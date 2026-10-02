import { createAdminClient } from "@/lib/admin";
import { ServiceError } from "./types";

const REPO = process.env.GITHUB_REPO ?? "Kumar2421/Marlo-platform";

function githubHeaders() {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

function vercelUrl(path: string) {
  const url = new URL(`https://api.vercel.com${path}`);
  if (process.env.VERCEL_TEAM_ID) url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID);
  return url.toString();
}

// ------------------------------------------------------------------ users & projects
export async function listPlatformUsers(opts: { page?: number; perPage?: number; query?: string } = {}) {
  const db = createAdminClient();
  const perPage = Math.min(Math.max(opts.perPage ?? 50, 1), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const { data, error } = await db.auth.admin.listUsers({ page, perPage });
  if (error) throw new Error(error.message);
  let users = data?.users ?? [];
  if (opts.query) {
    const q = opts.query.toLowerCase();
    users = users.filter((u) => (u.email ?? "").toLowerCase().includes(q) || u.id.startsWith(q));
  }
  const ids = users.map((u) => u.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: projects } = await db.from("projects").select("owner_id").in("owner_id", ids);
    for (const p of projects ?? []) counts.set(p.owner_id, (counts.get(p.owner_id) ?? 0) + 1);
  }
  const adminIds = new Set((process.env.MARLO_ADMIN_USER_IDS ?? "").split(",").map((v) => v.trim()).filter(Boolean));
  return {
    page, per_page: perPage, has_more: (data?.users?.length ?? 0) === perPage,
    users: users.map((u) => ({
      id: u.id, email: u.email ?? null, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null,
      projects: counts.get(u.id) ?? 0, is_admin: adminIds.has(u.id), banned: Boolean((u as { banned_until?: string | null }).banned_until),
    })),
  };
}

export async function listPlatformProjects(opts: { query?: string; ownerId?: string; before?: string; limit?: number } = {}) {
  const db = createAdminClient();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let q = db.from("projects").select("id,owner_id,name,url,category,created_at").order("created_at", { ascending: false }).limit(limit + 1);
  if (opts.ownerId) q = q.eq("owner_id", opts.ownerId);
  if (opts.before) q = q.lt("created_at", opts.before);
  if (opts.query) {
    const term = opts.query.replace(/[%,()]/g, " ").trim().slice(0, 80);
    if (term) q = q.or(`name.ilike.%${term}%,url.ilike.%${term}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const page = rows.slice(0, limit);
  return { projects: page, next_cursor: rows.length > limit ? page[page.length - 1].created_at : null };
}

export async function getPlatformProject(id: string) {
  const db = createAdminClient();
  const { data: project, error } = await db.from("projects").select("id,owner_id,name,url,category,created_at").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!project) throw new ServiceError("Project not found.", "not_found");
  const [{ data: owner }, findings, fixes, usage, recent] = await Promise.all([
    db.auth.admin.getUserById(project.owner_id),
    db.from("findings").select("id", { count: "exact", head: true }).eq("project_id", id),
    db.from("findings").select("id", { count: "exact", head: true }).eq("project_id", id).not("status", "in", "(fixed,verified)"),
    db.from("usage_events").select("id", { count: "exact", head: true }).eq("project_id", id),
    db.from("usage_events").select("id,agent_type,status,created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(15),
  ]);
  return {
    project, owner_email: owner?.user?.email ?? null,
    findings_total: findings.count ?? 0, findings_open: fixes.count ?? 0, usage_events: usage.count ?? 0,
    recent_usage: recent.data ?? [],
  };
}

// ------------------------------------------------------------------ fix queue
export async function listFindings(opts: { status?: string; severity?: string; projectId?: string; before?: string; limit?: number } = {}) {
  const db = createAdminClient();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let q = db.from("findings").select("*").order("created_at", { ascending: false }).limit(limit);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.severity) q = q.eq("severity", opts.severity);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listFixes(opts: { status?: string; projectId?: string; limit?: number } = {}) {
  const db = createAdminClient();
  let q = db.from("code_fixes").select("*").order("created_at", { ascending: false }).limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Put a failed fix back in the pending queue so the customer app's fixer can retry it. */
export async function requeueFix(id: string) {
  const db = createAdminClient();
  const { data, error } = await db.from("code_fixes").update({ status: "pending" }).eq("id", id).eq("status", "failed").select("id,status").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ServiceError("Fix not found or not in failed state.", "conflict");
  return data;
}

// ------------------------------------------------------------------ activity
export type ActivityItem = { id: string; label: string; source: string; severity: "info" | "warning" | "error"; projectId: string | null; createdAt: string };

export async function getActivity(opts: { limit?: number; source?: string; severity?: string } = {}): Promise<ActivityItem[]> {
  const db = createAdminClient();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const [usage, funnel, audit, mcp] = await Promise.all([
    db.from("usage_events").select("id,project_id,agent_type,status,created_at").order("created_at", { ascending: false }).limit(limit),
    db.from("marketing_funnel_events").select("id,event,created_at").order("created_at", { ascending: false }).limit(limit),
    db.from("platform_audit_log").select("id,via,action,status,target_type,target_id,created_at").order("created_at", { ascending: false }).limit(limit),
    db.from("platform_mcp_events").select("id,event_type,payload,created_at").in("event_type", ["note", "activity"]).order("created_at", { ascending: false }).limit(limit),
  ]);
  const items: ActivityItem[] = [
    ...(usage.data ?? []).map((e) => ({ id: `usage-${e.id}`, label: `${e.agent_type} · ${e.status}`, source: "usage_events", severity: e.status === "failed" ? "error" as const : "info" as const, projectId: e.project_id as string | null, createdAt: e.created_at as string })),
    ...(funnel.data ?? []).map((e) => ({ id: `funnel-${e.id}`, label: String(e.event).replaceAll("_", " "), source: "marketing_funnel_events", severity: e.event === "audit_failed" ? "error" as const : "info" as const, projectId: null, createdAt: e.created_at as string })),
    ...(audit.data ?? []).map((e) => ({ id: `audit-${e.id}`, label: `${e.action}${e.target_id ? ` · ${String(e.target_id).slice(0, 8)}` : ""}`, source: `admin:${e.via}`, severity: e.status === "error" ? "error" as const : e.status === "denied" ? "warning" as const : "info" as const, projectId: null, createdAt: e.created_at as string })),
    ...(mcp.data ?? []).map((e) => ({ id: `mcp-${e.id}`, label: String((e.payload as { title?: string; content?: string })?.title || (e.payload as { content?: string })?.content || e.event_type).slice(0, 120), source: `mcp:${e.event_type}`, severity: "info" as const, projectId: null, createdAt: e.created_at as string })),
  ];
  return items
    .filter((i) => (!opts.source || i.source.startsWith(opts.source)) && (!opts.severity || i.severity === opts.severity))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// ------------------------------------------------------------------ build
export async function getBuildInfo() {
  const result = {
    ci: "unknown" as "success" | "failure" | "running" | "unknown",
    runs: [] as { id: number; name: string; message: string; status: string; conclusion: string | null; url: string; createdAt: string; branch: string }[],
    deployments: [] as { id: string; state: string; url: string | null; createdAt: number; target: string | null; message: string | null }[],
    github: "error" as "healthy" | "error",
    vercel: "not_configured" as "healthy" | "error" | "not_configured",
    canRerun: Boolean(process.env.GITHUB_TOKEN),
  };
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=20`, { headers: githubHeaders(), cache: "no-store" });
    if (response.ok) {
      const payload = await response.json() as { workflow_runs?: Array<Record<string, unknown>> };
      const runs = payload.workflow_runs ?? [];
      result.github = "healthy";
      result.runs = runs.map((run) => ({
        id: run.id as number, name: String(run.name ?? "workflow"), message: String((run.head_commit as { message?: string } | null)?.message ?? "").split("\n")[0],
        status: String(run.status), conclusion: (run.conclusion as string | null) ?? null, url: String(run.html_url), createdAt: String(run.created_at), branch: String(run.head_branch ?? ""),
      }));
      const latest = result.runs[0];
      result.ci = !latest ? "unknown" : latest.status === "in_progress" || latest.status === "queued" ? "running" : latest.conclusion === "success" ? "success" : latest.conclusion === "failure" ? "failure" : "unknown";
    }
  } catch {}
  if (process.env.VERCEL_TOKEN) {
    try {
      const project = process.env.VERCEL_PROJECT_ID ? `&projectId=${encodeURIComponent(process.env.VERCEL_PROJECT_ID)}` : "";
      const response = await fetch(vercelUrl(`/v6/deployments?limit=10${project}`), { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` }, cache: "no-store" });
      if (response.ok) {
        const payload = await response.json() as { deployments?: Array<Record<string, unknown>> };
        result.vercel = "healthy";
        result.deployments = (payload.deployments ?? []).map((d) => ({
          id: String(d.uid), state: String(d.state ?? d.readyState ?? "unknown"), url: d.url ? `https://${d.url}` : null,
          createdAt: Number(d.created ?? 0), target: (d.target as string | null) ?? null,
          message: ((d.meta as { githubCommitMessage?: string } | undefined)?.githubCommitMessage ?? null),
        }));
      } else result.vercel = "error";
    } catch { result.vercel = "error"; }
  }
  return result;
}

export async function rerunWorkflow(runId: number, failedOnly = true) {
  if (!process.env.GITHUB_TOKEN) throw new ServiceError("GITHUB_TOKEN is not configured.", "config");
  const path = failedOnly ? "rerun-failed-jobs" : "rerun";
  const response = await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${runId}/${path}`, { method: "POST", headers: githubHeaders(), cache: "no-store" });
  if (!response.ok) throw new ServiceError(`GitHub rerun failed: HTTP ${response.status}`, "upstream");
  return { ok: true, run_id: runId };
}

// ------------------------------------------------------------------ health
export type HealthResult = { service: string; status: "healthy" | "degraded" | "error" | "not_configured"; latencyMs: number | null; detail: string | null };

async function timed(service: string, fn: () => Promise<{ status: HealthResult["status"]; detail?: string }>): Promise<HealthResult> {
  const start = Date.now();
  try {
    const out = await fn();
    const latencyMs = Date.now() - start;
    return { service, status: out.status === "healthy" && latencyMs > 2500 ? "degraded" : out.status, latencyMs, detail: out.detail ?? null };
  } catch (error) {
    return { service, status: "error", latencyMs: Date.now() - start, detail: error instanceof Error ? error.message.slice(0, 200) : "check failed" };
  }
}

export async function runHealthChecks(record = true): Promise<HealthResult[]> {
  const db = createAdminClient();
  const results = await Promise.all([
    timed("database", async () => {
      const { error } = await db.from("profiles").select("id", { head: true, count: "exact" }).limit(1);
      return error ? { status: "error" as const, detail: error.message } : { status: "healthy" as const };
    }),
    timed("supabase_auth", async () => {
      const { error } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
      return error ? { status: "error" as const, detail: error.message } : { status: "healthy" as const };
    }),
    timed("github", async () => {
      const response = await fetch(`https://api.github.com/repos/${REPO}`, { headers: githubHeaders(), cache: "no-store" });
      return response.ok ? { status: "healthy" as const, detail: process.env.GITHUB_TOKEN ? undefined : "unauthenticated (rate-limited)" } : { status: "error" as const, detail: `HTTP ${response.status}` };
    }),
    timed("vercel", async () => {
      if (!process.env.VERCEL_TOKEN) return { status: "not_configured" as const };
      const response = await fetch(vercelUrl("/v2/user"), { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` }, cache: "no-store" });
      return response.ok ? { status: "healthy" as const } : { status: "error" as const, detail: `HTTP ${response.status}` };
    }),
    timed("gmail", async () => {
      const { data } = await db.from("integration_connections").select("external_email,token_expiry").is("project_id", null).eq("provider", "gmail").limit(1).maybeSingle();
      if (!data) return { status: "not_configured" as const, detail: "No Gmail account connected." };
      return { status: "healthy" as const, detail: data.external_email ?? undefined };
    }),
    timed("lead_research", async () => {
      const missing = [!process.env.TAVILY_API_KEY && "TAVILY_API_KEY", !process.env.OPENAI_API_KEY && "OPENAI_API_KEY"].filter(Boolean);
      return missing.length ? { status: "not_configured" as const, detail: `Missing ${missing.join(", ")}` } : { status: "healthy" as const };
    }),
  ]);
  if (record) {
    await db.from("platform_health_checks").insert(results.map((r) => ({ service: r.service, status: r.status, latency_ms: r.latencyMs, detail: r.detail })));
  }
  return results;
}

export async function healthHistory(hours = 24) {
  const db = createAdminClient();
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data, error } = await db.from("platform_health_checks").select("service,status,latency_ms,detail,checked_at").gte("checked_at", since).order("checked_at", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  const byService = new Map<string, { total: number; ok: number; latest: (typeof data)[number] | null; avgLatency: number; latencySum: number; latencyN: number }>();
  for (const row of data ?? []) {
    const entry = byService.get(row.service) ?? { total: 0, ok: 0, latest: null, avgLatency: 0, latencySum: 0, latencyN: 0 };
    entry.total += 1;
    if (row.status === "healthy" || row.status === "not_configured") entry.ok += 1;
    if (!entry.latest) entry.latest = row;
    if (row.latency_ms != null) { entry.latencySum += row.latency_ms; entry.latencyN += 1; }
    byService.set(row.service, entry);
  }
  return [...byService.entries()].map(([service, e]) => ({
    service, checks: e.total, uptime_pct: e.total ? Math.round((e.ok / e.total) * 1000) / 10 : null,
    avg_latency_ms: e.latencyN ? Math.round(e.latencySum / e.latencyN) : null, latest: e.latest,
  }));
}

// ------------------------------------------------------------------ trends
export async function getTrends(days = 14) {
  const db = createAdminClient();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const [usage, leads, sent, signups] = await Promise.all([
    db.from("usage_events").select("created_at").gte("created_at", since).limit(10000),
    db.from("leads").select("created_at").eq("scope", "platform").gte("created_at", since).limit(10000),
    db.from("outreach_messages").select("sent_at").eq("status", "sent").gte("sent_at", since).limit(10000),
    db.from("marketing_funnel_events").select("created_at").eq("event", "signup_completed").gte("created_at", since).limit(10000),
  ]);
  const labels: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) labels.push(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10));
  const bucket = (rows: Array<Record<string, unknown>> | null, field: string) => {
    const counts = new Map(labels.map((l) => [l, 0]));
    for (const row of rows ?? []) {
      const day = String(row[field] ?? "").slice(0, 10);
      if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return labels.map((l) => counts.get(l) ?? 0);
  };
  return {
    days: labels,
    usage: bucket(usage.data, "created_at"),
    platform_leads: bucket(leads.data, "created_at"),
    emails_sent: bucket(sent.data, "sent_at"),
    signups: bucket(signups.data, "created_at"),
  };
}

// ------------------------------------------------------------------ config status
export async function getConfigStatus(adminUserId: string) {
  const db = createAdminClient();
  const { data: gmail } = await db.from("integration_connections").select("external_email").eq("user_id", adminUserId).is("project_id", null).eq("provider", "gmail").maybeSingle();
  return {
    admins: (process.env.MARLO_ADMIN_USER_IDS ?? "").split(",").map((v) => v.trim()).filter(Boolean).length,
    flags: {
      supabase_public: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      supabase_server_url: Boolean(process.env.MARLO_SUPABASE_URL),
      supabase_secret_key: Boolean(process.env.MARLO_SUPABASE_SECRET_KEY),
      admin_ids: Boolean(process.env.MARLO_ADMIN_USER_IDS?.trim()),
      gmail_oauth_app: Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET),
      research_keys: Boolean(process.env.TAVILY_API_KEY && process.env.OPENAI_API_KEY),
      github_token: Boolean(process.env.GITHUB_TOKEN),
      vercel_token: Boolean(process.env.VERCEL_TOKEN),
      cron_secret: Boolean(process.env.CRON_SECRET),
      mcp_issuer: Boolean(process.env.MARLO_MCP_ISSUER),
    },
    gmail: { connected: Boolean(gmail), email: gmail?.external_email ?? null },
  };
}
