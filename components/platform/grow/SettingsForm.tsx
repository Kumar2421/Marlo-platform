"use client";

import { useState } from "react";
import { apiPost } from "@/components/platform/api";
import { Button, Notice, Panel } from "@/components/platform/ui";
import { errMsg, type SendSettings } from "./types";

export function SettingsForm({ settings, onSaved }: { settings: SendSettings; onSaved: () => void }) {
  const [cap, setCap] = useState(String(settings?.dailySendCap ?? ""));
  const [delay, setDelay] = useState(String(settings?.sendDelaySeconds ?? ""));
  const [batch, setBatch] = useState(String(settings?.maxPerBatch ?? ""));
  const [signature, setSignature] = useState(settings?.signature ?? "");
  const [unsub, setUnsub] = useState(settings?.unsubscribeLine ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
    try {
      await apiPost("/api/platform/outreach", {
        action: "update_settings",
        settings: { dailySendCap: num(cap), sendDelaySeconds: num(delay), maxPerBatch: num(batch), signature, unsubscribeLine: unsub },
      });
      setMsg({ tone: "ok", text: "Settings saved." });
      onSaved();
    } catch (err) {
      setMsg({ tone: "bad", text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="SEND SETTINGS">
      <div className="pf-section">
        <div className="gw-form3">
          <label className="pf-field">Daily cap<input className="pf-input" type="number" min={1} value={cap} onChange={(e) => setCap(e.target.value)} /></label>
          <label className="pf-field">Delay between sends (s)<input className="pf-input" type="number" min={0} value={delay} onChange={(e) => setDelay(e.target.value)} /></label>
          <label className="pf-field">Max per batch<input className="pf-input" type="number" min={1} value={batch} onChange={(e) => setBatch(e.target.value)} /></label>
        </div>
        <label className="pf-field">Signature<textarea className="pf-textarea" rows={3} value={signature} onChange={(e) => setSignature(e.target.value)} /></label>
        <label className="pf-field">Unsubscribe line<textarea className="pf-textarea" rows={2} value={unsub} onChange={(e) => setUnsub(e.target.value)} /></label>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="pf-toolbar"><Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save settings"}</Button></div>
      </div>
    </Panel>
  );
}
