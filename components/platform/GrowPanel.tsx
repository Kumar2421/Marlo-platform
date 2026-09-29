import type { GrowStatus } from "@/lib/platform-data";

export function GrowPanel({ grow }: { grow: GrowStatus }) {
  const rows = [
    ["Lead pool", grow.leads],
    ["Email-ready", grow.emailReady],
    ["Outreach sent", grow.sent],
    ["Replies detected", grow.replies],
    ["Marketing leads", grow.marketingLeads],
  ] as const;

  return (
    <div className="grow-panel">
      {rows.map(([label, value]) => (
        <div className="grow-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
