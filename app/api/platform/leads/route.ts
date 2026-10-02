import { adminRoute, param, readJson } from "@/lib/api";
import { deleteLeads, importLeads, leadStats, listLeads, tagLeads, updateLead, type LeadFilters, type LeadInput } from "@/lib/services/leads";
import { ServiceError } from "@/lib/services/types";

export const GET = adminRoute(async (_actor, req) => {
  const hasEmail = param(req, "has_email");
  const [page, stats] = await Promise.all([
    listLeads({
      status: param(req, "status") as LeadFilters["status"], query: param(req, "q"), tag: param(req, "tag"), quality: param(req, "quality"),
      hasEmail: hasEmail === undefined ? undefined : hasEmail === "true", before: param(req, "cursor"), limit: Number(param(req, "limit")) || undefined,
    }),
    param(req, "cursor") ? Promise.resolve(null) : leadStats(),
  ]);
  return { ...page, stats };
});

// One action endpoint keeps the UI contract identical to the MCP tools of the same name.
export const POST = adminRoute(async (actor, req) => {
  const body = await readJson(req);
  switch (body.action) {
    case "import":
      return importLeads(actor, body.leads as LeadInput[], { dryRun: Boolean(body.dryRun), query: body.query as string | undefined, tags: body.tags as string[] | undefined });
    case "update":
      return { lead: await updateLead(String(body.id), (body.patch ?? {}) as LeadInput) };
    case "tag":
      return tagLeads((body.ids as string[]) ?? [], body.add as string[] | undefined, body.remove as string[] | undefined);
    case "delete":
      return deleteLeads((body.ids as string[]) ?? [], Boolean(body.force));
    default:
      throw new ServiceError("Unknown action.");
  }
}, async (req) => {
  const body = await req.clone().json().catch(() => null) as { action?: string } | null;
  return body?.action && body.action !== "preview" ? `leads.${body.action}` : null;
});
