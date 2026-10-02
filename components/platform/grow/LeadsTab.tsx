"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, timeAgo } from "@/components/platform/api";
import { Badge, Button, Empty, Notice, Panel, statusTone } from "@/components/platform/ui";
import { errMsg, leadStatus, type Lead, type LeadsResponse } from "./types";
import { LeadDrawer } from "./LeadDrawer";

const PAGE = 50;

export function LeadsTab({ onChanged, onQueue }: { onChanged: () => void; onQueue: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [hasEmail, setHasEmail] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Lead | null>(null);
  const [bulkTag, setBulkTag] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const buildUrl = useCallback((cur?: string | null) => {
    const p = new URLSearchParams({ limit: String(PAGE) });
    if (status) p.set("status", status);
    if (debouncedQ) p.set("q", debouncedQ);
    if (tag.trim()) p.set("tag", tag.trim());
    if (hasEmail) p.set("has_email", hasEmail);
    if (cur) p.set("cursor", cur);
    return `/api/platform/leads?${p}`;
  }, [status, debouncedQ, tag, hasEmail]);

  const load = useCallback(async (more = false, cur: string | null = null) => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<LeadsResponse>(buildUrl(more ? cur : null));
      setLeads((prev) => (more ? [...prev, ...(data.leads ?? [])] : data.leads ?? []));
      setCursor(data.next_cursor ?? null);
      if (!more) setSelected(new Set());
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => { void load(); }, [load]);

  const ids = [...selected];
  const allOnPage = leads.length > 0 && leads.every((l) => selected.has(l.id));

  function toggle(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function bulk(kind: "add" | "remove" | "delete") {
    if (!ids.length) return;
    const t = bulkTag.trim();
    if (kind !== "delete" && !t) { setNotice({ tone: "bad", text: "Enter a tag first." }); return; }
    if (kind === "delete" && !window.confirm(`Delete ${ids.length} lead${ids.length === 1 ? "" : "s"}? Already-contacted leads are skipped.`)) return;
    setBusy(true);
    setNotice(null);
    try {
      if (kind === "delete") {
        const r = await apiPost<{ deleted: number; skipped_contacted: string[] }>("/api/platform/leads", { action: "delete", ids });
        const skipped = r.skipped_contacted?.length ?? 0;
        setNotice({ tone: "ok", text: `Deleted ${r.deleted ?? 0}.${skipped ? ` Skipped ${skipped} already-contacted.` : ""}` });
      } else {
        const r = await apiPost<{ updated: number }>("/api/platform/leads", { action: "tag", ids, [kind]: [t] });
        setNotice({ tone: "ok", text: `Tag ${kind === "add" ? "added to" : "removed from"} ${r.updated ?? ids.length} lead(s).` });
      }
      await load();
      onChanged();
    } catch (err) {
      setNotice({ tone: "bad", text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="LEADS" right={<Button onClick={() => void load()} disabled={loading}>Refresh</Button>}>
      <div className="pf-section">
        <div className="pf-toolbar gw-filters">
          <input className="pf-input grow" placeholder="Search name, company, email…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="pf-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {["new", "sent", "replied", "failed", "unsubscribed"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="pf-input gw-tagfilter" placeholder="Tag" value={tag} onChange={(e) => setTag(e.target.value)} />
          <select className="pf-select" value={hasEmail} onChange={(e) => setHasEmail(e.target.value)} aria-label="Email">
            <option value="">Any email</option>
            <option value="true">Has email</option>
            <option value="false">No email</option>
          </select>
        </div>

        {ids.length > 0 && (
          <div className="pf-toolbar gw-bulk">
            <strong className="pf-small">{ids.length} selected</strong>
            <input className="pf-input gw-tagfilter" placeholder="tag" value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} />
            <Button disabled={busy} onClick={() => void bulk("add")}>Add tag</Button>
            <Button disabled={busy} onClick={() => void bulk("remove")}>Remove tag</Button>
            <Button variant="primary" disabled={busy} onClick={() => onQueue(ids)}>Queue outreach for selected</Button>
            <Button variant="danger" disabled={busy} onClick={() => void bulk("delete")}>Delete</Button>
          </div>
        )}

        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        {error && <Notice tone="bad">{error}</Notice>}

        {!leads.length ? (
          loading ? <Empty>Loading…</Empty> : <Empty>No leads match. Import a CSV or run web research in the Import tab.</Empty>
        ) : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={allOnPage} aria-label="Select all"
                    onChange={() => setSelected(allOnPage ? new Set() : new Set(leads.map((l) => l.id)))} /></th>
                  <th>Lead</th><th>Email</th><th>Status</th><th>Tags</th><th>Added</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const st = leadStatus(lead);
                  return (
                    <tr key={lead.id} className={selected.has(lead.id) ? "sel gw-row" : "gw-row"}>
                      <td><input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} aria-label="Select lead" /></td>
                      <td onClick={() => setOpen(lead)} className="gw-click">
                        <strong>{lead.name || "Unnamed lead"}</strong>
                        <small>{[lead.title, lead.company].filter(Boolean).join(" · ") || "No title/company"}</small>
                      </td>
                      <td>{lead.email || <span className="pf-muted">none</span>}{lead.email_quality && <small>{lead.email_quality}</small>}</td>
                      <td><Badge tone={st === "unsubscribed" ? "bad" : statusTone(st === "new" ? "" : st)}>{st}</Badge></td>
                      <td>{(lead.tags ?? []).slice(0, 3).join(", ") || <span className="pf-muted">—</span>}</td>
                      <td className="pf-muted">{timeAgo(lead.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="pf-toolbar">
          <span className="pf-small pf-muted">{leads.length} loaded</span>
          {cursor && <Button disabled={loading} onClick={() => void load(true, cursor)}>{loading ? "Loading…" : "Load more"}</Button>}
        </div>
      </div>

      {open && (
        <LeadDrawer
          lead={open}
          onClose={() => setOpen(null)}
          onSaved={(lead) => { setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l))); setOpen(lead); onChanged(); }}
        />
      )}
    </Panel>
  );
}
