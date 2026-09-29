import { createAdminClient } from "@/lib/admin";

export type FunnelStage = { label: string; count: number; rate: number };

export type PlatformOverview = {
  users: number;
  projects: number;
  leads: number;
  funnelEvents: number;
  auditsCompleted: number;
  signupsCompleted: number;
  usageEvents: number;
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
    ...events.map((event) =>
      db.from("marketing_funnel_events").select("id", { count: "exact", head: true }).eq("event", event)
    ),
  ]);

  const errors = [users, projects, leads, funnelEvents, audits, signups, usage, ...funnelQueries].filter((x) => x.error);
  if (errors.length) throw new Error(errors[0].error?.message ?? "Platform data query failed");

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
    funnel: events.map((event, index) => ({
      label: event.replaceAll("_", " "),
      count: funnelCounts[index],
      rate: base ? Math.round((funnelCounts[index] / base) * 100) : 0,
    })),
    system: { supabase: "healthy", database: "healthy" },
  };
}
