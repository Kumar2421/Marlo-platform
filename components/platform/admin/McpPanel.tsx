"use client";

import { Badge, Empty, Panel } from "@/components/platform/ui";
import { CopyText } from "./CopyButton";
import type { ConfigResp } from "./settings-types";

const SCOPE_TEXT: Record<string, string> = {
  read: "View dashboards, leads, findings and status. Cannot change anything.",
  write: "Change data: edit leads, create campaigns, queue messages, requeue fixes.",
  send: "Send real emails through the connected Gmail account.",
  admin: "Manage sessions, clients and other platform-level controls.",
};

export function McpPanel({ mcp }: { mcp: ConfigResp["mcp"] | undefined }) {
  const tools = mcp?.tools ?? [];
  const scopes = mcp?.scopes?.length ? mcp.scopes : Object.keys(SCOPE_TEXT);
  const grouped = new Map<string, typeof tools>();
  for (const tool of tools) grouped.set(tool.scope, [...(grouped.get(tool.scope) ?? []), tool]);

  return (
    <Panel title="MCP CONNECTION">
      <div className="pf-section">
        <div className="pf-field">Endpoint URL
          {mcp?.endpoint ? <CopyText value={mcp.endpoint} /> : <span className="pf-muted">Not available</span>}
        </div>
        <ol className="st-steps">
          <li>In Claude, open Settings, then Connectors.</li>
          <li>Choose Add custom connector.</li>
          <li>Paste the endpoint URL above and confirm.</li>
          <li>Approve the consent screen with your admin account and pick the scopes to grant.</li>
        </ol>
        <div>
          <h4 className="st-h">Scopes</h4>
          {scopes.map((s) => (
            <div className="st-tool" key={s}><Badge tone={s === "admin" || s === "send" ? "warn" : "info"}>{s}</Badge><span>{SCOPE_TEXT[s] ?? "Custom scope."}</span></div>
          ))}
        </div>
        <details className="st-details">
          <summary>Tool catalog ({tools.length})</summary>
          {tools.length === 0 && <Empty>No tools listed.</Empty>}
          {[...grouped.entries()].map(([scope, list]) => (
            <div key={scope}>
              <h4 className="st-h">{scope}</h4>
              {list.map((t) => (
                <div className="st-tool" key={t.name}>
                  <code>{t.name}</code><span>{t.title}</span>
                  {t.destructive && <Badge tone="bad">destructive</Badge>}
                </div>
              ))}
            </div>
          ))}
        </details>
      </div>
    </Panel>
  );
}
