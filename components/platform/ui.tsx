"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type Tone = "ok" | "warn" | "bad" | "info" | "muted";

export function StatGrid({ items }: { items: { label: string; value: ReactNode; note?: string }[] }) {
  return (
    <div className="stats">
      {items.map((item) => (
        <article className="panel stat" key={item.label}>
          <div className="label">{item.label}</div>
          <div className="value">{item.value}</div>
          {item.note && <div className="note">{item.note}</div>}
        </article>
      ))}
    </div>
  );
}

export function Panel({ title, right, children, flush }: { title: string; right?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="panel pf-panel">
      <div className="panelhead"><span>{title}</span>{right && <div className="pf-panelhead-right">{right}</div>}</div>
      <div className={flush ? "pf-body flush" : "pf-body"}>{children}</div>
    </section>
  );
}

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pf-badge ${tone}`}>{children}</span>;
}

export function Button({ variant = "default", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" }) {
  return <button type="button" {...props} className={`pf-btn ${variant} ${props.className ?? ""}`} />;
}

export function Notice({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`pf-notice ${tone}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="pf-empty">{children}</div>;
}

export function Loading({ error, loading }: { error?: string; loading?: boolean }) {
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (loading) return <div className="pf-empty">Loading…</div>;
  return null;
}

export function Row({ label, children, note }: { label: ReactNode; children?: ReactNode; note?: ReactNode }) {
  return (
    <div className="pf-row">
      <div className="pf-row-copy"><strong>{label}</strong>{note && <span>{note}</span>}</div>
      <div className="pf-row-end">{children}</div>
    </div>
  );
}

export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case "healthy": case "success": case "sent": case "ok": case "active": case "fixed": case "verified": case "completed": return "ok";
    case "degraded": case "running": case "queued": case "sending": case "pending": case "paused": case "fixing": case "warning": return "warn";
    case "error": case "failed": case "failure": case "bounced": case "denied": case "critical": return "bad";
    case "replied": case "interested": return "info";
    default: return "muted";
  }
}
