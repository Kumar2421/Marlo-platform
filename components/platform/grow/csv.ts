import type { LeadInput } from "./types";

/** Parse CSV text (quotes, escaped quotes, CRLF, embedded newlines). Delimiter auto-detected: comma, semicolon or tab. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const ALIASES: Record<string, string> = {
  email: "email", "e-mail": "email", "email address": "email", mail: "email",
  name: "name", "full name": "name", fullname: "name", contact: "name",
  "first name": "first", firstname: "first", first: "first", "given name": "first",
  "last name": "last", lastname: "last", last: "last", surname: "last", "family name": "last",
  company: "company", organization: "company", organisation: "company", "company name": "company", employer: "company",
  title: "title", "job title": "title", role: "title", position: "title",
  location: "location", city: "location", country: "location",
  phone: "phone", "phone number": "phone", mobile: "phone", tel: "phone",
  website: "source_url", url: "source_url", linkedin: "source_url", "linkedin url": "source_url", "source url": "source_url", source_url: "source_url",
  notes: "notes", note: "notes",
  tags: "tags", tag: "tags",
};

export function parseLeads(text: string): { leads: LeadInput[]; unmapped: string[] } {
  const rows = parseCsv(text);
  if (!rows.length) return { leads: [], unmapped: [] };
  const header = rows[0].map((h) => ALIASES[h.trim().toLowerCase()] ?? "");
  const unmapped = rows[0].filter((_, i) => !header[i]).map((h) => h.trim()).filter(Boolean);
  // No recognizable header: treat a single column of emails as a plain list.
  if (!header.some(Boolean)) {
    const leads = rows.map((r) => ({ email: r[0]?.trim() })).filter((l) => l.email);
    return { leads, unmapped: [] };
  }
  const leads: LeadInput[] = rows.slice(1).map((r) => {
    const lead: LeadInput = {};
    let first = "";
    let last = "";
    header.forEach((key, i) => {
      const value = (r[i] ?? "").trim();
      if (!key || !value) return;
      if (key === "first") first = value;
      else if (key === "last") last = value;
      else if (key === "tags") lead.tags = value.split(/[;,|]/).map((t) => t.trim()).filter(Boolean);
      else if (key === "source_url") lead.source_url = lead.source_url ?? value;
      else (lead as Record<string, string>)[key] = value;
    });
    if (!lead.name && (first || last)) lead.name = [first, last].filter(Boolean).join(" ");
    return lead;
  });
  return { leads, unmapped };
}
