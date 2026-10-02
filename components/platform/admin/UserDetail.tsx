"use client";

import { useApi, fmtDate } from "@/components/platform/api";
import { Badge, Empty, Loading, Panel } from "@/components/platform/ui";
import { CopyText } from "./CopyButton";

export type UserRow = { id: string; email: string | null; created_at: string | null; last_sign_in_at: string | null; projects: number; is_admin: boolean; banned: boolean };
type Project = { id: string; name: string | null; url: string | null; category: string | null; created_at: string | null };

export function UserDetail({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const { data, error, loading } = useApi<{ projects?: Project[] }>(`/api/platform/data?tab=projects&owner_id=${encodeURIComponent(user.id)}`);
  const projects = data?.projects ?? [];
  return (
    <Panel title="USER DETAIL" right={<button className="pf-btn" type="button" onClick={onClose}>Close</button>}>
      <dl className="st-kv">
        <dt>Email</dt><dd>{user.email ?? "—"}</dd>
        <dt>ID</dt><dd><CopyText value={user.id} /></dd>
        <dt>Joined</dt><dd>{fmtDate(user.created_at)}</dd>
        <dt>Last sign-in</dt><dd>{fmtDate(user.last_sign_in_at)}</dd>
        <dt>Flags</dt><dd>{user.is_admin ? <Badge tone="info">admin</Badge> : <Badge>user</Badge>} {user.banned && <Badge tone="bad">banned</Badge>}</dd>
      </dl>
      <h4 className="st-h">Projects ({user.projects ?? 0})</h4>
      <Loading error={error} loading={loading} />
      {!loading && !error && projects.length === 0 && <Empty>No projects.</Empty>}
      <div className="st-list">
        {projects.map((p) => (
          <div className="st-item" key={p.id} onClick={() => { window.location.hash = `#projects/${p.id}`; }}>
            <div><strong>{p.name ?? p.id}</strong><small>{p.url ?? p.category ?? "—"}</small></div>
            <a className="pf-small" href={`#projects/${p.id}`} onClick={(e) => e.stopPropagation()}>Open</a>
          </div>
        ))}
      </div>
    </Panel>
  );
}
