import type { MonitorStatus } from "@/lib/platform-data";

const rows = [
  ["Supabase", "supabase"],
  ["Database", "database"],
  ["GitHub Actions", "github"],
  ["Vercel", "vercel"],
] as const;

export function MonitorPanel({ monitor }: { monitor: MonitorStatus }) {
  return (
    <div className="monitor-panel">
      {rows.map(([label, key]) => {
        const value = monitor[key];
        const healthy = value === "healthy" || value === "configured";
        return (
          <div className="monitor-row" key={label}>
            <span>{label}</span>
            <span className={healthy ? "monitor-state healthy" : "monitor-state"}>
              <i className="dot" />
              {value.replaceAll("_", " ").toUpperCase()}
            </span>
          </div>
        );
      })}
      <div className="monitor-checked">LAST CHECK {new Date(monitor.checkedAt).toLocaleString()}</div>
    </div>
  );
}
