import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { exchangeAuthorizationCode, issueAuthorizationCode, refreshAccessToken } from "@/lib/mcp-auth";

function safeNext(next: string) {
  try {
    const url = new URL(next);
    return url.origin === new URL(process.env.MARLO_MCP_ISSUER ?? "http://localhost:3000").origin ? url.pathname + url.search : "/";
  } catch {
    return "/";
  }
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const responseType = params.get("response_type");
  const codeChallenge = params.get("code_challenge");
  const state = params.get("state");

  if (!clientId || !redirectUri || responseType !== "code" || !codeChallenge) {
    return new NextResponse("Invalid OAuth authorization request.", { status: 400 });
  }

  const { user, authorized } = await requireAdmin();
  if (!user) {
    const next = req.nextUrl.pathname + req.nextUrl.search;
    return NextResponse.redirect(new URL("/login?next=" + encodeURIComponent(next), req.url));
  }
  if (!authorized) return new NextResponse("Marlo administrator access required.", { status: 403 });

  const code = await issueAuthorizationCode({ userId: user.id, clientId, redirectUri, codeChallenge });
  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (state) target.searchParams.set("state", state);
  return NextResponse.redirect(target);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const grantType = String(form.get("grant_type") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  try {
    if (grantType === "authorization_code") {
      return NextResponse.json(await exchangeAuthorizationCode({
        code: String(form.get("code") ?? ""),
        clientId,
        redirectUri: String(form.get("redirect_uri") ?? ""),
        codeVerifier: String(form.get("code_verifier") ?? ""),
      }));
    }
    if (grantType === "refresh_token") {
      return NextResponse.json(await refreshAccessToken(String(form.get("refresh_token") ?? ""), clientId));
    }
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "invalid_grant", error_description: error instanceof Error ? error.message : "OAuth exchange failed." }, { status: 400 });
  }
}
