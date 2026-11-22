-- scripts/supabase-v57-1-save-skip-unchanged.sql
-- V57.1 post-release fix (Section 107 addendum). Production incident 2026-11-22 ~20:48:
-- Supabase SQLSTATE 57014 "canceling statement due to statement timeout" on
-- /rpc/cafm_save_state when staging a QA verdict on WR 2026000072 (earlier silent
-- revert-style losses on 2026000003/71 were the same failure). Root cause: every save
-- rewrote ALL 32 record tables (~2,700 rows) in one transaction while the client polls
-- every 2.5s and auto-retries failed saves 2.5s later, so attempts queued on the save
-- advisory lock until each died at Supabase's ~10s statement timeout. The "certain
-- Predefined Failure Reason" was timing correlation, not cause: revision 49->54 proves
-- the same saves succeeded in quiet windows.
--
-- Fix, all server-side (no application change, no redeploy):
--   1) cafm_save_state keeps its exact signature and contract, but a record kind is
--      only deleted + re-stored when its incoming payload differs from
--      jsonb_agg(data order by seq) already held by its table; blob kinds only
--      replace stored rows whose payload changed. A one-WR verdict save now
--      rewrites 1 kind instead of 33. API payloads stay byte-identical.
--   2) Best-effort statement_timeout headroom for the API role (30s).
-- Idempotent; single transaction; safe to re-paste. Prerequisite: V57 applied.

begin;

-- 1) The diffing save. Same signature, same revision contract, same return value.
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

  -- Blob kinds: unchanged payloads keep their stored row untouched; rows whose kind
  -- is absent from p_blocks are still removed (same end state as before).
  delete from cafm_blocks_store as b
   where b.site_id = p_site_id
     and not exists (select 1
                       from jsonb_each(p_blocks) as e(key, value)
                      where e.key = b.kind
                        and e.key not in ('auditCampaigns', 'auditFindings', 'auditImports', 'auditInspections', 'auditTemplates', 'blueprints', 'buildings', 'cifmPeople', 'craftpersonAbsences', 'craftspeople', 'deletedWorkRequests', 'desks', 'equipment', 'floors', 'locationFreezes', 'missionEvents', 'onboardingRequests', 'pmCoordination', 'qaAuditReports', 'qaFailureReasons', 'qaInspectorAssignments', 'roleDefinitions', 'rooms', 'schedules', 'siteRoleAssignments', 'siteRoleMappings', 'stakeholderTeams', 'suppressedPmOccurrences', 'tradeRoleMappings', 'userAccessProfiles', 'users', 'workRequests')
                        and e.value = b.payload);

  insert into cafm_blocks_store (site_id, kind, payload)
  select p_site_id, e.key, e.value
    from jsonb_each(p_blocks) as e(key, value)
   where e.key not in ('auditCampaigns', 'auditFindings', 'auditImports', 'auditInspections', 'auditTemplates', 'blueprints', 'buildings', 'cifmPeople', 'craftpersonAbsences', 'craftspeople', 'deletedWorkRequests', 'desks', 'equipment', 'floors', 'locationFreezes', 'missionEvents', 'onboardingRequests', 'pmCoordination', 'qaAuditReports', 'qaFailureReasons', 'qaInspectorAssignments', 'roleDefinitions', 'rooms', 'schedules', 'siteRoleAssignments', 'siteRoleMappings', 'stakeholderTeams', 'suppressedPmOccurrences', 'tradeRoleMappings', 'userAccessProfiles', 'users', 'workRequests')
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

-- 2) Supabase roles ship with a short statement_timeout the V57-size full-state
--    saves can collide with under load. Give the API role headroom. Best effort:
--    if the platform disallows the ALTER, a notice is raised and the fix still
--    works (the diff guards above already shorten every save).
do $tmo$
begin
  begin
    execute 'alter role service_role set statement_timeout = ''30s''';
  exception when others then
    raise notice 'statement_timeout alter skipped: %', sqlerrm;
  end;
end
$tmo$;

commit;

-- 9) Verification (eyeball in the SQL editor).

-- 9a. The deployed save function contains the 32 per-kind diff guards.
select array_length(string_to_array(pg_get_functiondef('public.cafm_save_state'::regproc),
       'is distinct from'), 1) - 1 as diff_guards_expected_32;

-- 9b. The service role statement timeout was applied (null rolconfig = the ALTER
--     was skipped by the platform; the notice above explains, the fix still holds).
select rolname, rolconfig from pg_roles where rolname = 'service_role';

-- EMERGENCY ROLLBACK
-- Re-paste scripts/supabase-v57-audits-qa-tables.sql (idempotent; its cafm_save_state
-- definition restores the pre-V57.1 always-rewrite body). Optionally reset the timeout:
--   alter role service_role reset statement_timeout;
