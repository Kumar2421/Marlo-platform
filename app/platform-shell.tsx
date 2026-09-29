"use client";

import { useState } from "react";
import {
  Activity, BarChart3, ChevronLeft, ChevronRight, FolderKanban,
  LayoutDashboard, Megaphone, Settings2, ShieldCheck,
} from "lucide-react";
import type { PlatformOverview } from "@/lib/platform-data";
import { OverviewFunnel } from "@/components/platform/OverviewFunnel";
import { OverviewSystem } from "@/components/platform/OverviewSystem";
import { BuildPanel } from "@/components/platform/BuildPanel";
import { MonitorPanel } from "@/components/platform/MonitorPanel";
import { GrowPanel } from "@/components/platform/GrowPanel";

const nav = [
  ["Overview", LayoutDashboard],
  ["Build", FolderKanban],
  ["Monitor", ShieldCheck],
  ["Grow", Megaphone],
  ["Fix", Activity],
  ["Activity", Activity],
  ["Settings", Settings2],
] as const;

const skeletons: Record<string, { stats: string[]; panels: string[] }> = {
  Overview: { stats: ["Users", "Projects", "Leads", "Usage"], panels: ["ACQUISITION FUNNEL", "SYSTEM STATUS"] },
  Build: { stats: ["CI", "Latest build", "Failures", "Deployment"], panels: ["BUILD PIPELINE", "RELEASE ACTIVITY"] },
  Monitor: { stats: ["Supabase", "Database", "GitHub", "Vercel"], panels: ["SYSTEM HEALTH", "HEALTH CHECK"] },
  Grow: { stats: ["Leads", "Email ready", "Sent", "Replies"], panels: ["OUTREACH PIPELINE", "MARKETING LEADS"] },
  Fix: { stats: ["Failures", "Incidents", "Retries", "Blocked"], panels: ["FIX QUEUE", "RECOVERY ACTIVITY"] },
  Activity: { stats: ["Events", "Today", "Errors", "Admin actions"], panels: ["ACTIVITY STREAM", "EVENT FILTERS"] },
  Settings: { stats: ["Admins", "Access", "Environment", "Config"], panels: ["PLATFORM SETTINGS", "ACCESS CONTROL"] },
};

export default function PlatformShell({ userEmail, overview }: { userEmail: string; overview: PlatformOverview }) {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState("Overview");
  const layout = skeletons[active];
  const overviewValues = [overview.users, overview.projects, overview.leads, overview.usageEvents];
  const buildValues = [overview.build.ci.toUpperCase(), overview.build.latestRun, overview.build.failures, overview.build.deployment === "connected" ? "CONNECTED" : "NOT SET"];
  const monitorValues = [overview.monitor.supabase.toUpperCase(), overview.monitor.database.toUpperCase(), overview.monitor.github.toUpperCase(), overview.monitor.vercel.replaceAll("_", " ").toUpperCase()];
  const growValues = [overview.grow.leads, overview.grow.emailReady, overview.grow.sent, overview.grow.replies];

  return (
    <main className="platform-shell">
      <div className="platform-terminal-wrap">
        <header className="platform-terminal">
          <div className="terminal-left"><i className="dot" /><span>MARLO</span><span className="muted">/ PLATFORM</span></div>
          <div className="terminal-right"><span>CONTROL PLANE</span><span className="muted">PHASE 1</span></div>
        </header>
      </div>

      <div className="platform-layout">
        <aside className={collapsed ? "platform-rail collapsed" : "platform-rail"}>
          <button className="collapse" onClick={() => setCollapsed((v) => !v)} aria-label="Toggle sidebar">
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
          <nav className="nav">
            {nav.map(([label, Icon]) => (
              <button key={label} className={active === label ? "item active" : "item"} onClick={() => setActive(label)} title={collapsed ? label : undefined}>
                <span className="icon"><Icon size={15} /></span><span className="nav-label">{label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="workspace">
          <div className="head">
            <div><div className="eyebrow">PLATFORM / {active.toUpperCase()}</div><h1>{active}</h1></div>
            <div className="operator"><i className="dot" /> {userEmail}</div>
          </div>

          <div className="stats">
            {layout.stats.map((label, i) => (
              <article className="panel stat" key={label}>
                <div className="label">{label}</div>
                <div className="value">
                  {active === "Overview" ? overviewValues[i] : active === "Build" ? buildValues[i] : active === "Monitor" ? monitorValues[i] : active === "Grow" ? growValues[i] : "—"}
                </div>
                <div className="note">
                  {active === "Overview"
                    ? ["Registered platform users", "Active customer projects", "Customer-generated leads", "Recorded agent runs"][i]
                    : active === "Build"
                      ? ["GitHub Actions state", "Latest workflow", "Recent failed runs", "Vercel integration"][i]
                      : active === "Monitor"
                        ? ["Supabase connection", "Database access", "CI availability", "Deployment integration"][i]
                        : active === "Grow"
                          ? ["Customer lead pool", "Leads with email", "Outreach sent", "Detected replies"][i]
                          : "Skeleton — data layer next"}
                </div>
              </article>
            ))}
          </div>

          <div className="grid">
            {layout.panels.map((panel, i) => (
              <section className="panel" key={panel}>
                <div className="panelhead"><span>{panel}</span>{i === 0 && <BarChart3 size={14} />}</div>
                {active === "Overview" && panel === "ACQUISITION FUNNEL" ? <OverviewFunnel stages={overview.funnel} />
                  : active === "Overview" && panel === "SYSTEM STATUS" ? <OverviewSystem system={overview.system} />
                  : active === "Build" && panel === "BUILD PIPELINE" ? <BuildPanel build={overview.build} />
                  : active === "Monitor" && panel === "SYSTEM HEALTH" ? <MonitorPanel monitor={overview.monitor} />
                  : active === "Grow" && panel === "OUTREACH PIPELINE" ? <GrowPanel grow={overview.grow} />
                  : active === "Grow" && panel === "MARKETING LEADS" ? (
                    <div className="grow-panel"><div className="grow-row"><span>Inbound marketing leads</span><strong>{overview.grow.marketingLeads}</strong></div><div className="grow-note">Social connections and automated social execution remain a later integration layer.</div></div>
                  ) : (
                    <div className="empty"><strong>{panel}</strong><span>UI skeleton ready — implementation follows.</span></div>
                  )}
              </section>
            ))}
          </div>
        </section>
      </div>

      <nav className="mobile-nav">
        {nav.slice(0, 5).map(([label, Icon]) => (
          <button key={label} className={active === label ? "mobile-item active" : "mobile-item"} onClick={() => setActive(label)}>
            <span className="mobile-icon"><Icon size={18} /></span>{label}
          </button>
        ))}
      </nav>
    </main>
  );
}
