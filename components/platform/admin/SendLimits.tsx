"use client";

import { useEffect, useState } from "react";
import { apiPost } from "@/components/platform/api";
import { Button, Notice, Panel, type Tone } from "@/components/platform/ui";
import type { SendSettings } from "./settings-types";

export function SendLimits({ initial, onSaved }: { initial: SendSettings; onSaved: () => void }) {
  const [cap, setCap] = useState(String(initial.dailySendCap ?? ""));
  const [delay, setDelay] = useState(String(initial.sendDelaySeconds ?? ""));
  const [batch, setBatch] = useState(String(initial.maxPerBatch ?? ""));
  const [signature, setSignature] = useState(initial.signature ?? "");
  const [unsub, setUnsub] = useState(initial.unsubscribeLine ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);

  // Re-sync the form when fresh settings arrive (after a save or a reload).
  useEffect(() => {
    setCap(String(initial.dailySendCap ?? ""));
    setDelay(String(initial.sendDelaySeconds ?? ""));
    setBatch(String(initial.maxPerBatch ?? ""));
    setSignature(initial.signature ?? "");
    setUnsub(initial.unsubscribeLine ?? "");
  }, [initial.dailySendCap, initial.sendDelaySeconds, initial.maxPerBatch, initial.signature, initial.unsubscribeLine]);

  async function save() {
    setBusy(true); setNotice(null);
    const settings: SendSettings = { signature, unsubscribeLine: unsub };
    if (cap !== "") settings.dailySendCap = Number(cap);
    if (delay !== "") settings.sendDelaySeconds = Number(delay);
    if (batch !== "") settings.maxPerBatch = Number(batch);
    try {
      await apiPost("/api/platform/outreach", { action: "update_settings", settings });
      setNotice({ tone: "ok", text: "Send limits saved." });
      onSaved();
    } catch (err) { setNotice({ tone: "bad", text: err instanceof Error ? err.message : "Save failed." }); }
    finally { setBusy(false); }
  }

  return (
    <Panel title="SEND LIMITS" right={<Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>}>
      <div className="pf-section">
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        <div className="st-form">
          <label className="pf-field">Daily cap<input className="pf-input" type="number" min={0} value={cap} onChange={(e) => setCap(e.target.value)} /></label>
          <label className="pf-field">Delay (seconds)<input className="pf-input" type="number" min={0} value={delay} onChange={(e) => setDelay(e.target.value)} /></label>
          <label className="pf-field">Max per batch<input className="pf-input" type="number" min={1} value={batch} onChange={(e) => setBatch(e.target.value)} /></label>
          <label className="pf-field wide">Signature<textarea className="pf-textarea" rows={3} value={signature} onChange={(e) => setSignature(e.target.value)} /></label>
          <label className="pf-field wide">Unsubscribe line<input className="pf-input" value={unsub} onChange={(e) => setUnsub(e.target.value)} /></label>
        </div>
      </div>
    </Panel>
  );
}
