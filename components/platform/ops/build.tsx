"use client";

import { useState } from "react";
import { apiPost, timeAgo } from "@/components/platform/api";
import { Badge, Button, Empty, Notice, Panel, statusTone } from "@/components/platform/ui";

export type Run = { id: number; name: string; message: string; status: string; conclusion: string | null; url: string | null; createdAt: string; branch: string };
export type Deployment = { id: string; state: string; url: string | null; createdAt: number; target: string | null; message: string | null };

export function RunsPanel({ runs, canRerun, onDone }: { runs: Run[]; canRerun: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function rerun(id: number) {
    setBusy(id); setMsg(null);
    try {
      await apiPost("/api/platform/data", { action: "rerun_ci", runId: id, failedOnly: true });
      setMsg({ tone: "ok", text: "Rerun requested for failed jobs." });
      onDone();
    } catch (err) {
      setMsg({ tone: "bad", text: err instanceof Error ? err.message : "Rerun failed." });
    } finally { setBusy(null); }
  }

  return (
    <Panel title="Recent workflow runs" flush>
      {msg && <div style={{ padding: 10 }}><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {runs.length === 0 ? <Empty>No workflow runs found.</Empty> : (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Workflow</th><th>Commit</th><th>Branch</th><th>Status</th><th>When</th><th></th></tr></thead>
            <tbody>
              {runs.map((r) => {
                const state = r.conclusion ?? r.status;
                const failed = r.conclusion === "failure";
                return (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong></td>
                    <td title={r.message}>{r.message?.split("\n")[0] || "—"}</td>
                    <td className="pf-mono">{r.branch || "—"}</td>
                    <td><Badge tone={statusTone(state)}>{state || "unknown"}</Badge></td>
                    <td>{timeAgo(r.createdAt)}</td>
                    <td>
                      <div className="pf-toolbar">
                        {r.url && <a className="ov-link" href={r.url} target="_blank" rel="noreferrer">Open</a>}
                        {failed && (canRerun
                          ? <Button disabled={busy === r.id} onClick={() => void rerun(r.id)}>{busy === r.id ? "Rerunning" : "Rerun failed jobs"}</Button>
                          : <span className="ov-sub">GITHUB_TOKEN needed to rerun</span>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function DeploymentsPanel({ deployments, vercel }: { deployments: Deployment[]; vercel: string }) {
  return (
    <Panel title="Vercel deployments" flush={deployments.length > 0}>
      {vercel === "not_configured" ? (
        <Empty>Vercel is not configured. Set VERCEL_TOKEN (and project id) to list deployments here.</Empty>
      ) : vercel === "error" ? (
        <Empty>Vercel returned an error. Check VERCEL_TOKEN and the project settings.</Empty>
      ) : deployments.length === 0 ? <Empty>No deployments found.</Empty> : (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>State</th><th>Target</th><th>URL</th><th>Commit</th><th>When</th></tr></thead>
            <tbody>
              {deployments.map((d) => (
                <tr key={d.id}>
                  <td><Badge tone={statusTone(d.state === "READY" ? "success" : d.state === "ERROR" ? "failure" : d.state === "BUILDING" ? "running" : d.state?.toLowerCase())}>{d.state || "unknown"}</Badge></td>
                  <td><Badge tone={d.target === "production" ? "info" : "muted"}>{d.target ?? "preview"}</Badge></td>
                  <td>{d.url ? <a className="ov-link" href={d.url.startsWith("http") ? d.url : `https://${d.url}`} target="_blank" rel="noreferrer">{d.url.replace(/^https?:\/\//, "")}</a> : "—"}</td>
                  <td title={d.message ?? ""}>{d.message?.split("\n")[0] || "—"}</td>
                  <td>{timeAgo(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
