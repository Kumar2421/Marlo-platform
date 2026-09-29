-- Platform-owned acquisition leads are kept separate from customer lead pools.
alter table public.leads
  add column if not exists scope text not null default 'customer',
  add column if not exists email_quality text,
  add column if not exists dedupe_key text;

alter table public.leads drop constraint if exists leads_scope_check;
alter table public.leads add constraint leads_scope_check check (scope in ('customer', 'platform'));
alter table public.leads drop constraint if exists leads_email_quality_check;
alter table public.leads add constraint leads_email_quality_check check (
  email_quality is null or email_quality in ('source_found', 'domain_found', 'pattern_candidate', 'smtp_accept', 'verified', 'bounced', 'unknown')
);

create index if not exists leads_scope_user_created_idx on public.leads(scope, user_id, created_at desc);
create index if not exists leads_scope_email_idx on public.leads(scope, lower(email));
create unique index if not exists leads_platform_dedupe_key_uidx on public.leads(dedupe_key) where scope = 'platform' and dedupe_key is not null;
