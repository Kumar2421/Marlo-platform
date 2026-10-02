import { createAdminClient } from "@/lib/admin";
import { getGmailThreadReplies } from "@/lib/gmail";
import { LEAD_COLUMNS } from "./leads";
import { addSuppression } from "./outreach";
import { ServiceError, type Actor } from "./types";

export type ReplyClass = "interested" | "negative" | "unsubscribe" | "bounce" | "auto_reply" | "neutral";
export const REPLY_CLASSES: ReplyClass[] = ["interested", "negative", "unsubscribe", "bounce", "auto_reply", "neutral"];

export function classifyReply(from: string, snippet: string): ReplyClass {
  const text = snippet.toLowerCase();
  if (/mailer-daemon|postmaster/i.test(from) || /delivery status notification|undeliverable|address not found|couldn't be delivered|could not be delivered|mailbox unavailable/.test(text)) return "bounce";
  if (/out of office|automatic reply|auto-?reply|on vacation|away from (the )?office/.test(text)) return "auto_reply";
  if (/\bunsubscribe\b|remove me|stop (emailing|contacting|sending)|take me off/.test(text)) return "unsubscribe";
  if (/not interested|no thanks|no thank you|not a fit|not looking/.test(text)) return "negative";
  if (/\binterested\b|sounds good|let'?s (talk|chat|connect|schedule)|book a|schedule a|tell me more|send (me )?(more|details)|happy to (chat|talk)|\bdemo\b/.test(text)) return "interested";
  return "neutral";
}

async function applyClass(leadId: string, email: string | null, klass: ReplyClass) {
  if (!email) return;
  if (klass === "unsubscribe") await addSuppression(email, "unsubscribe");
  if (klass === "bounce") await addSuppression(email, "bounce");
}

/** Check Gmail threads of contacted leads, record new replies, classify them, honor unsubscribes and bounces. */
export async function syncReplies(actor: Actor, opts: { limit?: number } = {}) {
  const db = createAdminClient();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const { data: leads, error } = await db.from("leads")
    .select("id,email,gmail_thread_id,gmail_message_id,last_reply_at")
    .eq("scope", "platform")
    .not("gmail_thread_id", "is", null)
    .not("gmail_message_id", "is", null)
    .order("emailed_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const summary = { checked: 0, new_replies: 0, bounces: 0, unsubscribes: 0, auto_replies: 0, failures: [] as string[] };
  const queue = [...(leads ?? [])];
  const worker = async () => {
    for (let lead = queue.shift(); lead; lead = queue.shift()) {
      summary.checked += 1;
      try {
        const messages = await getGmailThreadReplies(actor.userId, lead.gmail_thread_id!, lead.gmail_message_id!);
        const since = lead.last_reply_at ? new Date(lead.last_reply_at).getTime() : 0;
        const latest = messages
          .filter((m) => !m.internalDate || Number(m.internalDate) > since)
          .sort((a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0))[0];
        if (!latest) continue;

        const klass = classifyReply(latest.from, latest.snippet);
        const at = latest.internalDate ? new Date(Number(latest.internalDate)).toISOString() : new Date().toISOString();
        const update: Record<string, unknown> = { last_reply_at: at, last_reply_snippet: latest.snippet.slice(0, 500), reply_classification: klass };
        if (klass === "bounce") update.email_status = "failed";
        else if (klass !== "auto_reply") update.email_status = "replied";
        const { error: updateError } = await db.from("leads").update(update).eq("id", lead.id).eq("scope", "platform");
        if (updateError) throw new Error(updateError.message);

        await applyClass(lead.id, lead.email, klass);
        if (klass === "bounce") summary.bounces += 1;
        else if (klass === "auto_reply") summary.auto_replies += 1;
        else summary.new_replies += 1;
        if (klass === "unsubscribe") summary.unsubscribes += 1;
      } catch (err) {
        summary.failures.push(`${lead.id}: ${err instanceof Error ? err.message : "reply check failed"}`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return summary;
}

export async function listReplies(opts: { classification?: string; limit?: number } = {}) {
  const db = createAdminClient();
  let q = db.from("leads").select(LEAD_COLUMNS).eq("scope", "platform").not("last_reply_at", "is", null)
    .order("last_reply_at", { ascending: false }).limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));
  if (opts.classification) q = q.eq("reply_classification", opts.classification);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function markReply(leadId: string, classification: ReplyClass) {
  if (!REPLY_CLASSES.includes(classification)) throw new ServiceError("Invalid classification.");
  const db = createAdminClient();
  const { data, error } = await db.from("leads").update({ reply_classification: classification }).eq("scope", "platform").eq("id", leadId).select("id,email").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ServiceError("Lead not found.", "not_found");
  await applyClass(leadId, data.email, classification);
  return { lead_id: leadId, classification };
}
