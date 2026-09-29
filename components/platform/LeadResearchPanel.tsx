"use client";

import { FormEvent, useEffect, useState } from "react";

type Lead = {
  id: string; name: string | null; title: string | null; company: string | null; location: string | null;
  email: string | null; email_quality: string | null; source_url: string | null; created_at: string;
};

export function LeadResearchPanel() {
  const [role, setRole] = useState("Founder");
  const [companyOrIndustry, setCompanyOrIndustry] = useState("SaaS");
  const [location, setLocation] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/grow/research", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setLeads(data.leads ?? []);
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/grow/research", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, companyOrIndustry, location }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Research failed.");
      setLeads(data.leads ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed.");
    } finally { setBusy(false); }
  }

  return (
    <div className="lead-research">
      <form className="lead-research-form" onSubmit={submit}>
        <label>ROLE<input value={role} onChange={(e) => setRole(e.target.value)} maxLength={100} /></label>
        <label>COMPANY / INDUSTRY<input value={companyOrIndustry} onChange={(e) => setCompanyOrIndustry(e.target.value)} maxLength={120} /></label>
        <label>LOCATION<input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="Optional" /></label>
        <button type="submit" disabled={busy}>{busy ? "RESEARCHING…" : "RESEARCH LEADS"}</button>
      </form>
      {error && <div className="lead-research-error">{error}</div>}
      <div className="lead-research-meta">REAL WEB RESULTS → EXPLICIT FIELD EXTRACTION → PLATFORM LEAD POOL</div>
      <div className="lead-list">
        {!leads.length ? <div className="lead-empty">No platform leads yet. Run a research query.</div> : leads.map((lead) => (
          <div className="lead-row" key={lead.id}>
            <div className="lead-main"><strong>{lead.name || "Unnamed lead"}</strong><span>{[lead.title, lead.company, lead.location].filter(Boolean).join(" · ") || "No role/company/location extracted"}</span></div>
            <div className="lead-meta"><strong>{lead.email || "NO EMAIL"}</strong><span>{lead.email_quality || "SOURCE GAP"}{lead.source_url ? " · SOURCE" : ""}</span></div>
          </div>
        ))}
      </div>
      <div className="lead-research-note">Research is read-only with respect to external systems. Gmail sending remains a separate explicit human-approved action.</div>
    </div>
  );
}
