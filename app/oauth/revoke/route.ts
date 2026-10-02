import { NextRequest, NextResponse } from "next/server";
import { revokeToken } from "@/lib/mcp-auth";

// RFC 7009. Always answers 200 so callers cannot probe for valid tokens.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  if (token) await revokeToken(token).catch(() => undefined);
  return new NextResponse(null, { status: 200 });
}
