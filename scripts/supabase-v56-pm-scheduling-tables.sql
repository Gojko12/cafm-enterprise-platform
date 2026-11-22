-- V56 CAFM Database Stage C6: PM & Scheduling (6 record kinds as proper Postgres rows)
-- Turns the PM & scheduling JSON-blob rows into real, typed, one-row-per-record tables
-- (150 records across 6 kinds on 02-ESOC at migration time):
--   pm_schedules              one row per PM schedule (identity = ScheduleId)
--   pm_coordination           one row per coordination round (identity = id)
--   suppressed_pm_occurrences  one row per suppressed PM occurrence (identity = id)
--   location_freezes           one row per location freeze (identity = id)
--   mission_events            one row per mission event (identity = id)
--   pm_blueprints             one row per PM blueprint (identity = ChecklistCode; frequencyCode
--                             is NOT unique, it repeats across families, so it cannot key)
-- PREREQUISITE: scripts/supabase-v55-people-rbac-tables.sql (Section 105) is applied:
-- cafm_blocks is the 19-part API view over cafm_blocks_store + eighteen record kinds.
-- The application is deliberately untouched: the security_invoker VIEW cafm_blocks keeps
-- serving the exact same {site_id, kind, payload} rows to PostgREST, and cafm_save_state
-- keeps its exact contract (advisory lock, expected-revision check, SQLSTATE 40001
-- conflict, full-site replacement, revision bump). This file only widens the storage.
-- Local verification note: the live 02-ESOC data was probed before generation: all six
-- identity candidates unique and never empty (schedules.ScheduleId 75/75, blueprints
-- ChecklistCode 28/28), every numeric/int/bool field castable, the only nullable field
-- in all 150 records is pmCoordination.decisionOverride, and every schedule bl_id /
-- equipmentCode resolves against the buildings/equipment typed tables (the V53 rename
-- cascade holds). schedules keeps both key spellings as typed columns: levelName/roomCode
-- and LevelName/RoomCode (level_name/room_code and level_name_key/room_code_key).
-- Grants: explicit service_role SELECT inside the file (the V49 lesson; no Supabase
-- default privileges exist on this project).
-- Safe to run twice (idempotent). One transaction = atomic cutover.
-- EMERGENCY ROLLBACK: see the bottom of this file.

begin;

-- 0) Pre-migration snapshot of the six kinds being moved: permanent rollback
--    source (RLS-blocked).
do $snapshot$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_blocks_store')
     and not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v56_backup') then
    create table public.cafm_v56_backup (like public.cafm_blocks_store including indexes);
    insert into public.cafm_v56_backup
    select * from public.cafm_blocks_store where kind in ('schedules', 'pmCoordination', 'suppressedPmOccurrences', 'locationFreezes', 'missionEvents', 'blueprints');
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v56_backup') then
    alter table public.cafm_v56_backup enable row level security;
  end if;
end
$snapshot$;

-- 1) The record tables. Column order must match the field order returned by the
--    cafm_*_row() functions further below.

-- PM schedules: target, frequency, suppression, coordination and planner defaults
create table if not exists public.pm_schedules (
  site_id                   text    not null      ,
  seq                       bigint  not null      , -- array order within the collection
  schedule_id                 text    not null    , -- ScheduleId (identity)
  data                      jsonb   not null      , -- the complete record; guaranteed source for loads
  title                       text                , -- Title
  target_type                 text                , -- targetType
  target_key                  text                , -- targetKey
  equipment_code              text                , -- equipmentCode
  level_name                  text                , -- levelName
  room_code                   text                , -- roomCode
  bl_id                       text                , -- bl_id
  level_name_key              text                , -- LevelName
  room_code_key               text                , -- RoomCode
  anchor_date                 text                , -- anchorDate
  cycle_date                  text                , -- cycleDate
  shared_anchor_date          text                , -- sharedAnchorDate
  peak_slot_index             integer             , -- peakSlotIndex
  annual_slot_index           integer             , -- annualSlotIndex
  peak_year_index             integer             , -- peakYearIndex
  frequency_code              text                , -- frequencyCode
  frequency                   text                , -- Frequency
  frequency_interval          integer             , -- FrequencyInterval
  suppression_mode            text                , -- suppressionMode
  suppression_group_key       text                , -- suppressionGroupKey
  suppression_group_name      text                , -- suppressionGroupName
  checklist_code              text                , -- ChecklistCode
  equipment_codes             jsonb               , -- EquipmentCodes
  lead_time_days              integer             , -- LeadTimeDays
  margin_window_days          integer             , -- MarginWindowDays
  next_due_date               text                , -- NextDueDate
  affected_team_ids           jsonb               , -- affectedTeamIds
  requirement_ids             jsonb               , -- requirementIds
  coordination_lead_days      integer             , -- coordinationLeadDays
  impact_summary              text                , -- impactSummary
  is_active                   boolean             , -- IsActive
  created_by                  text                , -- CreatedBy
  created_at                  text                , -- CreatedAt
  updated_at                  text                , -- UpdatedAt
  auto_schedule_enabled       boolean             , -- autoScheduleEnabled
  default_technician_ids      jsonb               , -- defaultTechnicianIds
  default_recurrence_pattern  text                , -- defaultRecurrencePattern
  default_weekdays            jsonb               , -- defaultWeekdays
  default_start_time          text                , -- defaultStartTime
  default_duration_hours      numeric             , -- defaultDurationHours
  default_anchor_date         text                  -- defaultAnchorDate
);
create index if not exists pm_schedules_site_seq on public.pm_schedules (site_id, seq);
create index if not exists pms_site_active on public.pm_schedules (site_id, is_active);
create index if not exists pms_site_frequency_code on public.pm_schedules (site_id, frequency_code);
create index if not exists pms_site_checklist_code on public.pm_schedules (site_id, checklist_code);
create index if not exists pms_site_target_key on public.pm_schedules (site_id, target_key);
create index if not exists pms_site_bl_id on public.pm_schedules (site_id, bl_id);

-- PM coordination rounds: per-team and per-requirement statuses, discussion log
create table if not exists public.pm_coordination (
  site_id                   text    not null      ,
  seq                       bigint  not null      , -- array order within the collection
  coordination_id             text    not null    , -- id (identity)
  data                      jsonb   not null      , -- the complete record; guaranteed source for loads
  pms_id                      text                , -- pmsId
  wr_id                       text                , -- wrId
  target_date                 text                , -- targetDate
  team_statuses               jsonb               , -- teamStatuses
  requirement_statuses        jsonb               , -- requirementStatuses
  discussion_log              jsonb               , -- discussionLog
  decision_override           jsonb               , -- decisionOverride
  updated_at                  text                  -- updatedAt
);
create index if not exists pm_coordination_site_seq on public.pm_coordination (site_id, seq);
create index if not exists pmc_site_pms_id on public.pm_coordination (site_id, pms_id);
create index if not exists pmc_site_wr_id on public.pm_coordination (site_id, wr_id);

-- Suppressed PM occurrences: lower-frequency PMs covered by a higher-frequency PM
create table if not exists public.suppressed_pm_occurrences (
  site_id                   text    not null      ,
  seq                       bigint  not null      , -- array order within the collection
  occurrence_id               text    not null    , -- id (identity)
  data                      jsonb   not null      , -- the complete record; guaranteed source for loads
  suppressed_pms_id           text                , -- suppressedPmsId
  covered_by_pms_id           text                , -- coveredByPmsId
  covered_by_wr_id            text                , -- coveredByWrId
  equipment_code              text                , -- equipmentCode
  target_type                 text                , -- targetType
  target_key                  text                , -- targetKey
  suppression_group_name      text                , -- suppressionGroupName
  suppressed_frequency        text                , -- suppressedFrequency
  covered_by_frequency        text                , -- coveredByFrequency
  due_date                    text                , -- dueDate
  created_at                  text                  -- createdAt
);
create index if not exists suppressed_pm_occurrences_site_seq on public.suppressed_pm_occurrences (site_id, seq);
create index if not exists spo_site_suppressed_pms on public.suppressed_pm_occurrences (site_id, suppressed_pms_id);
create index if not exists spo_site_due_date on public.suppressed_pm_occurrences (site_id, due_date);

-- Location freezes: PM/FJ/LJ locks on buildings, floors and rooms
create table if not exists public.location_freezes (
  site_id                   text    not null      ,
  seq                       bigint  not null      , -- array order within the collection
  freeze_id                   text    not null    , -- id (identity)
  data                      jsonb   not null      , -- the complete record; guaranteed source for loads
  building_id                 text                , -- buildingId
  floor_id                    text                , -- floorId
  room_id                     text                , -- roomId
  floor_ids                   jsonb               , -- floorIds
  room_ids                    jsonb               , -- roomIds
  title                       text                , -- title
  description                 text                , -- description
  responsible_person          text                , -- responsiblePerson
  start_date_time             text                , -- startDateTime
  end_date_time               text                , -- endDateTime
  allow_pm                    boolean             , -- allowPM
  allow_fj                    boolean             , -- allowFJ
  allow_lj                    boolean               -- allowLJ
);
create index if not exists location_freezes_site_seq on public.location_freezes (site_id, seq);
create index if not exists frz_site_building on public.location_freezes (site_id, building_id);

-- Mission events: criticality, facility constraints, linked freezes
create table if not exists public.mission_events (
  site_id                   text    not null      ,
  seq                       bigint  not null      , -- array order within the collection
  event_id                    text    not null    , -- id (identity)
  data                      jsonb   not null      , -- the complete record; guaranteed source for loads
  mission_ref                 text                , -- missionRef
  mission_name                text                , -- missionName
  event_type                  text                , -- eventType
  criticality                 text                , -- criticality
  start_date_time             text                , -- startDateTime
  end_date_time               text                , -- endDateTime
  building_ids                jsonb               , -- buildingIds
  floor_ids                   jsonb               , -- floorIds
  room_ids                    jsonb               , -- roomIds
  facility_constraint         text                , -- facilityConstraint
  mission_lead                text                , -- missionLead
  remarks                     text                , -- remarks
  freeze_id                   text                  -- freezeId
);
create index if not exists mission_events_site_seq on public.mission_events (site_id, seq);
create index if not exists mev_site_criticality on public.mission_events (site_id, criticality);

-- PM blueprints: per-checklist maintenance templates with steps (ChecklistCode is the identity; frequencyCode is NOT unique)
create table if not exists public.pm_blueprints (
  site_id                   text    not null      ,
  seq                       bigint  not null      , -- array order within the collection
  checklist_code              text    not null    , -- ChecklistCode (identity)
  data                      jsonb   not null      , -- the complete record; guaranteed source for loads
  title                       text                , -- Title
  frequency_code              text                , -- frequencyCode
  blueprint_mode              text                , -- blueprintMode
  trade_id                    text                , -- TradeId
  trade_name                  text                , -- TradeName
  maintenance_reason          text                , -- MaintenanceReason
  expected_hours              numeric             , -- ExpectedHours
  steps                       jsonb               , -- Steps
  is_active                   boolean             , -- IsActive
  version                     integer             , -- Version
  family_id                   text                , -- familyId
  family_name                 text                  -- familyName
);
create index if not exists pm_blueprints_site_seq on public.pm_blueprints (site_id, seq);
create index if not exists bpl_site_frequency_code on public.pm_blueprints (site_id, frequency_code);
create index if not exists bpl_site_family_id on public.pm_blueprints (site_id, family_id);
create index if not exists bpl_site_trade_id on public.pm_blueprints (site_id, trade_id);

alter table public.pm_schedules enable row level security;
alter table public.pm_coordination enable row level security;
alter table public.suppressed_pm_occurrences enable row level security;
alter table public.location_freezes enable row level security;
alter table public.mission_events enable row level security;
alter table public.pm_blueprints enable row level security;
-- RLS stays on with no policies: only the service role key used by the server
-- can read and write, exactly like the other CAFM record tables.

-- 2) Single source of truth for extracting a record into typed columns.
--    Field order matches the table column order above.

create or replace function public.cafm_pms_row(p_site text, p_seq bigint, b jsonb)
returns public.pm_schedules
language sql
stable
as $pms$
  select p_site, p_seq, b->>'ScheduleId', b,
         b->>'Title',
         b->>'targetType',
         b->>'targetKey',
         b->>'equipmentCode',
         b->>'levelName',
         b->>'roomCode',
         b->>'bl_id',
         b->>'LevelName',
         b->>'RoomCode',
         b->>'anchorDate',
         b->>'cycleDate',
         b->>'sharedAnchorDate',
         nullif(b->>'peakSlotIndex', '')::integer,
         nullif(b->>'annualSlotIndex', '')::integer,
         nullif(b->>'peakYearIndex', '')::integer,
         b->>'frequencyCode',
         b->>'Frequency',
         nullif(b->>'FrequencyInterval', '')::integer,
         b->>'suppressionMode',
         b->>'suppressionGroupKey',
         b->>'suppressionGroupName',
         b->>'ChecklistCode',
         coalesce(b->'EquipmentCodes', '[]'::jsonb),
         nullif(b->>'LeadTimeDays', '')::integer,
         nullif(b->>'MarginWindowDays', '')::integer,
         b->>'NextDueDate',
         coalesce(b->'affectedTeamIds', '[]'::jsonb),
         coalesce(b->'requirementIds', '[]'::jsonb),
         nullif(b->>'coordinationLeadDays', '')::integer,
         b->>'impactSummary',
         nullif(b->>'IsActive', '')::boolean,
         b->>'CreatedBy',
         b->>'CreatedAt',
         b->>'UpdatedAt',
         nullif(b->>'autoScheduleEnabled', '')::boolean,
         coalesce(b->'defaultTechnicianIds', '[]'::jsonb),
         b->>'defaultRecurrencePattern',
         coalesce(b->'defaultWeekdays', '[]'::jsonb),
         b->>'defaultStartTime',
         nullif(b->>'defaultDurationHours', '')::numeric,
         b->>'defaultAnchorDate'
$pms$;

create or replace function public.cafm_pmc_row(p_site text, p_seq bigint, b jsonb)
returns public.pm_coordination
language sql
stable
as $pmc$
  select p_site, p_seq, b->>'id', b,
         b->>'pmsId',
         b->>'wrId',
         b->>'targetDate',
         coalesce(b->'teamStatuses', '{}'::jsonb),
         coalesce(b->'requirementStatuses', '{}'::jsonb),
         coalesce(b->'discussionLog', '[]'::jsonb),
         coalesce(b->'decisionOverride', '{}'::jsonb),
         b->>'updatedAt'
$pmc$;

create or replace function public.cafm_spo_row(p_site text, p_seq bigint, b jsonb)
returns public.suppressed_pm_occurrences
language sql
stable
as $spo$
  select p_site, p_seq, b->>'id', b,
         b->>'suppressedPmsId',
         b->>'coveredByPmsId',
         b->>'coveredByWrId',
         b->>'equipmentCode',
         b->>'targetType',
         b->>'targetKey',
         b->>'suppressionGroupName',
         b->>'suppressedFrequency',
         b->>'coveredByFrequency',
         b->>'dueDate',
         b->>'createdAt'
$spo$;

create or replace function public.cafm_frz_row(p_site text, p_seq bigint, b jsonb)
returns public.location_freezes
language sql
stable
as $frz$
  select p_site, p_seq, b->>'id', b,
         b->>'buildingId',
         b->>'floorId',
         b->>'roomId',
         coalesce(b->'floorIds', '[]'::jsonb),
         coalesce(b->'roomIds', '[]'::jsonb),
         b->>'title',
         b->>'description',
         b->>'responsiblePerson',
         b->>'startDateTime',
         b->>'endDateTime',
         nullif(b->>'allowPM', '')::boolean,
         nullif(b->>'allowFJ', '')::boolean,
         nullif(b->>'allowLJ', '')::boolean
$frz$;

create or replace function public.cafm_mev_row(p_site text, p_seq bigint, b jsonb)
returns public.mission_events
language sql
stable
as $mev$
  select p_site, p_seq, b->>'id', b,
         b->>'missionRef',
         b->>'missionName',
         b->>'eventType',
         b->>'criticality',
         b->>'startDateTime',
         b->>'endDateTime',
         coalesce(b->'buildingIds', '[]'::jsonb),
         coalesce(b->'floorIds', '[]'::jsonb),
         coalesce(b->'roomIds', '[]'::jsonb),
         b->>'facilityConstraint',
         b->>'missionLead',
         b->>'remarks',
         b->>'freezeId'
$mev$;

create or replace function public.cafm_bpl_row(p_site text, p_seq bigint, b jsonb)
returns public.pm_blueprints
language sql
stable
as $bpl$
  select p_site, p_seq, b->>'ChecklistCode', b,
         b->>'Title',
         b->>'frequencyCode',
         b->>'blueprintMode',
         b->>'TradeId',
         b->>'TradeName',
         b->>'MaintenanceReason',
         nullif(b->>'ExpectedHours', '')::numeric,
         coalesce(b->'Steps', '[]'::jsonb),
         nullif(b->>'IsActive', '')::boolean,
         nullif(b->>'Version', '')::integer,
         b->>'familyId',
         b->>'familyName'
$bpl$;

-- 3) Insert helpers used by saves and by the one-time data move below.

create or replace function public.cafm_pms_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_pms_s$
  with inserted as (
    insert into public.pm_schedules
    select (public.cafm_pms_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_pms_s$;

create or replace function public.cafm_pmc_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_pmc_s$
  with inserted as (
    insert into public.pm_coordination
    select (public.cafm_pmc_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_pmc_s$;

create or replace function public.cafm_spo_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_spo_s$
  with inserted as (
    insert into public.suppressed_pm_occurrences
    select (public.cafm_spo_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_spo_s$;

create or replace function public.cafm_frz_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_frz_s$
  with inserted as (
    insert into public.location_freezes
    select (public.cafm_frz_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_frz_s$;

create or replace function public.cafm_mev_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_mev_s$
  with inserted as (
    insert into public.mission_events
    select (public.cafm_mev_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_mev_s$;

create or replace function public.cafm_bpl_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_bpl_s$
  with inserted as (
    insert into public.pm_blueprints
    select (public.cafm_bpl_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_bpl_s$;

-- 4) One-time data move: existing blob rows become record rows, then the blob rows
--    are removed.

insert into public.pm_schedules
select (public.cafm_pms_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'schedules';

insert into public.pm_coordination
select (public.cafm_pmc_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'pmCoordination';

insert into public.suppressed_pm_occurrences
select (public.cafm_spo_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'suppressedPmOccurrences';

insert into public.location_freezes
select (public.cafm_frz_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'locationFreezes';

insert into public.mission_events
select (public.cafm_mev_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'missionEvents';

insert into public.pm_blueprints
select (public.cafm_bpl_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'blueprints';

delete from public.cafm_blocks_store where kind in ('schedules', 'pmCoordination', 'suppressedPmOccurrences', 'locationFreezes', 'missionEvents', 'blueprints');


-- 5) The API view: now a 25-part union. All twenty-four record kinds are driven by
--    cafm_site_revision so every known site always emits them ([] when empty).
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
  from public.cafm_site_revision r
  union all
  select r.site_id, 'equipment',
         coalesce((select jsonb_agg(e.data order by e.seq)
                   from public.equipment e
                   where e.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'rooms',
         coalesce((select jsonb_agg(rm.data order by rm.seq)
                   from public.rooms rm
                   where rm.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'buildings',
         coalesce((select jsonb_agg(b.data order by b.seq)
                   from public.buildings b
                   where b.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'floors',
         coalesce((select jsonb_agg(f.data order by f.seq)
                   from public.floors f
                   where f.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'desks',
         coalesce((select jsonb_agg(d.data order by d.seq)
                   from public.desks d
                   where d.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'users',
         coalesce((select jsonb_agg(u.data order by u.seq)
                   from public.users u
                   where u.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'userAccessProfiles',
         coalesce((select jsonb_agg(up.data order by up.seq)
                   from public.user_access_profiles up
                   where up.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'cifmPeople',
         coalesce((select jsonb_agg(cp.data order by cp.seq)
                   from public.cifm_people cp
                   where cp.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'craftspeople',
         coalesce((select jsonb_agg(cr.data order by cr.seq)
                   from public.craftspeople cr
                   where cr.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'craftpersonAbsences',
         coalesce((select jsonb_agg(ab.data order by ab.seq)
                   from public.craftperson_absences ab
                   where ab.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'roleDefinitions',
         coalesce((select jsonb_agg(rd.data order by rd.seq)
                   from public.role_definitions rd
                   where rd.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'siteRoleAssignments',
         coalesce((select jsonb_agg(sra.data order by sra.seq)
                   from public.site_role_assignments sra
                   where sra.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'siteRoleMappings',
         coalesce((select jsonb_agg(srm.data order by srm.seq)
                   from public.site_role_mappings srm
                   where srm.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'tradeRoleMappings',
         coalesce((select jsonb_agg(trm.data order by trm.seq)
                   from public.trade_role_mappings trm
                   where trm.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'stakeholderTeams',
         coalesce((select jsonb_agg(st.data order by st.seq)
                   from public.stakeholder_teams st
                   where st.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
  union all
  select r.site_id, 'onboardingRequests',
         coalesce((select jsonb_agg(onb.data order by onb.seq)
                   from public.onboarding_requests onb
                   where onb.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'schedules',
         coalesce((select jsonb_agg(ps.data order by ps.seq)
                   from public.pm_schedules ps
                   where ps.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'pmCoordination',
         coalesce((select jsonb_agg(pc.data order by pc.seq)
                   from public.pm_coordination pc
                   where pc.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'suppressedPmOccurrences',
         coalesce((select jsonb_agg(spo.data order by spo.seq)
                   from public.suppressed_pm_occurrences spo
                   where spo.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'locationFreezes',
         coalesce((select jsonb_agg(fz.data order by fz.seq)
                   from public.location_freezes fz
                   where fz.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'missionEvents',
         coalesce((select jsonb_agg(mv.data order by mv.seq)
                   from public.mission_events mv
                   where mv.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'blueprints',
         coalesce((select jsonb_agg(bp.data order by bp.seq)
                   from public.pm_blueprints bp
                   where bp.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r
;

-- 6) Grants (the V49 production lesson, baked in since): security_invoker views run
--    with the INVOKER's table grants and this project has no default privileges.
--    Skipped in vanilla local Postgres without Supabase roles.
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.cafm_blocks to service_role';
    execute 'grant select on public.pm_schedules, public.pm_coordination, public.suppressed_pm_occurrences, public.location_freezes, public.mission_events, public.pm_blueprints to service_role';
  end if;
end
$grant$;

-- 7) cafm_save_state: same signature and contract as V49-V55, now writing twenty-four
--    record kinds.
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
  delete from equipment where site_id = p_site_id;
  perform cafm_eq_store_rows(p_site_id, p_blocks->'equipment');
  delete from rooms where site_id = p_site_id;
  perform cafm_room_store_rows(p_site_id, p_blocks->'rooms');
  delete from buildings where site_id = p_site_id;
  perform cafm_building_store_rows(p_site_id, p_blocks->'buildings');
  delete from floors where site_id = p_site_id;
  perform cafm_floor_store_rows(p_site_id, p_blocks->'floors');
  delete from desks where site_id = p_site_id;
  perform cafm_desk_store_rows(p_site_id, p_blocks->'desks');
  delete from users where site_id = p_site_id;
  perform cafm_user_store_rows(p_site_id, p_blocks->'users');
  delete from user_access_profiles where site_id = p_site_id;
  perform cafm_uap_store_rows(p_site_id, p_blocks->'userAccessProfiles');
  delete from cifm_people where site_id = p_site_id;
  perform cafm_cifmp_store_rows(p_site_id, p_blocks->'cifmPeople');
  delete from craftspeople where site_id = p_site_id;
  perform cafm_craftsp_store_rows(p_site_id, p_blocks->'craftspeople');
  delete from craftperson_absences where site_id = p_site_id;
  perform cafm_absence_store_rows(p_site_id, p_blocks->'craftpersonAbsences');
  delete from role_definitions where site_id = p_site_id;
  perform cafm_roledef_store_rows(p_site_id, p_blocks->'roleDefinitions');
  delete from site_role_assignments where site_id = p_site_id;
  perform cafm_sra_store_rows(p_site_id, p_blocks->'siteRoleAssignments');
  delete from site_role_mappings where site_id = p_site_id;
  perform cafm_srm_store_rows(p_site_id, p_blocks->'siteRoleMappings');
  delete from trade_role_mappings where site_id = p_site_id;
  perform cafm_trm_store_rows(p_site_id, p_blocks->'tradeRoleMappings');
  delete from stakeholder_teams where site_id = p_site_id;
  perform cafm_team_store_rows(p_site_id, p_blocks->'stakeholderTeams');
  delete from onboarding_requests where site_id = p_site_id;
  perform cafm_onboarding_store_rows(p_site_id, p_blocks->'onboardingRequests');

  delete from pm_schedules where site_id = p_site_id;
  perform cafm_pms_store_rows(p_site_id, p_blocks->'schedules');
  delete from pm_coordination where site_id = p_site_id;
  perform cafm_pmc_store_rows(p_site_id, p_blocks->'pmCoordination');
  delete from suppressed_pm_occurrences where site_id = p_site_id;
  perform cafm_spo_store_rows(p_site_id, p_blocks->'suppressedPmOccurrences');
  delete from location_freezes where site_id = p_site_id;
  perform cafm_frz_store_rows(p_site_id, p_blocks->'locationFreezes');
  delete from mission_events where site_id = p_site_id;
  perform cafm_mev_store_rows(p_site_id, p_blocks->'missionEvents');
  delete from pm_blueprints where site_id = p_site_id;
  perform cafm_bpl_store_rows(p_site_id, p_blocks->'blueprints');

  delete from cafm_blocks_store where site_id = p_site_id;
  insert into cafm_blocks_store (site_id, kind, payload)
  select p_site_id, key, value from jsonb_each(p_blocks)
  where key not in ('blueprints', 'buildings', 'cifmPeople', 'craftpersonAbsences', 'craftspeople', 'deletedWorkRequests', 'desks', 'equipment', 'floors', 'locationFreezes', 'missionEvents', 'onboardingRequests', 'pmCoordination', 'roleDefinitions', 'rooms', 'schedules', 'siteRoleAssignments', 'siteRoleMappings', 'stakeholderTeams', 'suppressedPmOccurrences', 'tradeRoleMappings', 'userAccessProfiles', 'users', 'workRequests');
  insert into cafm_site_revision (site_id, revision)
  values (p_site_id, p_new_revision)
  on conflict (site_id) do update set revision = excluded.revision;
  return jsonb_build_object('revision', p_new_revision);
end
$save$;

-- 8) Legacy-blob migration path (fresh installs only; production is already on blocks):
--    repoint the V44 one-time migration at the store + all twenty-four record tables.
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
     or exists (select 1 from deleted_work_requests limit 1)
     or exists (select 1 from equipment limit 1)
     or exists (select 1 from rooms limit 1)
     or exists (select 1 from buildings limit 1)
     or exists (select 1 from floors limit 1)
     or exists (select 1 from desks limit 1)
     or exists (select 1 from users limit 1)
     or exists (select 1 from user_access_profiles limit 1)
     or exists (select 1 from cifm_people limit 1)
     or exists (select 1 from craftspeople limit 1)
     or exists (select 1 from craftperson_absences limit 1)
     or exists (select 1 from role_definitions limit 1)
     or exists (select 1 from site_role_assignments limit 1)
     or exists (select 1 from site_role_mappings limit 1)
     or exists (select 1 from trade_role_mappings limit 1)
     or exists (select 1 from stakeholder_teams limit 1)
     or exists (select 1 from onboarding_requests limit 1)

     or exists (select 1 from pm_schedules limit 1)

     or exists (select 1 from pm_coordination limit 1)

     or exists (select 1 from suppressed_pm_occurrences limit 1)

     or exists (select 1 from location_freezes limit 1)

     or exists (select 1 from mission_events limit 1)

     or exists (select 1 from pm_blueprints limit 1)

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
    perform cafm_eq_store_rows(v_site, v_state -> 'state' -> 'equipment');
    perform cafm_room_store_rows(v_site, v_state -> 'state' -> 'rooms');
    perform cafm_building_store_rows(v_site, v_state -> 'state' -> 'buildings');
    perform cafm_floor_store_rows(v_site, v_state -> 'state' -> 'floors');
    perform cafm_desk_store_rows(v_site, v_state -> 'state' -> 'desks');
    perform cafm_user_store_rows(v_site, v_state -> 'state' -> 'users');
    perform cafm_uap_store_rows(v_site, v_state -> 'state' -> 'userAccessProfiles');
    perform cafm_cifmp_store_rows(v_site, v_state -> 'state' -> 'cifmPeople');
    perform cafm_craftsp_store_rows(v_site, v_state -> 'state' -> 'craftspeople');
    perform cafm_absence_store_rows(v_site, v_state -> 'state' -> 'craftpersonAbsences');
    perform cafm_roledef_store_rows(v_site, v_state -> 'state' -> 'roleDefinitions');
    perform cafm_sra_store_rows(v_site, v_state -> 'state' -> 'siteRoleAssignments');
    perform cafm_srm_store_rows(v_site, v_state -> 'state' -> 'siteRoleMappings');
    perform cafm_trm_store_rows(v_site, v_state -> 'state' -> 'tradeRoleMappings');
    perform cafm_team_store_rows(v_site, v_state -> 'state' -> 'stakeholderTeams');
    perform cafm_onboarding_store_rows(v_site, v_state -> 'state' -> 'onboardingRequests');

    perform cafm_pms_store_rows(v_site, v_state -> 'state' -> 'schedules');

    perform cafm_pmc_store_rows(v_site, v_state -> 'state' -> 'pmCoordination');

    perform cafm_spo_store_rows(v_site, v_state -> 'state' -> 'suppressedPmOccurrences');

    perform cafm_frz_store_rows(v_site, v_state -> 'state' -> 'locationFreezes');

    perform cafm_mev_store_rows(v_site, v_state -> 'state' -> 'missionEvents');

    perform cafm_bpl_store_rows(v_site, v_state -> 'state' -> 'blueprints');

    insert into cafm_blocks_store (site_id, kind, payload)
    select v_site, key, value from jsonb_each(coalesce(v_state -> 'state', '{}'::jsonb))
    where key not in ('blueprints', 'buildings', 'cifmPeople', 'craftpersonAbsences', 'craftspeople', 'deletedWorkRequests', 'desks', 'equipment', 'floors', 'locationFreezes', 'missionEvents', 'onboardingRequests', 'pmCoordination', 'roleDefinitions', 'rooms', 'schedules', 'siteRoleAssignments', 'siteRoleMappings', 'stakeholderTeams', 'suppressedPmOccurrences', 'tradeRoleMappings', 'userAccessProfiles', 'users', 'workRequests');
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

select 'schedules' as table_name, count(*) as rows, pg_total_relation_size('public.pm_schedules') as bytes_on_disk
from public.pm_schedules
union all

select 'pmCoordination' as table_name, count(*) as rows, pg_total_relation_size('public.pm_coordination') as bytes_on_disk
from public.pm_coordination
union all

select 'suppressedPmOccurrences' as table_name, count(*) as rows, pg_total_relation_size('public.suppressed_pm_occurrences') as bytes_on_disk
from public.suppressed_pm_occurrences
union all

select 'locationFreezes' as table_name, count(*) as rows, pg_total_relation_size('public.location_freezes') as bytes_on_disk
from public.location_freezes
union all

select 'missionEvents' as table_name, count(*) as rows, pg_total_relation_size('public.mission_events') as bytes_on_disk
from public.mission_events
union all

select 'blueprints' as table_name, count(*) as rows, pg_total_relation_size('public.pm_blueprints') as bytes_on_disk
from public.pm_blueprints
union all

select 'cafm_blocks_store', count(*), pg_total_relation_size('public.cafm_blocks_store')
from public.cafm_blocks_store
union all
select 'cafm_v56_backup', count(*), pg_total_relation_size('public.cafm_v56_backup')
from public.cafm_v56_backup;

-- 9b. Round-trip fidelity: the API view must reproduce the pre-migration payloads exactly.
with
  old as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_v56_backup group by site_id
  ),
  new as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_blocks
    where kind in ('schedules', 'pmCoordination', 'suppressedPmOccurrences', 'locationFreezes', 'missionEvents', 'blueprints')
    group by site_id
  )
select o.site_id,
       o.state = n.state as state_identical,
       pg_column_size(o.state) as old_bytes,
       pg_column_size(n.state) as new_bytes
from old o join new n on n.site_id = o.site_id
order by o.site_id;

-- 9c. Kind census: one row per site+kind (21 store kinds + 24 record kinds = 45
--     distinct kinds for a fully migrated 02-ESOC):
select count(*) as kind_rows, count(distinct kind) as distinct_kinds
from public.cafm_blocks where site_id = '02-ESOC';

-- 9d. The classical-table feel: PM schedules with real columns.
select schedule_id, title, frequency_code, frequency_interval, target_type, target_key,
       bl_id, level_name_key, room_code_key, next_due_date, lead_time_days, is_active
from public.pm_schedules
where site_id = '02-ESOC'
order by seq
limit 25;

select checklist_code, title, frequency_code, blueprint_mode, trade_name,
       expected_hours, version, family_id, family_name, is_active
from public.pm_blueprints
where site_id = '02-ESOC'
order by seq
limit 30;

-- 9e. The relational story, no jsonb gymnastics:
-- 9e-1. Every active PM schedule with its building and equipment as real columns.
select s.schedule_id, s.title, s.frequency_code, s.next_due_date,
       b.name as building, e.equipment_name
from public.pm_schedules s
join public.buildings b on b.site_id = s.site_id and b.bl_id = s.bl_id
left join public.equipment e on e.site_id = s.site_id and e.equipment_code = s.equipment_code
where s.site_id = '02-ESOC' and s.is_active
order by s.seq
limit 15;

-- 9e-2. Blueprints joined to the schedules that use them.
select bp.checklist_code, bp.title as blueprint, bp.family_name,
       count(s.schedule_id) as schedules_using_it
from public.pm_blueprints bp
left join public.pm_schedules s
  on s.site_id = bp.site_id and s.checklist_code = bp.checklist_code
where bp.site_id = '02-ESOC'
group by bp.checklist_code, bp.title, bp.family_name, bp.seq
order by bp.seq;

-- 9e-3. The suppression story: every suppressed occurrence resolved to its covering schedule.
select spo.suppressed_pms_id, spo.suppressed_frequency, spo.due_date,
       spo.covered_by_pms_id, spo.covered_by_frequency, spo.covered_by_wr_id,
       cs.title as covering_schedule
from public.suppressed_pm_occurrences spo
left join public.pm_schedules cs
  on cs.site_id = spo.site_id and cs.schedule_id = spo.covered_by_pms_id
where spo.site_id = '02-ESOC'
order by spo.due_date
limit 15;

-- 9e-4. Mission events with their linked freeze, as real columns.
select mv.mission_ref, mv.mission_name, mv.event_type, mv.criticality,
       fz.title as freeze_title
from public.mission_events mv
left join public.location_freezes fz
  on fz.site_id = mv.site_id and fz.freeze_id = mv.freeze_id
where mv.site_id = '02-ESOC'
order by mv.start_date_time;

-- 9e-5. Active freezes and what they lock.
select freeze_id, title, responsible_person, start_date_time, end_date_time,
       allow_pm, allow_fj, allow_lj, building_id, floor_ids, room_ids
from public.location_freezes
where site_id = '02-ESOC'
order by seq;

-- EMERGENCY ROLLBACK (V56 -> V55 layout). Only for a real emergency: writes made after
-- this migration live in the record tables, so the store is re-merged over the backup.
-- Post-migration record contents are NOT auto-merged back into blob rows by this
-- snippet; ask Vibe to help if a rollback is ever needed.
--   begin;
--   -- recreate the V55 19-part view from scripts/supabase-v55-people-rbac-tables.sql
--   -- (its section 5: the store UNION plus the eighteen record kinds only);
--   drop function if exists public.cafm_save_state(text, bigint, bigint, jsonb);
--   drop function if exists public.cafm_migrate_v44();
--   -- restore V55's cafm_save_state/cafm_migrate_v44 bodies by re-running that
--   -- file's sections 7 and 8 (the V55 exclusion lists with only those eighteen kinds);
--   insert into public.cafm_blocks_store
--     select site_id, kind, payload from public.cafm_v56_backup
--   on conflict (site_id, kind) do update set payload = excluded.payload;
