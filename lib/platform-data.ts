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

export type FixStatus = {
  failed: number;
  critical: number;
  fixing: number;
  pending: number;
};

export type ActivityEvent = {
  id: string;
  label: string;
  source: string;
  severity: "info" | "warning" | "error";
  projectId: string | null;
  createdAt: string;
};

export type PlatformUser = { id: string; email: string | null; createdAt: string; projects: number };

export type PlatformProject = { id: string; ownerId: string; ownerEmail: string | null; name: string | null; url: string | null; category: string | null; createdAt: string };

export type SettingsStatus = {
  admins: number;
  supabase: boolean;
  secretKey: boolean;
  vercel: boolean;
  adminIds: boolean;
  gmail: boolean;
  gmailEmail: string | null;
};

export type PlatformOverview = {
  users: number;
  userDirectory: PlatformUser[];
  projectDirectory: PlatformProject[];
  projects: number;
  leads: number;
  funnelEvents: number;
  auditsCompleted: number;
  signupsCompleted: number;
  usageEvents: number;
  build: BuildStatus;
  monitor: MonitorStatus;
  grow: GrowStatus;
  fix: FixStatus;
  activity: {
    events: ActivityEvent[];
    today: number;
    errors: number;
    adminActions: number;
  };
  settings: SettingsStatus;
  funnel: FunnelStage[];
  system: { supabase: "healthy" | "error"; database: "healthy" | "error" };
};

export async function getPlatformOverview(adminUserId?: string): Promise<PlatformOverview> {
  const db = createAdminClient();
  const [{ data: authUsers, error: authUsersError }, { data: projectRows, error: projectRowsError }] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 100 }),
    db.from("projects").select("id,owner_id,name,url,category,created_at").order("created_at", { ascending: false }),
  ]);
  if (authUsersError) throw new Error(authUsersError.message);
  if (projectRowsError) throw new Error(projectRowsError.message);
  const projectCounts = new Map<string, number>();
  for (const project of projectRows ?? []) projectCounts.set(project.owner_id, (projectCounts.get(project.owner_id) ?? 0) + 1);
  const userDirectory: PlatformUser[] = (authUsers?.users ?? []).map((user) => ({ id: user.id, email: user.email ?? null, createdAt: user.created_at, projects: projectCounts.get(user.id) ?? 0 }));
  const authEmailById = new Map((authUsers?.users ?? []).map((user) => [user.id, user.email ?? null]));
  const projectDirectory: PlatformProject[] = (projectRows ?? []).map((project) => ({ id: project.id, ownerId: project.owner_id, ownerEmail: authEmailById.get(project.owner_id) ?? null, name: project.name ?? null, url: project.url ?? null, category: project.category ?? null, createdAt: project.created_at }));

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

  const [platformLeads, emailReady, sent, replies, marketingLeads] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).eq("scope", "platform"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("scope", "platform").not("email", "is", null),
    db.from("leads").select("id", { count: "exact", head: true }).eq("scope", "platform").not("emailed_at", "is", null),
    db.from("leads").select("id", { count: "exact", head: true }).eq("scope", "platform").not("last_reply_at", "is", null),
    db.from("marketing_leads").select("id", { count: "exact", head: true }),
  ]);
  const growErrors = [platformLeads, emailReady, sent, replies, marketingLeads].filter((x) => x.error);
  if (growErrors.length) throw new Error(growErrors[0].error?.message ?? "Growth data query failed");

  const [failedFindings, criticalFindings, fixingFindings, pendingFixes, activityUsage, activityFunnel] = await Promise.all([
    db.from("findings").select("id", { count: "exact", head: true }).eq("status", "failed"),
    db.from("findings").select("id", { count: "exact", head: true }).eq("severity", "critical").not("status", "in", "(fixed,verified)"),
    db.from("findings").select("id", { count: "exact", head: true }).eq("status", "fixing"),
    db.from("code_fixes").select("id", { count: "exact", head: true }).in("status", ["pending", "failed"]),
    db.from("usage_events").select("id,user_id,project_id,agent_type,status,created_at").order("created_at", { ascending: false }).limit(20),
    db.from("marketing_funnel_events").select("id,event,created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const fixErrors = [failedFindings, criticalFindings, fixingFindings, pendingFixes, activityUsage, activityFunnel].filter((x) => x.error);
  if (fixErrors.length) throw new Error(fixErrors[0].error?.message ?? "Fix data query failed");

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

  let gmail = false;
  let gmailEmail: string | null = null;
  if (adminUserId) {
    const { data: gmailConnection } = await db.from("integration_connections")
      .select("external_email")
      .eq("user_id", adminUserId)
      .is("project_id", null)
      .eq("provider", "gmail")
      .maybeSingle();
    gmail = Boolean(gmailConnection);
    gmailEmail = gmailConnection?.external_email ?? null;
  }

  const monitor: MonitorStatus = {
    database: errors.length ? "error" : "healthy",
    supabase: errors.length ? "error" : "healthy",
    github: build.ci === "unknown" ? "error" : "healthy",
    vercel: process.env.VERCEL_TOKEN ? "configured" : "not_configured",
    checkedAt: new Date().toISOString(),
  };
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const activityEvents: ActivityEvent[] = [
    ...(activityUsage.data ?? []).map((event: { id: string; user_id: string; project_id: string | null; agent_type: string; status: string; created_at: string }) => ({
      id: `usage-${event.id}`,
      label: `${event.agent_type} · ${event.status}`,
      source: "usage_events",
      severity: event.status === "failed" ? "error" as const : "info" as const,
      projectId: event.project_id,
      createdAt: event.created_at,
    })),
    ...(activityFunnel.data ?? []).map((event: { id: string; event: string; created_at: string }) => ({
      id: `funnel-${event.id}`,
      label: event.event.replaceAll("_", " "),
      source: "marketing_funnel_events",
      severity: event.event === "audit_failed" ? "error" as const : "info" as const,
      projectId: null,
      createdAt: event.created_at,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 30);
  const today = activityEvents.filter((event) => new Date(event.createdAt).getTime() >= dayStart.getTime()).length;
  const activityErrors = activityEvents.filter((event) => event.severity === "error").length;
  const funnelCounts = funnelQueries.map((query) => query.count ?? 0);
  const base = funnelCounts[0] || 0;

  return {
    users: users.count ?? 0,
    userDirectory,
    projectDirectory,
    projects: projects.count ?? 0,
    leads: leads.count ?? 0,
    funnelEvents: funnelEvents.count ?? 0,
    auditsCompleted: audits.count ?? 0,
    signupsCompleted: signups.count ?? 0,
    usageEvents: usage.count ?? 0,
    build,
    monitor,
    grow: { leads: leads.count ?? 0, emailReady: emailReady.count ?? 0, sent: sent.count ?? 0, replies: replies.count ?? 0, marketingLeads: marketingLeads.count ?? 0 },
    fix: { failed: failedFindings.count ?? 0, critical: criticalFindings.count ?? 0, fixing: fixingFindings.count ?? 0, pending: pendingFixes.count ?? 0 },
    activity: { events: activityEvents, today, errors: activityErrors, adminActions: 0 },
    settings: {
      admins: (process.env.MARLO_ADMIN_USER_IDS ?? "").split(",").map((v) => v.trim()).filter(Boolean).length,
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      secretKey: Boolean(process.env.SUPABASE_SECRET_KEY),
      vercel: Boolean(process.env.VERCEL_TOKEN),
      adminIds: Boolean(process.env.MARLO_ADMIN_USER_IDS?.trim()),
      gmail,
      gmailEmail,
    },
    funnel: events.map((event, index) => ({ label: event.replaceAll("_", " "), count: funnelCounts[index], rate: base ? Math.round((funnelCounts[index] / base) * 100) : 0 })),
    system: { supabase: "healthy", database: "healthy" },
  };
}
