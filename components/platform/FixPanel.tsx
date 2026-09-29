import type { FixStatus } from "@/lib/platform-data";

export function FixPanel({ fix }: { fix: FixStatus }) {
  const rows = [
    ["Failed", fix.failed],
    ["Critical active", fix.critical],
    ["Currently fixing", fix.fixing],
    ["Pending fixes", fix.pending],
  ];

  return (
    <div className="fix-panel">
      {rows.map(([label, value]) => (
        <div className="fix-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      <div className="fix-note">
        Recovery is data-driven from findings and code_fixes. Destructive actions and automatic retries remain disabled in phase 1.
      </div>
    </div>
  );
}
