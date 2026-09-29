import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildGmailAuthUrl, createGmailState } from "@/lib/gmail";
import { requireAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const { user, authorized } = await requireAdmin();
  if (!user || !authorized) return NextResponse.redirect(new URL("/login", req.url));

  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/?gmail_error=Gmail OAuth is not configured", req.url));
  }

  const state = createGmailState();
  const cookieStore = await cookies();
  cookieStore.set("marlo_gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const redirectUri = `${req.nextUrl.origin}/api/integrations/gmail/callback`;
  return NextResponse.redirect(buildGmailAuthUrl(redirectUri, state));
}
