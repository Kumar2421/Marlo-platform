"use client";

import "@/app/views-ops.css";
import { useState } from "react";
import { apiPost, timeAgo, useApi } from "@/components/platform/api";
import { Badge, Button, Empty, Loading, Notice, Panel, StatGrid, statusTone } from "@/components/platform/ui";

type Latest = { service: string; status: string; latency_ms: number | null; detail: string | null; checked_at: string };
type Service = { service: string; checks: number; uptime_pct: number | null; avg_latency_ms: number | null; latest: Latest | null };
type MonitorData = { history?: Service[] };

const WINDOWS = [{ label: "1h", hours: 1 }, { label: "6h", hours: 6 }, { label: "24h", hours: 24 }, { label: "7d", hours: 168 }];

function ServiceTable({ rows }: { rows: Service[] }) {
  return (
    <div className="pf-table-wrap">
      <table className="pf-table">
        <thead><tr><th>Service</th><th>Status</th><th>Uptime</th><th>Avg latency</th><th>Detail</th><th>Checked</th></tr></thead>
        <tbody>
          {rows.map((s) => {
            const up = s.uptime_pct;
            return (
              <tr key={s.service}>
                <td><strong>{s.service.replaceAll("_", " ")}</strong><small>{s.checks} checks</small></td>
                <td><Badge tone={statusTone(s.latest?.status)}>{s.latest?.status?.replaceAll("_", " ") ?? "no data"}</Badge></td>
                <td>
                  <div className="ov-uptime">
                    <div className={`pf-bar ${up != null && up < 90 ? "bad" : up != null && up < 99 ? "warn" : ""}`}><i style={{ width: `${up ?? 0}%` }} /></div>
                    <span className="pf-mono pf-small">{up == null ? "—" : `${up}%`}</span>
                  </div>
                </td>
                <td className="pf-mono">{s.avg_latency_ms == null ? "—" : `${Math.round(s.avg_latency_ms)} ms`}</td>
                <td className="ov-wrap" style={{ minWidth: 160 }}>{s.latest?.detail || "—"}</td>
                <td>{timeAgo(s.latest?.checked_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MonitorView() {
  const [hours, setHours] = useState(24);
  const { data, error, loading, setData, reload } = useApi<MonitorData>(`/api/platform/data?tab=monitor&hours=${hours}`);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function runChecks() {
    setRunning(true); setMsg(null);
    try {
      const res = await apiPost<{ history?: Service[] }>("/api/platform/data", { action: "run_health" });
      if (res.history) setData({ history: res.history });
      else await reload();
      setMsg({ tone: "ok", text: "Health checks completed." });
    } catch (err) {
      setMsg({ tone: "bad", text: err instanceof Error ? err.message : "Health checks failed." });
    } finally { setRunning(false); }
  }

  const rows = data?.history ?? [];
  const healthy = rows.filter((r) => r.latest?.status === "healthy").length;
  const errors = rows.filter((r) => r.latest?.status === "error").length;
  const lat = rows.map((r) => r.avg_latency_ms).filter((v): v is number => typeof v === "number");
  const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null;
  const last = rows.map((r) => r.latest?.checked_at).filter(Boolean).sort().pop();

  return (
    <div className="pf-stack">
      <StatGrid items={[
        { label: "Services healthy", value: `${healthy}/${rows.length}` },
        { label: "Errors", value: errors },
        { label: "Avg latency", value: avg == null ? "—" : `${avg} ms` },
        { label: "Last check", value: timeAgo(last) },
      ]} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Panel title="Services" flush right={
        <>
          <select className="pf-select" value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Window">
            {WINDOWS.map((w) => <option key={w.hours} value={w.hours}>{w.label}</option>)}
          </select>
          <Button variant="primary" onClick={() => void runChecks()} disabled={running}>{running ? "Running" : "Run checks now"}</Button>
        </>
      }>
        {!data ? <Loading error={error} loading={loading} /> : rows.length === 0 ? <Empty>No health checks recorded yet. Run checks now to create the first one.</Empty> : <ServiceTable rows={rows} />}
      </Panel>
      {data && error && <Notice tone="bad">{error}</Notice>}
      <div className="ov-sub">Checks are recorded every 15 minutes by a Vercel cron when CRON_SECRET is configured. Uptime and latency cover the selected window.</div>
    </div>
  );
}
