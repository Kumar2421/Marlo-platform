import { NextResponse } from "next/server";
import { createAdminClient, requireAdmin } from "@/lib/admin";
import { getGmailThreadReplies } from "@/lib/gmail";

export async function POST() {
  const { user, authorized } = await requireAdmin();
  if (!user || !authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data: leads, error } = await db.from("leads")
    .select("id,gmail_thread_id,gmail_message_id,last_reply_at")
    .eq("scope", "platform")
    .not("gmail_thread_id", "is", null)
    .not("gmail_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let checked = 0;
  let replies = 0;
  const failures: string[] = [];

  for (const lead of leads ?? []) {
    if (!lead.gmail_thread_id || !lead.gmail_message_id) continue;
    checked += 1;

    try {
      const messages = await getGmailThreadReplies(user.id, lead.gmail_thread_id, lead.gmail_message_id);
      if (!messages.length) continue;

      const latest = messages
        .filter((message) => !message.internalDate || !lead.last_reply_at || Number(message.internalDate) > new Date(lead.last_reply_at).getTime())
        .sort((a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0))[0];

      if (!latest) continue;

      const { error: updateError } = await db.from("leads").update({
        email_status: "replied",
        last_reply_at: latest.internalDate ? new Date(Number(latest.internalDate)).toISOString() : new Date().toISOString(),
        last_reply_snippet: latest.snippet.slice(0, 500),
      }).eq("id", lead.id).eq("scope", "platform");

      if (updateError) throw new Error(updateError.message);
      replies += 1;
    } catch (error) {
      failures.push(String(lead.id) + ": " + (error instanceof Error ? error.message : "reply check failed"));
    }
  }

  return NextResponse.json({ ok: true, checked, replies, failures });
}
