import type { FixStatus } from "@/lib/platform-data";

function StatusRow({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "danger" | "warning" }) {
  return (
    <div className={`fix-row fix-row-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function FixPanel({ fix }: { fix: FixStatus }) {
  const rows: Array<{ label: string; value: number; tone: "neutral" | "danger" | "warning" }> = [
    { label: "Failed", value: fix.failed, tone: "danger" },
    { label: "Critical active", value: fix.critical, tone: "danger" },
    { label: "Currently fixing", value: fix.fixing, tone: "warning" },
    { label: "Pending fixes", value: fix.pending, tone: "warning" },
  ];

  return (
    <div className="fix-panel">
      {rows.map(({ label, value, tone }) => (
        <StatusRow key={label} label={label} value={value} tone={tone} />
      ))}
      <div className="fix-note">
        Recovery is data-driven from findings and code_fixes. Destructive actions and automatic retries remain disabled in phase 1.
      </div>
    </div>
  );
}

export function FixRecoveryPanel({ fix }: { fix: FixStatus }) {
  const total = fix.failed + fix.fixing + fix.pending;
  const resolved = Math.max(0, total - fix.pending - fix.fixing);

  return (
    <div className="fix-panel">
      <div className="fix-recovery-head">
        <span>RECOVERY PIPELINE</span>
        <strong>{total === 0 ? "CLEAR" : "ACTIVE"}</strong>
      </div>
      <div className="fix-row"><span>Queued findings</span><strong>{fix.failed}</strong></div>
      <div className="fix-row"><span>In recovery</span><strong>{fix.fixing}</strong></div>
      <div className="fix-row"><span>Awaiting action</span><strong>{fix.pending}</strong></div>
      <div className="fix-row"><span>Resolved / verified</span><strong>{resolved}</strong></div>
      <div className="fix-note">
        Phase 1 is observation-first: findings and code-fix state are visible, while destructive execution and automatic retries remain disabled.
      </div>
    </div>
  );
}
