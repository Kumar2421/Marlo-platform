"use client";

import { useRef, useState } from "react";
import { apiPost } from "@/components/platform/api";
import { Button, Notice, Panel } from "@/components/platform/ui";
import { errMsg, type OutreachData, type SendResult } from "./types";

type Totals = { sent: number; failed: number; skipped: number; batches: number; errors: string[]; stopped: string | null; remaining: number | null; sentToday: number | null; cap: number | null };
const EMPTY: Totals = { sent: 0, failed: 0, skipped: 0, batches: 0, errors: [], stopped: null, remaining: null, sentToday: null, cap: null };

export function SendPanel({ data, gmail, onDone }: { data: OutreachData | null; gmail: string | null; onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState<Totals>(EMPTY);
  const [error, setError] = useState("");
  const stop = useRef(false);

  const queued = totals.remaining ?? data?.stats.queued ?? 0;
  const sentToday = totals.sentToday ?? data?.stats.sent_today ?? 0;
  const cap = totals.cap ?? data?.stats.daily_cap ?? 0;
  const pct = cap > 0 ? Math.min(100, Math.round((sentToday / cap) * 100)) : 0;

  async function start() {
    stop.current = false;
    setRunning(true);
    setError("");
    let acc: Totals = { ...EMPTY, errors: [] };
    setTotals(acc);
    try {
      for (let guard = 0; guard < 500 && !stop.current; guard++) {
        const r = await apiPost<SendResult>("/api/platform/outreach", { action: "send" });
        acc = {
          sent: acc.sent + (r.sent ?? 0), failed: acc.failed + (r.failed ?? 0), skipped: acc.skipped + (r.skipped ?? 0),
          batches: acc.batches + 1, errors: [...acc.errors, ...(r.errors ?? [])].slice(-20),
          stopped: r.stopped_reason ?? null, remaining: r.remaining_queued ?? 0, sentToday: r.sent_today ?? null, cap: r.daily_cap ?? null,
        };
        setTotals(acc);
        // Stop when nothing is left, a stop reason is set, or a batch made no progress (avoids a hot loop).
        if (acc.stopped || acc.remaining === 0 || (r.sent ?? 0) + (r.failed ?? 0) === 0) break;
      }
    } catch (err) {
      setError(errMsg(err, "Send failed."));
    } finally {
      setRunning(false);
      onDone();
    }
  }

  const reason = !gmail ? "Connect Gmail to enable sending." : queued === 0 ? "Nothing is queued." : data && data.stats.remaining_today <= 0 && !running ? "Daily cap reached; sending resumes tomorrow." : "";
  const disabled = !gmail || queued === 0;

  return (
    <Panel title="SEND QUEUE">
      <div className="pf-section">
        <div className="pf-toolbar">
          <strong>{queued} queued</strong>
          <span className="pf-small pf-muted">{sentToday} / {cap} sent today</span>
        </div>
        <div className={`pf-bar ${pct >= 100 ? "bad" : pct >= 80 ? "warn" : ""}`}><i style={{ width: `${pct}%` }} /></div>

        <div className="pf-toolbar">
          {running
            ? <Button variant="danger" onClick={() => { stop.current = true; }}>Stop after this batch</Button>
            : <Button variant="primary" disabled={disabled} onClick={() => void start()}>Send queued</Button>}
          {running && <span className="pf-small pf-muted">Sending one batch at a time (up to ~30s each)…</span>}
        </div>
        {reason && !running && <div className="pf-small pf-muted">{reason}</div>}

        {totals.batches > 0 && (
          <Notice tone={totals.failed ? "warn" : "ok"}>
            {totals.sent} sent · {totals.failed} failed · {totals.skipped} skipped · {totals.batches} batch{totals.batches === 1 ? "" : "es"}
            {totals.stopped && ` · stopped: ${totals.stopped.replace(/_/g, " ")}`}
            {!running && totals.stopped == null && totals.remaining === 0 && " · queue empty"}
          </Notice>
        )}
        {totals.errors.length > 0 && <ul className="gw-reasons">{totals.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        {error && <Notice tone="bad">{error}</Notice>}
      </div>
    </Panel>
  );
}
