"use client";

import { useState } from "react";
import { apiPost, fmtDate, timeAgo } from "@/components/platform/api";
import { Badge, Button, Empty, Notice, Panel, type Tone } from "@/components/platform/ui";
import type { SettingsResp } from "./settings-types";

export function SessionsPanel({ data, onChanged }: { data: SettingsResp; onChanged: () => void }) {
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);
  const sessions = data.sessions ?? [];
  const clients = data.clients ?? [];

  async function run(key: string, body: object, question: string, done: string) {
    if (!window.confirm(question)) return;
    setBusy(key); setNotice(null);
    try {
      await apiPost("/api/platform/data", body);
      setNotice({ tone: "ok", text: done });
      onChanged();
    } catch (err) { setNotice({ tone: "bad", text: err instanceof Error ? err.message : "Request failed." }); }
    finally { setBusy(""); }
  }

  return (
    <Panel title="CONNECTED CLIENTS AND SESSIONS" flush>
      {notice && <div className="pf-body"><Notice tone={notice.tone}>{notice.text}</Notice></div>}
      {sessions.length === 0 ? <Empty>No active sessions.</Empty> : (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Client</th><th>Scopes</th><th>Created</th><th>Last used</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.family_id}>
                  <td><strong>{s.client_name ?? s.client_id}</strong></td>
                  <td><span className="st-badges">{(s.scope ?? "").split(/\s+/).filter(Boolean).map((x) => <Badge key={x} tone="info">{x}</Badge>)}</span></td>
                  <td>{fmtDate(s.created_at)}</td>
                  <td>{timeAgo(s.last_used_at)}</td>
                  <td>{fmtDate(s.expires_at)}</td>
                  <td>
                    <span className="pf-toolbar">
                      <Button variant="danger" disabled={busy === s.family_id} onClick={() => void run(s.family_id, { action: "revoke_session", familyId: s.family_id }, "Revoke this session?", "Session revoked.")}>Revoke</Button>
                      <Button variant="danger" disabled={busy === s.client_id} onClick={() => void run(s.client_id, { action: "revoke_client", clientId: s.client_id }, `Revoke all sessions for ${s.client_name ?? s.client_id}?`, "Client revoked.")}>Revoke all</Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pf-body">
        <h4 className="st-h" style={{ marginTop: 0 }}>Registered clients</h4>
        {clients.length === 0 ? <span className="pf-muted pf-small">None registered.</span> : clients.map((c) => (
          <div className="st-tool" key={c.client_id}>
            <strong>{c.client_name ?? c.client_id}</strong>
            <span className="pf-muted">{fmtDate(c.created_at)}</span>
            {c.revoked_at ? <Badge tone="bad">revoked</Badge> : <Badge tone="ok">active</Badge>}
          </div>
        ))}
      </div>
    </Panel>
  );
}
