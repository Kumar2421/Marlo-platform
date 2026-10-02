"use client";

import { useMemo, useState } from "react";
import "@/app/views-admin.css";
import { apiPost, useApi } from "@/components/platform/api";
import { Button, Loading, Notice, Panel, StatGrid, type Tone } from "@/components/platform/ui";
import { FixTable, str, type Row } from "@/components/platform/admin/FixTable";

type Resp = { findings?: Row[]; fixes?: Row[] };

function options(rows: Row[], key: string) {
  return [...new Set(rows.map((r) => str(r[key])).filter(Boolean))].sort();
}

export function FixView() {
  const [tab, setTab] = useState<"findings" | "fixes">("findings");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);

  const url = `/api/platform/data?tab=fix&project_id=${encodeURIComponent(projectId.trim())}`;
  const { data, error, loading, reload } = useApi<Resp>(url);
  const findings = useMemo(() => data?.findings ?? [], [data]);
  const fixes = useMemo(() => data?.fixes ?? [], [data]);
  const rows = tab === "findings" ? findings : fixes;

  const statuses = useMemo(() => options(rows, "status"), [rows]);
  const severities = useMemo(() => options(findings, "severity"), [findings]);
  const shown = rows.filter((r) => (!status || str(r.status) === status) && (!severity || str(r.severity) === severity));

  async function requeue(row: Row) {
    const id = str(row.id);
    setBusy(id); setNotice(null);
    try {
      await apiPost("/api/platform/data", { action: "requeue_fix", id });
      setNotice({ tone: "ok", text: "Fix requeued." });
      await reload();
    } catch (err) { setNotice({ tone: "bad", text: err instanceof Error ? err.message : "Requeue failed." }); }
    finally { setBusy(""); }
  }

  const switchTab = (next: "findings" | "fixes") => { setTab(next); setStatus(""); setSeverity(""); };

  return (
    <>
      <StatGrid items={[
        { label: "Failed findings", value: findings.filter((r) => str(r.status) === "failed").length },
        { label: "Critical open", value: findings.filter((r) => str(r.severity) === "critical" && !["fixed", "closed", "resolved", "ignored"].includes(str(r.status))).length },
        { label: "Fixing", value: findings.filter((r) => str(r.status) === "fixing").length },
        { label: "Failed fixes", value: fixes.filter((r) => str(r.status) === "failed").length },
      ]} />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <Panel title="FIX PIPELINE" flush>
        <div className="pf-body">
          <div className="pf-tabs">
            <button type="button" className={`pf-tab${tab === "findings" ? " active" : ""}`} onClick={() => switchTab("findings")}>Findings ({findings.length})</button>
            <button type="button" className={`pf-tab${tab === "fixes" ? " active" : ""}`} onClick={() => switchTab("fixes")}>Fixes ({fixes.length})</button>
          </div>
          <div className="pf-toolbar">
            <select className="pf-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">All statuses</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {tab === "findings" && (
              <select className="pf-select" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity">
                <option value="">All severities</option>
                {severities.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <input className="pf-input" placeholder="Project id" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
            <span className="grow" />
            <Button onClick={() => void reload()} disabled={loading}>Refresh</Button>
          </div>
        </div>
        <Loading error={error} loading={loading && !data} />
        {data && (
          <FixTable
            rows={shown}
            empty={rows.length === 0 ? `No ${tab} yet.` : "No rows match the filters."}
            action={tab === "fixes" ? (row) => str(row.status) === "failed" ? (
              <Button disabled={busy === str(row.id)} onClick={() => void requeue(row)}>{busy === str(row.id) ? "…" : "Requeue"}</Button>
            ) : null : undefined}
          />
        )}
      </Panel>
    </>
  );
}
