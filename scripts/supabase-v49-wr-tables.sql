-- V49 CAFM Database Stage C1: Work Requests as Proper Postgres Rows
-- Turns the workRequests / deletedWorkRequests JSON-blob rows into real, typed,
-- one-row-per-record tables:
--   work_requests         one row per active work request (60 typed columns + data jsonb)
--   deleted_work_requests one row per deleted work request (same shape)
-- The application is deliberately untouched (route.ts, mobile, delta sync, conditional
-- GET all keep working): a security_invoker VIEW named cafm_blocks keeps serving the
-- exact same {site_id, kind, payload} rows PostgREST served before, and cafm_save_state
-- keeps its exact contract (expected-revision check, SQLSTATE 40001 conflict, full-site
-- replacement, revision bump).
-- Safe to run twice (idempotent). One transaction = atomic cutover.
-- EMERGENCY ROLLBACK: see the bottom of this file.

begin;

-- 0) Pre-migration snapshot: kept as a permanent rollback source (RLS-blocked).
do $snapshot$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_blocks')
     and not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v49_backup') then
    create table public.cafm_v49_backup (like public.cafm_blocks including indexes);
    insert into public.cafm_v49_backup select * from public.cafm_blocks;
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v49_backup') then
    alter table public.cafm_v49_backup enable row level security;
  end if;
end
$snapshot$;

-- 1) Rename the physical table; the name cafm_blocks is reused for the API view below.
do $rename$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_blocks') then
    alter table public.cafm_blocks rename to cafm_blocks_store;
  end if;
end
$rename$;

-- 2) The record tables. Column order must stay identical between the two tables and
--    must match the field order returned by cafm_wr_row() further below.
create table if not exists public.work_requests (
  site_id                   text    not null,
  seq                       bigint  not null,
  wr_id                     text    not null,
  data                      jsonb   not null, -- the complete record; guaranteed source for loads
  wr_type                   text,             -- WR_Type
  esa_work_type             text,             -- ESAWorkType
  status                    text,             -- WorkRequestStatus
  substatus                 text,             -- WorkRequestSubstatus
  percentage                numeric,          -- Percentage
  description               text,             -- Description
  bl_id                     text,             -- bl_id (building)
  level_name                text,             -- LevelName
  room_code                 text,             -- RoomCode
  problem_location          text,             -- ProblemLocation
  trade_id                  text,             -- TradeId
  trade_name                text,             -- TradeName
  created_by                text,             -- CreatedBy
  created_date              text,             -- CreatedDate
  due_date                  text,             -- DueDate
  margin_date               text,             -- MarginDate
  start_date                text,             -- StartDate
  start_date_tbd            boolean,          -- StartDateTBD
  closed_at                 text,             -- ClosedAt
  completed_at              text,             -- CompletedAt
  opened_by_name            text,             -- OpenedByName
  requestor_name            text,             -- RequestorName
  requestor_department      text,             -- RequestorDepartment
  requestor_email           text,             -- RequestorEmail
  intake_channel            text,             -- IntakeChannel
  job_id                    text,             -- JobID
  urgency                   text,             -- Urgency
  urgency_code               text,             -- UrgencyCode
  cost_type                 text,             -- CostType
  process_track             text,             -- ProcessTrack
  estimated_cost_eur        numeric,          -- EstimatedCostEur
  actual_cost_eur           numeric,          -- ActualCostEur
  expected_hours            numeric,          -- ExpectedHours
  downtime_minutes          numeric,          -- DowntimeMinutes
  total_time_minutes        numeric,          -- TotalTimeMinutes
  is_frozen                 boolean,          -- IsFrozen
  requires_drawing_update   boolean,          -- RequiresDrawingUpdate
  requires_inventory_update boolean,          -- RequiresInventoryUpdate
  requires_sat              boolean,          -- RequiresSAT
  freeze_reason             text,             -- FreezeReason
  freeze_started_at         text,             -- FreezeStartedAt
  qa_audit_status           text,             -- QA_AuditStatus
  qa_selection_mode         text,             -- QA_SelectionMode
  qa_inspected_by           text,             -- QA_InspectedBy
  qa_inspected_date         text,             -- QA_InspectedDate
  qa_completion_date        text,             -- QA_CompletionDate
  pms_id                    text,             -- pmsId
  pm_cycle_key              text,             -- PM_CycleKey
  pm_frequency              text,             -- pmFrequency
  schedule_id               text,             -- ScheduleId
  suppression_group_name    text,             -- suppressionGroupName
  target_type               text,             -- targetType
  target_key                text,             -- targetKey
  parent_pm_wr_id           text,             -- ParentPM_WR_ID
  reopen_count              integer,          -- ReopenCount
  updated_at                text,             -- UpdatedAt
  primary key (site_id, wr_id)
);

create index if not exists work_requests_site_seq     on public.work_requests (site_id, seq);
create index if not exists work_requests_site_status  on public.work_requests (site_id, status);
create index if not exists work_requests_site_type    on public.work_requests (site_id, wr_type);
create index if not exists work_requests_site_pct     on public.work_requests (site_id, percentage);
create index if not exists work_requests_site_updated on public.work_requests (site_id, updated_at);

create table if not exists public.deleted_work_requests (like public.work_requests including indexes);

alter table public.work_requests         enable row level security;
alter table public.deleted_work_requests enable row level security;
-- RLS stays on with no policies: only the service role key used by the server
-- can read and write, exactly like cafm_blocks_store and cafm_site_revision.

-- 3) Single source of truth for extracting a record into typed columns.
--    Field order matches the work_requests column order above.
create or replace function public.cafm_wr_row(p_site text, p_seq bigint, w jsonb)
returns public.work_requests
language sql
stable
as $row$
  select p_site, p_seq, w->>'WR_ID', w,
         w->>'WR_Type', w->>'ESAWorkType', w->>'WorkRequestStatus', w->>'WorkRequestSubstatus',
         nullif(w->>'Percentage', '')::numeric,
         w->>'Description',
         w->>'bl_id', w->>'LevelName', w->>'RoomCode', w->>'ProblemLocation',
         w->>'TradeId', w->>'TradeName',
         w->>'CreatedBy', w->>'CreatedDate', w->>'DueDate', w->>'MarginDate', w->>'StartDate',
         nullif(w->>'StartDateTBD', '')::boolean,
         w->>'ClosedAt', w->>'CompletedAt',
         w->>'OpenedByName', w->>'RequestorName', w->>'RequestorDepartment', w->>'RequestorEmail',
         w->>'IntakeChannel', w->>'JobID', w->>'Urgency', w->>'UrgencyCode',
         w->>'CostType', w->>'ProcessTrack',
         nullif(w->>'EstimatedCostEur', '')::numeric,
         nullif(w->>'ActualCostEur', '')::numeric,
         nullif(w->>'ExpectedHours', '')::numeric,
         nullif(w->>'DowntimeMinutes', '')::numeric,
         nullif(w->>'TotalTimeMinutes', '')::numeric,
         nullif(w->>'IsFrozen', '')::boolean,
         nullif(w->>'RequiresDrawingUpdate', '')::boolean,
         nullif(w->>'RequiresInventoryUpdate', '')::boolean,
         nullif(w->>'RequiresSAT', '')::boolean,
         w->>'FreezeReason', w->>'FreezeStartedAt',
         w->>'QA_AuditStatus', w->>'QA_SelectionMode',
         w->>'QA_InspectedBy', w->>'QA_InspectedDate', w->>'QA_CompletionDate',
         w->>'pmsId', w->>'PM_CycleKey', w->>'pmFrequency', w->>'ScheduleId',
         w->>'suppressionGroupName', w->>'targetType', w->>'targetKey', w->>'ParentPM_WR_ID',
         nullif(w->>'ReopenCount', '')::integer,
         w->>'UpdatedAt'
$row$;

-- 4) Insert helpers used by saves and by the one-time data move below.
create or replace function public.cafm_wr_store_rows(p_site_id text, p_wrs jsonb) returns bigint
language sql volatile as $store$
  with inserted as (
    insert into public.work_requests
    select (public.cafm_wr_row(p_site_id, t.ord, t.w)).*
    from jsonb_array_elements(coalesce(p_wrs, '[]'::jsonb)) with ordinality as t(w, ord)
    returning 1
  )
  select count(*) from inserted;
$store$;

create or replace function public.cafm_dwr_store_rows(p_site_id text, p_wrs jsonb) returns bigint
language sql volatile as $store_d$
  with inserted as (
    insert into public.deleted_work_requests
    select (public.cafm_wr_row(p_site_id, t.ord, t.w)).*
    from jsonb_array_elements(coalesce(p_wrs, '[]'::jsonb)) with ordinality as t(w, ord)
    returning 1
  )
  select count(*) from inserted;
$store_d$;

-- 5) One-time data move: existing blob rows become record rows, then the blob rows are removed.
insert into public.work_requests
select (public.cafm_wr_row(b.site_id, t.ord, t.w)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(w, ord)
where b.kind = 'workRequests';

insert into public.deleted_work_requests
select (public.cafm_wr_row(b.site_id, t.ord, t.w)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(w, ord)
where b.kind = 'deletedWorkRequests';

delete from public.cafm_blocks_store where kind in ('workRequests', 'deletedWorkRequests');

-- 6) The API view: same three columns PostgREST has always served, now assembled from
--    the store table and the record tables. The two WR kinds are driven by
--    cafm_site_revision so every known site always emits both keys (empty array when
--    the site has no work requests).
create or replace view public.cafm_blocks with (security_invoker = true) as
  select site_id, kind, payload
  from public.cafm_blocks_store
  union all
  select r.site_id, 'workRequests',
         coalesce((select jsonb_agg(w.data order by w.seq)
                   from public.work_requests w
                   where w.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'deletedWorkRequests',
         coalesce((select jsonb_agg(w.data order by w.seq)
                   from public.deleted_work_requests w
                   where w.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r;

do $grant$
  declare r text;
begin
  -- Supabase roles; skipped automatically in a vanilla Postgres used for testing.
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant select on public.cafm_blocks to %I', r);
    end if;
  end loop;
end
$grant$;

-- 7) cafm_save_state: same signature and contract as V44, but the two WR kinds are
--    written as record rows instead of whole-collection blobs.
create or replace function public.cafm_save_state(
  p_site_id           text,
  p_expected_revision bigint,
  p_new_revision      bigint,
  p_blocks            jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $save$
begin
  perform pg_advisory_xact_lock(hashtext('cafm-save:' || p_site_id));
  if coalesce((select revision from cafm_site_revision where site_id = p_site_id), 0)
     <> coalesce(p_expected_revision, 0) then
    raise exception 'State has changed; reload and resolve the conflict.'
      using errcode = '40001';
  end if;
  delete from work_requests where site_id = p_site_id;
  perform cafm_wr_store_rows(p_site_id, p_blocks->'workRequests');
  delete from deleted_work_requests where site_id = p_site_id;
  perform cafm_dwr_store_rows(p_site_id, p_blocks->'deletedWorkRequests');
  delete from cafm_blocks_store where site_id = p_site_id;
  insert into cafm_blocks_store (site_id, kind, payload)
  select p_site_id, key, value from jsonb_each(p_blocks)
  where key not in ('workRequests', 'deletedWorkRequests');
  insert into cafm_site_revision (site_id, revision)
  values (p_site_id, p_new_revision)
  on conflict (site_id) do update set revision = excluded.revision;
  return jsonb_build_object('revision', p_new_revision);
end
$save$;

-- 8) Legacy-blob migration path (fresh installs only; production is already on blocks):
--    repoint the V44 one-time migration at the store + record tables.
create or replace function public.cafm_migrate_v44() returns jsonb
language plpgsql
security definer
set search_path = public
as $mig$
declare
  v_legacy jsonb;
  v_site   text;
  v_state  jsonb;
  v_sites  int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('cafm-migrate'));
  if exists (select 1 from cafm_blocks_store limit 1)
     or exists (select 1 from work_requests limit 1)
     or exists (select 1 from cafm_site_revision limit 1) then
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
    delete from cafm_blocks_store where site_id = v_site;
    perform cafm_wr_store_rows(v_site, v_state -> 'state' -> 'workRequests');
    perform cafm_dwr_store_rows(v_site, v_state -> 'state' -> 'deletedWorkRequests');
    insert into cafm_blocks_store (site_id, kind, payload)
    select v_site, key, value from jsonb_each(coalesce(v_state -> 'state', '{}'::jsonb))
    where key not in ('workRequests', 'deletedWorkRequests');
    insert into cafm_site_revision (site_id, revision)
    values (v_site, coalesce((v_state ->> 'revision')::bigint, 0))
    on conflict (site_id) do update set revision = excluded.revision;
    v_sites := v_sites + 1;
  end loop;
  return jsonb_build_object('migratedSites', v_sites);
end
$mig$;

commit;

-- 9) Verification (eyeball the results in the SQL editor):
-- 9a. Record counts and storage sizes:
select 'work_requests' as table_name, count(*) as rows, pg_total_relation_size('public.work_requests') as bytes_on_disk
from public.work_requests
union all
select 'deleted_work_requests', count(*), pg_total_relation_size('public.deleted_work_requests')
from public.deleted_work_requests
union all
select 'cafm_blocks_store', count(*), pg_total_relation_size('public.cafm_blocks_store')
from public.cafm_blocks_store
union all
select 'cafm_v49_backup', count(*), pg_total_relation_size('public.cafm_v49_backup')
from public.cafm_v49_backup;

-- 9b. Round-trip fidelity: the API view must reproduce the pre-migration state exactly.
with
  old as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_v49_backup group by site_id
  ),
  new as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_blocks group by site_id
  )
select o.site_id,
       o.state = n.state as state_identical,
       pg_column_size(o.state) as old_bytes,
       pg_column_size(n.state) as new_bytes
from old o join new n on n.site_id = o.site_id
order by o.site_id;

-- 9c. The classical-table feel, no jsonb gymnastics needed any more:
select wr_id, wr_type, status, substatus, percentage, trade_name, bl_id, room_code,
       intake_channel, created_date, closed_at, qa_audit_status
from public.work_requests
where site_id = '02-ESOC'
order by seq
limit 25;

-- EMERGENCY ROLLBACK (V49 -> V44 layout). Only for a real emergency: writes made after
-- this migration live in cafm_blocks_store / work_requests, so the store is re-merged
-- over the backup. Post-migration work-request contents are NOT auto-merged back into
-- blob rows by this snippet; ask Vibe to help if a rollback is ever needed.
--   begin;
--   drop view if exists public.cafm_blocks;
--   drop function if exists public.cafm_save_state(text, bigint, bigint, jsonb);
--   drop function if exists public.cafm_migrate_v44();
--   create table public.cafm_blocks (
--     site_id text not null, kind text not null, payload jsonb not null,
--     primary key (site_id, kind)
--   );
--   insert into public.cafm_blocks select * from public.cafm_v49_backup;
--   insert into public.cafm_blocks
--     select site_id, kind, payload from public.cafm_blocks_store
--   on conflict (site_id, kind) do update set payload = excluded.payload;
--   alter table public.cafm_blocks enable row level security;
--   drop table if exists public.cafm_blocks_store;
--   drop table if exists public.work_requests;
--   drop table if exists public.deleted_work_requests;
--   drop function if exists public.cafm_wr_row(text, bigint, jsonb);
--   drop function if exists public.cafm_wr_store_rows(text, jsonb);
--   drop function if exists public.cafm_dwr_store_rows(text, jsonb);
--   -- then rerun scripts/supabase-v44-blocks.sql to restore its function bodies.
--   commit;
