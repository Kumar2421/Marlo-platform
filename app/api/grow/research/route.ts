import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, requireAdmin } from "@/lib/admin";
import { leadDedupeKey, researchLeads, type ResearchQuery } from "@/lib/lead-research";

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  const { user, authorized } = await requireAdmin();
  if (!user || !authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data, error } = await db.from("leads")
    .select("id,name,title,company,location,email,email_quality,email_verified,source_url,query,created_at,email_status,emailed_at,last_reply_at")
    .eq("scope", "platform").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leads: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { user, authorized } = await requireAdmin();
  if (!user || !authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const payload = body as Record<string, unknown>;
  const query: ResearchQuery = { role: clean(payload.role, 100), companyOrIndustry: clean(payload.companyOrIndustry, 120), location: clean(payload.location, 120) };
  if (!query.role || !query.companyOrIndustry) return NextResponse.json({ error: "Role and company/industry are required." }, { status: 400 });

  try {
    const result = await researchLeads(query);
    const rows = result.leads.map((lead) => ({
      user_id: user.id, project_id: null, scope: "platform", name: lead.name, title: lead.title || null,
      company: lead.company || null, location: lead.location || null, email: lead.email,
      email_quality: lead.email ? "source_found" : null, email_verified: false, source_url: lead.sourceUrl,
      query: JSON.stringify(query), lead_type: "person", dedupe_key: leadDedupeKey(lead),
    }));
    const db = createAdminClient();
    if (rows.length) {
      const { error } = await db.from("leads").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const { data: saved, error: readError } = await db.from("leads")
      .select("id,name,title,company,location,email,email_quality,email_verified,source_url,query,created_at,email_status,emailed_at,last_reply_at")
      .eq("scope", "platform").order("created_at", { ascending: false }).limit(100);
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
    return NextResponse.json({ leads: saved ?? [], found: result.leads.length, searches: result.searches, results: result.results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lead research failed." }, { status: 500 });
  }
}
