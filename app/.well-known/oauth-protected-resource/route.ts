import { NextRequest, NextResponse } from "next/server";
import { SUPPORTED_SCOPES } from "@/lib/mcp-auth";

export async function GET(req: NextRequest) {
  const origin = new URL(process.env.MARLO_MCP_ISSUER ?? req.url).origin;
  return NextResponse.json({
    resource: origin + "/mcp",
    authorization_servers: [origin],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ["header"],
  });
}
