import { createAdminClient } from "@/lib/admin";
import { sendGmail } from "@/lib/gmail";
import { listLeads, normalizeEmail, type LeadFilters } from "./leads";
import { getSendSettings } from "./settings";
import { clean, ServiceError, type Actor } from "./types";

type LeadRow = {
  id: string; name: string | null; title: string | null; company: string | null; location: string | null;
  email: string | null; emailed_at: string | null; unsubscribed_at: string | null;
};

const LEAD_FIELDS = "id,name,title,company,location,email,emailed_at,unsubscribed_at";
const STALE_CLAIM_MS = 10 * 60_000;

// ------------------------------------------------------------------ templates
export function renderTemplate(template: string, lead: Pick<LeadRow, "name" | "title" | "company" | "location">) {
  const name = lead.name?.trim() || "";
  const values: Record<string, string> = {
    name: name || "there",
    first_name: name.split(/\s+/)[0] || "there",
    company: lead.company?.trim() || "your company",
    title: lead.title?.trim() || "your role",
    location: lead.location?.trim() || "your area",
  };
  return template.replace(/\{\{\s*(name|first_name|company|title|location)\s*\}\}/g, (_, key: string) => values[key]);
}

function withFooter(body: string, signature: string, unsubscribeLine: string) {
  return [body.trimEnd(), signature.trim(), unsubscribeLine.trim() ? `--\n${unsubscribeLine.trim()}` : ""].filter(Boolean).join("\n\n");
}

// ------------------------------------------------------------------ suppression
export async function listSuppressions(limit = 200) {
  const db = createAdminClient();
  const { data, error } = await db.from("email_suppressions").select("email,reason,created_at").order("created_at", { ascending: false }).limit(Math.min(limit, 500));
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addSuppression(email: string, reason: "unsubscribe" | "bounce" | "manual" | "complaint" = "manual") {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new ServiceError("email is required");
  const db = createAdminClient();
  const { error } = await db.from("email_suppressions").upsert({ email: normalized, reason }, { onConflict: "email" });
  if (error) throw new Error(error.message);
  const now = new Date().toISOString();
  if (reason === "unsubscribe" || reason === "complaint" || reason === "manual") {
    await db.from("leads").update({ unsubscribed_at: now }).eq("scope", "platform").ilike("email", normalized).is("unsubscribed_at", null);
  }
  const { data: leadRows } = await db.from("leads").select("id").eq("scope", "platform").ilike("email", normalized);
  const ids = (leadRows ?? []).map((row) => row.id);
  let cancelled = 0;
  if (ids.length) {
    const { data } = await db.from("outreach_messages").update({ status: "cancelled", error: `suppressed: ${reason}` }).in("lead_id", ids).eq("status", "queued").select("id");
    cancelled = data?.length ?? 0;
  }
  return { email: normalized, reason, cancelled_queued: cancelled };
}

export async function removeSuppression(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new ServiceError("email is required");
  const db = createAdminClient();
  const { error } = await db.from("email_suppressions").delete().eq("email", normalized);
  if (error) throw new Error(error.message);
  await db.from("leads").update({ unsubscribed_at: null }).eq("scope", "platform").ilike("email", normalized);
  return { email: normalized, removed: true };
}

async function suppressedSet(emails: string[]) {
  if (!emails.length) return new Set<string>();
  const db = createAdminClient();
  const { data, error } = await db.from("email_suppressions").select("email").in("email", emails);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.email));
}

// ------------------------------------------------------------------ campaigns
export async function createCampaign(actor: Actor, input: { name: string; subject: string; body: string }) {
  const name = clean(input.name, 120);
  const subject = clean(input.subject, 180);
  const body = clean(input.body, 10000);
  if (!name || !subject || !body) throw new ServiceError("name, subject and body are required.");
  const db = createAdminClient();
  const { data, error } = await db.from("outreach_campaigns").insert({ name, subject, body, created_by: actor.userId }).select("id,name,subject,body,status,created_at").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setCampaignStatus(campaignId: string, status: "active" | "paused" | "completed") {
  const db = createAdminClient();
  const { data, error } = await db.from("outreach_campaigns").update({ status }).eq("id", campaignId).select("id,name,status").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ServiceError("Campaign not found.", "not_found");
  return data;
}

export async function listCampaigns() {
  const db = createAdminClient();
  const [{ data: campaigns, error }, { data: messages }] = await Promise.all([
    db.from("outreach_campaigns").select("id,name,subject,body,status,created_at").order("created_at", { ascending: false }).limit(100),
    db.from("outreach_messages").select("campaign_id,status").not("campaign_id", "is", null).limit(10000),
  ]);
  if (error) throw new Error(error.message);
  const stats = new Map<string, Record<string, number>>();
  for (const message of messages ?? []) {
    const bucket = stats.get(message.campaign_id as string) ?? {};
    bucket[message.status] = (bucket[message.status] ?? 0) + 1;
    stats.set(message.campaign_id as string, bucket);
  }
  return (campaigns ?? []).map((campaign) => ({ ...campaign, stats: stats.get(campaign.id) ?? {} }));
}

export async function listMessages(opts: { status?: string; campaignId?: string; limit?: number } = {}) {
  const db = createAdminClient();
  let q = db.from("outreach_messages")
    .select("id,campaign_id,lead_id,to_email,subject,status,error,queued_at,sent_at")
    .order("queued_at", { ascending: false }).limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.campaignId) q = q.eq("campaign_id", opts.campaignId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ------------------------------------------------------------------ queue
export type QueueInput = {
  leadIds?: string[];
  filter?: LeadFilters;
  campaignId?: string;
  subject?: string;
  body?: string;
  limit?: number;
  dryRun?: boolean;
  /** Skip the signature/unsubscribe footer (used for legacy single-send with an already complete body). */
  raw?: boolean;
};

export async function queueOutreach(actor: Actor, input: QueueInput) {
  const db = createAdminClient();
  let subject = clean(input.subject, 180);
  let body = clean(input.body, 10000);
  let campaignId: string | null = null;
  if (input.campaignId) {
    const { data: campaign } = await db.from("outreach_campaigns").select("id,subject,body,status").eq("id", input.campaignId).maybeSingle();
    if (!campaign) throw new ServiceError("Campaign not found.", "not_found");
    if (campaign.status !== "active") throw new ServiceError(`Campaign is ${campaign.status}.`, "conflict");
    campaignId = campaign.id;
    subject = subject || campaign.subject;
    body = body || campaign.body;
  }
  if (!subject || !body) throw new ServiceError("subject and body (or a campaignId) are required.");

  const cap = Math.min(Math.max(input.limit ?? 100, 1), 200);
  let leads: LeadRow[];
  if (input.leadIds?.length) {
    if (input.leadIds.length > 200) throw new ServiceError("At most 200 leadIds per queue call.", "limit");
    const { data, error } = await db.from("leads").select(LEAD_FIELDS).eq("scope", "platform").in("id", input.leadIds);
    if (error) throw new Error(error.message);
    leads = (data ?? []) as LeadRow[];
  } else {
    const filter: LeadFilters = { status: "new", hasEmail: true, ...input.filter, limit: cap };
    leads = (await listLeads(filter)).leads as unknown as LeadRow[];
  }

  const emails = leads.flatMap((lead) => (lead.email ? [lead.email.toLowerCase()] : []));
  const suppressed = await suppressedSet(emails);
  const { data: live } = leads.length
    ? await db.from("outreach_messages").select("lead_id").in("lead_id", leads.map((l) => l.id)).in("status", ["queued", "sending", "sent"])
    : { data: [] };
  const liveIds = new Set((live ?? []).map((row) => row.lead_id));

  const settings = await getSendSettings();
  const skipped: { lead_id: string; reason: string }[] = [];
  const rows: Record<string, unknown>[] = [];
  const previews: { to: string; subject: string; body: string }[] = [];
  for (const lead of leads) {
    if (!lead.email) { skipped.push({ lead_id: lead.id, reason: "no_email" }); continue; }
    if (lead.unsubscribed_at || suppressed.has(lead.email.toLowerCase())) { skipped.push({ lead_id: lead.id, reason: "suppressed" }); continue; }
    if (lead.emailed_at || liveIds.has(lead.id)) { skipped.push({ lead_id: lead.id, reason: "already_contacted_or_queued" }); continue; }
    const renderedSubject = renderTemplate(subject, lead).slice(0, 180);
    const rendered = renderTemplate(body, lead);
    const finalBody = input.raw ? rendered : withFooter(rendered, settings.signature, settings.unsubscribeLine);
    rows.push({ campaign_id: campaignId, lead_id: lead.id, to_email: lead.email, subject: renderedSubject, body: finalBody, queued_by: actor.userId });
    if (previews.length < 3) previews.push({ to: lead.email, subject: renderedSubject, body: finalBody });
  }

  if (input.dryRun) return { dry_run: true, would_queue: rows.length, skipped, previews };
  let queued = 0;
  if (rows.length) {
    const { data, error } = await db.from("outreach_messages").insert(rows).select("id");
    if (error) {
      if (error.code !== "23505") throw new Error(error.message);
      for (const row of rows) {
        const single = await db.from("outreach_messages").insert(row).select("id");
        if (!single.error) queued += 1;
        else skipped.push({ lead_id: String(row.lead_id), reason: "already_contacted_or_queued" });
      }
    } else queued = data?.length ?? 0;
  }
  return { dry_run: false, queued, skipped, previews };
}

export async function cancelQueued(opts: { campaignId?: string; messageIds?: string[] }) {
  if (!opts.campaignId && !opts.messageIds?.length) throw new ServiceError("campaignId or messageIds required.");
  const db = createAdminClient();
  let q = db.from("outreach_messages").update({ status: "cancelled", error: "cancelled by operator" }).eq("status", "queued");
  if (opts.campaignId) q = q.eq("campaign_id", opts.campaignId);
  if (opts.messageIds?.length) q = q.in("id", opts.messageIds.slice(0, 500));
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  return { cancelled: data?.length ?? 0 };
}

// ------------------------------------------------------------------ send
async function sentToday() {
  const db = createAdminClient();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count, error } = await db.from("outreach_messages").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", dayStart.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function reapStaleClaims() {
  const db = createAdminClient();
  await db.from("outreach_messages")
    .update({ status: "failed", error: "Interrupted while sending. Check the Gmail sent folder before re-queueing." })
    .eq("status", "sending")
    .lt("claimed_at", new Date(Date.now() - STALE_CLAIM_MS).toISOString());
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Message = { id: string; lead_id: string; to_email: string; subject: string; body: string };

async function sendClaimed(actor: Actor, message: Message): Promise<{ ok: true } | { ok: false; error: string; fatal: boolean }> {
  const db = createAdminClient();
  // Final safety check right before sending.
  const { data: lead } = await db.from("leads").select("id,email,emailed_at,unsubscribed_at").eq("id", message.lead_id).maybeSingle();
  const suppressed = await suppressedSet([message.to_email.toLowerCase()]);
  if (!lead || lead.emailed_at || lead.unsubscribed_at || suppressed.size) {
    await db.from("outreach_messages").update({ status: "skipped", error: !lead ? "lead removed" : lead.emailed_at ? "already contacted" : "suppressed" }).eq("id", message.id);
    return { ok: false, error: "skipped", fatal: false };
  }
  try {
    const sent = await sendGmail(actor.userId, message.to_email, message.subject, message.body);
    const now = new Date().toISOString();
    await db.from("outreach_messages").update({ status: "sent", sent_at: now, gmail_thread_id: sent.threadId, gmail_message_id: sent.messageId, error: null }).eq("id", message.id);
    await db.from("leads").update({ email_status: "sent", emailed_at: now, gmail_thread_id: sent.threadId, gmail_message_id: sent.messageId }).eq("id", message.lead_id).eq("scope", "platform");
    return { ok: true };
  } catch (error) {
    const text = error instanceof Error ? error.message : "Gmail send failed.";
    await db.from("outreach_messages").update({ status: "failed", error: text.slice(0, 500) }).eq("id", message.id);
    await db.from("leads").update({ email_status: "failed" }).eq("id", message.lead_id).eq("scope", "platform");
    // Gmail not connected / auth problems / quota: stop the whole batch.
    const fatal = /Connect Gmail|token request failed|HTTP (401|403|429)/.test(text);
    return { ok: false, error: text, fatal };
  }
}

/** Send up to one safe batch of queued messages, honoring the daily cap and per-send delay. */
export async function sendQueued(actor: Actor, opts: { limit?: number; campaignId?: string } = {}) {
  const db = createAdminClient();
  const settings = await getSendSettings();
  await reapStaleClaims();
  const todayCount = await sentToday();
  const remainingToday = Math.max(settings.dailySendCap - todayCount, 0);
  const batch = Math.min(Math.max(opts.limit ?? settings.maxPerBatch, 1), settings.maxPerBatch, remainingToday);

  const result = { sent: 0, failed: 0, skipped: 0, stopped_reason: null as string | null, errors: [] as string[], daily_cap: settings.dailySendCap, sent_today: todayCount, remaining_today: remainingToday, remaining_queued: 0 };
  if (batch <= 0) {
    result.stopped_reason = "daily_cap_reached";
  } else {
    const { data: paused } = await db.from("outreach_campaigns").select("id").neq("status", "active");
    const pausedIds = (paused ?? []).map((c) => c.id);
    let q = db.from("outreach_messages").select("id").eq("status", "queued").order("queued_at", { ascending: true }).limit(batch);
    if (opts.campaignId) q = q.eq("campaign_id", opts.campaignId);
    if (pausedIds.length) q = q.or(`campaign_id.is.null,campaign_id.not.in.(${pausedIds.join(",")})`);
    const { data: candidates, error } = await q;
    if (error) throw new Error(error.message);

    for (const candidate of candidates ?? []) {
      // Atomic claim: only one worker can flip queued -> sending.
      const { data: claimed } = await db.from("outreach_messages")
        .update({ status: "sending", claimed_at: new Date().toISOString() })
        .eq("id", candidate.id).eq("status", "queued")
        .select("id,lead_id,to_email,subject,body").maybeSingle();
      if (!claimed) continue;
      const outcome = await sendClaimed(actor, claimed as Message);
      if (outcome.ok) result.sent += 1;
      else if (outcome.error === "skipped") result.skipped += 1;
      else { result.failed += 1; result.errors.push(outcome.error.slice(0, 200)); }
      if (!outcome.ok && outcome.fatal) { result.stopped_reason = "gmail_error"; break; }
      if (settings.sendDelaySeconds > 0) await sleep(settings.sendDelaySeconds * 1000);
    }
  }

  const { count } = await db.from("outreach_messages").select("id", { count: "exact", head: true }).eq("status", "queued");
  result.remaining_queued = count ?? 0;
  result.sent_today += result.sent;
  result.remaining_today = Math.max(settings.dailySendCap - result.sent_today, 0);
  if (!result.stopped_reason && result.remaining_queued > 0 && result.remaining_today === 0) result.stopped_reason = "daily_cap_reached";
  return result;
}

/** Queue + send a single already-written message to one lead (admin UI manual send). */
export async function sendOne(actor: Actor, leadId: string, subject: string, body: string) {
  const queued = await queueOutreach(actor, { leadIds: [leadId], subject, body, raw: true });
  if (!queued.queued) {
    const reason = queued.skipped?.[0]?.reason ?? "not_queued";
    throw new ServiceError(
      reason === "no_email" ? "Lead has no email address."
        : reason === "suppressed" ? "Lead is unsubscribed or suppressed."
        : reason === "already_contacted_or_queued" ? "Lead has already been contacted or is queued."
        : "Lead could not be queued.",
      reason === "no_email" ? "invalid" : "conflict",
    );
  }
  const db = createAdminClient();
  const settings = await getSendSettings();
  if ((await sentToday()) >= settings.dailySendCap) {
    await db.from("outreach_messages").update({ status: "cancelled", error: "daily cap reached" }).eq("lead_id", leadId).eq("status", "queued");
    throw new ServiceError("Daily send cap reached.", "limit");
  }
  const { data: claimed } = await db.from("outreach_messages")
    .update({ status: "sending", claimed_at: new Date().toISOString() })
    .eq("lead_id", leadId).eq("status", "queued")
    .select("id,lead_id,to_email,subject,body").maybeSingle();
  if (!claimed) throw new ServiceError("Message was already picked up.", "conflict");
  const outcome = await sendClaimed(actor, claimed as Message);
  if (!outcome.ok) throw new ServiceError(outcome.error, "upstream");
  return { ok: true };
}

export async function outreachStats() {
  const db = createAdminClient();
  const settings = await getSendSettings();
  const count = (status: string) => db.from("outreach_messages").select("id", { count: "exact", head: true }).eq("status", status);
  const [queued, failed, today] = await Promise.all([count("queued"), count("failed"), sentToday()]);
  return {
    queued: queued.count ?? 0, failed: failed.count ?? 0, sent_today: today,
    daily_cap: settings.dailySendCap, remaining_today: Math.max(settings.dailySendCap - today, 0),
  };
}
