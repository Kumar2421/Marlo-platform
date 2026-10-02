import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { runHealthChecks } from "@/lib/services/platform";

// Scheduled health probe. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`;
// a signed-in admin can also trigger it by hand.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const cronOk = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!cronOk) {
    const { user, authorized } = await requireAdmin();
    if (!user || !authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ checks: await runHealthChecks(true) });
}
