import { createHash } from "node:crypto";

type SearchResult = { title: string; url: string; content: string };
export type ResearchQuery = { role: string; companyOrIndustry: string; location: string };
export type ExtractedLead = { name: string; title: string; company: string; location: string; email: string | null; sourceUrl: string | null };

const MAX_LEADS = 30;
const RESULTS_PER_QUERY = 10;
const MAX_RESULTS_FOR_LLM = 60;

function buildQueries(q: ResearchQuery) {
  const parts = [q.role, q.companyOrIndustry, q.location].filter(Boolean).join(" ");
  const queries = [
    `"${q.role}" ${q.companyOrIndustry} ${q.location} site:linkedin.com/in`,
    `${parts} email contact`,
    `"${q.role}" ${q.companyOrIndustry} linkedin profile`,
    `${q.companyOrIndustry} ${q.role} ${q.location} directory`,
    `${q.companyOrIndustry} ${q.role} "contact us"`,
  ];
  if (q.location) queries.push(`"${q.role}" ${q.companyOrIndustry} linkedin`);
  return queries.filter((query) => query.trim().length > 0);
}

async function tavilySearch(apiKey: string, query: string): Promise<SearchResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: RESULTS_PER_QUERY, search_depth: "basic", include_answer: false }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Lead research search failed: HTTP ${response.status}`);
  const data = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results ?? []).flatMap((item) => item.url && item.title ? [{ title: item.title, url: item.url, content: item.content ?? "" }] : []);
}

function parseArray(raw: string): ExtractedLead[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const leads: ExtractedLead[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const value = item as Record<string, unknown>;
      const name = typeof value.name === "string" ? value.name.trim() : "";
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      leads.push({
        name,
        title: typeof value.title === "string" ? value.title.trim() : "",
        company: typeof value.company === "string" ? value.company.trim() : "",
        location: typeof value.location === "string" ? value.location.trim() : "",
        email: typeof value.email === "string" && value.email.trim() ? value.email.trim().toLowerCase() : null,
        sourceUrl: typeof value.sourceUrl === "string" && value.sourceUrl.trim() ? value.sourceUrl.trim() : null,
      });
      if (leads.length >= MAX_LEADS) break;
    }
    return leads;
  } catch {
    return [];
  }
}

async function extractWithOpenAI(apiKey: string, model: string, query: ResearchQuery, results: SearchResult[]) {
  const block = results.map((result, index) => `${index + 1}. ${result.title}\nURL: ${result.url}\nSnippet: ${result.content.slice(0, 500)}`).join("\n\n");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: `You extract real people from supplied web search snippets. Never invent a person or fill a missing field from general knowledge. Every name, title, company, location and email must be explicitly present in a supplied snippet. If a field is absent, use an empty string or null. Never guess email patterns. Skip companies, job listings, articles and non-person results. Return ONLY a JSON array with objects shaped as {name,title,company,location,email,sourceUrl}.` },
        { role: "user", content: `Target: role="${query.role}", company/industry="${query.companyOrIndustry}", location="${query.location}"\n\nSearch results:\n${block}\n\nExtract up to ${MAX_LEADS} distinct people.` },
      ],
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Lead extraction failed: HTTP ${response.status}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
  return parseArray(data.choices?.[0]?.message?.content ?? "");
}

export async function researchLeads(query: ResearchQuery) {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";
  if (!tavilyKey) throw new Error("TAVILY_API_KEY is not configured.");
  if (!openAiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const queries = buildQueries(query);
  const resultSets = await Promise.all(queries.map((searchQuery) => tavilySearch(tavilyKey, searchQuery).catch(() => [])));
  const seenUrls = new Set<string>();
  const results: SearchResult[] = [];
  for (const result of resultSets.flat()) {
    const key = result.url.trim();
    if (!key || seenUrls.has(key)) continue;
    seenUrls.add(key);
    results.push(result);
    if (results.length >= MAX_RESULTS_FOR_LLM) break;
  }
  if (!results.length) return { leads: [], searches: queries.length, results: 0 };
  return { leads: await extractWithOpenAI(openAiKey, model, query, results), searches: queries.length, results: results.length };
}

export function leadDedupeKey(lead: ExtractedLead) {
  if (lead.email) return `email:${lead.email.trim().toLowerCase()}`;
  const source = lead.sourceUrl?.trim().toLowerCase() ?? "";
  const identity = [lead.name, lead.company, lead.location].map((value) => value.trim().toLowerCase()).join("|");
  return `identity:${createHash("sha256").update(`${source}|${identity}`).digest("hex")}`;
}
