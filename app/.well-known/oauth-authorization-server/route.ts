import { NextRequest, NextResponse } from "next/server";
import { SUPPORTED_SCOPES } from "@/lib/mcp-auth";

export async function GET(req: NextRequest) {
  const origin = new URL(process.env.MARLO_MCP_ISSUER ?? req.url).origin;
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: origin + "/oauth/authorize",
    token_endpoint: origin + "/oauth/token",
    registration_endpoint: origin + "/oauth/register",
    revocation_endpoint: origin + "/oauth/revoke",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: SUPPORTED_SCOPES,
  });
}
