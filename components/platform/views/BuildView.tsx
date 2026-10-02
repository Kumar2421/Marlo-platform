"use client";

import "@/app/views-ops.css";
import { timeAgo, useApi } from "@/components/platform/api";
import { Badge, Button, Loading, Notice, StatGrid, statusTone } from "@/components/platform/ui";
import { DeploymentsPanel, RunsPanel, type Deployment, type Run } from "@/components/platform/ops/build";

type BuildData = { ci?: string; runs?: Run[]; deployments?: Deployment[]; github?: string; vercel?: string; canRerun?: boolean };

export function BuildView() {
  const { data, error, loading, reload } = useApi<BuildData>("/api/platform/data?tab=build");
  if (!data) return <Loading error={error} loading={loading} />;
  const runs = data.runs ?? [];
  const latest = runs[0];
  const failures = runs.filter((r) => r.conclusion === "failure").length;
  const vercel = data.vercel ?? "not_configured";
  return (
    <div className="pf-stack">
      {error && <Notice tone="bad">{error}</Notice>}
      {data.github === "error" && <Notice tone="warn">GitHub API returned an error; run data may be stale or missing.</Notice>}
      <div className="pf-toolbar"><span className="grow" /><Button onClick={() => void reload()} disabled={loading}>{loading ? "Refreshing" : "Refresh"}</Button></div>
      <StatGrid items={[
        { label: "CI state", value: <Badge tone={statusTone(data.ci)}>{data.ci ?? "unknown"}</Badge> },
        { label: "Latest run", value: latest ? (latest.conclusion ?? latest.status ?? "—") : "—", note: latest ? `${latest.name} · ${timeAgo(latest.createdAt)}` : "No runs" },
        { label: "Recent failures", value: failures, note: `of ${runs.length} runs` },
        { label: "Vercel", value: vercel === "healthy" ? "Healthy" : vercel === "error" ? "Error" : "Not set up" },
      ]} />
      <RunsPanel runs={runs} canRerun={Boolean(data.canRerun)} onDone={() => void reload()} />
      <DeploymentsPanel deployments={data.deployments ?? []} vercel={vercel} />
    </div>
  );
}
