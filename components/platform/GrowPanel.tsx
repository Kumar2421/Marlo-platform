import type { GrowStatus } from "@/lib/platform-data";

export function GrowPanel({ grow }: { grow: GrowStatus }) {
  const rows = [
    ["Lead pool", grow.leads],
    ["Email ready", grow.ready],
    ["Sent", grow.sent],
    ["Replies", grow.replies],
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
      <div className="grow-note">
        Outreach state is read from existing lead email/reply fields. Social execution is intentionally not connected yet.
      </div>
    </div>
  );
}
