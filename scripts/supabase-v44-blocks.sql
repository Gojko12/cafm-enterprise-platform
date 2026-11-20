-- V44 CAFM Database Split (Stage A)
-- Replaces the single 32 MB cafm_state JSON blob with proper Postgres storage:
-- one row per site and per state collection (equipment, workRequests, rooms, ...).
-- Paste this whole file into the Supabase SQL editor and click Run once.
-- It is safe to run twice (idempotent) and it migrates existing data automatically
-- the first time the app saves or loads via the new cafm_migrate_v44() function.

create table if not exists cafm_blocks (
  site_id  text  not null,
  kind     text  not null,
  payload  jsonb not null,
  primary key (site_id, kind)
);

create table if not exists cafm_site_revision (
  site_id  text    primary key,
  revision bigint  not null default 0
);

-- Row Level Security stays on with no policies: anon/authenticated are fully blocked.
-- Only the service role key used by the server can read and write these tables.
alter table cafm_blocks enable row level security;
alter table cafm_site_revision enable row level security;

-- Atomic whole-site save: replaces that site's blocks and bumps its revision
-- in one transaction. A concurrent or stale writer gets SQLSTATE 40001,
-- which PostgREST reports as 409 so the server can reply with a conflict.
create or replace function cafm_save_state(
  p_site_id           text,
  p_expected_revision bigint,
  p_new_revision      bigint,
  p_blocks            jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('cafm-save:' || p_site_id));
  if coalesce((select revision from cafm_site_revision where site_id = p_site_id), 0)
     <> coalesce(p_expected_revision, 0) then
    raise exception 'State has changed; reload and resolve the conflict.'
      using errcode = '40001';
  end if;
  delete from cafm_blocks where site_id = p_site_id;
  insert into cafm_blocks (site_id, kind, payload)
  select p_site_id, key, value from jsonb_each(p_blocks);
  insert into cafm_site_revision (site_id, revision)
  values (p_site_id, p_new_revision)
  on conflict (site_id) do update set revision = excluded.revision;
  return jsonb_build_object('revision', p_new_revision);
end $$;

-- One-time migration from the legacy single-blob cafm_state row into
-- per-site, per-collection rows. No-op when the new layout already exists
-- or the legacy table never did.
create or replace function cafm_migrate_v44() returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_legacy jsonb;
  v_site   text;
  v_state  jsonb;
  v_sites  int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('cafm-migrate'));
  if exists (select 1 from cafm_blocks limit 1) then
    return jsonb_build_object('migratedSites', 0, 'reason', 'already migrated');
  end if;
  if to_regclass('public.cafm_state') is null then
    return jsonb_build_object('migratedSites', 0, 'reason', 'no legacy state table');
  end if;
  select payload into v_legacy from public.cafm_state where id = 'default' limit 1;
  if v_legacy is null then
    return jsonb_build_object('migratedSites', 0, 'reason', 'legacy state empty');
  end if;
  for v_site, v_state in
    select key, value from jsonb_each(v_legacy -> 'sites')
  loop
    delete from cafm_blocks where site_id = v_site;
    insert into cafm_blocks (site_id, kind, payload)
    select v_site, key, value from jsonb_each(coalesce(v_state -> 'state', '{}'::jsonb));
    insert into cafm_site_revision (site_id, revision)
    values (v_site, coalesce((v_state ->> 'revision')::bigint, 0))
    on conflict (site_id) do update set revision = excluded.revision;
    v_sites := v_sites + 1;
  end loop;
  return jsonb_build_object('migratedSites', v_sites);
end $$;

-- The legacy cafm_state table is intentionally kept as a backup.
-- Once V44 is verified in production it can be dropped:
--   drop table if exists cafm_state;
