import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const origin = new URL(process.env.MARLO_MCP_ISSUER ?? req.url).origin;
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: origin + "/oauth/authorize",
    token_endpoint: origin + "/oauth/token",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["marlo:read", "marlo:write"],
  });
}
