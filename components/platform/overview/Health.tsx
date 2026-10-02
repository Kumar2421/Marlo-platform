"use client";

import type { ReactNode } from "react";
import { Badge, Panel, statusTone } from "@/components/platform/ui";
import { timeAgo } from "@/components/platform/api";
import { goTab, type OverviewData } from "./types";

type Ov = OverviewData["overview"];

function TabLink({ tab, children }: { tab: string; children: string }) {
  return <button type="button" className="ov-link" onClick={() => goTab(tab)}>{children}</button>;
}

function KV({ k, children }: { k: string; children: ReactNode }) {
  return <div className="ov-kv"><span>{k}</span><span>{children}</span></div>;
}

export function SystemHealth({ ov }: { ov: Ov }) {
  const { monitor, build, settings } = ov;
  return (
    <Panel title="System health" right={<TabLink tab="monitor">Monitor</TabLink>}>
      <KV k="Database"><Badge tone={statusTone(monitor?.database)}>{monitor?.database ?? "unknown"}</Badge></KV>
      <KV k="Supabase"><Badge tone={statusTone(monitor?.supabase)}>{monitor?.supabase ?? "unknown"}</Badge></KV>
      <KV k="GitHub"><Badge tone={statusTone(monitor?.github)}>{monitor?.github ?? "unknown"}</Badge></KV>
      <KV k="Vercel"><Badge tone={monitor?.vercel === "configured" ? "ok" : "muted"}>{monitor?.vercel === "configured" ? "configured" : "not configured"}</Badge></KV>
      <KV k="CI"><Badge tone={statusTone(build?.ci)}>{build?.ci ?? "unknown"}</Badge></KV>
      <KV k="Gmail">{settings?.gmail ? <Badge tone="ok">{settings.gmailEmail ?? "connected"}</Badge> : <Badge tone="warn">not connected</Badge>}</KV>
      <div className="ov-sub" style={{ marginTop: 6 }}>Checked {timeAgo(monitor?.checkedAt)}</div>
    </Panel>
  );
}

export function FixQueue({ ov }: { ov: Ov }) {
  const f = ov.fix;
  return (
    <Panel title="Fix queue" right={<TabLink tab="fix">Open fix</TabLink>}>
      <KV k="Failed findings"><Badge tone={f?.failed ? "bad" : "muted"}>{f?.failed ?? 0}</Badge></KV>
      <KV k="Critical open"><Badge tone={f?.critical ? "bad" : "muted"}>{f?.critical ?? 0}</Badge></KV>
      <KV k="Fixing"><Badge tone={f?.fixing ? "warn" : "muted"}>{f?.fixing ?? 0}</Badge></KV>
      <KV k="Pending / failed fixes"><Badge tone={f?.pending ? "warn" : "muted"}>{f?.pending ?? 0}</Badge></KV>
    </Panel>
  );
}

export function RecentActivity({ ov }: { ov: Ov }) {
  const events = (ov.activity?.events ?? []).slice(0, 8);
  return (
    <Panel title="Recent activity" right={<TabLink tab="activity">View all</TabLink>}>
      {events.length === 0 ? <div className="pf-empty">No recent events.</div> : (
        <ul className="ov-feed">
          {events.map((e) => (
            <li key={e.id}><span className={`ov-dot ${e.severity}`} /><span className="lbl" title={e.label}>{e.label}</span><span className="when">{timeAgo(e.createdAt)}</span></li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
