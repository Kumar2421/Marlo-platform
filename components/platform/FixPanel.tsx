import type { FixStatus } from "@/lib/platform-data";

function StatusRow({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "danger" | "warning" }) {\n  return (\n    <div className={`fix-row fix-row-${tone}`}>\n      <span>{label}</span>\n      <strong>{value}</strong>\n    </div>\n  );\n}\n\nexport function FixPanel({ fix }: { fix: FixStatus }) {
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
