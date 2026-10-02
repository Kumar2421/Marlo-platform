"use client";

import { useEffect, useState } from "react";
import "@/app/views-admin.css";
import { timeAgo, fmtDate, useApi } from "@/components/platform/api";
import { Badge, Button, Empty, Loading, Panel, StatGrid } from "@/components/platform/ui";
import { CopyButton } from "@/components/platform/admin/CopyButton";
import { UserDetail, type UserRow } from "@/components/platform/admin/UserDetail";

type Resp = { page: number; per_page: number; has_more: boolean; users: UserRow[] };

export function UsersView() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<UserRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const { data, error, loading } = useApi<Resp>(`/api/platform/data?tab=users&page=${page}&per_page=50&q=${encodeURIComponent(query)}`);
  const users = data?.users ?? [];
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = users.filter((u) => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() > weekAgo).length;

  return (
    <>
      <StatGrid items={[
        { label: "Users on this page", value: users.length },
        { label: "With projects", value: users.filter((u) => (u.projects ?? 0) > 0).length },
        { label: "Admins", value: users.filter((u) => u.is_admin).length },
        { label: "Signed in last 7 days", value: recent },
      ]} />
      <div className={selected ? "st-split" : undefined}>
        <Panel title="USERS" flush right={<input className="pf-input" placeholder="Search email…" value={q} onChange={(e) => setQ(e.target.value)} />}>
          <Loading error={error} loading={loading && !data} />
          {data && users.length === 0 && <Empty>No users found.</Empty>}
          {users.length > 0 && (
            <div className="pf-table-wrap">
              <table className="pf-table">
                <thead><tr><th>Email</th><th>ID</th><th>Joined</th><th>Last sign-in</th><th>Projects</th><th>Flags</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={`st-click${selected?.id === u.id ? " sel" : ""}`} onClick={() => setSelected(u)}>
                      <td><strong>{u.email ?? "—"}</strong></td>
                      <td><span className="st-copy"><span className="pf-mono">{u.id.slice(0, 8)}</span><CopyButton value={u.id} /></span></td>
                      <td>{fmtDate(u.created_at)}</td>
                      <td>{timeAgo(u.last_sign_in_at)}</td>
                      <td>{u.projects ?? 0}</td>
                      <td>{u.is_admin && <Badge tone="info">admin</Badge>} {u.banned && <Badge tone="bad">banned</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="st-pager">
            <Button disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <span className="pf-small pf-muted">Page {page}{loading ? " …" : ""}</span>
            <Button disabled={!data?.has_more || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </Panel>
        {selected && <UserDetail key={selected.id} user={selected} onClose={() => setSelected(null)} />}
      </div>
    </>
  );
}
