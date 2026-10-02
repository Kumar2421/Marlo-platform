-- Platform control plane: MCP hardening, audit log, outreach engine, suppression list, settings.

-- ---------------------------------------------------------------- MCP OAuth
create table if not exists public.platform_mcp_clients (
  client_id text primary key,
  client_name text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.platform_mcp_tokens
  add column if not exists revoked_at timestamptz,
  add column if not exists last_used_at timestamptz,
  add column if not exists family_id uuid not null default gen_random_uuid();
create index if not exists platform_mcp_tokens_user_idx on public.platform_mcp_tokens(user_id, created_at desc);
create index if not exists platform_mcp_tokens_family_idx on public.platform_mcp_tokens(family_id);

alter table public.platform_mcp_authorization_codes
  add column if not exists family_id uuid not null default gen_random_uuid();

-- ---------------------------------------------------------------- audit log
create table if not exists public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  via text not null check (via in ('ui', 'mcp', 'system')),
  client_id text,
  action text not null,
  target_type text,
  target_id text,
  status text not null default 'ok' check (status in ('ok', 'error', 'denied', 'pending')),
  idempotency_key text,
  meta jsonb not null default '{}'::jsonb,
  result jsonb,
  created_at timestamptz not null default now()
);
create index if not exists platform_audit_created_idx on public.platform_audit_log(created_at desc);
create index if not exists platform_audit_actor_idx on public.platform_audit_log(actor_id, created_at desc);
create unique index if not exists platform_audit_idem_uidx
  on public.platform_audit_log(actor_id, action, idempotency_key) where idempotency_key is not null and status in ('ok', 'pending');

-- ---------------------------------------------------------------- settings
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- leads
alter table public.leads
  add column if not exists tags text[] not null default '{}',
  add column if not exists notes text,
  add column if not exists reply_classification text,
  add column if not exists unsubscribed_at timestamptz;
create index if not exists leads_platform_tags_idx on public.leads using gin(tags) where scope = 'platform';

-- Unify dedupe keys: email-bearing platform leads always use "email:<lowercase address>".
update public.leads l set dedupe_key = 'email:' || lower(l.email)
where l.scope = 'platform' and l.email is not null
  and l.dedupe_key is distinct from 'email:' || lower(l.email)
  and not exists (
    select 1 from public.leads o
    where o.scope = 'platform' and o.dedupe_key = 'email:' || lower(l.email) and o.id <> l.id
  );

-- ---------------------------------------------------------------- outreach
create table if not exists public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.outreach_campaigns(id) on delete set null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled', 'skipped')),
  error text,
  gmail_thread_id text,
  gmail_message_id text,
  queued_by uuid not null,
  queued_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);
create index if not exists outreach_messages_status_idx on public.outreach_messages(status, queued_at);
create index if not exists outreach_messages_lead_idx on public.outreach_messages(lead_id);
create index if not exists outreach_messages_campaign_idx on public.outreach_messages(campaign_id);
-- one live (queued/sending/sent) message per lead
create unique index if not exists outreach_messages_lead_live_uidx
  on public.outreach_messages(lead_id) where status in ('queued', 'sending', 'sent');

create table if not exists public.email_suppressions (
  email text primary key,
  reason text not null check (reason in ('unsubscribe', 'bounce', 'manual', 'complaint')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
-- These tables are service-role only. RLS with no policies denies anon/authenticated access.
alter table public.platform_mcp_clients enable row level security;
alter table public.platform_mcp_authorization_codes enable row level security;
alter table public.platform_mcp_tokens enable row level security;
alter table public.platform_mcp_events enable row level security;
alter table public.platform_audit_log enable row level security;
alter table public.platform_settings enable row level security;
alter table public.outreach_campaigns enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.email_suppressions enable row level security;

-- ---------------------------------------------------------------- health history
create table if not exists public.platform_health_checks (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  status text not null check (status in ('healthy', 'degraded', 'error', 'not_configured')),
  latency_ms integer,
  detail text,
  checked_at timestamptz not null default now()
);
create index if not exists platform_health_service_idx on public.platform_health_checks(service, checked_at desc);
alter table public.platform_health_checks enable row level security;
