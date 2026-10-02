import { createAdminClient } from "@/lib/admin";
import type { Actor } from "./types";

type AuditInput = {
  actor: Actor;
  action: string;
  targetType?: string;
  targetId?: string;
  status?: "ok" | "error" | "denied";
  idempotencyKey?: string | null;
  meta?: Record<string, unknown>;
  result?: unknown;
};

/** Best-effort audit write. Never throws: an audit failure must not break the action it records. */
export async function audit(input: AuditInput) {
  try {
    const db = createAdminClient();
    await db.from("platform_audit_log").insert({
      actor_id: input.actor.userId,
      via: input.actor.via,
      client_id: input.actor.clientId ?? null,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      status: input.status ?? "ok",
      idempotency_key: input.status && input.status !== "ok" ? null : input.idempotencyKey ?? null,
      meta: input.meta ?? {},
      result: input.result ?? null,
    });
  } catch {}
}

type Claim = { state: "claimed"; id: string } | { state: "replay"; result: unknown } | { state: "busy" };

/**
 * Atomically reserve an idempotency key. The unique index on (actor, action, key) makes the insert the lock,
 * so two simultaneous calls with the same key cannot both run.
 */
export async function claimIdempotency(actor: Actor, action: string, key: string): Promise<Claim> {
  const db = createAdminClient();
  const { data, error } = await db.from("platform_audit_log").insert({
    actor_id: actor.userId, via: actor.via, client_id: actor.clientId ?? null, action, status: "pending", idempotency_key: key,
  }).select("id").single();
  if (!error && data) return { state: "claimed", id: data.id };
  const { data: existing } = await db.from("platform_audit_log").select("status,result,created_at")
    .eq("actor_id", actor.userId).eq("action", action).eq("idempotency_key", key).in("status", ["ok", "pending"]).maybeSingle();
  if (existing?.status === "ok") return { state: "replay", result: existing.result };
  // A pending claim older than 10 minutes belongs to a crashed call; release it and let this one proceed.
  if (existing && Date.now() - new Date(existing.created_at).getTime() > 10 * 60_000) {
    await db.from("platform_audit_log").update({ status: "error", idempotency_key: null }).eq("actor_id", actor.userId).eq("action", action).eq("idempotency_key", key).eq("status", "pending");
    return claimIdempotency(actor, action, key);
  }
  return { state: "busy" };
}

export async function finishIdempotency(id: string, outcome: { ok: true; result: unknown; meta?: Record<string, unknown> } | { ok: false; meta?: Record<string, unknown> }) {
  try {
    const db = createAdminClient();
    await db.from("platform_audit_log").update(
      outcome.ok
        ? { status: "ok", result: outcome.result ?? null, meta: outcome.meta ?? {} }
        : { status: "error", idempotency_key: null, meta: outcome.meta ?? {} },
    ).eq("id", id);
  } catch {}
}

export async function listAudit(opts: { limit?: number; before?: string; action?: string; via?: string; status?: string }) {
  const db = createAdminClient();
  let query = db.from("platform_audit_log")
    .select("id,actor_id,via,client_id,action,target_type,target_id,status,meta,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));
  if (opts.before) query = query.lt("created_at", opts.before);
  if (opts.action) query = query.ilike("action", `%${opts.action}%`);
  if (opts.via) query = query.eq("via", opts.via);
  if (opts.status) query = query.eq("status", opts.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Rate limit helper: number of audited actions by a client in the last `seconds`. */
export async function recentActionCount(actor: Actor, seconds: number) {
  const db = createAdminClient();
  const since = new Date(Date.now() - seconds * 1000).toISOString();
  const { count } = await db.from("platform_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", actor.userId)
    .eq("via", "mcp")
    .gte("created_at", since);
  return count ?? 0;
}
