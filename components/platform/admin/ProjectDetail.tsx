"use client";

import { fmtDate, useApi } from "@/components/platform/api";
import { Badge, Empty, Loading, Panel, statusTone } from "@/components/platform/ui";

type Detail = {
  project: { id: string; name: string | null; url: string | null; category: string | null; created_at: string | null } | null;
  owner_email: string | null; findings_total: number; findings_open: number; usage_events: number;
  recent_usage: { id: string; agent_type: string | null; status: string | null; created_at: string | null }[];
};

export function ProjectDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, loading } = useApi<Detail>(`/api/platform/data?tab=projects&id=${encodeURIComponent(id)}`);
  const p = data?.project;
  const usage = data?.recent_usage ?? [];
  return (
    <Panel title="PROJECT DETAIL" right={<button className="pf-btn" type="button" onClick={onClose}>Close</button>}>
      <Loading error={error} loading={loading} />
      {data && !p && <Empty>Project not found.</Empty>}
      {p && (
        <>
          <dl className="st-kv">
            <dt>Name</dt><dd>{p.name ?? p.id}</dd>
            <dt>Owner</dt><dd>{data?.owner_email ?? "—"}</dd>
            <dt>URL</dt><dd>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.url}</a> : "—"}</dd>
            <dt>Category</dt><dd>{p.category ?? "—"}</dd>
            <dt>Created</dt><dd>{fmtDate(p.created_at)}</dd>
            <dt>Findings</dt><dd>{data?.findings_total ?? 0} total, {data?.findings_open ?? 0} open</dd>
            <dt>Agent usage</dt><dd>{data?.usage_events ?? 0} events</dd>
          </dl>
          <h4 className="st-h">Recent usage</h4>
          {usage.length === 0 ? <Empty>No usage yet.</Empty> : (
            <div className="st-list">
              {usage.map((u) => (
                <div className="st-item" key={u.id} style={{ cursor: "default" }}>
                  <div><strong>{u.agent_type ?? "agent"}</strong><small>{fmtDate(u.created_at)}</small></div>
                  <Badge tone={statusTone(u.status)}>{u.status ?? "unknown"}</Badge>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
