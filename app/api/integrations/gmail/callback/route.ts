import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient, requireAdmin } from "@/lib/admin";
import { exchangeGmailCode, getGmailEmail } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("marlo_gmail_oauth_state")?.value;
  cookieStore.delete("marlo_gmail_oauth_state");

  const settingsUrl = new URL("/", req.url);
  if (code === null || state === null || expectedState === null || state !== expectedState) {
    settingsUrl.searchParams.set("gmail_error", "Invalid or expired Gmail authorization.");
    return NextResponse.redirect(settingsUrl);
  }

  const { user, authorized } = await requireAdmin();
  if (!user || !authorized) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const redirectUri = `${req.nextUrl.origin}/api/integrations/gmail/callback`;
    const tokens = await exchangeGmailCode(code, redirectUri);
    if (!tokens.refreshToken) throw new Error("Google did not return a refresh token. Revoke the existing Marlo grant and reconnect.");

    const email = await getGmailEmail(tokens.accessToken);
    if (!email) throw new Error("Could not read the connected Gmail account.");

    const db = createAdminClient();
    const accessName = `marlo:gmail:${user.id}:access`;
    const refreshName = `marlo:gmail:${user.id}:refresh`;
    const [{ data: accessSecretId, error: accessError }, { data: refreshSecretId, error: refreshError }] = await Promise.all([
      db.rpc("vault_set_secret", { p_secret: tokens.accessToken, p_name: accessName }),
      db.rpc("vault_set_secret", { p_secret: tokens.refreshToken, p_name: refreshName }),
    ]);

    if (accessError || refreshError) {
      throw new Error(accessError?.message ?? refreshError?.message ?? "Failed to store Gmail tokens.");
    }

    const { error } = await db.from("integration_connections").upsert({
      user_id: user.id,
      project_id: null,
      provider: "gmail",
      access_token_secret_id: accessSecretId,
      refresh_token_secret_id: refreshSecretId,
      token_expiry: new Date(tokens.expiresAt).toISOString(),
      external_email: email,
      external_property: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,project_id,provider" });

    if (error) throw new Error(error.message);
    return NextResponse.redirect(settingsUrl);
  } catch (error) {
    settingsUrl.searchParams.set("gmail_error", error instanceof Error ? error.message : "Gmail connection failed.");
    return NextResponse.redirect(settingsUrl);
  }
}
