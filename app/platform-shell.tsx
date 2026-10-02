"use client";

import { useEffect, useState, type ComponentType } from "react";
import {
  Activity, ChevronLeft, ChevronRight, FolderKanban, GitBranch, HeartPulse, LayoutDashboard,
  Megaphone, Settings2, Users, Wrench,
} from "lucide-react";
import { OverviewView } from "@/components/platform/views/OverviewView";
import { UsersView } from "@/components/platform/views/UsersView";
import { ProjectsView } from "@/components/platform/views/ProjectsView";
import { BuildView } from "@/components/platform/views/BuildView";
import { MonitorView } from "@/components/platform/views/MonitorView";
import { GrowView } from "@/components/platform/views/GrowView";
import { FixView } from "@/components/platform/views/FixView";
import { ActivityView } from "@/components/platform/views/ActivityView";
import { SettingsView } from "@/components/platform/views/SettingsView";

const tabs: { id: string; label: string; icon: ComponentType<{ size?: number }>; view: ComponentType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, view: OverviewView },
  { id: "users", label: "Users", icon: Users, view: UsersView },
  { id: "projects", label: "Projects", icon: FolderKanban, view: ProjectsView },
  { id: "build", label: "Build", icon: GitBranch, view: BuildView },
  { id: "monitor", label: "Monitor", icon: HeartPulse, view: MonitorView },
  { id: "grow", label: "Grow", icon: Megaphone, view: GrowView },
  { id: "fix", label: "Fix", icon: Wrench, view: FixView },
  { id: "activity", label: "Activity", icon: Activity, view: ActivityView },
  { id: "settings", label: "Settings", icon: Settings2, view: SettingsView },
];

function fromHash() {
  if (typeof window === "undefined") return "overview";
  const id = window.location.hash.replace("#", "").split("/")[0];
  return tabs.some((tab) => tab.id === id) ? id : "overview";
}

export default function PlatformShell({ userEmail }: { userEmail: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState("overview");

  useEffect(() => {
    setActive(fromHash());
    const onHash = () => setActive(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function select(id: string) {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const View = current.view;

  return (
    <main className="platform-shell">
      <div className="platform-terminal-wrap">
        <header className="platform-terminal">
          <div className="terminal-left"><i className="dot" /><span>MARLO</span><span className="muted">/ PLATFORM</span></div>
          <div className="terminal-right"><span>CONTROL PLANE</span><span className="muted">MCP + ADMIN</span></div>
        </header>
      </div>

      <div className="platform-layout">
        <aside className={collapsed ? "platform-rail collapsed" : "platform-rail"}>
          <button className="collapse" onClick={() => setCollapsed((v) => !v)} aria-label="Toggle sidebar">
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
          <nav className="nav">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} className={active === id ? "item active" : "item"} onClick={() => select(id)} title={collapsed ? label : undefined}>
                <span className="icon"><Icon size={15} /></span><span className="nav-label">{label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="workspace">
          <div className="head">
            <div><div className="eyebrow">PLATFORM / {current.label.toUpperCase()}</div><h1>{current.label}</h1></div>
            <div className="operator"><i className="dot" /> {userEmail}</div>
          </div>
          <div className="pf-stack"><View key={current.id} /></div>
        </section>
      </div>

      <nav className="mobile-nav">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} className={active === id ? "mobile-item active" : "mobile-item"} onClick={() => select(id)}>
            <span className="mobile-icon"><Icon size={18} /></span>{label}
          </button>
        ))}
      </nav>
    </main>
  );
}
