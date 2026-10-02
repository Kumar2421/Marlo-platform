import { createAdminClient } from "@/lib/admin";
import { leadDedupeKey } from "@/lib/lead-research";
import { clean, ServiceError, type Actor } from "./types";

export const LEAD_COLUMNS =
  "id,name,title,company,location,email,phone,email_quality,email_verified,email_status,emailed_at,last_reply_at,last_reply_snippet,reply_classification,unsubscribed_at,source_url,query,tags,notes,created_at";

export type LeadInput = {
  name?: string; title?: string; company?: string; location?: string; email?: string; phone?: string;
  source_url?: string; query?: string; tags?: string[]; notes?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MAX_IMPORT = 500;

export function normalizeEmail(value: unknown) {
  const email = clean(value, 254).toLowerCase();
  return email || null;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((t) => clean(t, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
}

type Normalized = { row: Record<string, unknown>; key: string } | { error: string };

export function normalizeLead(input: LeadInput, defaults: { query?: string; tags?: string[] } = {}): Normalized {
  const name = clean(input.name, 160);
  const company = clean(input.company, 160);
  const email = normalizeEmail(input.email);
  if (!name && !company && !email) return { error: "name, company or email is required" };
  if (email && !EMAIL_RE.test(email)) return { error: `invalid email: ${email}` };
  const sourceUrl = clean(input.source_url, 500) || null;
  const location = clean(input.location, 160);
  const key = leadDedupeKey({ name, title: "", company, location, email, sourceUrl });
  return {
    key,
    row: {
      scope: "platform", project_id: null, lead_type: "person",
      name: name || null, title: clean(input.title, 160) || null, company: company || null,
      location: location || null, email, phone: clean(input.phone, 60) || null,
      email_quality: email ? "source_found" : null, email_verified: false,
      source_url: sourceUrl, query: clean(input.query, 300) || defaults.query || "import",
      tags: [...new Set([...normalizeTags(input.tags), ...(defaults.tags ?? [])])].slice(0, 20),
      notes: clean(input.notes, 2000) || null, dedupe_key: key,
    },
  };
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function importLeads(actor: Actor, inputs: LeadInput[], opts: { dryRun?: boolean; query?: string; tags?: string[] } = {}) {
  if (!Array.isArray(inputs) || !inputs.length) throw new ServiceError("leads must be a non-empty array");
  if (inputs.length > MAX_IMPORT) throw new ServiceError(`At most ${MAX_IMPORT} leads per import.`, "limit");

  const invalid: { index: number; reason: string }[] = [];
  const unique = new Map<string, Record<string, unknown>>();
  let batchDuplicates = 0;
  inputs.forEach((input, index) => {
    const result = normalizeLead(input ?? {}, { query: opts.query, tags: opts.tags });
    if ("error" in result) return void invalid.push({ index, reason: result.error });
    if (unique.has(result.key)) { batchDuplicates += 1; return; }
    unique.set(result.key, result.row);
  });

  const db = createAdminClient();
  const existing = new Set<string>();
  for (const keys of chunk([...unique.keys()], 100)) {
    const { data, error } = await db.from("leads").select("dedupe_key").eq("scope", "platform").in("dedupe_key", keys);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) if (row.dedupe_key) existing.add(row.dedupe_key);
  }
  const fresh = [...unique.entries()].filter(([key]) => !existing.has(key)).map(([, row]) => ({ ...row, user_id: actor.userId }));
  const duplicates = existing.size + batchDuplicates;
  if (opts.dryRun) return { dry_run: true, received: inputs.length, would_create: fresh.length, duplicates, invalid };

  let created = 0;
  let raced = 0;
  for (const rows of chunk(fresh, 100)) {
    const { data, error } = await db.from("leads").insert(rows).select("id");
    if (!error) { created += data?.length ?? 0; continue; }
    // Unique-index race or one bad row: fall back to row-by-row so the rest still lands.
    for (const row of rows) {
      const single = await db.from("leads").insert(row).select("id");
      if (!single.error) created += 1;
      else if (single.error.code === "23505") raced += 1;
      else invalid.push({ index: -1, reason: single.error.message });
    }
  }
  return { dry_run: false, received: inputs.length, created, duplicates: duplicates + raced, invalid };
}

export type LeadFilters = {
  status?: "new" | "sent" | "replied" | "failed" | "unsubscribed";
  hasEmail?: boolean;
  quality?: string;
  query?: string;
  tag?: string;
  before?: string;
  limit?: number;
};

export async function listLeads(filters: LeadFilters = {}) {
  const db = createAdminClient();
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  let q = db.from("leads").select(LEAD_COLUMNS).eq("scope", "platform").order("created_at", { ascending: false }).limit(limit + 1);
  if (filters.status === "new") q = q.is("emailed_at", null).is("unsubscribed_at", null);
  if (filters.status === "sent") q = q.not("emailed_at", "is", null);
  if (filters.status === "replied") q = q.not("last_reply_at", "is", null);
  if (filters.status === "failed") q = q.eq("email_status", "failed");
  if (filters.status === "unsubscribed") q = q.not("unsubscribed_at", "is", null);
  if (filters.hasEmail === true) q = q.not("email", "is", null);
  if (filters.hasEmail === false) q = q.is("email", null);
  if (filters.quality) q = q.eq("email_quality", filters.quality);
  if (filters.tag) q = q.contains("tags", [filters.tag.toLowerCase()]);
  if (filters.before) q = q.lt("created_at", filters.before);
  if (filters.query) {
    const term = filters.query.replace(/[%,()]/g, " ").trim().slice(0, 80);
    if (term) q = q.or(`name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%,title.ilike.%${term}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const page = rows.slice(0, limit);
  return { leads: page, next_cursor: rows.length > limit ? page[page.length - 1].created_at : null };
}

export async function getLead(id: string) {
  const db = createAdminClient();
  const { data, error } = await db.from("leads").select(LEAD_COLUMNS).eq("scope", "platform").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ServiceError("Lead not found.", "not_found");
  const { data: messages } = await db.from("outreach_messages")
    .select("id,campaign_id,subject,status,error,queued_at,sent_at")
    .eq("lead_id", id).order("queued_at", { ascending: false }).limit(20);
  return { lead: data, messages: messages ?? [] };
}

export async function updateLead(id: string, patch: LeadInput) {
  const db = createAdminClient();
  const update: Record<string, unknown> = {};
  for (const field of ["name", "title", "company", "location", "phone", "notes"] as const) {
    if (patch[field] !== undefined) update[field] = clean(patch[field], field === "notes" ? 2000 : 160) || null;
  }
  if (patch.source_url !== undefined) update.source_url = clean(patch.source_url, 500) || null;
  if (patch.tags !== undefined) update.tags = normalizeTags(patch.tags);
  if (patch.email !== undefined) {
    const email = normalizeEmail(patch.email);
    if (email && !EMAIL_RE.test(email)) throw new ServiceError(`invalid email: ${email}`);
    update.email = email;
    update.email_quality = email ? "source_found" : null;
    if (email) update.dedupe_key = `email:${email}`;
  }
  if (!Object.keys(update).length) throw new ServiceError("No updatable fields supplied.");
  const { data, error } = await db.from("leads").update(update).eq("scope", "platform").eq("id", id).select(LEAD_COLUMNS).maybeSingle();
  if (error) throw new ServiceError(error.code === "23505" ? "Another lead already uses that email." : error.message, error.code === "23505" ? "conflict" : "invalid");
  if (!data) throw new ServiceError("Lead not found.", "not_found");
  return data;
}

export async function tagLeads(ids: string[], add: string[] = [], remove: string[] = []) {
  if (!ids.length || ids.length > 200) throw new ServiceError("Provide 1-200 lead ids.", "limit");
  const addTags = normalizeTags(add);
  const removeTags = new Set(normalizeTags(remove));
  const db = createAdminClient();
  const { data, error } = await db.from("leads").select("id,tags").eq("scope", "platform").in("id", ids);
  if (error) throw new Error(error.message);
  let updated = 0;
  for (const lead of data ?? []) {
    const next = [...new Set([...(lead.tags ?? []), ...addTags])].filter((t) => !removeTags.has(t)).slice(0, 20);
    const { error: updateError } = await db.from("leads").update({ tags: next }).eq("id", lead.id);
    if (!updateError) updated += 1;
  }
  return { updated };
}

export async function deleteLeads(ids: string[], force = false) {
  if (!ids.length || ids.length > 100) throw new ServiceError("Provide 1-100 lead ids.", "limit");
  const db = createAdminClient();
  let blockedIds: string[] = [];
  if (!force) {
    const { data } = await db.from("leads").select("id").eq("scope", "platform").in("id", ids).not("emailed_at", "is", null);
    blockedIds = (data ?? []).map((row) => row.id);
  }
  const deletable = ids.filter((id) => !blockedIds.includes(id));
  let deleted = 0;
  if (deletable.length) {
    const { data, error } = await db.from("leads").delete().eq("scope", "platform").in("id", deletable).select("id");
    if (error) throw new Error(error.message);
    deleted = data?.length ?? 0;
  }
  return { deleted, skipped_contacted: blockedIds };
}

export async function leadStats() {
  const db = createAdminClient();
  const base = () => db.from("leads").select("id", { count: "exact", head: true }).eq("scope", "platform");
  const [total, withEmail, sent, replied, unsub, failed] = await Promise.all([
    base(),
    base().not("email", "is", null),
    base().not("emailed_at", "is", null),
    base().not("last_reply_at", "is", null),
    base().not("unsubscribed_at", "is", null),
    base().eq("email_status", "failed"),
  ]);
  const bad = [total, withEmail, sent, replied, unsub, failed].find((r) => r.error);
  if (bad?.error) throw new Error(bad.error.message);
  return {
    total: total.count ?? 0, with_email: withEmail.count ?? 0, sent: sent.count ?? 0,
    replied: replied.count ?? 0, unsubscribed: unsub.count ?? 0, failed: failed.count ?? 0,
  };
}
