import { NextRequest, NextResponse } from "next/server";
import { registerClient } from "@/lib/mcp-auth";

// RFC 7591 dynamic client registration. Registering grants nothing: every authorization
// still needs an administrator to approve it on the consent screen.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { client_name?: unknown; redirect_uris?: unknown } | null;
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length) return NextResponse.json({ error: "invalid_redirect_uri", error_description: "redirect_uris is required." }, { status: 400 });
  try {
    const client = await registerClient({ clientName: typeof body?.client_name === "string" ? body.client_name : undefined, redirectUris: uris });
    return NextResponse.json({
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "invalid_redirect_uri", error_description: error instanceof Error ? error.message : "Registration failed." }, { status: 400 });
  }
}
