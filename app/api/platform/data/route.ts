import { adminRoute, intParam, param, readJson } from "@/lib/api";
import { listAudit } from "@/lib/services/audit";
import { getActivity, getBuildInfo, getPlatformProject, getTrends, healthHistory, listFindings, listFixes, listPlatformProjects, listPlatformUsers, requeueFix, rerunWorkflow, runHealthChecks } from "@/lib/services/platform";
import { getPlatformOverview } from "@/lib/platform-data";
import { listMcpSessions, revokeClient, revokeFamily } from "@/lib/mcp-auth";
import { ServiceError } from "@/lib/services/types";
import { getSendSettings } from "@/lib/services/settings";
import { tools } from "@/lib/mcp/tools";
import { getConfigStatus } from "@/lib/services/platform";
import { SUPPORTED_SCOPES } from "@/lib/mcp-auth";

// Per-tab data for the dashboards: GET /api/platform/data?tab=<name>. Tabs fetch only what they show.
export const GET = adminRoute(async (actor, req) => {
  switch (param(req, "tab")) {
    case "overview": {
      const [overview, trends, health] = await Promise.all([getPlatformOverview(actor.userId), getTrends(intParam(req, "days") ?? 14), healthHistory(24)]);
      const { userDirectory: _u, projectDirectory: _p, ...summary } = overview;
      void _u; void _p;
      return { overview: summary, trends, health };
    }
    case "users":
      return listPlatformUsers({ page: intParam(req, "page"), perPage: intParam(req, "per_page"), query: param(req, "q") });
    case "projects":
      return param(req, "id")
        ? getPlatformProject(String(param(req, "id")))
        : listPlatformProjects({ query: param(req, "q"), ownerId: param(req, "owner_id"), before: param(req, "cursor"), limit: intParam(req, "limit") });
    case "build":
      return getBuildInfo();
    case "monitor":
      return { history: await healthHistory(intParam(req, "hours") ?? 24) };
    case "fix": {
      const [findings, fixes] = await Promise.all([
        listFindings({ status: param(req, "status"), severity: param(req, "severity"), projectId: param(req, "project_id"), limit: intParam(req, "limit") ?? 50 }),
        listFixes({ status: param(req, "fix_status"), projectId: param(req, "project_id"), limit: intParam(req, "limit") ?? 50 }),
      ]);
      return { findings, fixes };
    }
    case "activity":
      return { events: await getActivity({ limit: intParam(req, "limit") ?? 100, source: param(req, "source"), severity: param(req, "severity") }) };
    case "settings": {
      const [sessions, audit] = await Promise.all([listMcpSessions(), listAudit({ limit: 50 })]);
      return { ...sessions, audit };
    }
    case "config": {
      const [config, send] = await Promise.all([getConfigStatus(actor.userId), getSendSettings()]);
      const origin = new URL(process.env.MARLO_MCP_ISSUER ?? req.url).origin;
      return { ...config, send_settings: send, mcp: { endpoint: origin + "/mcp", scopes: SUPPORTED_SCOPES, tools: tools.map((t) => ({ name: t.name, title: t.title, scope: t.scope, destructive: Boolean(t.destructive) })) } };
    }
    case "audit":
      return { entries: await listAudit({ limit: intParam(req, "limit") ?? 100, before: param(req, "before"), action: param(req, "action"), via: param(req, "via"), status: param(req, "status") }) };
    default:
      throw new ServiceError("Unknown tab.");
  }
});

export const POST = adminRoute(async (_actor, req) => {
  const body = await readJson(req);
  switch (body.action) {
    case "rerun_ci": return rerunWorkflow(Number(body.runId), body.failedOnly !== false);
    case "run_health": return { checks: await runHealthChecks(true), history: await healthHistory(24) };
    case "requeue_fix": return requeueFix(String(body.id));
    case "revoke_session": return { revoked_tokens: await revokeFamily(String(body.familyId)) };
    case "revoke_client": return { revoked_tokens: await revokeClient(String(body.clientId)) };
    default: throw new ServiceError("Unknown action.");
  }
}, async (req) => {
  const body = await req.clone().json().catch(() => null) as { action?: string } | null;
  return body?.action ? `platform.${body.action}` : null;
});
