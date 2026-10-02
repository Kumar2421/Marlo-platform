"use client";

import { useState } from "react";
import "@/app/views-grow.css";
import { useApi } from "@/components/platform/api";
import { Panel, StatGrid } from "@/components/platform/ui";
import type { LeadsResponse } from "@/components/platform/grow/types";
import { LeadsTab } from "@/components/platform/grow/LeadsTab";
import { CsvImport } from "@/components/platform/grow/CsvImport";
import { ResearchForm } from "@/components/platform/grow/ResearchForm";
import { OutreachTab } from "@/components/platform/grow/OutreachTab";
import { RepliesTab } from "@/components/platform/grow/RepliesTab";
import { SuppressionTab } from "@/components/platform/grow/SuppressionTab";

const TABS = [
  ["leads", "Leads"], ["import", "Import"], ["outreach", "Outreach"], ["replies", "Replies"], ["suppression", "Suppression"],
] as const;
type Tab = (typeof TABS)[number][0];

export function GrowView() {
  const [tab, setTab] = useState<Tab>("leads");
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [version, setVersion] = useState(0); // bumped to remount the leads table after imports
  const { data, error, reload } = useApi<LeadsResponse>("/api/platform/leads?limit=1");
  const stats = data?.stats;
  const n = (v: number | undefined) => (error && !data ? "—" : v === undefined ? "…" : v.toLocaleString());

  function changed() { void reload(); setVersion((v) => v + 1); }

  return (
    <>
      <StatGrid items={[
        { label: "Platform leads", value: n(stats?.total) },
        { label: "With email", value: n(stats?.with_email) },
        { label: "Sent", value: n(stats?.sent), note: stats ? `${stats.failed} failed · ${stats.unsubscribed} unsubscribed` : undefined },
        { label: "Replies", value: n(stats?.replied) },
      ]} />
      <Panel title="GROW" flush>
        <div className="gw-tabs-wrap">
          <div className="pf-tabs gw-tabs" role="tablist">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={`pf-tab${tab === key ? " active" : ""}`} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>
        </div>
      </Panel>
      {tab === "leads" && (
        <LeadsTab key={version} onChanged={() => void reload()} onQueue={(ids) => { setQueueIds(ids); setTab("outreach"); }} />
      )}
      {tab === "import" && (
        <>
          <CsvImport onImported={changed} />
          <ResearchForm onDone={changed} />
        </>
      )}
      {tab === "outreach" && <OutreachTab leadIds={queueIds} onClearIds={() => setQueueIds([])} onChanged={() => void reload()} />}
      {tab === "replies" && <RepliesTab onChanged={() => void reload()} />}
      {tab === "suppression" && <SuppressionTab />}
    </>
  );
}
