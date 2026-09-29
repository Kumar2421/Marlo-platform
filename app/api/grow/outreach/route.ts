import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, requireAdmin } from "@/lib/admin";
import { sendGmail } from "@/lib/gmail";

export async function GET() {
  const { user, authorized } = await requireAdmin();
  if (!user || !authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const [{ data: leads, error: leadsError }, { data: connection }] = await Promise.all([
    db.from("leads")
      .select("id,name,title,company,location,email,email_quality,email_status,emailed_at,gmail_thread_id,last_reply_at,last_reply_snippet,source_url,created_at")
      .eq("scope", "platform")
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("integration_connections")
      .select("external_email")
      .eq("user_id", user.id)
      .is("project_id", null)
      .eq("provider", "gmail")
      .maybeSingle(),
  ]);

  if (leadsError) return NextResponse.json({ error: leadsError.message }, { status: 500 });
  return NextResponse.json({ leads: leads ?? [], gmail: connection?.external_email ?? null });
}

export async function POST(req: NextRequest) {
  const { user, authorized } = await requireAdmin();
  if (!user || !authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as { leadId?: string; subject?: string; message?: string } | null;
  const leadId = body?.leadId?.trim();
  const subject = body?.subject?.trim();
  const message = body?.message?.trim();

  if (!leadId || !subject || !message) {
    return NextResponse.json({ error: "leadId, subject and message are required." }, { status: 400 });
  }
  if (subject.length > 180 || message.length > 10000) {
    return NextResponse.json({ error: "Subject or message is too long." }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: lead, error: leadError } = await db.from("leads")
    .select("id,email,email_status,emailed_at")
    .eq("id", leadId)
    .eq("scope", "platform")
    .maybeSingle();

  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Platform lead not found." }, { status: 404 });
  if (!lead.email) return NextResponse.json({ error: "Lead has no email address." }, { status: 400 });
  if (lead.emailed_at) return NextResponse.json({ error: "Lead has already been contacted." }, { status: 409 });

  try {
    const sent = await sendGmail(user.id, lead.email, subject, message);
    const { error: updateError } = await db.from("leads").update({
      email_status: "sent",
      emailed_at: new Date().toISOString(),
      gmail_thread_id: sent.threadId,
      gmail_message_id: sent.messageId,
    }).eq("id", lead.id).eq("scope", "platform");

    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    await db.from("leads").update({ email_status: "failed" }).eq("id", lead.id).eq("scope", "platform");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gmail send failed." }, { status: 502 });
  }
}
