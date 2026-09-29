import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const origin = new URL(process.env.MARLO_MCP_ISSUER ?? req.url).origin;
  return NextResponse.json({
    resource: origin + "/mcp",
    authorization_servers: [origin],
    scopes_supported: ["marlo:read", "marlo:write"],
    bearer_methods_supported: ["header"],
  });
}
