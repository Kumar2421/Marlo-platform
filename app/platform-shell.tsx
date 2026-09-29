"use client";

import { useState } from "react";
import { Activity, BarChart3, ChevronLeft, ChevronRight, FolderKanban, LayoutDashboard, Megaphone, Settings2, ShieldCheck, Users } from "lucide-react";
import type { PlatformOverview } from "@/lib/platform-data";

const nav = [["Overview", LayoutDashboard], ["Users", Users], ["Projects", FolderKanban], ["Outreach", Megaphone], ["System", ShieldCheck], ["Activity", Activity], ["Settings", Settings2]] as const;

const skeletons: Record<string, { stats: string[]; panels: string[] }> = {
  Overview: { stats: ["Users", "Projects", "Leads", "Usage"], panels: ["ACQUISITION FUNNEL", "SYSTEM STATUS"] },
  Users: { stats: ["Total users", "New users", "Active users", "Plans"], panels: ["USER DIRECTORY", "USER ACTIVITY"] },
  Projects: { stats: ["Projects", "Active", "Analyses", "Crawls"], panels: ["PROJECT DIRECTORY", "PROJECT ACTIVITY"] },
  Outreach: { stats: ["Leads", "Ready", "Sent", "Replies"], panels: ["OUTREACH PIPELINE", "RECENT ACTIVITY"] },
  System: { stats: ["Supabase", "App", "Workers", "Integrations"], panels: ["SYSTEM HEALTH", "INTEGRATIONS"] },
  Activity: { stats: ["Events", "Today", "Errors", "Admin actions"], panels: ["ACTIVITY STREAM", "EVENT FILTERS"] },
  Settings: { stats: ["Admins", "Access", "Environment", "Config"], panels: ["PLATFORM SETTINGS", "ACCESS CONTROL"] },
};

export default function PlatformShell({ userEmail, overview }: { userEmail: string; overview: PlatformOverview }) {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState("Overview");
  const layout = skeletons[active];
  const overviewValues = [overview.users, overview.projects, overview.leads, overview.usageEvents];

  return <main>
    <header className="terminal"><div className="terminal-left"><i className="dot" /><span>MARLO</span><span className="muted">/ PLATFORM</span></div><div className="terminal-right"><span>CONTROL PLANE</span><span className="muted">PHASE 1</span></div></header>
    <div className="layout"><aside className={collapsed ? "rail collapsed" : "rail"}>
      <button className="collapse" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">{collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}</button>
      <nav className="nav">{nav.map(([label, Icon]) => <button key={label} className={active === label ? "item active" : "item"} onClick={() => setActive(label)}><span className="icon"><Icon size={15} /></span><span>{label}</span></button>)}</nav>
    </aside>
    <section className="workspace"><div className="head"><div><div className="eyebrow">PLATFORM / {active.toUpperCase()}</div><h1>{active}</h1></div><div className="operator"><i className="dot" /> {userEmail}</div></div>
      <div className="stats">{layout.stats.map((label, i) => <article className="panel stat" key={label}><div className="label">{label}</div><div className="value">{active === "Overview" ? overviewValues[i] : "—"}</div><div className="note">{active === "Overview" ? ["Registered platform users", "Active customer projects", "Customer-generated leads", "Recorded agent runs"][i] : "Skeleton — data layer next"}</div></article>)}</div>
      <div className="grid">{layout.panels.map((panel, i) => <section className="panel" key={panel}><div className="panelhead"><span>{panel}</span>{i === 0 && <BarChart3 size={14} />}</div><div className="empty"><strong>{panel}</strong><span>{active === "Overview" ? "Live platform data connected." : "UI skeleton ready — implementation follows."}</span></div></section>)}</div>
    </section></div>
  </main>;
}
