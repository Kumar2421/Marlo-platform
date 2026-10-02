"use client";

import "@/app/views-ops.css";
import { useApi } from "@/components/platform/api";
import { Loading, Notice, Panel, StatGrid } from "@/components/platform/ui";
import { AcquisitionFunnel, OutreachFunnel } from "@/components/platform/overview/Funnels";
import { FixQueue, RecentActivity, SystemHealth } from "@/components/platform/overview/Health";
import { Trends } from "@/components/platform/overview/Trends";
import { goTab, type OverviewData } from "@/components/platform/overview/types";

function attention(ov: OverviewData["overview"], health: OverviewData["health"]) {
  const items: { tone: "bad" | "warn"; text: string; tab: string }[] = [];
  if (ov.build?.ci === "failure") items.push({ tone: "bad", text: "Latest CI run failed.", tab: "build" });
  const bad = (health ?? []).filter((h) => h.latest?.status === "error").map((h) => h.service.replaceAll("_", " "));
  if (bad.length) items.push({ tone: "bad", text: `Health checks failing: ${bad.join(", ")}.`, tab: "monitor" });
  if (ov.fix?.critical) items.push({ tone: "bad", text: `${ov.fix.critical} critical finding(s) still open.`, tab: "fix" });
  if (ov.fix?.failed) items.push({ tone: "bad", text: `${ov.fix.failed} failed finding(s) need attention.`, tab: "fix" });
  if (ov.settings && !ov.settings.gmail) items.push({ tone: "warn", text: "Gmail is not connected; outreach cannot send.", tab: "settings" });
  return items;
}

export function OverviewView() {
  const { data, error, loading, reload } = useApi<OverviewData>("/api/platform/data?tab=overview&days=14");
  const ov = data?.overview;
  if (!ov) return <Loading error={error} loading={loading} />;
  const alerts = attention(ov, data?.health);
  return (
    <div className="pf-stack">
      {error && <Notice tone="bad">{error}</Notice>}
      {alerts.length > 0 && (
        <div className="ov-attn">
          {alerts.map((a) => (
            <Notice key={a.text} tone={a.tone}>
              {a.text} <button type="button" className="ov-link" onClick={() => goTab(a.tab)}>Review</button>
            </Notice>
          ))}
        </div>
      )}
      <StatGrid items={[
        { label: "Users", value: ov.users ?? 0, note: `${ov.signupsCompleted ?? 0} signups completed` },
        { label: "Projects", value: ov.projects ?? 0 },
        { label: "Platform leads", value: ov.grow?.leads ?? 0, note: `${ov.grow?.sent ?? 0} emailed` },
        { label: "Agent runs", value: ov.usageEvents ?? 0 },
      ]} />
      <Panel title="14-day trends" right={<button type="button" className="ov-link" onClick={() => void reload()} disabled={loading}>{loading ? "Refreshing" : "Refresh"}</button>}>
        <Trends trends={data?.trends} />
      </Panel>
      <div className="pf-grid2 even">
        <Panel title="Acquisition funnel"><AcquisitionFunnel funnel={ov.funnel} /></Panel>
        <Panel title="Platform outreach funnel"><OutreachFunnel grow={ov.grow} /></Panel>
      </div>
      <div className="pf-grid2 even">
        <SystemHealth ov={ov} />
        <FixQueue ov={ov} />
      </div>
      <RecentActivity ov={ov} />
    </div>
  );
}
