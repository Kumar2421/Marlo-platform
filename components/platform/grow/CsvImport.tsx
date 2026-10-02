"use client";

import { useMemo, useState } from "react";
import { apiPost } from "@/components/platform/api";
import { Button, Notice, Panel } from "@/components/platform/ui";
import { parseLeads } from "./csv";
import { errMsg, type LeadInput } from "./types";

type Result = { dry_run: boolean; received: number; would_create?: number; created?: number; duplicates: number; invalid: { index: number; reason: string }[] };
const CHUNK = 500;

export function CsvImport({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<"" | "dry" | "import">("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const parsed = useMemo(() => parseLeads(text), [text]);
  const leads = parsed.leads;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setText(await file.text());
    setResult(null);
  }

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "dry" : "import");
    setError("");
    setResult(null);
    const total: Result = { dry_run: dryRun, received: 0, would_create: 0, created: 0, duplicates: 0, invalid: [] };
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      for (let i = 0; i < leads.length; i += CHUNK) {
        setProgress(`Batch ${Math.floor(i / CHUNK) + 1} of ${Math.ceil(leads.length / CHUNK)}…`);
        const chunk: LeadInput[] = leads.slice(i, i + CHUNK);
        const r = await apiPost<Result>("/api/platform/leads", {
          action: "import", leads: chunk, dryRun, query: label.trim() || undefined, tags: tagList.length ? tagList : undefined,
        });
        total.received += r.received ?? chunk.length;
        total.would_create = (total.would_create ?? 0) + (r.would_create ?? 0);
        total.created = (total.created ?? 0) + (r.created ?? 0);
        total.duplicates += r.duplicates ?? 0;
        total.invalid.push(...(r.invalid ?? []).map((x) => ({ ...x, index: x.index + i })));
        setResult({ ...total, invalid: [...total.invalid] });
      }
      if (!dryRun) onImported();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  const preview = leads.slice(0, 10);
  return (
    <Panel title="IMPORT LEADS (CSV / PASTE)">
      <div className="pf-section">
        <p className="pf-small pf-muted gw-help">
          Paste CSV or pick a file. Recognised headers: email, name / full name, first name + last name, company / organization, title / job title, location, phone, website / linkedin (saved as source), notes, tags. A single column of emails also works.
        </p>
        <textarea className="pf-textarea pf-mono" rows={6} placeholder={"email,name,company\njane@acme.com,Jane Doe,Acme"} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} />
        <div className="pf-toolbar">
          <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} />
          <input className="pf-input" placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
          <input className="pf-input" placeholder="Label / source query" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>

        {leads.length > 0 && (
          <>
            <div className="pf-small pf-muted">
              {leads.length} row{leads.length === 1 ? "" : "s"} parsed{leads.length > CHUNK ? ` (sent in ${Math.ceil(leads.length / CHUNK)} batches)` : ""}.
              {parsed.unmapped.length > 0 && ` Ignored columns: ${parsed.unmapped.join(", ")}.`}
            </div>
            <div className="pf-table-wrap">
              <table className="pf-table">
                <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Title</th><th>Company</th><th>Source</th></tr></thead>
                <tbody>
                  {preview.map((l, i) => (
                    <tr key={i}><td>{i + 1}</td><td>{l.name ?? "—"}</td><td>{l.email ?? "—"}</td><td>{l.title ?? "—"}</td><td>{l.company ?? "—"}</td><td>{l.source_url ?? "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {leads.length > 10 && <div className="pf-small pf-muted">Showing first 10 of {leads.length}.</div>}
          </>
        )}

        <div className="pf-toolbar">
          <Button disabled={!leads.length || Boolean(busy)} onClick={() => void run(true)}>{busy === "dry" ? "Checking…" : "Dry run"}</Button>
          <Button variant="primary" disabled={!leads.length || Boolean(busy)} onClick={() => void run(false)}>{busy === "import" ? "Importing…" : `Import ${leads.length || ""}`}</Button>
          {progress && <span className="pf-small pf-muted">{progress}</span>}
        </div>

        {error && <Notice tone="bad">{error}</Notice>}
        {result && (
          <Notice tone={result.invalid.length ? "warn" : "ok"}>
            <strong>{result.dry_run ? "Dry run" : "Imported"}:</strong> {result.received} received ·{" "}
            {result.dry_run ? `${result.would_create ?? 0} would be created` : `${result.created ?? 0} created`} · {result.duplicates} duplicate · {result.invalid.length} invalid
            {result.invalid.length > 0 && (
              <ul className="gw-reasons">
                {result.invalid.slice(0, 20).map((x, i) => <li key={i}>Row {x.index + 1}: {x.reason}</li>)}
                {result.invalid.length > 20 && <li>…and {result.invalid.length - 20} more</li>}
              </ul>
            )}
          </Notice>
        )}
      </div>
    </Panel>
  );
}
