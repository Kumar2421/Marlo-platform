create table if not exists public.platform_mcp_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  user_id uuid not null,
  client_id text not null,
  redirect_uri text not null,
  code_challenge text not null,
  scope text not null default 'marlo:read marlo:write',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  token_type text not null check (token_type in ('access', 'refresh')),
  user_id uuid not null,
  client_id text not null,
  scope text not null default 'marlo:read marlo:write',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_mcp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_mcp_events_created_idx
  on public.platform_mcp_events(created_at desc);

create index if not exists platform_mcp_events_user_idx
  on public.platform_mcp_events(user_id, created_at desc);
