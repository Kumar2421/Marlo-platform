"use client";

import { Badge, Panel, Row } from "@/components/platform/ui";

type Env = { flag: string; vars: string; text: string; optional?: boolean };

export const ENV_ITEMS: Env[] = [
  { flag: "supabase_public", vars: "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY", text: "Lets the browser sign admins in with Supabase Auth." },
  { flag: "supabase_server_url", vars: "MARLO_SUPABASE_URL", text: "Server-side Supabase project URL used for all data reads and writes." },
  { flag: "supabase_secret_key", vars: "MARLO_SUPABASE_SECRET_KEY", text: "Service key that lets the control plane read users, projects and findings." },
  { flag: "admin_ids", vars: "MARLO_ADMIN_USER_IDS", text: "Comma-separated user ids allowed into this dashboard and the MCP admin scope." },
  { flag: "gmail_oauth_app", vars: "GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET", text: "Google OAuth app used to connect the Gmail account that sends outreach." },
  { flag: "research_keys", vars: "TAVILY_API_KEY + OPENAI_API_KEY", text: "Enables web lead research (search plus extraction).", optional: true },
  { flag: "github_token", vars: "GITHUB_TOKEN", text: "Shows CI runs on the Build tab and allows re-running workflows.", optional: true },
  { flag: "vercel_token", vars: "VERCEL_TOKEN", text: "Shows deployments on the Build tab.", optional: true },
  { flag: "cron_secret", vars: "CRON_SECRET", text: "Authenticates scheduled jobs such as health checks.", optional: true },
  { flag: "mcp_issuer", vars: "MARLO_MCP_ISSUER", text: "Public base URL advertised as the OAuth issuer for MCP clients." },
];

export function EnvPanel({ flags }: { flags: Record<string, boolean> }) {
  return (
    <Panel title="ENVIRONMENT">
      {ENV_ITEMS.map((item) => {
        const ok = Boolean(flags[item.flag]);
        return (
          <Row key={item.flag} label={<span className="pf-mono pf-small">{item.vars}</span>} note={item.text}>
            {ok ? <Badge tone="ok">ready</Badge> : item.optional ? <Badge>optional</Badge> : <Badge tone="bad">missing</Badge>}
          </Row>
        );
      })}
    </Panel>
  );
}
