-- V58 CAFM Database Stage C8: Fast Job notifications (the last record kind)
-- Turns the fjNotifications JSON-blob kind into a real, typed, one-row-per-notification
-- table (351 records on 02-ESOC at migration time; every one FJ_DISSATISFACTION).
-- Identity lesson from the live probe: the record id is only a slug
-- fjn-<WR-type>-<recipient> with 3 distinct values across 351 records, so it cannot
-- key the table. The app already dedupes on (wrId, recipient) and that pair is unique
-- 351/351, so the primary key is (site_id, wr_id, recipient); the id lives on as the
-- notification_slug column. The probe also showed 117 distinct wrIds and 3 distinct
-- recipients, createdAt is ISO-like text, and read is boolean where present.
-- PREREQUISITE: scripts/supabase-v57-audits-qa-tables.sql (Section 107) and its
-- addendum scripts/supabase-v57-1-save-skip-unchanged.sql are applied: cafm_blocks is
-- the 33-part API view and cafm_save_state already diff-saves thirty-two kinds.
-- The application is deliberately untouched: the security_invoker VIEW cafm_blocks
-- keeps serving the exact same {site_id, kind, payload} rows to PostgREST (now a
-- 34-part union), and cafm_save_state keeps its exact contract (advisory lock,
-- expected-revision check, SQLSTATE 40001 conflict, per-kind skip-unchanged guards,
-- revision bump). Only the storage widens; re-applying the V57.1 statement_timeout
-- headroom is harmless.
-- Grants: explicit service_role SELECT inside the file (the V49 lesson; no Supabase
-- default privileges exist on this project).
-- Safe to run twice (idempotent). One transaction = atomic cutover.
-- EMERGENCY ROLLBACK: see the bottom of this file.

begin;


-- 0) Pre-migration snapshot of the kind being moved: permanent rollback
--    source (RLS-blocked).
do $snapshot$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_blocks_store')
     and not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v58_backup') then
    create table public.cafm_v58_backup (like public.cafm_blocks_store including indexes);
    insert into public.cafm_v58_backup
    select * from public.cafm_blocks_store where kind in ('fjNotifications');
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v58_backup') then
    alter table public.cafm_v58_backup enable row level security;
  end if;
end
$snapshot$;


-- 1) The record table. Column order must match the field order returned by the
--    cafm_fjn_row() function further below.
create table if not exists public.fj_notifications (
  site_id            text    not null    ,
  seq                bigint  not null    , -- array order within the collection
  wr_id              text    not null    , -- the work request the notification belongs to (wrId)
  recipient          text    not null    , -- the notified user; with wr_id this is the record identity
  data               jsonb   not null    , -- guaranteed source for loads
  notification_slug  text    not null    , -- the record id value (fjn-<WR-type>-<recipient>); a slug, not a key
  created_at         text    not null    , -- createdAt (zod string, ISO-like)
  kind               text    not null    , -- all FJ_DISSATISFACTION today
  message            text    not null    , -- the notification body
  read               boolean             , -- read flag; null or false = unread (zod optional)
  primary key (site_id, wr_id, recipient)
);

create index if not exists fjn_site_seq on public.fj_notifications (site_id, seq);
create index if not exists fjn_site_created_at on public.fj_notifications (site_id, created_at);
create index if not exists fjn_site_recipient on public.fj_notifications (site_id, recipient);
create index if not exists fjn_site_unread on public.fj_notifications (site_id, created_at) where read is not true;

-- RLS stays on with no policies: only the service role key used by the server
-- can read and write, exactly like the other CAFM record tables.

alter table public.fj_notifications enable row level security;


-- 2) Single source of truth for extracting a record into typed columns.
create or replace function public.cafm_fjn_row(p_site text, p_seq bigint, b jsonb)
returns public.fj_notifications
language sql
stable
as $fjn$
  select p_site, p_seq, b->>'wrId', b->>'recipient', b, b->>'id', b->>'createdAt', b->>'kind', b->>'message', nullif(b->>'read','')::boolean
$fjn$;


-- 3) Insert helpers used by saves and by the one-time data move below.

create or replace function public.cafm_fjn_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_fjn_s$
  with inserted as (
    insert into public.fj_notifications
    select (public.cafm_fjn_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_fjn_s$;


-- 4) One-time data move: existing blob rows become record rows, then the blob rows
--    are removed. (Idempotent: after the first run the store holds none of this kind.)

insert into public.fj_notifications
select (public.cafm_fjn_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'fjNotifications';

delete from public.cafm_blocks_store where kind in ('fjNotifications');


-- 5) The API view: now a 34-part union. All thirty-three record kinds are driven by
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

  union all
  select r.site_id, 'auditFindings',
         coalesce((select jsonb_agg(af.data order by af.seq)
                   from public.audit_findings af
                   where af.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'auditInspections',
         coalesce((select jsonb_agg(ins.data order by ins.seq)
                   from public.audit_inspections ins
                   where ins.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'auditCampaigns',
         coalesce((select jsonb_agg(cmp.data order by cmp.seq)
                   from public.audit_campaigns cmp
                   where cmp.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'auditTemplates',
         coalesce((select jsonb_agg(tmp.data order by tmp.seq)
                   from public.audit_templates tmp
                   where tmp.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'auditImports',
         coalesce((select jsonb_agg(imp.data order by imp.seq)
                   from public.audit_imports imp
                   where imp.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'qaInspectorAssignments',
         coalesce((select jsonb_agg(qia.data order by qia.seq)
                   from public.qa_inspector_assignments qia
                   where qia.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'qaFailureReasons',
         coalesce((select jsonb_agg(qfr.data order by qfr.seq)
                   from public.qa_failure_reasons qfr
                   where qfr.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'qaAuditReports',
         coalesce((select jsonb_agg(qar.data order by qar.seq)
                   from public.qa_audit_reports qar
                   where qar.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'fjNotifications',
         coalesce((select jsonb_agg(fjn.data order by fjn.seq)
                   from public.fj_notifications fjn
                   where fjn.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

;


-- 6) Grants (the V49 production lesson, baked in since): security_invoker views run
--    with the INVOKER's table grants and this project has no default privileges.
--    Skipped in vanilla local Postgres without Supabase roles.
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.cafm_blocks to service_role';
    execute 'grant select on public.work_requests, public.deleted_work_requests, public.equipment, public.rooms, public.buildings, public.floors, public.desks, public.users, public.user_access_profiles, public.cifm_people, public.craftspeople, public.craftperson_absences, public.role_definitions, public.site_role_assignments, public.site_role_mappings, public.trade_role_mappings, public.stakeholder_teams, public.onboarding_requests, public.pm_schedules, public.pm_coordination, public.suppressed_pm_occurrences, public.location_freezes, public.mission_events, public.pm_blueprints, public.audit_findings, public.audit_inspections, public.audit_campaigns, public.audit_templates, public.audit_imports, public.qa_inspector_assignments, public.qa_failure_reasons, public.qa_audit_reports, public.fj_notifications to service_role';
  end if;
end
$grant$;


-- 7) cafm_save_state: same signature and contract as V49-V57.1, now diff-saving all
--    thirty-three record kinds (the V57.1 per-kind skip-unchanged guards are kept).
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

  -- workRequests: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'workRequests' is distinct from
     (select coalesce(jsonb_agg(w.data order by w.seq), '[]'::jsonb)
        from work_requests w
       where w.site_id = p_site_id) then
    delete from work_requests where site_id = p_site_id;
    perform cafm_wr_store_rows(p_site_id, p_blocks->'workRequests');
  end if;

  -- deletedWorkRequests: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'deletedWorkRequests' is distinct from
     (select coalesce(jsonb_agg(d.data order by d.seq), '[]'::jsonb)
        from deleted_work_requests d
       where d.site_id = p_site_id) then
    delete from deleted_work_requests where site_id = p_site_id;
    perform cafm_dwr_store_rows(p_site_id, p_blocks->'deletedWorkRequests');
  end if;

  -- equipment: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'equipment' is distinct from
     (select coalesce(jsonb_agg(e.data order by e.seq), '[]'::jsonb)
        from equipment e
       where e.site_id = p_site_id) then
    delete from equipment where site_id = p_site_id;
    perform cafm_eq_store_rows(p_site_id, p_blocks->'equipment');
  end if;

  -- rooms: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'rooms' is distinct from
     (select coalesce(jsonb_agg(r.data order by r.seq), '[]'::jsonb)
        from rooms r
       where r.site_id = p_site_id) then
    delete from rooms where site_id = p_site_id;
    perform cafm_room_store_rows(p_site_id, p_blocks->'rooms');
  end if;

  -- buildings: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'buildings' is distinct from
     (select coalesce(jsonb_agg(b.data order by b.seq), '[]'::jsonb)
        from buildings b
       where b.site_id = p_site_id) then
    delete from buildings where site_id = p_site_id;
    perform cafm_building_store_rows(p_site_id, p_blocks->'buildings');
  end if;

  -- floors: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'floors' is distinct from
     (select coalesce(jsonb_agg(f.data order by f.seq), '[]'::jsonb)
        from floors f
       where f.site_id = p_site_id) then
    delete from floors where site_id = p_site_id;
    perform cafm_floor_store_rows(p_site_id, p_blocks->'floors');
  end if;

  -- desks: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'desks' is distinct from
     (select coalesce(jsonb_agg(k.data order by k.seq), '[]'::jsonb)
        from desks k
       where k.site_id = p_site_id) then
    delete from desks where site_id = p_site_id;
    perform cafm_desk_store_rows(p_site_id, p_blocks->'desks');
  end if;

  -- users: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'users' is distinct from
     (select coalesce(jsonb_agg(u.data order by u.seq), '[]'::jsonb)
        from users u
       where u.site_id = p_site_id) then
    delete from users where site_id = p_site_id;
    perform cafm_user_store_rows(p_site_id, p_blocks->'users');
  end if;

  -- userAccessProfiles: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'userAccessProfiles' is distinct from
     (select coalesce(jsonb_agg(p.data order by p.seq), '[]'::jsonb)
        from user_access_profiles p
       where p.site_id = p_site_id) then
    delete from user_access_profiles where site_id = p_site_id;
    perform cafm_uap_store_rows(p_site_id, p_blocks->'userAccessProfiles');
  end if;

  -- cifmPeople: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'cifmPeople' is distinct from
     (select coalesce(jsonb_agg(c.data order by c.seq), '[]'::jsonb)
        from cifm_people c
       where c.site_id = p_site_id) then
    delete from cifm_people where site_id = p_site_id;
    perform cafm_cifmp_store_rows(p_site_id, p_blocks->'cifmPeople');
  end if;

  -- craftspeople: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'craftspeople' is distinct from
     (select coalesce(jsonb_agg(s.data order by s.seq), '[]'::jsonb)
        from craftspeople s
       where s.site_id = p_site_id) then
    delete from craftspeople where site_id = p_site_id;
    perform cafm_craftsp_store_rows(p_site_id, p_blocks->'craftspeople');
  end if;

  -- craftpersonAbsences: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'craftpersonAbsences' is distinct from
     (select coalesce(jsonb_agg(a.data order by a.seq), '[]'::jsonb)
        from craftperson_absences a
       where a.site_id = p_site_id) then
    delete from craftperson_absences where site_id = p_site_id;
    perform cafm_absence_store_rows(p_site_id, p_blocks->'craftpersonAbsences');
  end if;

  -- roleDefinitions: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'roleDefinitions' is distinct from
     (select coalesce(jsonb_agg(o.data order by o.seq), '[]'::jsonb)
        from role_definitions o
       where o.site_id = p_site_id) then
    delete from role_definitions where site_id = p_site_id;
    perform cafm_roledef_store_rows(p_site_id, p_blocks->'roleDefinitions');
  end if;

  -- siteRoleAssignments: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'siteRoleAssignments' is distinct from
     (select coalesce(jsonb_agg(g.data order by g.seq), '[]'::jsonb)
        from site_role_assignments g
       where g.site_id = p_site_id) then
    delete from site_role_assignments where site_id = p_site_id;
    perform cafm_sra_store_rows(p_site_id, p_blocks->'siteRoleAssignments');
  end if;

  -- siteRoleMappings: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'siteRoleMappings' is distinct from
     (select coalesce(jsonb_agg(m.data order by m.seq), '[]'::jsonb)
        from site_role_mappings m
       where m.site_id = p_site_id) then
    delete from site_role_mappings where site_id = p_site_id;
    perform cafm_srm_store_rows(p_site_id, p_blocks->'siteRoleMappings');
  end if;

  -- tradeRoleMappings: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'tradeRoleMappings' is distinct from
     (select coalesce(jsonb_agg(t.data order by t.seq), '[]'::jsonb)
        from trade_role_mappings t
       where t.site_id = p_site_id) then
    delete from trade_role_mappings where site_id = p_site_id;
    perform cafm_trm_store_rows(p_site_id, p_blocks->'tradeRoleMappings');
  end if;

  -- stakeholderTeams: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'stakeholderTeams' is distinct from
     (select coalesce(jsonb_agg(h.data order by h.seq), '[]'::jsonb)
        from stakeholder_teams h
       where h.site_id = p_site_id) then
    delete from stakeholder_teams where site_id = p_site_id;
    perform cafm_team_store_rows(p_site_id, p_blocks->'stakeholderTeams');
  end if;

  -- onboardingRequests: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'onboardingRequests' is distinct from
     (select coalesce(jsonb_agg(n.data order by n.seq), '[]'::jsonb)
        from onboarding_requests n
       where n.site_id = p_site_id) then
    delete from onboarding_requests where site_id = p_site_id;
    perform cafm_onboarding_store_rows(p_site_id, p_blocks->'onboardingRequests');
  end if;

  -- schedules: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'schedules' is distinct from
     (select coalesce(jsonb_agg(sc.data order by sc.seq), '[]'::jsonb)
        from pm_schedules sc
       where sc.site_id = p_site_id) then
    delete from pm_schedules where site_id = p_site_id;
    perform cafm_pms_store_rows(p_site_id, p_blocks->'schedules');
  end if;

  -- pmCoordination: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'pmCoordination' is distinct from
     (select coalesce(jsonb_agg(co.data order by co.seq), '[]'::jsonb)
        from pm_coordination co
       where co.site_id = p_site_id) then
    delete from pm_coordination where site_id = p_site_id;
    perform cafm_pmc_store_rows(p_site_id, p_blocks->'pmCoordination');
  end if;

  -- suppressedPmOccurrences: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'suppressedPmOccurrences' is distinct from
     (select coalesce(jsonb_agg(so.data order by so.seq), '[]'::jsonb)
        from suppressed_pm_occurrences so
       where so.site_id = p_site_id) then
    delete from suppressed_pm_occurrences where site_id = p_site_id;
    perform cafm_spo_store_rows(p_site_id, p_blocks->'suppressedPmOccurrences');
  end if;

  -- locationFreezes: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'locationFreezes' is distinct from
     (select coalesce(jsonb_agg(fz.data order by fz.seq), '[]'::jsonb)
        from location_freezes fz
       where fz.site_id = p_site_id) then
    delete from location_freezes where site_id = p_site_id;
    perform cafm_frz_store_rows(p_site_id, p_blocks->'locationFreezes');
  end if;

  -- missionEvents: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'missionEvents' is distinct from
     (select coalesce(jsonb_agg(mv.data order by mv.seq), '[]'::jsonb)
        from mission_events mv
       where mv.site_id = p_site_id) then
    delete from mission_events where site_id = p_site_id;
    perform cafm_mev_store_rows(p_site_id, p_blocks->'missionEvents');
  end if;

  -- blueprints: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'blueprints' is distinct from
     (select coalesce(jsonb_agg(bp.data order by bp.seq), '[]'::jsonb)
        from pm_blueprints bp
       where bp.site_id = p_site_id) then
    delete from pm_blueprints where site_id = p_site_id;
    perform cafm_bpl_store_rows(p_site_id, p_blocks->'blueprints');
  end if;

  -- auditFindings: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'auditFindings' is distinct from
     (select coalesce(jsonb_agg(af.data order by af.seq), '[]'::jsonb)
        from audit_findings af
       where af.site_id = p_site_id) then
    delete from audit_findings where site_id = p_site_id;
    perform cafm_adf_store_rows(p_site_id, p_blocks->'auditFindings');
  end if;

  -- auditInspections: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'auditInspections' is distinct from
     (select coalesce(jsonb_agg(ai.data order by ai.seq), '[]'::jsonb)
        from audit_inspections ai
       where ai.site_id = p_site_id) then
    delete from audit_inspections where site_id = p_site_id;
    perform cafm_adi_store_rows(p_site_id, p_blocks->'auditInspections');
  end if;

  -- auditCampaigns: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'auditCampaigns' is distinct from
     (select coalesce(jsonb_agg(ac.data order by ac.seq), '[]'::jsonb)
        from audit_campaigns ac
       where ac.site_id = p_site_id) then
    delete from audit_campaigns where site_id = p_site_id;
    perform cafm_adc_store_rows(p_site_id, p_blocks->'auditCampaigns');
  end if;

  -- auditTemplates: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'auditTemplates' is distinct from
     (select coalesce(jsonb_agg(at.data order by at.seq), '[]'::jsonb)
        from audit_templates at
       where at.site_id = p_site_id) then
    delete from audit_templates where site_id = p_site_id;
    perform cafm_adt_store_rows(p_site_id, p_blocks->'auditTemplates');
  end if;

  -- auditImports: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'auditImports' is distinct from
     (select coalesce(jsonb_agg(im.data order by im.seq), '[]'::jsonb)
        from audit_imports im
       where im.site_id = p_site_id) then
    delete from audit_imports where site_id = p_site_id;
    perform cafm_aim_store_rows(p_site_id, p_blocks->'auditImports');
  end if;

  -- qaInspectorAssignments: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'qaInspectorAssignments' is distinct from
     (select coalesce(jsonb_agg(qa.data order by qa.seq), '[]'::jsonb)
        from qa_inspector_assignments qa
       where qa.site_id = p_site_id) then
    delete from qa_inspector_assignments where site_id = p_site_id;
    perform cafm_qia_store_rows(p_site_id, p_blocks->'qaInspectorAssignments');
  end if;

  -- qaFailureReasons: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'qaFailureReasons' is distinct from
     (select coalesce(jsonb_agg(qf.data order by qf.seq), '[]'::jsonb)
        from qa_failure_reasons qf
       where qf.site_id = p_site_id) then
    delete from qa_failure_reasons where site_id = p_site_id;
    perform cafm_qfr_store_rows(p_site_id, p_blocks->'qaFailureReasons');
  end if;

  -- qaAuditReports: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'qaAuditReports' is distinct from
     (select coalesce(jsonb_agg(qr.data order by qr.seq), '[]'::jsonb)
        from qa_audit_reports qr
       where qr.site_id = p_site_id) then
    delete from qa_audit_reports where site_id = p_site_id;
    perform cafm_qar_store_rows(p_site_id, p_blocks->'qaAuditReports');
  end if;

  -- fjNotifications: skip the rewrite when the table already holds this exact payload.
  if p_blocks->'fjNotifications' is distinct from
     (select coalesce(jsonb_agg(fjn.data order by fjn.seq), '[]'::jsonb)
        from fj_notifications fjn
       where fjn.site_id = p_site_id) then
    delete from fj_notifications where site_id = p_site_id;
    perform cafm_fjn_store_rows(p_site_id, p_blocks->'fjNotifications');
  end if;

  -- Blob kinds: unchanged payloads keep their stored row untouched; rows whose kind
  -- is absent from p_blocks are still removed (same end state as before).
  delete from cafm_blocks_store as b
   where b.site_id = p_site_id
     and not exists (select 1
                       from jsonb_each(p_blocks) as e(key, value)
                      where e.key = b.kind
                        and e.key not in ('auditCampaigns', 'auditFindings', 'auditImports', 'auditInspections', 'auditTemplates', 'blueprints', 'buildings', 'cifmPeople', 'craftpersonAbsences', 'craftspeople', 'deletedWorkRequests', 'desks', 'equipment', 'fjNotifications', 'floors', 'locationFreezes', 'missionEvents', 'onboardingRequests', 'pmCoordination', 'qaAuditReports', 'qaFailureReasons', 'qaInspectorAssignments', 'roleDefinitions', 'rooms', 'schedules', 'siteRoleAssignments', 'siteRoleMappings', 'stakeholderTeams', 'suppressedPmOccurrences', 'tradeRoleMappings', 'userAccessProfiles', 'users', 'workRequests')
                        and e.value = b.payload);

  insert into cafm_blocks_store (site_id, kind, payload)
  select p_site_id, e.key, e.value
    from jsonb_each(p_blocks) as e(key, value)
   where e.key not in ('auditCampaigns', 'auditFindings', 'auditImports', 'auditInspections', 'auditTemplates', 'blueprints', 'buildings', 'cifmPeople', 'craftpersonAbsences', 'craftspeople', 'deletedWorkRequests', 'desks', 'equipment', 'fjNotifications', 'floors', 'locationFreezes', 'missionEvents', 'onboardingRequests', 'pmCoordination', 'qaAuditReports', 'qaFailureReasons', 'qaInspectorAssignments', 'roleDefinitions', 'rooms', 'schedules', 'siteRoleAssignments', 'siteRoleMappings', 'stakeholderTeams', 'suppressedPmOccurrences', 'tradeRoleMappings', 'userAccessProfiles', 'users', 'workRequests')
     and not exists (select 1 from cafm_blocks_store as b
                      where b.site_id = p_site_id
                        and b.kind = e.key
                        and b.payload = e.value);

  insert into cafm_site_revision (site_id, revision)
  values (p_site_id, p_new_revision)
  on conflict (site_id) do update set revision = excluded.revision;
  return jsonb_build_object('revision', p_new_revision);
end
$save$;


-- 7b) The V57.1 statement_timeout headroom for the API role (30s). Re-applying is
--     harmless; kept so fresh installs get it too.
do $tmo$
begin
  begin
    execute 'alter role service_role set statement_timeout = ''30s''';
  exception when others then
    raise notice 'statement_timeout alter skipped: %', sqlerrm;
  end;
end
$tmo$;


-- 8) Legacy-blob migration path (fresh installs only; production is already on blocks):
--    repoint the V44 one-time migration at the store + all thirty-three record tables.
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
     or exists (select 1 from audit_findings limit 1)
     or exists (select 1 from audit_inspections limit 1)
     or exists (select 1 from audit_campaigns limit 1)
     or exists (select 1 from audit_templates limit 1)
     or exists (select 1 from audit_imports limit 1)
     or exists (select 1 from qa_inspector_assignments limit 1)
     or exists (select 1 from qa_failure_reasons limit 1)
     or exists (select 1 from qa_audit_reports limit 1)
     or exists (select 1 from fj_notifications limit 1)
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
    perform cafm_adf_store_rows(v_site, v_state -> 'state' -> 'auditFindings');
    perform cafm_adi_store_rows(v_site, v_state -> 'state' -> 'auditInspections');
    perform cafm_adc_store_rows(v_site, v_state -> 'state' -> 'auditCampaigns');
    perform cafm_adt_store_rows(v_site, v_state -> 'state' -> 'auditTemplates');
    perform cafm_aim_store_rows(v_site, v_state -> 'state' -> 'auditImports');
    perform cafm_qia_store_rows(v_site, v_state -> 'state' -> 'qaInspectorAssignments');
    perform cafm_qfr_store_rows(v_site, v_state -> 'state' -> 'qaFailureReasons');
    perform cafm_qar_store_rows(v_site, v_state -> 'state' -> 'qaAuditReports');
    perform cafm_fjn_store_rows(v_site, v_state -> 'state' -> 'fjNotifications');

    insert into cafm_blocks_store (site_id, kind, payload)
    select v_site, key, value from jsonb_each(coalesce(v_state -> 'state', '{}'::jsonb))
    where key not in ('auditCampaigns', 'auditFindings', 'auditImports', 'auditInspections', 'auditTemplates', 'blueprints', 'buildings', 'cifmPeople', 'craftpersonAbsences', 'craftspeople', 'deletedWorkRequests', 'desks', 'equipment', 'fjNotifications', 'floors', 'locationFreezes', 'missionEvents', 'onboardingRequests', 'pmCoordination', 'qaAuditReports', 'qaFailureReasons', 'qaInspectorAssignments', 'roleDefinitions', 'rooms', 'schedules', 'siteRoleAssignments', 'siteRoleMappings', 'stakeholderTeams', 'suppressedPmOccurrences', 'tradeRoleMappings', 'userAccessProfiles', 'users', 'workRequests');
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

select 'fj_notifications' as table_name, count(*) as rows, pg_total_relation_size('public.fj_notifications') as bytes_on_disk
from public.fj_notifications
union all

select 'cafm_blocks_store', count(*), pg_total_relation_size('public.cafm_blocks_store')
from public.cafm_blocks_store
union all
select 'cafm_v58_backup', count(*), pg_total_relation_size('public.cafm_v58_backup')
from public.cafm_v58_backup;

-- 9b. Round-trip fidelity: the API view must reproduce the pre-migration payloads
--     exactly.
with
  old as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_v58_backup group by site_id
  ),
  new as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_blocks
    where kind in ('fjNotifications')
    group by site_id
  )
select o.site_id,
       o.state = n.state as state_identical,
       pg_column_size(o.state) as old_bytes,
       pg_column_size(n.state) as new_bytes
from old o join new n on n.site_id = o.site_id
order by o.site_id;

-- 9c. Kind census: one row per site+kind (12 store kinds + 33 record kinds = 45
--     distinct kinds for a fully migrated 02-ESOC):
select count(*) as kind_rows, count(distinct kind) as distinct_kinds
from public.cafm_blocks where site_id = '02-ESOC';

-- 9d. The classical-table feel: notifications with real columns and real joins.
-- 9d-1. Every notification resolves to a real work request (expect 351 joined rows).
select count(*) as joined_rows
from public.fj_notifications n
join public.work_requests w
  on w.site_id = n.site_id and w.wr_id = n.wr_id
where n.site_id = '02-ESOC';

-- 9d-2. The classic list: newest first, read as a real boolean column.
select wr_id, recipient, notification_slug, kind, created_at, read, message
from public.fj_notifications
where site_id = '02-ESOC'
order by seq desc
limit 15;

-- 9d-3. Notification and unread counts per recipient.
select recipient, count(*) as notifications,
       count(*) filter (where read is not true) as unread
from public.fj_notifications
where site_id = '02-ESOC'
group by recipient
order by recipient;

-- 9e. Blob census: what still lives in cafm_blocks_store (expect 12 kinds, and no
--     fjNotifications anywhere).
select kind, count(*) as rows
from public.cafm_blocks_store
group by kind
order by kind;

-- 9f. The deployed save function now contains the 33 per-kind diff guards.
select array_length(string_to_array(pg_get_functiondef('public.cafm_save_state'::regproc),
       'is distinct from'), 1) - 1 as diff_guards_expected_33;

-- EMERGENCY ROLLBACK (V58 -> V57 layout). Only for a real emergency: writes made after
-- this migration live in fj_notifications, so re-merge the backup over the store.
-- Post-migration record contents are NOT auto-merged back into blob rows by this
-- snippet; the backed-up rows are re-merged as whole kinds. Ask Vibe to help if a
-- rollback is ever needed.
--   begin;
--   -- re-paste scripts/supabase-v57-audits-qa-tables.sql and then
--   -- scripts/supabase-v57-1-save-skip-unchanged.sql (both idempotent; they restore
--   -- the V57 33-part view and save/migrate bodies);
--   insert into public.cafm_blocks_store
--     select site_id, kind, payload from public.cafm_v58_backup
--   on conflict (site_id, kind) do update set payload = excluded.payload;
--   truncate table public.fj_notifications;
--   commit;
