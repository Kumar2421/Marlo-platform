"use client";

import { fmtDate } from "@/components/platform/api";
import { Badge, Empty, Panel, statusTone } from "@/components/platform/ui";
import type { OutMessage } from "./types";

export function MessageLog({ messages }: { messages: OutMessage[] }) {
  return (
    <Panel title="MESSAGE LOG" flush>
      {!messages.length ? <Empty>No messages yet.</Empty> : (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>To</th><th>Subject</th><th>Status</th><th>When</th><th>Error</th></tr></thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id}>
                  <td>{m.to_email}</td>
                  <td>{m.subject}</td>
                  <td><Badge tone={statusTone(m.status)}>{m.status}</Badge></td>
                  <td className="pf-muted">{fmtDate(m.sent_at ?? m.queued_at)}</td>
                  <td className="wrap gw-err" title={m.error ?? ""}>{m.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
