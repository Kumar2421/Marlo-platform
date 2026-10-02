# Marlo Platform

Internal admin control plane for Marlo: dashboards for the whole platform, plus an MCP server so an AI agent (for example Claude) can read and operate the same things with the same safety rules.

Customer product: https://github.com/Kumar2421/okara-alternative (shares the Supabase project).

## Architecture

```
Admin UI (app/, components/platform/)      MCP clients (Claude etc.)
        |  /api/platform/*, /api/grow/*            |  POST /mcp  (OAuth 2.1 + PKCE)
        v                                          v
            lib/services/*   <- one implementation of every action
   leads · outreach (queue/caps/send) · replies · platform data · audit · settings
                          |
                   Supabase (service role)  +  Gmail API
```

- **Services are the single source of truth.** The UI routes and MCP tools call the same functions, so behavior cannot drift.
- **Every write is audited** (`platform_audit_log`) and shown in Activity.
- **Dashboards fetch per tab** from `GET /api/platform/data?tab=...`.

## MCP

Endpoint: `https://<host>/mcp`. Add it as a custom connector in Claude; the first connection opens a consent screen where an administrator approves the requested scopes.

| Scope | Allows |
|---|---|
| `marlo:read` | list/read leads, outreach, users, projects, findings, builds, health, activity |
| `marlo:write` | import/edit/tag/delete leads, campaigns, notes, requeue fixes (implies read) |
| `marlo:send` | queue and send email via the connected Gmail, sync replies, suppress addresses |
| `marlo:admin` | audit log, MCP session management, CI reruns, send settings, un-suppress |

Highlights:

- `marlo.import_leads` bulk import (≤500, `dry_run`, dedupe, per-row validation).
- Outreach is **queue → send in batches**: `queue_outreach`, then `send_queued` repeatedly until `remaining_queued` is 0 or `stopped_reason` is set.
- Safety: daily send cap, per-send delay, batch size, automatic unsubscribe footer, suppression list (unsubscribes and bounces are suppressed automatically), atomic claim so a lead can never be emailed twice.
- `idempotency_key` on every write tool makes retries safe.
- Resources (`marlo://status`, `marlo://settings/send`) and prompts (`run_outreach`, `weekly_report`).
- Security: dynamic client registration with exact redirect-URI matching, consent screen, single-use authorization codes, rotating refresh tokens with reuse detection, revocable sessions, admin allowlist re-checked on every request, per-token rate limits.

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | admin login |
| `MARLO_SUPABASE_URL`, `MARLO_SUPABASE_SECRET_KEY` | server-side data access (service role) |
| `MARLO_ADMIN_USER_IDS` | comma-separated Supabase user ids allowed in (UI and MCP) |
| `MARLO_MCP_ISSUER` | public origin used in OAuth metadata, e.g. `https://platform.example.com` |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` | Gmail OAuth app (outreach sender) |
| `TAVILY_API_KEY`, `OPENAI_API_KEY` (`OPENAI_MODEL`) | web lead research |
| `GITHUB_TOKEN` (`GITHUB_REPO`) | CI status without rate limits; needed for reruns |
| `VERCEL_TOKEN` (`VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`) | deployment list |
| `CRON_SECRET` | authorizes the 15-minute health probe in `vercel.json` |

## Database

Apply `supabase/migrations/*` in order. `20260930000000_platform_control.sql` adds OAuth clients, token revocation/rotation, the audit log, outreach campaigns/messages, the suppression list, platform settings and health history, enables RLS (service-role only) on all platform tables, and unifies lead dedupe keys.

## Development

```
npm install
npm run dev
npx tsc --noEmit
```
