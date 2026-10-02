"use client";

import { Fragment, useState } from "react";
import { timeAgo, useApi } from "@/components/platform/api";
import { Badge, Button, Empty, Loading, Panel, statusTone } from "@/components/platform/ui";

type Entry = { id: string; actor_id: string | null; via: string; client_id: string | null; action: string; target_type: string | null; target_id: string | null; status: string; meta: unknown; created_at: string };

export function AuditLog() {
  const [via, setVia] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const qs = new URLSearchParams({ tab: "audit", limit: "50" });
  if (via) qs.set("via", via);
  if (status) qs.set("status", status);
  const { data, error, loading, reload } = useApi<{ entries?: Entry[] }>(`/api/platform/data?${qs}`);
  const entries = data?.entries ?? [];

  return (
    <Panel title="Audit log" flush right={
      <>
        <select className="pf-select" value={via} onChange={(e) => setVia(e.target.value)} aria-label="Via">
          <option value="">All via</option><option value="ui">UI</option><option value="mcp">MCP</option>
        </select>
        <select className="pf-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All status</option><option value="ok">OK</option><option value="error">Error</option><option value="denied">Denied</option>
        </select>
        <Button onClick={() => void reload()} disabled={loading}>Refresh</Button>
      </>
    }>
      {!data ? <Loading error={error} loading={loading} /> : entries.length === 0 ? <Empty>No audit entries match.</Empty> : (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Action</th><th>Actor</th><th>Via</th><th>Status</th><th>Target</th><th>When</th><th></th></tr></thead>
            <tbody>
              {entries.map((e) => {
                const hasMeta = e.meta != null && (typeof e.meta !== "object" || Object.keys(e.meta as object).length > 0);
                return (
                  <Fragment key={e.id}>
                    <tr>
                      <td><strong>{e.action}</strong></td>
                      <td className="pf-mono" title={e.actor_id ?? ""}>{e.actor_id ? e.actor_id.slice(0, 8) : "—"}</td>
                      <td><Badge tone={e.via === "mcp" ? "info" : "muted"}>{e.via}</Badge></td>
                      <td><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                      <td>{e.target_type ? `${e.target_type}${e.target_id ? ` · ${e.target_id.slice(0, 8)}` : ""}` : "—"}</td>
                      <td title={e.created_at}>{timeAgo(e.created_at)}</td>
                      <td>{hasMeta && <button type="button" className="ov-link" onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? "Hide" : "Meta"}</button>}</td>
                    </tr>
                    {open === e.id && <tr><td colSpan={7} className="wrap"><pre className="pf-pre">{JSON.stringify(e.meta, null, 2)}</pre></td></tr>}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
