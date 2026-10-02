"use client";

import { useState } from "react";
import { apiPost, fmtDate, useApi } from "@/components/platform/api";
import { Button, Empty, Loading, Notice, Panel } from "@/components/platform/ui";
import { errMsg, type OutreachData } from "./types";
import { SettingsForm } from "./SettingsForm";

export function SuppressionTab() {
  const { data, error, loading, reload } = useApi<OutreachData>("/api/platform/outreach");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(payload: Record<string, unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await apiPost("/api/platform/outreach", payload);
      setMsg({ tone: "ok", text: ok });
      await reload();
      return true;
    } catch (err) {
      setMsg({ tone: "bad", text: errMsg(err) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!email.trim()) return;
    if (await post({ action: "add_suppression", email: email.trim(), reason: reason.trim() || undefined }, "Added to suppression list.")) {
      setEmail("");
      setReason("");
    }
  }

  const list = data?.suppressions ?? [];
  return (
    <div className="pf-stack">
      <Loading error={error} loading={loading && !data} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Panel title="SUPPRESSION LIST" flush>
        <div className="gw-pad pf-toolbar">
          <input className="pf-input grow" type="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="pf-input" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="primary" disabled={busy || !email.trim()} onClick={() => void add()}>Add</Button>
        </div>
        {!list.length ? <Empty>No suppressed addresses.</Empty> : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead><tr><th>Email</th><th>Reason</th><th>Added</th><th /></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.email}>
                    <td>{s.email}</td><td>{s.reason ?? "—"}</td><td className="pf-muted">{fmtDate(s.created_at)}</td>
                    <td><Button variant="danger" disabled={busy} onClick={() => { if (window.confirm(`Remove ${s.email} from the suppression list? They may be emailed again.`)) void post({ action: "remove_suppression", email: s.email }, "Removed."); }}>Remove</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {data && <SettingsForm settings={data.settings} onSaved={() => void reload()} />}
    </div>
  );
}
