"use client";

import { useState } from "react";
import { apiPost, timeAgo, useApi } from "@/components/platform/api";
import { Badge, Button, Empty, Loading, Notice, Panel } from "@/components/platform/ui";
import { errMsg, type Lead } from "./types";

const CLASSES = ["interested", "negative", "unsubscribe", "bounce", "auto_reply", "neutral"] as const;
type SyncResult = { checked: number; new_replies: number; bounces: number; unsubscribes: number; auto_replies: number; failures: string[] };

export function RepliesTab({ onChanged }: { onChanged: () => void }) {
  const [filter, setFilter] = useState("");
  const { data, error, loading, reload } = useApi<{ replies: Lead[] }>(`/api/platform/replies${filter ? `?classification=${filter}` : ""}`);
  const [syncing, setSyncing] = useState(false);
  const [sync, setSync] = useState<SyncResult | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [marking, setMarking] = useState("");

  async function runSync() {
    setSyncing(true);
    setMsg(null);
    setSync(null);
    try {
      setSync(await apiPost<SyncResult>("/api/platform/replies", { action: "sync" }));
      await reload();
      onChanged();
    } catch (err) {
      setMsg({ tone: "bad", text: errMsg(err, "Sync failed.") });
    } finally {
      setSyncing(false);
    }
  }

  async function mark(leadId: string, classification: string) {
    setMarking(leadId);
    setMsg(null);
    try {
      await apiPost("/api/platform/replies", { action: "mark", leadId, classification });
      await reload();
      onChanged();
    } catch (err) {
      setMsg({ tone: "bad", text: errMsg(err) });
    } finally {
      setMarking("");
    }
  }

  const replies = data?.replies ?? [];
  return (
    <Panel title="REPLIES" right={<Button variant="primary" disabled={syncing} onClick={() => void runSync()}>{syncing ? "Syncing…" : "Sync Gmail replies"}</Button>}>
      <div className="pf-section">
        <div className="gw-chips">
          {["", ...CLASSES].map((c) => (
            <button key={c || "all"} type="button" className={`gw-chip${filter === c ? " active" : ""}`} onClick={() => setFilter(c)}>{c ? c.replace("_", " ") : "all"}</button>
          ))}
        </div>
        {syncing && <Notice tone="info">Checking Gmail threads. This can take a while.</Notice>}
        {sync && (
          <Notice tone={sync.failures?.length ? "warn" : "ok"}>
            Checked {sync.checked} · {sync.new_replies} new repl{sync.new_replies === 1 ? "y" : "ies"} · {sync.bounces} bounce(s) · {sync.unsubscribes} unsubscribe(s) · {sync.auto_replies} auto-repl{sync.auto_replies === 1 ? "y" : "ies"} · {sync.failures?.length ?? 0} failure(s)
            {sync.failures?.length > 0 && <ul className="gw-reasons">{sync.failures.slice(0, 10).map((f, i) => <li key={i}>{f}</li>)}</ul>}
          </Notice>
        )}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Loading error={error} loading={loading && !data} />
        {data && !replies.length && <Empty>No replies{filter ? ` classified as ${filter}` : " yet"}.</Empty>}
        {replies.map((lead) => (
          <article className="gw-reply-card" key={lead.id}>
            <div className="pf-toolbar">
              <strong className="grow">{lead.name || lead.email || "Unknown"}</strong>
              <Badge tone={lead.reply_classification === "interested" ? "info" : lead.reply_classification && ["negative", "bounce", "unsubscribe"].includes(lead.reply_classification) ? "bad" : "muted"}>
                {lead.reply_classification ?? "unclassified"}
              </Badge>
            </div>
            <div className="pf-small pf-muted">{[lead.title, lead.company, lead.email].filter(Boolean).join(" · ")} · {timeAgo(lead.last_reply_at)}</div>
            <p className="gw-snippet">{lead.last_reply_snippet || "No snippet captured."}</p>
            <div className="pf-toolbar">
              {CLASSES.map((c) => (
                <Button key={c} disabled={marking === lead.id || lead.reply_classification === c} onClick={() => void mark(lead.id, c)}>{c.replace("_", " ")}</Button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}
