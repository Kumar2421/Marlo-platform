export type Lead = {
  id: string;
  name: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  email_quality: string | null;
  email_verified: boolean | null;
  email_status: string | null;
  emailed_at: string | null;
  last_reply_at: string | null;
  last_reply_snippet: string | null;
  reply_classification: string | null;
  unsubscribed_at: string | null;
  source_url: string | null;
  query: string | null;
  tags: string[] | null;
  notes: string | null;
  created_at: string;
};

export type LeadStats = { total: number; with_email: number; sent: number; replied: number; unsubscribed: number; failed: number };
export type LeadsResponse = { leads: Lead[]; next_cursor: string | null; stats: LeadStats | null };

export type LeadInput = Partial<Record<"name" | "title" | "company" | "location" | "email" | "phone" | "source_url" | "query" | "notes", string>> & { tags?: string[] };

export type Campaign = { id: string; name: string; subject: string; body: string; status: string; created_at: string; stats?: Record<string, number> };
export type OutMessage = { id: string; campaign_id: string | null; lead_id: string | null; to_email: string; subject: string; status: string; error: string | null; queued_at: string | null; sent_at: string | null };
export type SendSettings = { dailySendCap: number; sendDelaySeconds: number; maxPerBatch: number; signature: string; unsubscribeLine: string };
export type Suppression = { email: string; reason: string | null; created_at: string };
export type OutreachData = {
  campaigns: Campaign[];
  messages: OutMessage[];
  stats: { queued: number; failed: number; sent_today: number; daily_cap: number; remaining_today: number };
  settings: SendSettings;
  suppressions: Suppression[];
  gmail: string | null;
};

export type Preview = { dry_run: boolean; would_queue?: number; queued?: number; skipped?: { lead_id: string; reason: string }[]; previews?: { to: string; subject: string; body: string }[] };
export type SendResult = { sent: number; failed: number; skipped: number; stopped_reason: string | null; errors: string[]; daily_cap: number; sent_today: number; remaining_today: number; remaining_queued: number };

export function errMsg(err: unknown, fallback = "Request failed.") {
  return err instanceof Error ? err.message : fallback;
}

export function leadStatus(lead: Lead): "unsubscribed" | "replied" | "failed" | "sent" | "queued" | "new" {
  if (lead.unsubscribed_at) return "unsubscribed";
  if (lead.last_reply_at) return "replied";
  if (lead.email_status === "failed" || lead.email_status === "bounced") return "failed";
  if (lead.emailed_at || lead.email_status === "sent") return "sent";
  if (lead.email_status === "queued") return "queued";
  return "new";
}
