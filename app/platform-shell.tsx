"use client";

import { useState } from "react";
import { Activity, BarChart3, ChevronLeft, ChevronRight, FolderKanban, LayoutDashboard, Megaphone, Settings2, ShieldCheck, Users } from "lucide-react";
import type { PlatformOverview } from "@/lib/platform-data";

const nav = [["Overview", LayoutDashboard], ["Users", Users], ["Projects", FolderKanban], ["Outreach", Megaphone], ["System", ShieldCheck]] as const;

export default function PlatformShell({ userEmail, overview }: { userEmail: string; overview: PlatformOverview }) {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState("Overview");
  const stats = [["Users", overview.users, "Registered platform users"], ["Projects", overview.projects, "Active customer projects"], ["Leads", overview.leads, "Customer-generated leads"], ["Usage", overview.usageEvents, "Recorded agent runs"]] as const;
  return <main>
    <header className="terminal"><div className="terminal-left"><i className="dot" /><span>MARLO</span><span className="muted">/ PLATFORM</span></div><div className="terminal-right"><span>CONTROL PLANE</span><span className="muted">PHASE 1</span></div></header>
    <div className="layout"><aside className={collapsed ? "rail collapsed" : "rail"}>
      <button className="collapse" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">{collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}</button>
      <nav className="nav">{nav.map(([label, Icon]) => <button key={label} className={active === label ? "item active" : "item"} onClick={() => setActive(label)}><span className="icon"><Icon size={15} /></span><span>{label}</span></button>)}</nav>
      <div className="nav bottom"><button className="item"><span className="icon"><Activity size={15} /></span><span>Activity</span></button><button className="item"><span className="icon"><Settings2 size={15} /></span><span>Settings</span></button></div>
    </aside>
    <section className="workspace"><div className="head"><div><div className="eyebrow">PLATFORM / {active.toUpperCase()}</div><h1>{active}</h1></div><div className="operator"><i className="dot" /> {userEmail}</div></div>
      <div className="stats">{stats.map(([label, value, note]) => <article className="panel stat" key={label}><div className="label">{label}</div><div className="value">{value}</div><div className="note">{note}</div></article>)}</div>
      <div className="grid"><section className="panel"><div className="panelhead"><span>ACQUISITION FUNNEL</span><BarChart3 size={14} /></div><div className="rows">
        <div className="row"><span>Audits completed</span><strong>{overview.auditsCompleted}</strong></div><div className="row"><span>Signup completed</span><strong>{overview.signupsCompleted}</strong></div><div className="row"><span>Funnel events</span><strong>{overview.funnelEvents}</strong></div>
      </div></section>
      <section className="panel"><div className="panelhead"><span>SYSTEM STATUS</span><span className="ready">CONNECTED</span></div><div className="rows">{["Supabase data", "Admin authorization", "Platform metrics"].map(x => <div className="row" key={x}><span>{x}</span><span className="status">LIVE</span></div>)}</div></section></div>
    </section></div>
  </main>;
}
