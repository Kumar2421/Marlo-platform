import { adminRoute, readJson } from "@/lib/api";
import { researchLeads, type ResearchQuery } from "@/lib/lead-research";
import { importLeads, listLeads, LEAD_COLUMNS } from "@/lib/services/leads";
import { clean, ServiceError } from "@/lib/services/types";
import { createAdminClient } from "@/lib/admin";

export const maxDuration = 60;

export const GET = adminRoute(async () => ({ leads: (await listLeads({ limit: 100 })).leads }));

export const POST = adminRoute(async (actor, req) => {
  const payload = await readJson(req);
  const query: ResearchQuery = { role: clean(payload.role, 100), companyOrIndustry: clean(payload.companyOrIndustry, 120), location: clean(payload.location, 120) };
  if (!query.role || !query.companyOrIndustry) throw new ServiceError("Role and company/industry are required.");

  const result = await researchLeads(query);
  if (result.leads.length) {
    await importLeads(actor, result.leads.map((l) => ({
      name: l.name, title: l.title, company: l.company, location: l.location, email: l.email ?? undefined, source_url: l.sourceUrl ?? undefined,
    })), { query: JSON.stringify(query) });
  }
  const db = createAdminClient();
  const { data, error } = await db.from("leads").select(LEAD_COLUMNS).eq("scope", "platform").order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return { leads: data ?? [], found: result.leads.length, searches: result.searches, results: result.results };
}, "leads.research");
