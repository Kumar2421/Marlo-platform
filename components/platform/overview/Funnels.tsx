"use client";

import type { FunnelStage, GrowStatus } from "@/lib/platform-data";
import { pct } from "./types";

function FunnelRow({ label, count, rate, max }: { label: string; count: number; rate: number; max: number }) {
  return (
    <div className="ov-funnel-row">
      <span style={{ textTransform: "capitalize" }}>{label}</span>
      <div className="pf-bar"><i style={{ width: `${pct(count, max)}%` }} /></div>
      <span className="ov-funnel-num">{count.toLocaleString()} · {rate}%</span>
    </div>
  );
}

export function AcquisitionFunnel({ funnel }: { funnel: FunnelStage[] | undefined }) {
  const stages = funnel ?? [];
  if (!stages.length) return <div className="pf-empty">No funnel events yet.</div>;
  const max = Math.max(1, ...stages.map((s) => s.count));
  return <div>{stages.map((s) => <FunnelRow key={s.label} label={s.label} count={s.count} rate={s.rate} max={max} />)}</div>;
}

export function OutreachFunnel({ grow }: { grow: GrowStatus | undefined }) {
  if (!grow) return <div className="pf-empty">No outreach data.</div>;
  const stages = [
    { label: "Platform leads", count: grow.leads, prev: grow.leads },
    { label: "Email ready", count: grow.emailReady, prev: grow.leads },
    { label: "Sent", count: grow.sent, prev: grow.emailReady },
    { label: "Replies", count: grow.replies, prev: grow.sent },
  ];
  const max = Math.max(1, grow.leads);
  return (
    <div>
      {stages.map((s, i) => <FunnelRow key={s.label} label={s.label} count={s.count} rate={i === 0 ? 100 : pct(s.count, s.prev)} max={max} />)}
      <div className="ov-sub" style={{ marginTop: 6 }}>Conversion is vs. the previous stage. Marketing leads: {grow.marketingLeads}.</div>
    </div>
  );
}
