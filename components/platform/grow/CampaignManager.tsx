"use client";

import { useState } from "react";
import { apiPost } from "@/components/platform/api";
import { Badge, Button, Empty, Notice, Panel, statusTone } from "@/components/platform/ui";
import { errMsg, type Campaign } from "./types";

export function CampaignManager({ campaigns, onChanged }: { campaigns: Campaign[]; onChanged: () => void }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function act(id: string, payload: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(id);
    setMsg(null);
    try {
      const r = await apiPost<{ cancelled?: number }>("/api/platform/outreach", payload);
      setMsg({ tone: "ok", text: payload.action === "cancel" ? `Cancelled ${r.cancelled ?? 0} queued message(s).` : "Campaign updated." });
      onChanged();
    } catch (err) {
      setMsg({ tone: "bad", text: errMsg(err) });
    } finally {
      setBusy("");
    }
  }

  return (
    <Panel title="CAMPAIGNS" flush>
      {msg && <div className="gw-pad"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {!campaigns.length ? <Empty>No campaigns yet. Write a message above and click &quot;Save as campaign&quot;.</Empty> : (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Name</th><th>Status</th><th>Messages</th><th>Actions</th></tr></thead>
            <tbody>
              {campaigns.map((c) => {
                const stats = Object.entries(c.stats ?? {}).filter(([, n]) => n > 0);
                const disabled = busy === c.id;
                return (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong><small>{c.subject}</small></td>
                    <td><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                    <td>{stats.length ? stats.map(([k, n]) => `${k} ${n}`).join(" · ") : <span className="pf-muted">none</span>}</td>
                    <td>
                      <div className="pf-toolbar">
                        {c.status === "active"
                          ? <Button disabled={disabled} onClick={() => void act(c.id, { action: "set_campaign_status", campaignId: c.id, status: "paused" })}>Pause</Button>
                          : c.status !== "completed" && <Button disabled={disabled} onClick={() => void act(c.id, { action: "set_campaign_status", campaignId: c.id, status: "active" })}>Resume</Button>}
                        {c.status !== "completed" && <Button disabled={disabled} onClick={() => void act(c.id, { action: "set_campaign_status", campaignId: c.id, status: "completed" })}>Complete</Button>}
                        {(c.stats?.queued ?? 0) > 0 && (
                          <Button variant="danger" disabled={disabled} onClick={() => void act(c.id, { action: "cancel", campaignId: c.id }, `Cancel ${c.stats?.queued} queued message(s) in "${c.name}"?`)}>Cancel queued</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
