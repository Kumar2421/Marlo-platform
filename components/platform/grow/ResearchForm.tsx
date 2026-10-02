"use client";

import { FormEvent, useState } from "react";
import { apiPost } from "@/components/platform/api";
import { Button, Notice, Panel } from "@/components/platform/ui";
import { errMsg } from "./types";

type Result = { found?: number; searches?: number; results?: number; leads?: unknown[] };

export function ResearchForm({ onDone }: { onDone: () => void }) {
  const [role, setRole] = useState("Founder");
  const [company, setCompany] = useState("SaaS");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await apiPost<Result>("/api/grow/research", { role: role.trim(), companyOrIndustry: company.trim(), location: location.trim() });
      setResult(r);
      onDone();
    } catch (err) {
      setError(errMsg(err, "Research failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="WEB RESEARCH">
      <form className="pf-section" onSubmit={submit}>
        <div className="gw-form3">
          <label className="pf-field">Role<input className="pf-input" value={role} onChange={(e) => setRole(e.target.value)} maxLength={100} required /></label>
          <label className="pf-field">Company / industry<input className="pf-input" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} required /></label>
          <label className="pf-field">Location<input className="pf-input" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="Optional" /></label>
        </div>
        <div className="pf-toolbar">
          <Button variant="primary" type="submit" disabled={busy || !role.trim() || !company.trim()}>{busy ? "Researching…" : "Research leads"}</Button>
          <span className="pf-small pf-muted">Searches the web and imports leads directly. Takes up to 40s.</span>
        </div>
        {busy && <Notice tone="info">Researching… this can take up to 40 seconds. Keep this tab open.</Notice>}
        {error && <Notice tone="bad">{error}</Notice>}
        {result && (
          <Notice tone={(result.found ?? 0) > 0 ? "ok" : "warn"}>
            Found {result.found ?? 0} lead{result.found === 1 ? "" : "s"} from {result.results ?? 0} results across {result.searches ?? 0} searches.
            {(result.found ?? 0) === 0 && " Try a broader role or industry."}
          </Notice>
        )}
      </form>
    </Panel>
  );
}
