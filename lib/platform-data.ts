import { createAdminClient } from "@/lib/admin";

export type FunnelStage = { label: string; count: number; rate: number };

export type BuildStatus = {
  ci: "success" | "failure" | "running" | "unknown";
  latestRun: string;
  latestRunUrl: string | null;
  failures: number;
  deployment: "connected" | "not_configured";
};

export type MonitorStatus = {
  database: "healthy" | "error";
  github: "healthy" | "error";
  vercel: "configured" | "not_configured";
  supabase: "healthy" | "error";
  checkedAt: string;
};

export type GrowStatus = {
  leads: number;
  emailReady: number;
  sent: number;
  replies: number;
  marketingLeads: number;
};

export type PlatformOverview = {
  users: number;
  projects: number;
  leads: number;
  funnelEvents: number;
  auditsCompleted: number;
  signupsCompleted: number;
  usageEvents: number;
  build: BuildStatus;
  monitor: MonitorStatus;
  grow: GrowStatus;
  funnel: FunnelStage[];
  system: { supabase: "healthy" | "error"; database: "healthy" | "error" };
};

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const db = createAdminClient();
  const events = ["audit_started", "audit_completed", "signup_cta_clicked", "signup_completed"];

  const [users, projects, leads, funnelEvents, audits, signups, usage, ...funnelQueries] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("projects").select("id", { count: "exact", head: true }),
    db.from("leads").select("id", { count: "exact", head: true }),
    db.from("marketing_funnel_events").select("id", { count: "exact", head: true }),
    db.from("marketing_funnel_events").select("id", { count: "exact", head: true }).eq("event", "audit_completed"),
    db.from("marketing_funnel_events").select("id", { count: "exact", head: true }).eq("event", "signup_completed"),
    db.from("usage_events").select("id", { count: "exact", head: true }),
    ...events.map((event) => db.from("marketing_funnel_events").select("id", { count: "exact", head: true }).eq("event", event)),
  ]);

  const errors = [users, projects, leads, funnelEvents, audits, signups, usage, ...funnelQueries].filter((x) => x.error);
  if (errors.length) throw new Error(errors[0].error?.message ?? "Platform data query failed");

  const [emailReady, sent, replies, marketingLeads] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).not("email", "is", null),
    db.from("leads").select("id", { count: "exact", head: true }).not("emailed_at", "is", null),
    db.from("leads").select("id", { count: "exact", head: true }).not("last_reply_at", "is", null),
    db.from("marketing_leads").select("id", { count: "exact", head: true }),
  ]);
  const growErrors = [emailReady, sent, replies, marketingLeads].filter((x) => x.error);
  if (growErrors.length) throw new Error(growErrors[0].error?.message ?? "Growth data query failed");

  let build: BuildStatus = { ci: "unknown", latestRun: "Unavailable", latestRunUrl: null, failures: 0, deployment: process.env.VERCEL_TOKEN ? "connected" : "not_configured" };
  try {
    const response = await fetch("https://api.github.com/repos/Kumar2421/Marlo-platform/actions/runs?per_page=20", { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
      const latest = runs[0];
      build = {
        ci: latest?.status === "in_progress" || latest?.status === "queued" ? "running" : latest?.conclusion === "success" ? "success" : latest?.conclusion === "failure" ? "failure" : "unknown",
        latestRun: latest?.head_commit?.message ?? "No runs",
        latestRunUrl: latest?.html_url ?? null,
        failures: runs.filter((run: { conclusion?: string | null }) => run.conclusion === "failure").length,
        deployment: process.env.VERCEL_TOKEN ? "connected" : "not_configured",
      };
    }
  } catch {}

  const monitor: MonitorStatus = {
    database: errors.length ? "error" : "healthy",
    supabase: errors.length ? "error" : "healthy",
    github: build.ci === "unknown" ? "error" : "healthy",
    vercel: process.env.VERCEL_TOKEN ? "configured" : "not_configured",
    checkedAt: new Date().toISOString(),
  };
  const funnelCounts = funnelQueries.map((query) => query.count ?? 0);
  const base = funnelCounts[0] || 0;

  return {
    users: users.count ?? 0,
    projects: projects.count ?? 0,
    leads: leads.count ?? 0,
    funnelEvents: funnelEvents.count ?? 0,
    auditsCompleted: audits.count ?? 0,
    signupsCompleted: signups.count ?? 0,
    usageEvents: usage.count ?? 0,
    build,
    monitor,
    grow: { leads: leads.count ?? 0, emailReady: emailReady.count ?? 0, sent: sent.count ?? 0, replies: replies.count ?? 0, marketingLeads: marketingLeads.count ?? 0 },
    funnel: events.map((event, index) => ({ label: event.replaceAll("_", " "), count: funnelCounts[index], rate: base ? Math.round((funnelCounts[index] / base) * 100) : 0 })),
    system: { supabase: "healthy", database: "healthy" },
  };
}
