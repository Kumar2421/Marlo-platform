"use client";

import type { OverviewData } from "./types";

function Spark({ values, days }: { values: number[]; days: string[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="ov-spark">
      {values.map((v, i) => (
        <i key={i} className={`${v === 0 ? "zero " : ""}${i === values.length - 1 ? "last" : ""}`}
          style={{ height: `${Math.max(4, (v / max) * 100)}%` }} title={`${days[i] ?? `Day ${i + 1}`}: ${v}`} />
      ))}
    </div>
  );
}

export function Trends({ trends }: { trends: OverviewData["trends"] }) {
  const days = trends?.days ?? [];
  const series = [
    { title: "Agent usage", values: trends?.usage ?? [] },
    { title: "Platform leads", values: trends?.platform_leads ?? [] },
    { title: "Emails sent", values: trends?.emails_sent ?? [] },
    { title: "Signups", values: trends?.signups ?? [] },
  ];
  return (
    <div className="ov-trends">
      {series.map((s) => {
        const values = s.values.map((v) => Number(v) || 0);
        return (
          <div className="ov-trend" key={s.title}>
            <div className="ov-trend-head"><span>{s.title}</span><b>{values.reduce((a, b) => a + b, 0)}</b></div>
            {values.length ? <Spark values={values} days={days} /> : <div className="ov-sub">No data</div>}
          </div>
        );
      })}
    </div>
  );
}
