import type { PlatformOverview } from "@/lib/platform-data";

export function OverviewSystem({ system }: { system: PlatformOverview["system"] }) {
  const checks = [
    ["Supabase", system.supabase],
    ["Database", system.database],
  ] as const;

  return (
    <div className="system-list">
      {checks.map(([label, status]) => (
        <div className="system-row" key={label}>
          <span>{label}</span>
          <span className="system-state"><i className="dot" /> {status.toUpperCase()}</span>
        </div>
      ))}
    </div>
  );
}
