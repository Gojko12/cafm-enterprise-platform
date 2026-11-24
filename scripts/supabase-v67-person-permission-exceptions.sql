-- ============================================================================
-- V67 (MASTER_SPEC Section 117): Person permission exceptions -> normalized
-- SQL projection + change-log trail.
--
-- Creates public.person_permission_exceptions, a VIEW that unpacks the V66
-- permissionExceptions blob on user_access_profiles into one row per person
-- and permission key:
--   site_id, profile_id, person_name, full_name, primary_role, is_super_admin,
--   permission_key, mode ('added' | 'removed'), updated_by, updated_at.
-- All sites at once, so estate-wide questions are one query.
--
-- Design decision (house "guaranteed source" law, MASTER_SPEC Section 117):
-- the load/sync source of truth stays user_access_profiles.data; the view is
-- a pure projection, so it can never drift and it is immune to the
-- cafm_save_state store pattern, which deletes and reinserts every profile
-- row of a site on each save (a trigger-synced child table would fire twice
-- per save and could still race the replace). No triggers, no jobs, no new
-- columns, no cafm_blocks change: paste and query. The app is deliberately
-- untouched by this file - nothing in the state flow changes; payloads stay
-- byte-identical.
--
-- The HISTORY trail is NOT this file: V67 also logs every exception change
-- into the existing public.change_log table (change type
-- person.permissionException) from the app save pipeline, so /change-log
-- shows who changed what, when, old -> new. change_log.change_type is free
-- text and the rows arrive through the existing cafm_save_state diff-save
-- path - no table change needed for the history part.
--
-- Query examples (Supabase SQL editor):
--   who deviates from role defaults anywhere in the estate:
--     select site_id, person_name, count(*) as exceptions
--     from public.person_permission_exceptions
--     group by 1, 2 order by 3 desc;
--   everyone denied a specific capability, e.g. Fast Job creation:
--     select site_id, person_name from public.person_permission_exceptions
--     where permission_key = 'canCreateFJ' and mode = 'removed';
--
-- PREREQUISITE: scripts/supabase-v55-people-rbac-tables.sql applied
-- (public.user_access_profiles exists - true in production) and V66 deployed.
--
-- Safe to run twice (create or replace view is idempotent). No data changed.
-- As with every table/view here: only the service role key used by the server
-- may read it; views cannot carry RLS, the underlying table keeps RLS on.
-- EMERGENCY ROLLBACK: drop view if exists public.person_permission_exceptions;
-- (the app never reads the view; dropping it changes nothing for the app.)
-- ============================================================================

begin;

-- 1) The projection. Derived only from the guaranteed source (data jsonb).
create or replace view public.person_permission_exceptions as
with profiles as (
  select
    uap.site_id,
    uap.profile_id,
    uap.person_name,
    coalesce(nullif(uap.full_name, ''), uap.person_name) as full_name,
    coalesce(nullif(uap.primary_role, ''), '(no role)') as primary_role,
    uap.is_super_admin,
    coalesce(uap.data->'permissionExceptions', '{}'::jsonb) as exceptions
  from public.user_access_profiles uap
)
select
  p.site_id,
  p.profile_id,
  p.person_name,
  p.full_name,
  p.primary_role,
  p.is_super_admin,
  keys.permission_key,
  keys.mode,
  coalesce(nullif(p.exceptions->>'updatedBy', ''), '(unknown)') as updated_by,
  coalesce(nullif(p.exceptions->>'updatedAt', ''), '(unknown)') as updated_at
from profiles p
cross join lateral (
  select x.permission_key, 'added'::text as mode
    from jsonb_array_elements_text(coalesce(p.exceptions->'added', '[]'::jsonb)) as x(permission_key)
  union all
  select x.permission_key, 'removed'::text as mode
    from jsonb_array_elements_text(coalesce(p.exceptions->'removed', '[]'::jsonb)) as x(permission_key)
) as keys;

comment on view public.person_permission_exceptions is
  'V67 Section 117: one row per person and permission exception (added/removed); pure projection of user_access_profiles.data->permissionExceptions (guaranteed source); read-only, app never reads it.';

-- 2) Grants: the service role only, mirroring the v55 table grants.
grant select on public.person_permission_exceptions to service_role;

commit;

-- ============================================================================
-- 9) Verification after paste (run in the SQL editor, record ACTUALS):
-- 9a view exists and is empty until an admin sets an exception:
--      select count(*) from public.person_permission_exceptions;
--    (expected 0 right after paste)
-- 9b after denying "Create FJ" for a test persona in the brainstorm tab and
--    letting the site sync:
--      select site_id, person_name, permission_key, mode, updated_by, updated_at
--      from public.person_permission_exceptions order by site_id, person_name;
--    (expected exactly one row for that persona, mode = removed)
-- 9c after "Reset to role defaults" and sync, 9a must be 0 again.
-- 9d the change-log side (logged by the app, not this file):
--      select modified_date, modified_time, change_type, record_key, old_value, new_value
--      from public.change_log
--      where change_type = 'person.permissionException' order by at desc limit 5;
-- ============================================================================
