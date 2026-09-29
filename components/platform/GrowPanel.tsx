"use client";

import { useEffect, useMemo, useState } from "react";
import type { GrowStatus } from "@/lib/platform-data";

type Lead = {
  id: string;
  name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  email_quality: string | null;
  email_status: string | null;
  emailed_at: string | null;
  last_reply_at: string | null;
  last_reply_snippet: string | null;
};

export function GrowPanel({ grow }: { grow: GrowStatus }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [gmail, setGmail] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [subject, setSubject] = useState("Quick question about your growth");
  const [message, setMessage] = useState("Hi {{name}},\n\nI came across {{company}} and wanted to reach out about a potential growth opportunity.\n\nWould you be open to a short conversation?\n\nBest,");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function load() {
    const response = await fetch("/api/grow/outreach", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setLeads(data.leads ?? []);
    setGmail(data.gmail ?? null);
  }

  useEffect(() => { void load(); }, []);

  const sendable = useMemo(() => leads.filter((lead) => lead.email && !lead.emailed_at), [leads]);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function sendSelected() {
    if (!subject.trim() || !message.trim() || !selected.length) return;
    setBusy(true);
    setStatus("");
    let sent = 0;
    try {
      for (const id of selected) {
        const lead = leads.find((item) => item.id === id);
        if (!lead?.email) continue;
        const personalized = message
          .replaceAll("{{name}}", lead.name || "there")
          .replaceAll("{{company}}", lead.company || "your company");
        const response = await fetch("/api/grow/outreach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: id, subject: subject.trim(), message: personalized }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Send failed.");
        sent += 1;
      }
      setSelected([]);
      setStatus(`${sent} email${sent === 1 ? "" : "s"} sent.`);
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Outreach failed.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const rows = [
    ["Platform leads", grow.leads],
    ["Email-ready", grow.emailReady],
    ["Outreach sent", grow.sent],
    ["Replies detected", grow.replies],
    ["Marketing leads", grow.marketingLeads],
  ] as const;

  return (
    <div className="grow-panel">
      {rows.map(([label, value]) => (
        <div className="grow-row" key={label}><span>{label}</span><strong>{value}</strong></div>
      ))}

      <div className="outreach">
        <div className="outreach-head">
          <div><strong>OUTREACH PIPELINE</strong><span>{gmail ? `GMAIL · ${gmail}` : "GMAIL NOT CONNECTED"}</span></div>
          <button type="button" onClick={() => void load()}>REFRESH</button>
        </div>

        {!gmail && <div className="outreach-note">Connect Gmail in Settings before sending. Research remains available without Gmail.</div>}

        <div className="outreach-compose">
          <label>SUBJECT<input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={180} /></label>
          <label>MESSAGE<textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} maxLength={10000} /></label>
          <div className="outreach-actions">
            <span>{selected.length} selected · {sendable.length} sendable</span>
            <button type="button" disabled={!gmail || !selected.length || busy} onClick={() => void sendSelected()}>
              {busy ? "SENDING…" : `SEND SELECTED`}
            </button>
          </div>
          {status && <div className="outreach-status">{status}</div>}
        </div>

        <div className="outreach-list">
          {leads.length === 0 ? <div className="lead-empty">No platform leads available.</div> : leads.map((lead) => (
            <label className="outreach-row" key={lead.id}>
              <input
                type="checkbox"
                checked={selected.includes(lead.id)}
                disabled={!lead.email || Boolean(lead.emailed_at) || busy}
                onChange={() => toggle(lead.id)}
              />
              <div className="lead-main">
                <strong>{lead.name || "Unnamed lead"}</strong>
                <span>{[lead.title, lead.company].filter(Boolean).join(" · ") || "No company/title"}</span>
              </div>
              <div className="lead-meta">
                <strong>{lead.email || "NO EMAIL"}</strong>
                <span>{lead.emailed_at ? "SENT" : lead.last_reply_at ? "REPLIED" : lead.email_quality || "SOURCE GAP"}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="lead-research-note">Every send is an explicit operator action. Already-contacted leads are locked to prevent accidental duplicate outreach.</div>
      </div>
    </div>
  );
}
