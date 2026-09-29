import type { BuildStatus } from "@/lib/platform-data";

export function BuildPanel({ build }: { build: BuildStatus }) {
  return (
    <div className="build-panel">
      <div className="build-state">
        <span className={`build-indicator ${build.ci}`} />
        <div>
          <strong>CI {build.ci.toUpperCase()}</strong>
          <span>Latest GitHub Actions run</span>
        </div>
      </div>
      <div className="build-row">
        <span>Latest run</span>
        {build.latestRunUrl ? <a href={build.latestRunUrl} target="_blank" rel="noreferrer">{build.latestRun}</a> : <span>{build.latestRun}</span>}
      </div>
      <div className="build-row"><span>Recent failures</span><span>{build.failures}</span></div>
      <div className="build-row"><span>Vercel</span><span>{build.deployment === "connected" ? "CONNECTED" : "NOT CONFIGURED"}</span></div>
    </div>
  );
}
