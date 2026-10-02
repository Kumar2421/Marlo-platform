import { createAdminClient } from "@/lib/admin";
import { getPlatformOverview } from "@/lib/platform-data";
import { listAudit } from "@/lib/services/audit";
import { getBuildInfo, getActivity, getPlatformProject, getTrends, healthHistory, listFindings, listFixes, listPlatformProjects, listPlatformUsers, requeueFix, rerunWorkflow, runHealthChecks } from "@/lib/services/platform";
import { leadStats } from "@/lib/services/leads";
import { outreachStats } from "@/lib/services/outreach";
import { getSendSettings, updateSendSettings } from "@/lib/services/settings";
import { listMcpSessions, revokeClient, revokeFamily } from "@/lib/mcp-auth";
import { ServiceError } from "@/lib/services/types";
import { bool, int, obj, str, type ToolDef } from "../registry";

export const platformTools: ToolDef[] = [
  {
    name: "marlo.get_platform_status", title: "Platform status", scope: "read",
    description: "Acquisition and outreach counters (leads, email-ready, sent, replies, queue and daily allowance).",
    inputSchema: obj({}),
    handler: async () => {
      const [leads, outreach] = await Promise.all([leadStats(), outreachStats()]);
      return { leads: leads.total, email_ready: leads.with_email, sent: leads.sent, replies: leads.replied, unsubscribed: leads.unsubscribed, failed: leads.failed, outreach };
    },
  },
  {
    name: "marlo.get_overview", title: "Dashboard overview", scope: "read",
    description: "The same snapshot the Overview/Grow/Fix/Settings dashboards show: users, projects, funnel, CI, health, grow and fix counters.",
    inputSchema: obj({}),
    handler: async ({ actor }) => {
      const overview = await getPlatformOverview(actor.userId);
      const { userDirectory, projectDirectory, activity, ...rest } = overview;
      return { ...rest, activity: { today: activity.today, errors: activity.errors }, directory_sizes: { users: userDirectory.length, projects: projectDirectory.length } };
    },
  },
  {
    name: "marlo.get_trends", title: "Daily trends", scope: "read",
    description: "Per-day counts for usage events, new platform leads, emails sent and signups.",
    inputSchema: obj({ days: int("Window in days (default 14)", 1, 90) }),
    handler: async (_ctx, args) => getTrends((args.days as number | undefined) ?? 14),
  },
  {
    name: "marlo.list_users", title: "List users", scope: "read",
    description: "Customer accounts with project counts, last sign-in and admin flag. Paged.",
    inputSchema: obj({ page: int("Page (1-based)", 1), per_page: int("Page size", 1, 200), query: str("Match email or id prefix within the page") }),
    handler: async (_ctx, args) => listPlatformUsers({ page: args.page as number | undefined, perPage: args.per_page as number | undefined, query: args.query as string | undefined }),
  },
  {
    name: "marlo.list_projects", title: "List projects", scope: "read",
    description: "Customer projects, newest first.",
    inputSchema: obj({ query: str("Match name or URL"), owner_id: str("Owner user id"), cursor: str("next_cursor from a previous page"), limit: int("Page size", 1, 200) }),
    handler: async (_ctx, args) => listPlatformProjects({ query: args.query as string | undefined, ownerId: args.owner_id as string | undefined, before: args.cursor as string | undefined, limit: args.limit as number | undefined }),
  },
  {
    name: "marlo.get_project", title: "Project detail", scope: "read",
    description: "A project with its owner, finding counts and recent agent usage.",
    inputSchema: obj({ id: str("Project id") }, ["id"]),
    handler: async (_ctx, args) => getPlatformProject(String(args.id)),
  },
  {
    name: "marlo.list_findings", title: "List findings", scope: "read",
    description: "Audit findings across customer projects.",
    inputSchema: obj({ status: str("Finding status"), severity: str("Severity, e.g. critical"), project_id: str("Project id"), limit: int("Page size", 1, 200) }),
    handler: async (_ctx, args) => ({ findings: await listFindings({ status: args.status as string | undefined, severity: args.severity as string | undefined, projectId: args.project_id as string | undefined, limit: args.limit as number | undefined }) }),
  },
  {
    name: "marlo.list_fixes", title: "List code fixes", scope: "read",
    description: "Automated code fixes and their state.",
    inputSchema: obj({ status: str("Fix status: pending, failed, ..."), project_id: str("Project id"), limit: int("Page size", 1, 200) }),
    handler: async (_ctx, args) => ({ fixes: await listFixes({ status: args.status as string | undefined, projectId: args.project_id as string | undefined, limit: args.limit as number | undefined }) }),
  },
  {
    name: "marlo.requeue_fix", title: "Requeue a failed fix", scope: "write",
    description: "Move a failed code fix back to pending so the fixer retries it.",
    inputSchema: obj({ id: str("Fix id") }, ["id"]),
    handler: async (_ctx, args) => requeueFix(String(args.id)),
  },
  {
    name: "marlo.get_activity", title: "Activity stream", scope: "read",
    description: "Merged stream of agent usage, funnel events, admin/MCP audit actions and notes.",
    inputSchema: obj({ limit: int("Max events", 1, 200), source: str("Source prefix, e.g. usage_events, admin, mcp"), severity: str("Severity", { enum: ["info", "warning", "error"] }) }),
    handler: async (_ctx, args) => ({ events: await getActivity({ limit: args.limit as number | undefined, source: args.source as string | undefined, severity: args.severity as string | undefined }) }),
  },
  {
    name: "marlo.get_build_status", title: "Build and deploy status", scope: "read",
    description: "Recent GitHub Actions runs and Vercel deployments.",
    inputSchema: obj({}),
    handler: async () => getBuildInfo(),
  },
  {
    name: "marlo.rerun_ci", title: "Rerun CI", scope: "admin",
    description: "Re-run a GitHub Actions run (failed jobs only by default). Needs GITHUB_TOKEN with actions:write.",
    inputSchema: obj({ run_id: int("Workflow run id", 1), failed_only: bool("Only rerun failed jobs (default true)") }, ["run_id"]),
    handler: async (_ctx, args) => rerunWorkflow(Number(args.run_id), args.failed_only !== false),
  },
  {
    name: "marlo.run_health_checks", title: "Run health checks", scope: "read",
    description: "Check database, auth, GitHub, Vercel, Gmail and research keys now; the results are recorded in health history.",
    inputSchema: obj({}),
    handler: async () => ({ checks: await runHealthChecks(true) }),
  },
  {
    name: "marlo.get_health_history", title: "Health history", scope: "read",
    description: "Uptime percentage and average latency per service.",
    inputSchema: obj({ hours: int("Window in hours (default 24)", 1, 720) }),
    handler: async (_ctx, args) => ({ services: await healthHistory((args.hours as number | undefined) ?? 24) }),
  },
  {
    name: "marlo.create_note", title: "Add note", scope: "write",
    description: "Store a note in the admin activity stream.",
    inputSchema: obj({ title: str("Title", { maxLength: 200 }), content: str("Content", { maxLength: 5000 }), metadata: { type: "object", description: "Extra structured data" } }, ["content"]),
    handler: async ({ actor }, args) => addEvent(actor.userId, actor.clientId ?? "", "note", args),
  },
  {
    name: "marlo.create_activity", title: "Log activity", scope: "write",
    description: "Store a structured activity event for admin review.",
    inputSchema: obj({ title: str("Title", { maxLength: 200 }), content: str("Content", { maxLength: 5000 }), metadata: { type: "object", description: "Extra structured data" } }, ["content"]),
    handler: async ({ actor }, args) => addEvent(actor.userId, actor.clientId ?? "", "activity", args),
  },
  {
    name: "marlo.get_send_settings", title: "Get send settings", scope: "read",
    description: "Daily cap, delay, batch size, signature and unsubscribe line used for outreach.",
    inputSchema: obj({}),
    handler: async () => getSendSettings(),
  },
  {
    name: "marlo.update_send_settings", title: "Update send settings", scope: "admin",
    description: "Change outreach safety limits and the footer appended to every email.",
    inputSchema: obj({
      daily_send_cap: int("Max emails per UTC day", 1, 500), send_delay_seconds: int("Pause between sends", 0, 30), max_per_batch: int("Max per send_queued call", 1, 25),
      signature: str("Signature appended to every email", { maxLength: 1000 }), unsubscribe_line: str("Unsubscribe line appended to every email", { maxLength: 500 }),
    }),
    handler: async (_ctx, args) => updateSendSettings({
      dailySendCap: args.daily_send_cap as number | undefined, sendDelaySeconds: args.send_delay_seconds as number | undefined, maxPerBatch: args.max_per_batch as number | undefined,
      signature: args.signature as string | undefined, unsubscribeLine: args.unsubscribe_line as string | undefined,
    }),
  },
  {
    name: "marlo.get_audit_log", title: "Audit log", scope: "admin",
    description: "Who did what: every admin UI and MCP write action.",
    inputSchema: obj({ limit: int("Max rows", 1, 200), action: str("Match action name"), via: str("ui or mcp", { enum: ["ui", "mcp"] }), status: str("Status", { enum: ["ok", "error", "denied"] }), before: str("Created-before cursor") }),
    handler: async (_ctx, args) => ({ entries: await listAudit({ limit: args.limit as number | undefined, action: args.action as string | undefined, via: args.via as string | undefined, status: args.status as string | undefined, before: args.before as string | undefined }) }),
  },
  {
    name: "marlo.list_mcp_sessions", title: "List MCP sessions", scope: "admin",
    description: "Connected MCP clients and active sessions.",
    inputSchema: obj({}),
    handler: async () => listMcpSessions(),
  },
  {
    name: "marlo.revoke_mcp_session", title: "Revoke MCP session or client", scope: "admin", destructive: true,
    description: "Revoke one session (family_id) or every token of a client (client_id).",
    inputSchema: obj({ family_id: str("Session id from list_mcp_sessions"), client_id: str("Revoke everything for this client") }),
    handler: async (_ctx, args) => {
      if (args.client_id) return { revoked_tokens: await revokeClient(String(args.client_id)) };
      if (args.family_id) return { revoked_tokens: await revokeFamily(String(args.family_id)) };
      throw new ServiceError("family_id or client_id is required.");
    },
  },
];

async function addEvent(userId: string, clientId: string, type: "note" | "activity", args: Record<string, unknown>) {
  const db = createAdminClient();
  const { data, error } = await db.from("platform_mcp_events").insert({
    user_id: userId, client_id: clientId, event_type: type,
    payload: { title: String(args.title ?? "").trim(), content: String(args.content ?? "").trim(), metadata: args.metadata ?? {} },
  }).select("id,event_type,payload,created_at").single();
  if (error) throw new Error(error.message);
  return data;
}
