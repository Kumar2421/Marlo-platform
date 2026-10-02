import { researchLeads } from "@/lib/lead-research";
import { deleteLeads, getLead, importLeads, leadStats, listLeads, tagLeads, updateLead, type LeadFilters, type LeadInput } from "@/lib/services/leads";
import { bool, int, leadFields, leadStatusEnum, obj, str, strList, type ToolDef } from "../registry";

const filterProps = {
  status: str("Lead state filter", { enum: leadStatusEnum }),
  has_email: bool("Only leads that do (true) or do not (false) have an email"),
  quality: str("email_quality value, e.g. source_found"),
  query: str("Free-text match on name, company, title or email"),
  tag: str("Only leads carrying this tag"),
  cursor: str("next_cursor from a previous page"),
  limit: int("Page size (default 50)", 1, 200),
};

function toFilters(args: Record<string, unknown>): LeadFilters {
  return {
    status: args.status as LeadFilters["status"], hasEmail: args.has_email as boolean | undefined,
    quality: args.quality as string | undefined, query: args.query as string | undefined, tag: args.tag as string | undefined,
    before: args.cursor as string | undefined, limit: args.limit as number | undefined,
  };
}

export const leadTools: ToolDef[] = [
  {
    name: "marlo.list_leads", title: "List leads", scope: "read",
    description: "Page through platform acquisition leads with filters. Returns next_cursor when more rows exist.",
    inputSchema: obj(filterProps),
    handler: async (_ctx, args) => listLeads(toFilters(args)),
  },
  {
    name: "marlo.get_leads", title: "Get recent leads", scope: "read",
    description: "Alias of list_leads kept for older clients.",
    inputSchema: obj(filterProps),
    handler: async (_ctx, args) => listLeads(toFilters(args)),
  },
  {
    name: "marlo.get_lead", title: "Get lead", scope: "read",
    description: "One lead with its outreach message history.",
    inputSchema: obj({ id: str("Lead id") }, ["id"]),
    handler: async (_ctx, args) => getLead(String(args.id)),
  },
  {
    name: "marlo.lead_stats", title: "Lead statistics", scope: "read",
    description: "Counts: total, with email, sent, replied, unsubscribed, failed.",
    inputSchema: obj({}),
    handler: async () => leadStats(),
  },
  {
    name: "marlo.import_leads", title: "Import leads (bulk)", scope: "write",
    description:
      "Import up to 500 leads in one call. Duplicates (same email, or same source/name/company) are skipped, invalid rows are reported. " +
      "Use dry_run=true first to see what would happen. Only supply data found at a real source: never invent emails.",
    inputSchema: obj({
      leads: { type: "array", minItems: 1, maxItems: 500, description: "Lead objects", items: obj(leadFields) },
      dry_run: bool("Validate and count only; write nothing"),
      query: str("Label stored on every imported lead", { maxLength: 300 }),
      tags: strList("Tags applied to every imported lead", 20),
    }, ["leads"]),
    handler: async ({ actor }, args) => importLeads(actor, args.leads as LeadInput[], {
      dryRun: Boolean(args.dry_run), query: args.query as string | undefined, tags: args.tags as string[] | undefined,
    }),
  },
  {
    name: "marlo.create_lead", title: "Create one lead", scope: "write",
    description: "Import a single lead (same rules as import_leads).",
    inputSchema: obj(leadFields),
    handler: async ({ actor }, args) => {
      const result = await importLeads(actor, [args as LeadInput], { query: (args.query as string | undefined) ?? "MCP" });
      return { created: result.dry_run ? false : (result as { created: number }).created > 0, ...result };
    },
  },
  {
    name: "marlo.update_lead", title: "Update lead", scope: "write",
    description: "Edit fields on a lead. Changing the email re-keys the lead and fails if another lead owns that email.",
    inputSchema: obj({ id: str("Lead id"), ...leadFields }, ["id"]),
    handler: async (_ctx, args) => {
      const { id, ...patch } = args;
      return updateLead(String(id), patch as LeadInput);
    },
  },
  {
    name: "marlo.tag_leads", title: "Tag leads", scope: "write",
    description: "Add and/or remove tags on up to 200 leads.",
    inputSchema: obj({ lead_ids: strList("Lead ids", 200), add: strList("Tags to add", 20), remove: strList("Tags to remove", 20) }, ["lead_ids"]),
    handler: async (_ctx, args) => tagLeads(args.lead_ids as string[], args.add as string[] | undefined, args.remove as string[] | undefined),
  },
  {
    name: "marlo.delete_leads", title: "Delete leads", scope: "write", destructive: true,
    description: "Permanently delete up to 100 leads. Contacted leads are skipped unless force=true.",
    inputSchema: obj({ lead_ids: strList("Lead ids", 100), force: bool("Also delete leads that were already emailed") }, ["lead_ids"]),
    handler: async (_ctx, args) => deleteLeads(args.lead_ids as string[], Boolean(args.force)),
  },
  {
    name: "marlo.run_research", title: "Research leads on the web", scope: "write",
    description: "Run Marlo's web research (Tavily search + strict extraction) for a role and industry, and import the people found. Needs TAVILY_API_KEY and OPENAI_API_KEY on the server.",
    inputSchema: obj({
      role: str("Target role, e.g. Founder", { maxLength: 100 }),
      company_or_industry: str("Company or industry", { maxLength: 120 }),
      location: str("Optional location", { maxLength: 120 }),
      tags: strList("Tags applied to imported leads", 20),
    }, ["role", "company_or_industry"]),
    handler: async ({ actor }, args) => {
      const query = { role: String(args.role), companyOrIndustry: String(args.company_or_industry), location: String(args.location ?? "") };
      const found = await researchLeads(query);
      const imported = found.leads.length
        ? await importLeads(actor, found.leads.map((l) => ({ name: l.name, title: l.title, company: l.company, location: l.location, email: l.email ?? undefined, source_url: l.sourceUrl ?? undefined })), { query: JSON.stringify(query), tags: args.tags as string[] | undefined })
        : null;
      return { searches: found.searches, results: found.results, found: found.leads.length, import: imported };
    },
  },
];
