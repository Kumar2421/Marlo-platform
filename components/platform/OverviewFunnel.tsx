import type { FunnelStage } from "@/lib/platform-data";

export function OverviewFunnel({ stages }: { stages: FunnelStage[] }) {
  return (
    <div className="overview-funnel">
      {stages.map((stage, index) => (
        <div className="funnel-row" key={stage.label}>
          <div className="funnel-meta">
            <span>{String(index + 1).padStart(2, "0")} / {stage.label}</span>
            <span>{stage.count} · {stage.rate}%</span>
          </div>
          <div className="funnel-track">
            <div className="funnel-fill" style={{ width: `${stage.rate}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
