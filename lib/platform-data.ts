import { createAdminClient } from "@/lib/admin";

export type PlatformOverview = {
  users: number;
  projects: number;
  leads: number;
  funnelEvents: number;
  auditsCompleted: number;
  signupsCompleted: number;
  usageEvents: number;
};

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const db = createAdminClient();
  const [users, projects, leads, funnelEvents, audits, signups, usage] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("projects").select("id", { count: "exact", head: true }),
    db.from("leads").select("id", { count: "exact", head: true }),
    db.from("marketing_funnel_events").select("id", { count: "exact", head: true }),
    db.from("marketing_funnel_events").select("id", { count: "exact", head: true }).eq("event", "audit_completed"),
    db.from("marketing_funnel_events").select("id", { count: "exact", head: true }).eq("event", "signup_completed"),
    db.from("usage_events").select("id", { count: "exact", head: true }),
  ]);

  const errors = [users, projects, leads, funnelEvents, audits, signups, usage].filter(x => x.error);
  if (errors.length) throw new Error(errors[0].error?.message ?? "Platform data query failed");

  return {
    users: users.count ?? 0,
    projects: projects.count ?? 0,
    leads: leads.count ?? 0,
    funnelEvents: funnelEvents.count ?? 0,
    auditsCompleted: audits.count ?? 0,
    signupsCompleted: signups.count ?? 0,
    usageEvents: usage.count ?? 0,
  };
}
