"use client";

import "@/app/views-ops.css";
import { useEffect, useMemo, useState } from "react";
import { timeAgo, useApi } from "@/components/platform/api";
import { Empty, Loading, Notice, Panel, StatGrid } from "@/components/platform/ui";
import { Button } from "@/components/platform/ui";
import { AuditLog } from "@/components/platform/ops/audit";

type Ev = { id: string; label: string; source: string; severity: "info" | "warning" | "error"; projectId: string | null; createdAt: string };

const SOURCES = [
  { key: "", label: "All" },
  { key: "usage_events", label: "Agent usage" },
  { key: "marketing_funnel_events", label: "Funnel" },
  { key: "admin", label: "Admin actions" },
  { key: "mcp", label: "MCP" },
];

export function ActivityView() {
  const [source, setSource] = useState("");
  const [severity, setSeverity] = useState("");
  const [q, setQ] = useState("");
  const [auto, setAuto] = useState(false);
  const qs = new URLSearchParams({ tab: "activity", limit: "100" });
  if (source) qs.set("source", source);
  if (severity) qs.set("severity", severity);
  const { data, error, loading, reload } = useApi<{ events?: Ev[] }>(`/api/platform/data?${qs}`);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void reload(), 30000);
    return () => clearInterval(t);
  }, [auto, reload]);

  const events = useMemo(() => data?.events ?? [], [data]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? events.filter((e) => e.label?.toLowerCase().includes(needle)) : events;
  }, [events, q]);
  const count = (fn: (e: Ev) => boolean) => events.filter(fn).length;

  return (
    <div className="pf-stack">
      <StatGrid items={[
        { label: "Events shown", value: shown.length, note: q ? `of ${events.length} loaded` : undefined },
        { label: "Errors", value: count((e) => e.severity === "error") },
        { label: "Admin / MCP actions", value: count((e) => e.source.startsWith("admin") || e.source.startsWith("mcp")) },
        { label: "Warnings", value: count((e) => e.severity === "warning") },
      ]} />
      <Panel title="Live stream" right={
        <>
          <label className="pf-small pf-muted" style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto refresh every 30s
          </label>
          <Button onClick={() => void reload()} disabled={loading}>{loading ? "Loading" : "Refresh"}</Button>
        </>
      }>
        <div className="pf-stack">
          <div className="ov-chips">
            {SOURCES.map((s) => <button key={s.key} type="button" className={`ov-chip ${source === s.key ? "active" : ""}`} onClick={() => setSource(s.key)}>{s.label}</button>)}
          </div>
          <div className="pf-toolbar">
            <select className="pf-select" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity">
              <option value="">All severities</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option>
            </select>
            <input className="pf-input grow" placeholder="Search events" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {error && <Notice tone="bad">{error}</Notice>}
          {!data ? <Loading loading={loading} /> : shown.length === 0 ? <Empty>No events match these filters.</Empty> : (
            <ul className="ov-feed">
              {shown.map((e) => (
                <li key={e.id}>
                  <span className={`ov-dot ${e.severity}`} title={e.severity} />
                  <span className="lbl" title={e.label}>{e.label}</span>
                  <span className="ov-sub">{e.source}</span>
                  <span className="when" title={e.createdAt}>{timeAgo(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
      <AuditLog />
    </div>
  );
}
