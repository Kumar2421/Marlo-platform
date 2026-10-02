"use client";

import { useEffect, useState } from "react";
import "@/app/views-admin.css";
import { apiGet, useApi } from "@/components/platform/api";
import { Button, Empty, Loading, Notice, Panel, StatGrid } from "@/components/platform/ui";
import { ProjectDetail } from "@/components/platform/admin/ProjectDetail";

type Project = { id: string; owner_id: string | null; name: string | null; url: string | null; category: string | null; created_at: string | null };
type Resp = { projects: Project[]; next_cursor: string | null };

export function ProjectsView() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState<Project[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  // Deep link from other tabs: #projects/<id>
  const [selected, setSelected] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const [, id] = window.location.hash.replace("#", "").split("/");
    return id || null;
  });

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const url = `/api/platform/data?tab=projects&limit=50&q=${encodeURIComponent(query)}`;
  const { data, error, loading } = useApi<Resp>(url);
  useEffect(() => { setExtra([]); setCursor(null); }, [url]);

  const nextCursor = cursor === null ? data?.next_cursor ?? null : cursor || null;
  const projects = [...(data?.projects ?? []), ...extra];

  async function loadMore() {
    if (!nextCursor) return;
    setMore(true); setMoreError("");
    try {
      const next = await apiGet<Resp>(`${url}&cursor=${encodeURIComponent(nextCursor)}`);
      setExtra((prev) => [...prev, ...(next.projects ?? [])]);
      setCursor(next.next_cursor ?? "");
    } catch (err) { setMoreError(err instanceof Error ? err.message : "Failed to load more."); }
    finally { setMore(false); }
  }

  return (
    <>
      <StatGrid items={[
        { label: "Projects loaded", value: projects.length },
        { label: "With URL", value: projects.filter((p) => p.url).length },
        { label: "Categories", value: new Set(projects.map((p) => p.category).filter(Boolean)).size },
        { label: "Owners", value: new Set(projects.map((p) => p.owner_id).filter(Boolean)).size },
      ]} />
      <div className={selected ? "st-split" : undefined}>
        <Panel title="PROJECTS" flush right={<input className="pf-input" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} />}>
          <Loading error={error} loading={loading && !data} />
          {data && projects.length === 0 && <Empty>No projects found.</Empty>}
          <div className="st-list">
            {projects.map((p) => (
              <div className={`st-item${selected === p.id ? " sel" : ""}`} key={p.id} onClick={() => setSelected(p.id)}>
                <div><strong>{p.name ?? p.id}</strong><small>{p.url ?? "no url"}</small></div>
                {p.category && <span className="pf-small pf-muted">{p.category}</span>}
              </div>
            ))}
          </div>
          {moreError && <Notice tone="bad">{moreError}</Notice>}
          {nextCursor && <div className="st-pager"><Button disabled={more} onClick={loadMore}>{more ? "Loading…" : "Load more"}</Button></div>}
        </Panel>
        {selected && <ProjectDetail key={selected} id={selected} onClose={() => setSelected(null)} />}
      </div>
    </>
  );
}
