-- ============================================================================
-- V60 (MASTER_SPEC Section 110): Data Integrity Health Check + snapshot repair.
--
-- Problem: after V49-V58 the site data lives in 33 typed Postgres record tables,
-- but nothing ever VERIFIED cross-collection references at the database layer.
-- A live probe (23-11-2026, revision 65) proved the gap is real but small and
-- fully explainable: (a) 6 PM work requests carry a stale targetKey snapshot
-- (BL:/FL:/RM: composite) because the V53 rename cascade deliberately rewrites
-- only bl_id/LevelName/RoomCode on work requests, not the derived PM metadata
-- string; (b) the 2025-era audit family (campaigns, findings, inspections) plus
-- one CIFM person and three onboarding requests still reference building codes
-- from BEFORE renames existed / covered those kinds (S01-BL-1 legacy code).
--
-- Why NO foreign keys: cafm_save_state replaces whole collections inside one
-- transaction, and legitimate transient states exist (BIM resync windows where
-- rooms arrive after equipment; bimElementLinks may point at equipment that is
-- not created yet, validated by key shape only). Hard FKs would turn each of
-- those into a save rejection and re-create the V53/V54 wedge era. This check
-- is therefore REPORT-ONLY plus two deterministic one-time repairs.
--
-- Severity model: error = hard identity reference to something absent at the
-- site; warn = stale but historically explainable reference (rename-era lag);
-- info = accepted/neutral observations. Healthy check = 0 offenders.
--
-- Repairs shipped (single transaction, idempotent, reversible):
--   R1 (all sites, deterministic): PM work-request targetKey snapshots rebuilt
--       from each row's own bl_id/LevelName/RoomCode. Expected: 6 rows on
--       02-ESOC (WR 2026000055-2026000060).
--   R2 (02-ESOC only, proven map): legacy building code S01-BL-1 -> S01-BL-111
--       (the only building with that prefix; rename history S01-BL-1 ->
--       S01-BL-11 -> S01-BL-111, the last hop recorded in locationRenameLog)
--       on audit_findings (38), audit_inspections (19), audit_campaigns (3),
--       cifm_people (1), onboarding_requests (3); plus the one stale room code
--       S01-B1-L0-R1 -> S01-B1-L0-R1 T1 on audit_findings (2).
-- Pre-repair rows are snapshotted to public.cafm_v60_repair_backup (RLS on,
-- no policies) so every repair is reversible.
--
-- Client note: this paste does NOT bump the site revision, so browsers keep
-- their acknowledged state until the next save; the web app's own V60 changes
-- (cascade fix + server-side migrateWorkRequestTargetKeys) then keep the data
-- consistent even if a stale browser pushes an old copy afterwards.
--
-- How to run: paste the whole file into the Supabase SQL editor once, eyeball
-- the raised notices and section 9 below the commit.
--
-- Rollback: every repaired row is restorable from cafm_v60_repair_backup
-- (src label + old_value jsonb per row). The report function is standalone:
-- drop function if exists public.cafm_integrity_report(text);
-- drop table if exists public.cafm_v60_repair_backup; -- only if desired.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Pre-repair notices (proof of what the transaction is about to change).
-- ---------------------------------------------------------------------------
do $notice$
declare
  n_wr integer; n_dwr integer;
  n_fb integer; n_fr integer; n_ib integer; n_cb integer; n_pb integer; n_ob integer;
begin
  select count(*) into n_wr from public.work_requests where wr_type = 'PM'
    and target_key is not null and target_type in ('building','floor','room')
    and bl_id is not null
    and (target_type = 'building'
      or (target_type = 'floor' and coalesce(level_name,'') <> '')
      or (target_type = 'room' and coalesce(level_name,'') <> '' and coalesce(room_code,'') <> ''))
    and target_key is distinct from (case target_type
      when 'building' then 'BL:' || bl_id
      when 'floor' then 'FL:' || bl_id || '|' || level_name
      else 'RM:' || bl_id || '|' || level_name || '|' || room_code end);
  select count(*) into n_dwr from public.deleted_work_requests where wr_type = 'PM'
    and target_key is not null and target_type in ('building','floor','room')
    and bl_id is not null
    and (target_type = 'building'
      or (target_type = 'floor' and coalesce(level_name,'') <> '')
      or (target_type = 'room' and coalesce(level_name,'') <> '' and coalesce(room_code,'') <> ''))
    and target_key is distinct from (case target_type
      when 'building' then 'BL:' || bl_id
      when 'floor' then 'FL:' || bl_id || '|' || level_name
      else 'RM:' || bl_id || '|' || level_name || '|' || room_code end);
  select count(*) into n_fb from public.audit_findings where site_id = '02-ESOC' and building_id = 'S01-BL-1';
  select count(*) into n_fr from public.audit_findings where site_id = '02-ESOC' and building_id = 'S01-BL-111' and room_id = 'S01-B1-L0-R1';
  select count(*) into n_ib from public.audit_inspections where site_id = '02-ESOC' and building_id = 'S01-BL-1';
  select count(*) into n_cb from public.audit_campaigns where site_id = '02-ESOC' and building_ids is not null and building_ids @> array['S01-BL-1'];
  select count(*) into n_pb from public.cifm_people where site_id = '02-ESOC' and stationed_building_id = 'S01-BL-1';
  select count(*) into n_ob from public.onboarding_requests where site_id = '02-ESOC' and stationed_building_id = 'S01-BL-1';
  raise notice 'V60 pre-repair: PM target snapshot drift wr=% dwr=% (expected 6 and 0)', n_wr, n_dwr;
  raise notice 'V60 pre-repair legacy rows on 02-ESOC: findings bld=% room=% inspections=% campaigns=% cifm=% onboarding=% (expected 38 2 19 3 1 3)', n_fb, n_fr, n_ib, n_cb, n_pb, n_ob;
end
$notice$;

-- ---------------------------------------------------------------------------
-- 1. Backup every row any repair will touch (idempotent; re-paste adds none).
-- ---------------------------------------------------------------------------
create table if not exists public.cafm_v60_repair_backup (
  src         text        not null,
  site_id     text        not null,
  row_key     text        not null,
  old_value   jsonb       not null,
  captured_at timestamptz not null default now(),
  primary key (src, site_id, row_key)
);
alter table public.cafm_v60_repair_backup enable row level security;

insert into public.cafm_v60_repair_backup (src, site_id, row_key, old_value)
select 'work_requests_target', site_id, wr_id,
       jsonb_build_object('target_key', target_key, 'data_targetKey', data->'targetKey')
from public.work_requests
where wr_type = 'PM'
  and target_key is not null and target_type in ('building','floor','room')
  and bl_id is not null
  and (target_type = 'building'
    or (target_type = 'floor' and coalesce(level_name,'') <> '')
    or (target_type = 'room' and coalesce(level_name,'') <> '' and coalesce(room_code,'') <> ''))
  and target_key is distinct from (case target_type
    when 'building' then 'BL:' || bl_id
    when 'floor' then 'FL:' || bl_id || '|' || level_name
    else 'RM:' || bl_id || '|' || level_name || '|' || room_code end)
on conflict do nothing;

insert into public.cafm_v60_repair_backup (src, site_id, row_key, old_value)
select 'deleted_work_requests_target', site_id, wr_id,
       jsonb_build_object('target_key', target_key, 'data_targetKey', data->'targetKey')
from public.deleted_work_requests
where wr_type = 'PM'
  and target_key is not null and target_type in ('building','floor','room')
  and bl_id is not null
  and (target_type = 'building'
    or (target_type = 'floor' and coalesce(level_name,'') <> '')
    or (target_type = 'room' and coalesce(level_name,'') <> '' and coalesce(room_code,'') <> ''))
  and target_key is distinct from (case target_type
    when 'building' then 'BL:' || bl_id
    when 'floor' then 'FL:' || bl_id || '|' || level_name
    else 'RM:' || bl_id || '|' || level_name || '|' || room_code end)
on conflict do nothing;

insert into public.cafm_v60_repair_backup (src, site_id, row_key, old_value)
select 'audit_findings_building', site_id, finding_id,
       jsonb_build_object('building_id', building_id, 'data_buildingId', data->'buildingId')
from public.audit_findings
where site_id = '02-ESOC' and building_id = 'S01-BL-1'
on conflict do nothing;

insert into public.cafm_v60_repair_backup (src, site_id, row_key, old_value)
select 'audit_findings_room', site_id, finding_id,
       jsonb_build_object('room_id', room_id, 'data_roomId', data->'roomId')
from public.audit_findings
where site_id = '02-ESOC' and building_id = 'S01-BL-111' and room_id = 'S01-B1-L0-R1'
on conflict do nothing;

insert into public.cafm_v60_repair_backup (src, site_id, row_key, old_value)
select 'audit_inspections_building', site_id, inspection_id,
       jsonb_build_object('building_id', building_id, 'data_buildingId', data->'buildingId')
from public.audit_inspections
where site_id = '02-ESOC' and building_id = 'S01-BL-1'
on conflict do nothing;

insert into public.cafm_v60_repair_backup (src, site_id, row_key, old_value)
select 'audit_campaigns_building', site_id, campaign_id,
       jsonb_build_object('building_ids', to_jsonb(building_ids), 'data_buildingIds', data->'buildingIds')
from public.audit_campaigns
where site_id = '02-ESOC' and building_ids is not null and building_ids @> array['S01-BL-1']
on conflict do nothing;

insert into public.cafm_v60_repair_backup (src, site_id, row_key, old_value)
select 'cifm_people_building', site_id, person_id,
       jsonb_build_object('stationed_building_id', stationed_building_id, 'data_stationedBuildingId', data->'stationedBuildingId')
from public.cifm_people
where site_id = '02-ESOC' and stationed_building_id = 'S01-BL-1'
on conflict do nothing;

insert into public.cafm_v60_repair_backup (src, site_id, row_key, old_value)
select 'onboarding_requests_building', site_id, request_id,
       jsonb_build_object('stationed_building_id', stationed_building_id, 'data_stationedBuildingId', data->'stationedBuildingId')
from public.onboarding_requests
where site_id = '02-ESOC' and stationed_building_id = 'S01-BL-1'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2 R1. Repair: rebuild PM work-request targetKey snapshots from each row's
--       own location columns (all sites; deterministic; 6 rows expected).
-- ---------------------------------------------------------------------------
update public.work_requests
set target_key = case target_type
      when 'building' then 'BL:' || bl_id
      when 'floor' then 'FL:' || bl_id || '|' || level_name
      else 'RM:' || bl_id || '|' || level_name || '|' || room_code end,
    data = jsonb_set(data, '{targetKey}', to_jsonb(case target_type
      when 'building' then 'BL:' || bl_id
      when 'floor' then 'FL:' || bl_id || '|' || level_name
      else 'RM:' || bl_id || '|' || level_name || '|' || room_code end))
where wr_type = 'PM'
  and target_key is not null and target_type in ('building','floor','room')
  and bl_id is not null
  and (target_type = 'building'
    or (target_type = 'floor' and coalesce(level_name,'') <> '')
    or (target_type = 'room' and coalesce(level_name,'') <> '' and coalesce(room_code,'') <> ''))
  and target_key is distinct from (case target_type
    when 'building' then 'BL:' || bl_id
    when 'floor' then 'FL:' || bl_id || '|' || level_name
    else 'RM:' || bl_id || '|' || level_name || '|' || room_code end);

update public.deleted_work_requests
set target_key = case target_type
      when 'building' then 'BL:' || bl_id
      when 'floor' then 'FL:' || bl_id || '|' || level_name
      else 'RM:' || bl_id || '|' || level_name || '|' || room_code end,
    data = jsonb_set(data, '{targetKey}', to_jsonb(case target_type
      when 'building' then 'BL:' || bl_id
      when 'floor' then 'FL:' || bl_id || '|' || level_name
      else 'RM:' || bl_id || '|' || level_name || '|' || room_code end))
where wr_type = 'PM'
  and target_key is not null and target_type in ('building','floor','room')
  and bl_id is not null
  and (target_type = 'building'
    or (target_type = 'floor' and coalesce(level_name,'') <> '')
    or (target_type = 'room' and coalesce(level_name,'') <> '' and coalesce(room_code,'') <> ''))
  and target_key is distinct from (case target_type
    when 'building' then 'BL:' || bl_id
    when 'floor' then 'FL:' || bl_id || '|' || level_name
    else 'RM:' || bl_id || '|' || level_name || '|' || room_code end);

-- ---------------------------------------------------------------------------
-- 2 R2. Repair: legacy 02-ESOC location codes from the pre-rename era.
--       Proven map: S01-BL-1 -> S01-BL-111 (unique successor; history recorded
--       in locationRenameLog), S01-B1-L0-R1 -> S01-B1-L0-R1 T1 (unique match).
-- ---------------------------------------------------------------------------
update public.audit_findings
set building_id = 'S01-BL-111', data = jsonb_set(data, '{buildingId}', '"S01-BL-111"')
where site_id = '02-ESOC' and building_id = 'S01-BL-1';

update public.audit_findings
set room_id = 'S01-B1-L0-R1 T1', data = jsonb_set(data, '{roomId}', '"S01-B1-L0-R1 T1"')
where site_id = '02-ESOC' and building_id = 'S01-BL-111' and room_id = 'S01-B1-L0-R1';

update public.audit_inspections
set building_id = 'S01-BL-111', data = jsonb_set(data, '{buildingId}', '"S01-BL-111"')
where site_id = '02-ESOC' and building_id = 'S01-BL-1';

update public.audit_campaigns
set building_ids = array_replace(building_ids, 'S01-BL-1', 'S01-BL-111'),
    data = jsonb_set(data, '{buildingIds}', (
      select jsonb_agg(case when elm = to_jsonb('S01-BL-1') then to_jsonb('S01-BL-111') else elm end)
      from jsonb_array_elements(data->'buildingIds') as elm))
where site_id = '02-ESOC'
  and building_ids is not null and building_ids @> array['S01-BL-1']
  and jsonb_typeof(data->'buildingIds') = 'array';

update public.cifm_people
set stationed_building_id = 'S01-BL-111', data = jsonb_set(data, '{stationedBuildingId}', '"S01-BL-111"')
where site_id = '02-ESOC' and stationed_building_id = 'S01-BL-1';

update public.onboarding_requests
set stationed_building_id = 'S01-BL-111', data = jsonb_set(data, '{stationedBuildingId}', '"S01-BL-111"')
where site_id = '02-ESOC' and stationed_building_id = 'S01-BL-1';

-- ---------------------------------------------------------------------------
-- 3. The report function. One row per check, always emitted (0 = healthy).
--    Offenders are capped at 25 identity strings per check.
--    NOTE the drift check must use the SAME expressions as the R1 repair
--    above, so a green report genuinely proves the repair holds.
-- ---------------------------------------------------------------------------
create or replace function public.cafm_integrity_report(p_site text)
returns table(check_code text, severity text, label text, offender_count integer, offenders jsonb)
language sql
stable
as $report$
with
bad_floors_b as (
  select f.bl_id || '|' || f.level_name as off
  from public.floors f
  left join public.buildings b on b.site_id = f.site_id and b.bl_id = f.bl_id
  where f.site_id = p_site and b.bl_id is null
),
bad_rooms_b as (
  select r.bl_id || '|' || r.level_name || '|' || r.room_code as off
  from public.rooms r
  left join public.buildings b on b.site_id = r.site_id and b.bl_id = r.bl_id
  where r.site_id = p_site and b.bl_id is null
),
bad_rooms_f as (
  select r.bl_id || '|' || r.level_name || '|' || r.room_code as off
  from public.rooms r
  left join public.floors x on x.site_id = r.site_id and x.bl_id = r.bl_id and x.level_name = r.level_name
  where r.site_id = p_site and x.bl_id is null
),
bad_equipment_b as (
  select e.equipment_code as off
  from public.equipment e
  left join public.buildings b on b.site_id = e.site_id and b.bl_id = e.bl_id
  where e.site_id = p_site and b.bl_id is null
),
bad_equipment_room as (
  select e.equipment_code as off
  from public.equipment e
  left join public.rooms r on r.site_id = e.site_id and r.bl_id = e.bl_id
    and r.level_name = e.level_name and r.room_code = e.room_code
  where e.site_id = p_site and r.room_code is null
),
bad_desks_b as (
  select d.desk_id as off
  from public.desks d
  left join public.buildings b on b.site_id = d.site_id and b.bl_id = d.bl_id
  where d.site_id = p_site and b.bl_id is null
),
bad_desks_room as (
  select d.desk_id as off
  from public.desks d
  left join public.rooms r on r.site_id = d.site_id and r.bl_id = d.bl_id
    and r.level_name = d.level_name and r.room_code = d.room_code
  where d.site_id = p_site and r.room_code is null
),
bad_wr_b as (
  select w.wr_id as off
  from public.work_requests w
  left join public.buildings b on b.site_id = w.site_id and b.bl_id = w.bl_id
  where w.site_id = p_site and w.bl_id is not null and b.bl_id is null
),
bad_dwr_b as (
  select w.wr_id as off
  from public.deleted_work_requests w
  left join public.buildings b on b.site_id = w.site_id and b.bl_id = w.bl_id
  where w.site_id = p_site and w.bl_id is not null and b.bl_id is null
),
bad_wr_drift as (
  select w.wr_id || ': ' || w.target_key || ' -> ' ||
    (case w.target_type
      when 'building' then 'BL:' || w.bl_id
      when 'floor' then 'FL:' || w.bl_id || '|' || w.level_name
      else 'RM:' || w.bl_id || '|' || w.level_name || '|' || w.room_code end) as off
  from public.work_requests w
  where w.site_id = p_site and w.wr_type = 'PM'
    and w.target_key is not null and w.target_type in ('building','floor','room')
    and w.bl_id is not null
    and (w.target_type = 'building'
      or (w.target_type = 'floor' and coalesce(w.level_name,'') <> '')
      or (w.target_type = 'room' and coalesce(w.level_name,'') <> '' and coalesce(w.room_code,'') <> ''))
    and w.target_key is distinct from (case w.target_type
      when 'building' then 'BL:' || w.bl_id
      when 'floor' then 'FL:' || w.bl_id || '|' || w.level_name
      else 'RM:' || w.bl_id || '|' || w.level_name || '|' || w.room_code end)
),
bad_dwr_drift as (
  select w.wr_id || ': ' || w.target_key || ' -> ' ||
    (case w.target_type
      when 'building' then 'BL:' || w.bl_id
      when 'floor' then 'FL:' || w.bl_id || '|' || w.level_name
      else 'RM:' || w.bl_id || '|' || w.level_name || '|' || w.room_code end) as off
  from public.deleted_work_requests w
  where w.site_id = p_site and w.wr_type = 'PM'
    and w.target_key is not null and w.target_type in ('building','floor','room')
    and w.bl_id is not null
    and (w.target_type = 'building'
      or (w.target_type = 'floor' and coalesce(w.level_name,'') <> '')
      or (w.target_type = 'room' and coalesce(w.level_name,'') <> '' and coalesce(w.room_code,'') <> ''))
    and w.target_key is distinct from (case w.target_type
      when 'building' then 'BL:' || w.bl_id
      when 'floor' then 'FL:' || w.bl_id || '|' || w.level_name
      else 'RM:' || w.bl_id || '|' || w.level_name || '|' || w.room_code end)
),
bad_schedules_blueprint as (
  select s.schedule_id || ':' || coalesce(s.checklist_code,'') as off
  from public.pm_schedules s
  left join public.pm_blueprints x on x.site_id = s.site_id and x.checklist_code = s.checklist_code
  where s.site_id = p_site and x.checklist_code is null
),
bad_schedules_building as (
  select s.schedule_id || ':' || coalesce(s.bl_id,'') as off
  from public.pm_schedules s
  left join public.buildings b on b.site_id = s.site_id and b.bl_id = s.bl_id
  where s.site_id = p_site and s.bl_id is not null and b.bl_id is null
),
bad_schedules_floor as (
  select s.schedule_id || ':' || s.bl_id || '|' || coalesce(s.data->>'LevelName','') as off
  from public.pm_schedules s
  where s.site_id = p_site and s.target_type in ('floor','room')
    and not exists (
      select 1 from public.floors x
      where x.site_id = s.site_id and x.bl_id = s.bl_id and x.level_name = s.data->>'LevelName')
),
bad_schedules_room as (
  select s.schedule_id || ':' || s.bl_id || '|' || coalesce(s.data->>'LevelName','') || '|' || coalesce(s.data->>'RoomCode','') as off
  from public.pm_schedules s
  where s.site_id = p_site and s.target_type = 'room'
    and not exists (
      select 1 from public.rooms x
      where x.site_id = s.site_id and x.bl_id = s.bl_id and x.level_name = s.data->>'LevelName'
        and x.room_code = s.data->>'RoomCode')
),
bad_schedules_equipment as (
  select s.schedule_id || ':' || k as off
  from public.pm_schedules s
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(s.data->'EquipmentCodes') = 'array' then s.data->'EquipmentCodes' else '[]'::jsonb end) as k
  where s.site_id = p_site and s.target_type = 'equipment'
    and not exists (select 1 from public.equipment e where e.site_id = p_site and e.equipment_code = k)
),
bad_suppressed_wr as (
  select o.occurrence_id as off
  from public.suppressed_pm_occurrences o
  where o.site_id = p_site and o.covered_by_wr_id is not null
    and not exists (select 1 from public.work_requests w where w.site_id = o.site_id and w.wr_id = o.covered_by_wr_id)
),
bad_suppressed_schedule as (
  select o.occurrence_id as off
  from public.suppressed_pm_occurrences o
  where o.site_id = p_site
    and ((o.suppressed_pms_id is not null and not exists (
        select 1 from public.pm_schedules p where p.site_id = o.site_id and p.schedule_id = o.suppressed_pms_id))
      or (o.covered_by_pms_id is not null and not exists (
        select 1 from public.pm_schedules p where p.site_id = o.site_id and p.schedule_id = o.covered_by_pms_id)))
),
bad_suppressed_equipment as (
  select o.occurrence_id as off
  from public.suppressed_pm_occurrences o
  where o.site_id = p_site and coalesce(o.equipment_code,'') <> ''
    and not exists (select 1 from public.equipment e where e.site_id = o.site_id and e.equipment_code = o.equipment_code)
),
bad_fj_wr as (
  select n.wr_id || ':' || n.recipient as off
  from public.fj_notifications n
  where n.site_id = p_site
    and not exists (select 1 from public.work_requests w where w.site_id = n.site_id and w.wr_id = n.wr_id)
),
info_fj_deleted as (
  select n.wr_id || ':' || n.recipient as off
  from public.fj_notifications n
  where n.site_id = p_site
    and not exists (select 1 from public.work_requests w where w.site_id = n.site_id and w.wr_id = n.wr_id)
    and exists (select 1 from public.deleted_work_requests d where d.site_id = n.site_id and d.wr_id = n.wr_id)
),
bad_findings_campaign as (
  select f.finding_id as off
  from public.audit_findings f
  where f.site_id = p_site
    and not exists (select 1 from public.audit_campaigns c where c.site_id = f.site_id and c.campaign_id = f.campaign_id)
),
bad_findings_equipment as (
  select f.finding_id || ':' || coalesce(f.equipment_id,'') as off
  from public.audit_findings f
  where f.site_id = p_site and f.equipment_id is not null
    and not exists (select 1 from public.equipment e where e.site_id = f.site_id and e.equipment_code = f.equipment_id)
),
bad_findings_linked_wr as (
  select f.finding_id || ':' || coalesce(f.linked_wr_id,'') as off
  from public.audit_findings f
  where f.site_id = p_site and f.linked_wr_id is not null
    and not exists (select 1 from public.work_requests w where w.site_id = f.site_id and w.wr_id = f.linked_wr_id)
),
bad_inspections_campaign as (
  select i.inspection_id as off
  from public.audit_inspections i
  where i.site_id = p_site
    and not exists (select 1 from public.audit_campaigns c where c.site_id = i.site_id and c.campaign_id = i.campaign_id)
),
bad_inspections_equipment as (
  select i.inspection_id || ':' || coalesce(i.equipment_id,'') as off
  from public.audit_inspections i
  where i.site_id = p_site and i.equipment_id is not null
    and not exists (select 1 from public.equipment e where e.site_id = i.site_id and e.equipment_code = i.equipment_id)
),
bad_imports_campaign as (
  select a.import_id as off
  from public.audit_imports a
  where a.site_id = p_site
    and not exists (select 1 from public.audit_campaigns c where c.site_id = a.site_id and c.campaign_id = a.campaign_id)
),
bad_absences_craftsperson as (
  select a.absence_id as off
  from public.craftperson_absences a
  where a.site_id = p_site
    and not exists (select 1 from public.craftspeople c where c.site_id = a.site_id and c.craftperson_id = a.craftperson_id)
),
bad_users_profile as (
  select u.user_id as off
  from public.users u
  where u.site_id = p_site
    and not exists (select 1 from public.user_access_profiles p where p.site_id = u.site_id and p.username = u.user_id)
),
bad_pmc_wr as (
  select c.coordination_id as off
  from public.pm_coordination c
  where c.site_id = p_site and c.wr_id is not null
    and not exists (select 1 from public.work_requests w where w.site_id = c.site_id and w.wr_id = c.wr_id)
),
bad_pmc_pms as (
  select c.coordination_id as off
  from public.pm_coordination c
  where c.site_id = p_site
    and not exists (select 1 from public.pm_schedules p where p.site_id = c.site_id and p.schedule_id = c.pms_id)
),
info_pmc_no_wr as (
  select c.coordination_id as off
  from public.pm_coordination c
  where c.site_id = p_site and c.wr_id is null
),
bad_missions_freeze as (
  select m.event_id as off
  from public.mission_events m
  where m.site_id = p_site and m.freeze_id is not null
    and not exists (select 1 from public.location_freezes f where f.site_id = m.site_id and f.freeze_id = m.freeze_id)
),
bad_campaigns_buildings as (
  select c.campaign_id || ':' || bid as off
  from public.audit_campaigns c
  cross join lateral unnest(coalesce(c.building_ids, '{}')) as bid
  where c.site_id = p_site
    and not exists (select 1 from public.buildings b where b.site_id = c.site_id and b.bl_id = bid)
),
bad_findings_building as (
  select f.finding_id || ':' || coalesce(f.building_id,'') as off
  from public.audit_findings f
  where f.site_id = p_site and f.building_id is not null
    and not exists (select 1 from public.buildings b where b.site_id = f.site_id and b.bl_id = f.building_id)
),
bad_findings_room as (
  select f.finding_id || ':' || coalesce(f.room_id,'') as off
  from public.audit_findings f
  where f.site_id = p_site and f.room_id is not null and f.building_id is not null
    and not exists (
      select 1 from public.rooms r
      where r.site_id = f.site_id and r.bl_id = f.building_id and r.room_code = f.room_id)
),
bad_inspections_building as (
  select i.inspection_id || ':' || coalesce(i.building_id,'') as off
  from public.audit_inspections i
  where i.site_id = p_site and i.building_id is not null
    and not exists (select 1 from public.buildings b where b.site_id = i.site_id and b.bl_id = i.building_id)
),
bad_cifm_building as (
  select p.person_id || ':' || coalesce(p.stationed_building_id,'') as off
  from public.cifm_people p
  where p.site_id = p_site and p.stationed_building_id is not null
    and not exists (select 1 from public.buildings b where b.site_id = p.site_id and b.bl_id = p.stationed_building_id)
),
bad_onboarding_building as (
  select o.request_id || ':' || coalesce(o.stationed_building_id,'') as off
  from public.onboarding_requests o
  where o.site_id = p_site and o.stationed_building_id is not null
    and not exists (select 1 from public.buildings b where b.site_id = o.site_id and b.bl_id = o.stationed_building_id)
),
bad_freeze_building as (
  select f.freeze_id || ':' || coalesce(f.building_id,'') as off
  from public.location_freezes f
  where f.site_id = p_site and f.building_id is not null
    and not exists (select 1 from public.buildings b where b.site_id = f.site_id and b.bl_id = f.building_id)
),
bad_freeze_building_ids as (
  select f.freeze_id || ':' || bid as off
  from public.location_freezes f
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(f.data->'buildingIds') = 'array' then f.data->'buildingIds' else '[]'::jsonb end) as bid
  where f.site_id = p_site
    and not exists (select 1 from public.buildings b where b.site_id = f.site_id and b.bl_id = bid)
),
info_qa_person as (
  select q.assignment_id || ': ' || q.person_name as off
  from public.qa_inspector_assignments q
  where q.site_id = p_site
    and not exists (
      select 1 from public.user_access_profiles p
      where p.site_id = q.site_id and (p.full_name = q.person_name or p.person_name = q.person_name))
)
select 'floors_missing_building'::text, 'error'::text, 'floors referencing a building that does not exist'::text,
  (select count(*)::int from bad_floors_b), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_floors_b limit 25) t)
union all select 'rooms_missing_building', 'error', 'rooms referencing a building that does not exist',
  (select count(*)::int from bad_rooms_b), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_rooms_b limit 25) t)
union all select 'rooms_missing_floor', 'error', 'rooms whose floor no longer exists',
  (select count(*)::int from bad_rooms_f), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_rooms_f limit 25) t)
union all select 'equipment_missing_building', 'error', 'equipment referencing a building that does not exist',
  (select count(*)::int from bad_equipment_b), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_equipment_b limit 25) t)
union all select 'equipment_missing_room', 'error', 'equipment whose room no longer exists',
  (select count(*)::int from bad_equipment_room), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_equipment_room limit 25) t)
union all select 'desks_missing_building', 'error', 'desks referencing a building that does not exist',
  (select count(*)::int from bad_desks_b), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_desks_b limit 25) t)
union all select 'desks_missing_room', 'error', 'desks whose room no longer exists',
  (select count(*)::int from bad_desks_room), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_desks_room limit 25) t)
union all select 'work_requests_missing_building', 'error', 'work requests referencing a building that does not exist',
  (select count(*)::int from bad_wr_b), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_wr_b limit 25) t)
union all select 'deleted_work_requests_missing_building', 'error', 'deleted work requests referencing a building that does not exist',
  (select count(*)::int from bad_dwr_b), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_dwr_b limit 25) t)
union all select 'pm_wr_target_snapshot_drift', 'error', 'PM work requests whose PM target composite disagrees with their own location keys',
  (select count(*)::int from bad_wr_drift), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_wr_drift limit 25) t)
union all select 'pm_deleted_wr_target_snapshot_drift', 'error', 'deleted PM work requests whose target composite disagrees with their own location keys',
  (select count(*)::int from bad_dwr_drift), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_dwr_drift limit 25) t)
union all select 'schedules_missing_blueprint', 'error', 'PM schedules referencing a checklist blueprint that does not exist',
  (select count(*)::int from bad_schedules_blueprint), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_schedules_blueprint limit 25) t)
union all select 'schedules_missing_building', 'error', 'PM schedules referencing a building that does not exist',
  (select count(*)::int from bad_schedules_building), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_schedules_building limit 25) t)
union all select 'schedules_missing_floor', 'error', 'PM floor/room schedules whose floor no longer exists',
  (select count(*)::int from bad_schedules_floor), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_schedules_floor limit 25) t)
union all select 'schedules_missing_room', 'error', 'PM room schedules whose room no longer exists',
  (select count(*)::int from bad_schedules_room), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_schedules_room limit 25) t)
union all select 'schedules_missing_equipment', 'error', 'PM equipment schedules with an equipment code that does not exist',
  (select count(*)::int from bad_schedules_equipment), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_schedules_equipment limit 25) t)
union all select 'suppressed_missing_covering_wr', 'error', 'PM suppressions whose covering work request no longer exists',
  (select count(*)::int from bad_suppressed_wr), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_suppressed_wr limit 25) t)
union all select 'suppressed_missing_schedule', 'error', 'PM suppressions whose schedule no longer exists',
  (select count(*)::int from bad_suppressed_schedule), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_suppressed_schedule limit 25) t)
union all select 'suppressed_missing_equipment', 'error', 'PM suppressions whose equipment no longer exists',
  (select count(*)::int from bad_suppressed_equipment), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_suppressed_equipment limit 25) t)
union all select 'fj_notification_missing_wr', 'error', 'Fast Job notifications whose work request no longer exists',
  (select count(*)::int from bad_fj_wr), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_fj_wr limit 25) t)
union all select 'findings_missing_campaign', 'error', 'audit findings referencing a campaign that does not exist',
  (select count(*)::int from bad_findings_campaign), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_findings_campaign limit 25) t)
union all select 'findings_missing_equipment', 'error', 'audit findings referencing equipment that does not exist',
  (select count(*)::int from bad_findings_equipment), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_findings_equipment limit 25) t)
union all select 'findings_linked_wr_dangling', 'error', 'audit findings linked to a work request that does not exist',
  (select count(*)::int from bad_findings_linked_wr), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_findings_linked_wr limit 25) t)
union all select 'inspections_missing_campaign', 'error', 'audit inspections referencing a campaign that does not exist',
  (select count(*)::int from bad_inspections_campaign), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_inspections_campaign limit 25) t)
union all select 'inspections_missing_equipment', 'error', 'audit inspections referencing equipment that does not exist',
  (select count(*)::int from bad_inspections_equipment), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_inspections_equipment limit 25) t)
union all select 'imports_missing_campaign', 'error', 'audit imports referencing a campaign that does not exist',
  (select count(*)::int from bad_imports_campaign), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_imports_campaign limit 25) t)
union all select 'absences_missing_craftsperson', 'error', 'craftperson absences referencing a craftsperson that does not exist',
  (select count(*)::int from bad_absences_craftsperson), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_absences_craftsperson limit 25) t)
union all select 'users_missing_profile', 'error', 'users without a matching access profile (username)',
  (select count(*)::int from bad_users_profile), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_users_profile limit 25) t)
union all select 'pm_coordination_missing_wr', 'error', 'coordination rounds pointing at a work request that does not exist',
  (select count(*)::int from bad_pmc_wr), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_pmc_wr limit 25) t)
union all select 'pm_coordination_missing_schedule', 'error', 'coordination rounds pointing at a PM schedule that does not exist',
  (select count(*)::int from bad_pmc_pms), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_pmc_pms limit 25) t)
union all select 'missions_missing_freeze', 'error', 'mission events pointing at a location freeze that does not exist',
  (select count(*)::int from bad_missions_freeze), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_missions_freeze limit 25) t)
union all select 'campaigns_missing_building', 'warn', 'audit campaigns listing a building that does not exist',
  (select count(*)::int from bad_campaigns_buildings), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_campaigns_buildings limit 25) t)
union all select 'findings_missing_building', 'warn', 'audit findings referencing a building that does not exist',
  (select count(*)::int from bad_findings_building), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_findings_building limit 25) t)
union all select 'findings_missing_room', 'warn', 'audit findings referencing a room that does not exist',
  (select count(*)::int from bad_findings_room), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_findings_room limit 25) t)
union all select 'inspections_missing_building', 'warn', 'audit inspections referencing a building that does not exist',
  (select count(*)::int from bad_inspections_building), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_inspections_building limit 25) t)
union all select 'cifm_stationed_building_missing', 'warn', 'CIFM people stationed at a building that does not exist',
  (select count(*)::int from bad_cifm_building), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_cifm_building limit 25) t)
union all select 'onboarding_stationed_building_missing', 'warn', 'onboarding requests stationed at a building that does not exist',
  (select count(*)::int from bad_onboarding_building), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_onboarding_building limit 25) t)
union all select 'freeze_missing_building', 'warn', 'location freezes referencing a building that does not exist',
  (select count(*)::int from bad_freeze_building), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_freeze_building limit 25) t)
union all select 'freeze_building_ids_missing', 'warn', 'location freezes listing a building id that does not exist',
  (select count(*)::int from bad_freeze_building_ids), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from bad_freeze_building_ids limit 25) t)
union all select 'pm_coordination_without_wr', 'info', 'coordination rounds without their work request yet',
  (select count(*)::int from info_pmc_no_wr), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from info_pmc_no_wr limit 25) t)
union all select 'fj_notification_deleted_wr', 'info', 'Fast Job notifications pointing at a deleted work request',
  (select count(*)::int from info_fj_deleted), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from info_fj_deleted limit 25) t)
union all select 'qa_person_names_unmatched', 'info', 'QA inspector assignments whose person name matches no access profile name',
  (select count(*)::int from info_qa_person), (select coalesce(jsonb_agg(off order by off), '[]'::jsonb) from (select off from info_qa_person limit 25) t)
$report$;

grant select on public.cafm_v60_repair_backup to service_role;
grant execute on function public.cafm_integrity_report(text) to service_role;

commit;

-- ============================================================================
-- 9. Verification (read-only; run each block after the commit). All expected
--    numbers below were proven against the live revision-65 state by a
--    server-side probe BEFORE this file was generated.
--
-- 9a. Full report for the flagship site. Expected: 31 error checks + 8 warn checks
--     ALL with offender_count = 0; exactly 2 info rows with counts:
--     pm_coordination_without_wr = 1, qa_person_names_unmatched = 3.
-- select * from public.cafm_integrity_report('02-ESOC') order by severity, check_code;
--
-- 9b. Hard zero prove (expected 0 and 0):
-- select count(*) filter (where severity = 'error' and offender_count > 0) as errors,
--        count(*) filter (where severity = 'warn' and offender_count > 0) as warns
-- from public.cafm_integrity_report('02-ESOC');
--
-- 9c. The six repaired PM work requests (expected targetKey values
--     BL:S01-BL-111 x2, FL:S01-BL-111|Level 0 x2, RM:S01-BL-111|Level 0|S01-B1-L0-R1 T1 x2):
-- select wr_id, target_key, data->>'targetKey' from public.work_requests
-- where wr_id in ('2026000055','2026000056','2026000057','2026000058','2026000059','2026000060');
--
-- 9d. Backup census (expected: work_requests_target 6, audit_findings_building 38,
--     audit_findings_room 2, audit_inspections_building 19, audit_campaigns_building 3,
--     cifm_people_building 1, onboarding_requests_building 3; no deleted_work_requests row):
-- select src, count(*) from public.cafm_v60_repair_backup group by src order by src;
--
-- 9e. All 43 findings now resolve to a live room (expected 43):
-- select count(*) from public.audit_findings f
-- join public.rooms r on r.site_id = f.site_id and r.bl_id = f.building_id and r.room_code = f.room_id
-- where f.site_id = '02-ESOC';
--
-- 9f. Check census (expected 42 checks in total: 31 error, 8 warn, 3 info):
-- select count(*) from public.cafm_integrity_report('02-ESOC');
--
-- 9g. Kind census unchanged by this migration (expected 46 distinct kinds).
--     The V58 file 9c comment (45) remains historical.
-- select count(distinct kind) from public.cafm_blocks where site_id = '02-ESOC';
-- ============================================================================
