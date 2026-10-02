"use client";

import "@/app/views-admin.css";
import { useApi } from "@/components/platform/api";
import { Badge, Loading, Panel, Row, StatGrid } from "@/components/platform/ui";
import { ENV_ITEMS, EnvPanel } from "@/components/platform/admin/EnvPanel";
import { SendLimits } from "@/components/platform/admin/SendLimits";
import { McpPanel } from "@/components/platform/admin/McpPanel";
import { SessionsPanel } from "@/components/platform/admin/SessionsPanel";
import type { ConfigResp, SettingsResp } from "@/components/platform/admin/settings-types";

export function SettingsView() {
  const config = useApi<ConfigResp>("/api/platform/data?tab=config");
  const sessions = useApi<SettingsResp>("/api/platform/data?tab=settings");
  const cfg = config.data;
  const flags = cfg?.flags ?? {};
  const passing = ENV_ITEMS.filter((i) => flags[i.flag]).length;
  const gmail = cfg?.gmail;

  return (
    <>
      <StatGrid items={[
        { label: "Admins", value: cfg ? cfg.admins : "—" },
        { label: "Gmail", value: cfg ? (gmail?.connected ? "Connected" : "Not connected") : "—", note: gmail?.email ?? undefined },
        { label: "Config checks passing", value: cfg ? `${passing}/${ENV_ITEMS.length}` : "—" },
        { label: "MCP sessions", value: sessions.data ? (sessions.data.sessions ?? []).length : "—" },
      ]} />
      <Loading error={config.error} loading={config.loading && !cfg} />
      {cfg && (
        <>
          <EnvPanel flags={flags} />
          <Panel title="GMAIL">
            <Row label={gmail?.connected ? "Connected" : "Not connected"} note={gmail?.email ?? "Connect a Gmail account to send outreach."}>
              <Badge tone={gmail?.connected ? "ok" : "warn"}>{gmail?.connected ? "connected" : "disconnected"}</Badge>
              <a className="pf-btn primary" href="/api/integrations/gmail/connect">{gmail?.connected ? "Reconnect" : "Connect"}</a>
            </Row>
          </Panel>
          <SendLimits initial={cfg.send_settings ?? {}} onSaved={() => void config.reload()} />
          <McpPanel mcp={cfg.mcp} />
        </>
      )}
      <Loading error={sessions.error} loading={sessions.loading && !sessions.data} />
      {sessions.data && <SessionsPanel data={sessions.data} onChanged={() => void sessions.reload()} />}
    </>
  );
}
