"use client";

import { useState } from "react";
import { apiPost, fmtDate } from "@/components/platform/api";
import { Badge, Button, Notice, statusTone } from "@/components/platform/ui";
import { errMsg, leadStatus, type Lead } from "./types";

const FIELDS = ["name", "title", "company", "location", "email", "phone"] as const;

export function LeadDrawer({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: (lead: Lead) => void }) {
  const [form, setForm] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(FIELDS.map((f) => [f, lead[f] ?? ""])),
    notes: lead.notes ?? "",
    tags: (lead.tags ?? []).join(", "),
  }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const st = leadStatus(lead);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const patch = { ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) };
      const r = await apiPost<{ lead: Lead }>("/api/platform/leads", { action: "update", id: lead.id, patch });
      setMsg({ tone: "ok", text: "Saved." });
      if (r.lead) onSaved(r.lead);
    } catch (err) {
      setMsg({ tone: "bad", text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  const set = (key: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="pf-modal-back" onClick={onClose}>
      <div className="pf-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Lead details">
        <div className="pf-toolbar">
          <h3 className="grow">{lead.name || "Unnamed lead"}</h3>
          <Badge tone={st === "unsubscribed" ? "bad" : statusTone(st === "new" ? "" : st)}>{st}</Badge>
        </div>

        {lead.last_reply_at && (
          <div className="gw-reply">
            <div className="pf-toolbar">
              <Badge tone="info">{lead.reply_classification ?? "unclassified"}</Badge>
              <span className="pf-small pf-muted">{fmtDate(lead.last_reply_at)}</span>
            </div>
            <p>{lead.last_reply_snippet || "No snippet captured."}</p>
          </div>
        )}

        <div className="gw-form2">
          {FIELDS.map((f) => (
            <label className="pf-field" key={f}>{f}<input className="pf-input" value={form[f]} onChange={set(f)} /></label>
          ))}
        </div>
        <label className="pf-field">tags (comma separated)<input className="pf-input" value={form.tags} onChange={set("tags")} /></label>
        <label className="pf-field">notes<textarea className="pf-textarea" rows={3} value={form.notes} onChange={set("notes")} /></label>

        <div className="pf-small pf-muted gw-meta">
          <span>Added {fmtDate(lead.created_at)}</span>
          {lead.emailed_at && <span>Emailed {fmtDate(lead.emailed_at)}</span>}
          {lead.query && <span>Query: {lead.query}</span>}
          {lead.source_url && <a href={lead.source_url} target="_blank" rel="noreferrer noopener">Source link</a>}
        </div>

        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="pf-toolbar">
          <Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
