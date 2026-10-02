"use client";

import { useState } from "react";
import { apiPost, useApi } from "@/components/platform/api";
import { Button, Loading, Notice, Panel } from "@/components/platform/ui";
import { errMsg, type OutreachData, type Preview } from "./types";
import { SendPanel } from "./SendPanel";
import { CampaignManager } from "./CampaignManager";
import { MessageLog } from "./MessageLog";

const DEFAULT_SUBJECT = "Quick question, {{first_name}}";
const DEFAULT_BODY = "Hi {{first_name}},\n\nI came across {{company}} and wanted to reach out.\n\nWould you be open to a short conversation?\n\nBest,";

export function OutreachTab({ leadIds, onClearIds, onChanged }: { leadIds: string[]; onClearIds: () => void; onChanged: () => void }) {
  const { data, error, loading, reload } = useApi<OutreachData>("/api/platform/outreach");
  const [campaignId, setCampaignId] = useState("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState("50");
  const [busy, setBusy] = useState<"" | "preview" | "queue">("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const campaigns = data?.campaigns ?? [];
  const gmail = data?.gmail ?? null;

  function pickCampaign(id: string) {
    setCampaignId(id);
    const c = campaigns.find((x) => x.id === id);
    if (c) { setSubject(c.subject); setBody(c.body); }
  }

  function audience() {
    const base = { subject: subject.trim(), body, campaignId: campaignId || undefined };
    if (leadIds.length) return { ...base, leadIds };
    const n = Number(limit);
    return { ...base, filter: { status: "new", tag: tag.trim() || undefined, query: query.trim() || undefined }, limit: Number.isFinite(n) && n > 0 ? n : 50 };
  }

  async function run(action: "preview" | "queue") {
    if (!subject.trim() || !body.trim()) { setMsg({ tone: "bad", text: "Subject and body are required." }); return; }
    setBusy(action);
    setMsg(null);
    try {
      const r = await apiPost<Preview>("/api/platform/outreach", { action, ...audience() });
      setPreview(r);
      if (action === "queue") {
        setMsg({ tone: "ok", text: `Queued ${r.queued ?? 0} message(s). ${r.skipped?.length ?? 0} skipped.` });
        await reload();
        onChanged();
      }
    } catch (err) {
      setMsg({ tone: "bad", text: errMsg(err) });
    } finally {
      setBusy("");
    }
  }

  async function saveCampaign() {
    const name = window.prompt("Campaign name");
    if (!name?.trim()) return;
    try {
      await apiPost("/api/platform/outreach", { action: "create_campaign", name: name.trim(), subject: subject.trim(), body });
      setMsg({ tone: "ok", text: "Campaign saved." });
      await reload();
    } catch (err) {
      setMsg({ tone: "bad", text: errMsg(err) });
    }
  }

  const skipped = preview?.skipped ?? [];
  return (
    <div className="pf-stack">
      <Loading error={error} loading={loading && !data} />
      {data && (
        <div className="gw-gmail pf-small">
          {gmail
            ? <>Gmail connected as <strong>{gmail}</strong></>
            : <Notice tone="warn">Gmail is not connected, so nothing can be sent. You can still preview and queue. <a href="/api/integrations/gmail/connect">Connect Gmail</a></Notice>}
        </div>
      )}

      <Panel title="COMPOSE" right={<Button onClick={() => void saveCampaign()} disabled={!subject.trim() || !body.trim()}>Save as campaign</Button>}>
        <div className="pf-section">
          <label className="pf-field">Template
            <select className="pf-select" value={campaignId} onChange={(e) => pickCampaign(e.target.value)}>
              <option value="">Custom message</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
            </select>
          </label>
          <label className="pf-field">Subject<input className="pf-input" value={subject} maxLength={180} onChange={(e) => setSubject(e.target.value)} /></label>
          <label className="pf-field">Body<textarea className="pf-textarea" rows={8} value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)} /></label>
          <p className="pf-small pf-muted gw-help">Merge fields: {"{{first_name}} {{name}} {{company}} {{title}} {{location}}"}. Signature and unsubscribe line are appended automatically.</p>

          <div className="gw-audience">
            <div className="pf-small pf-muted">AUDIENCE</div>
            {leadIds.length > 0 ? (
              <div className="pf-toolbar">
                <strong>{leadIds.length} lead(s) selected in Leads tab</strong>
                <Button onClick={onClearIds}>Use filter instead</Button>
              </div>
            ) : (
              <div className="gw-form3">
                <label className="pf-field">Tag<input className="pf-input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="any" /></label>
                <label className="pf-field">Search<input className="pf-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="name, company…" /></label>
                <label className="pf-field">Limit<input className="pf-input" type="number" min={1} max={500} value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
              </div>
            )}
            {!leadIds.length && <div className="pf-small pf-muted">Filter: leads with status &quot;new&quot; that have an email.</div>}
          </div>

          <div className="pf-toolbar">
            <Button disabled={Boolean(busy)} onClick={() => void run("preview")}>{busy === "preview" ? "Previewing…" : "Preview"}</Button>
            <Button variant="primary" disabled={Boolean(busy)} onClick={() => void run("queue")}>{busy === "queue" ? "Queuing…" : "Queue"}</Button>
          </div>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

          {preview && (
            <div className="pf-section">
              <Notice tone="info">
                {preview.dry_run ? `Would queue ${preview.would_queue ?? 0}` : `Queued ${preview.queued ?? 0}`} · {skipped.length} skipped
              </Notice>
              {(preview.previews ?? []).slice(0, 3).map((p, i) => (
                <div className="gw-preview" key={i}>
                  <div className="pf-small pf-muted">To: {p.to}</div>
                  <strong>{p.subject}</strong>
                  <pre className="pf-pre">{p.body}</pre>
                </div>
              ))}
              {skipped.length > 0 && (
                <details>
                  <summary className="pf-small">Skipped reasons ({skipped.length})</summary>
                  <ul className="gw-reasons">{skipped.slice(0, 50).map((s, i) => <li key={i}>{s.lead_id.slice(0, 8)}: {s.reason}</li>)}</ul>
                </details>
              )}
            </div>
          )}
        </div>
      </Panel>

      <SendPanel data={data} gmail={gmail} onDone={() => { void reload(); onChanged(); }} />
      <CampaignManager campaigns={campaigns} onChanged={() => void reload()} />
      <MessageLog messages={data?.messages ?? []} />
    </div>
  );
}
