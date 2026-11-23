-- ============================================================================
-- V60.1 (addendum to MASTER_SPEC Section 110): Integrity report fix - CIFM station join.
--
-- Problem: the V60 report check cifm_stationed_building_missing flagged 26
-- cifm_people rows on 02-ESOC whose stationed_building_id is S02/S03/S04/S05-BL-1.
-- Those codes are NOT corrupt: cifm_people is a global directory replicated
-- into every site partition (scopeData deliberately does not filter it), and
-- each row carries its own stationed_site_id. The legacy codes belong to the
-- home sites via LEGACY_SITE_MAP (SITE-01 -> 02-ESOC, so S01-BL-* is 02-ESOC's
-- own family; S02-BL-1 = 01-ESTEC, S03-BL-1 = 04-ESRIN, S04-BL-1 = 03-HQ,
-- S05-BL-1 = 05-ESAC). The V60 check joined public.buildings on the PARTITION
-- site (b.site_id = p.site_id), so every cross-site-stationed person was
-- structurally flagged regardless of their home site.
--
-- PRODUCTION REALITY (live API query 2026-11-23, Gregor): only 02-ESOC
-- currently has rows in the record tables; the other four sites' buildings
-- partitions are EMPTY. Live 02-ESOC census: 59 cifm_people carry a station,
-- of which 33 are own-site (29 x 02-S_V1, 2 x S01-BL-2, 1 x S01-BL-3,
-- 1 x S01-BL-111) and 26 are cross-site (S02/S03/S04/S05-BL-1). So after this
-- paste the warn family on 02-ESOC STAYS AT 26 - the codes only resolve once
-- the home sites are seeded. The improvement is SEMANTIC ONLY: the check now
-- resolves against the person's home stationed_site_id (correct attribution),
-- and any building genuinely missing from a POPULATED home site still flags.
--
-- Fix (report-only, no data change): bad_cifm_building now joins buildings on
-- coalesce(p.stationed_site_id, p.site_id), i.e. the person's home site.
-- A person stationed at a building missing from their OWN site still flags.
-- bad_onboarding_building is intentionally unchanged: onboarding_requests IS
-- site-partitioned in scopeData, so the partition join is correct there.
--
-- The function body below is the V60 body verbatim except that one join line.
--
-- How to run: paste the whole file into the Supabase SQL editor once, eyeball
-- the raised notices and section 9 below the commit. REHEARSED OFFLINE first
-- against a real local PostgreSQL (embedded-postgres) with the full V44-V60
-- migration chain replayed and the live 02-ESOC drift reproduced.
--
-- Offline rehearsal ACTUALS (2026-11-23, local PostgreSQL, V44-V60 replayed):
--   Run A (all five sites seeded with buildings): pre-paste report 02-ESOC
--     showed exactly cifm_stationed_building_missing = 26 (S02-BL-1 x8 /
--     stationed 01-ESTEC, S03-BL-1 x6 / 04-ESRIN, S04-BL-1 x6 / 03-HQ,
--     S05-BL-1 x6 / 05-ESAC), all 31 error checks 0; the file applied TWICE
--     cleanly (idempotent); post-paste report 02-ESOC: 42 checks, 0 errors,
--     0 warns, 9c = 30/30 rows resolve under the home site; a planted bogus
--     own-site row (S02-BL-99 on 01-ESTEC) still flagged = 1, so genuinely
--     missing own-site stations are NOT masked by the new join.
--   Run B (ONLY 02-ESOC seeded, matching production where the live API returns
--     state only for 02-ESOC): pre-paste 26 as above; post-paste report
--     02-ESOC: 42 checks, 0 errors, warn cifm_stationed_building_missing = 26
--     (UNCHANGED count - the cross-site stations can only resolve once their
--     home sites have buildings rows). This is the production prediction.
--   Production post-paste numbers must be recorded in section 9 comments after
--   the real paste, replacing these rehearsal expectations (V60 lesson).
--
-- Rollback: the previous function version is replaced, not accumulated, so
-- rollback = re-paste scripts/supabase-v60-integrity-report.sql section 3
-- (create or replace ... cafm_integrity_report) or simply:
--   drop function if exists public.cafm_integrity_report(text);
-- No tables are created, altered or dropped by this file; no data is touched.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Pre-paste notices: census of the accepted warn family on the flagship
--    site (expected 02-ESOC: S02-BL-1 x8, S03-BL-1 x6, S04-BL-1 x6, S05-BL-1 x6
--    = 26, plus 1 x S01-BL-1 if the V60 R2 repair has not run yet). The second
--    number applies the NEW home-site join: in PRODUCTION it is expected 26
--    as well, because only 02-ESOC has buildings rows today (live API check
--    2026-11-23) - the cross-site stations resolve only once their home sites
--    are seeded. It is 0 in a fully-seeded offline rehearsal (rehearsal run A).
-- ---------------------------------------------------------------------------
do $notice$
declare
  n_cross integer; n_missing_after integer;
begin
  select count(*) into n_cross from public.cifm_people p
  where p.site_id = '02-ESOC' and p.stationed_building_id is not null
    and not exists (select 1 from public.buildings b where b.site_id = p.site_id and b.bl_id = p.stationed_building_id);
  select count(*) into n_missing_after from public.cifm_people p
  where p.site_id = '02-ESOC' and p.stationed_building_id is not null
    and not exists (select 1 from public.buildings b where b.site_id = coalesce(p.stationed_site_id, p.site_id) and b.bl_id = p.stationed_building_id);
  raise notice 'V60.1 pre-paste: cifm rows on 02-ESOC missing under partition site = % (expected 26); missing under home stationed_site_id = % (expected 26 in production - other sites empty; 0 when all sites seeded)', n_cross, n_missing_after;
end
$notice$;

-- ---------------------------------------------------------------------------
-- 1. The report function (V60 body verbatim, one join line patched).
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
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(c.building_ids) = 'array' then c.building_ids else '[]'::jsonb end) as bid
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
    and not exists (select 1 from public.buildings b where b.site_id = coalesce(p.stationed_site_id, p.site_id) and b.bl_id = p.stationed_building_id)
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

grant execute on function public.cafm_integrity_report(text) to service_role;

commit;

-- ============================================================================
-- 9. Verification (read-only; run each block after the commit).
--
-- 9a. Full report for the flagship site. Expected after this paste in
--     PRODUCTION (only 02-ESOC has rows today): every error check
--     offender_count = 0, and exactly one warn family remains,
--     cifm_stationed_building_missing = 26 - the SAME count as before, now
--     with corrected home-site semantics (the codes resolve once the home
--     sites 01-ESTEC/03-HQ/04-ESRIN/05-ESAC are seeded; all other check
--     codes unchanged vs V60).
-- select * from public.cafm_integrity_report('02-ESOC') order by severity, check_code;
--
-- 9b. Warn/error census (expected production: errors 0, warns 1 family).
-- select count(*) filter (where severity = 'error' and offender_count > 0) as errors,
--        count(*) filter (where severity = 'warn' and offender_count > 0) as warns
-- from public.cafm_integrity_report('02-ESOC');
--
-- 9c. Rows resolving under the HOME site join. PRODUCTION (live API query
--     2026-11-23: 59 cifm_people on 02-ESOC carry a station): expected 33 -
--     the own-site rows 29 x 02-S_V1, 2 x S01-BL-2, 1 x S01-BL-3,
--     1 x S01-BL-111 all resolve; the 26 cross-site rows (S02/S03/S04/S05-BL-1)
--     resolve only once their home sites are seeded. (Offline rehearsal with
--     only 4 seeded own-site rows showed 4 - rehearsal data, not production.)
-- select count(*) from public.cifm_people p
-- where p.site_id = '02-ESOC' and p.stationed_building_id is not null
--   and exists (select 1 from public.buildings b
--               where b.site_id = coalesce(p.stationed_site_id, p.site_id)
--                 and b.bl_id = p.stationed_building_id);
--
-- 9d. A genuinely missing OWN-site station still flags (guard against
--     over-broad join): any such row is listed here; production today still
--     lists the 26 cross-site rows because their home partitions are empty.
-- select * from public.cafm_integrity_report('02-ESOC')
-- where check_code = 'cifm_stationed_building_missing';
--
-- 9e. Same report on the other four sites. Production today: those
--     partitions are empty, so all 42 checks report 0 offenders there.
-- select * from public.cafm_integrity_report('01-ESTEC') order by severity, check_code;
-- select * from public.cafm_integrity_report('03-HQ')    order by severity, check_code;
-- select * from public.cafm_integrity_report('04-ESRIN') order by severity, check_code;
-- select * from public.cafm_integrity_report('05-ESAC')  order by severity, check_code;
--
-- 9f. Check census unchanged (expected 42 checks: 31 error, 8 warn, 3 info).
-- select count(*) from public.cafm_integrity_report('02-ESOC');
-- ============================================================================
