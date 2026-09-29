import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthorizationCode, refreshAccessToken } from "@/lib/mcp-auth";

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
    return NextResponse.json({
      error: "invalid_grant",
      error_description: error instanceof Error ? error.message : "OAuth exchange failed.",
    }, { status: 400 });
  }
}
