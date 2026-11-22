-- V55 CAFM Database Stage C5: People & RBAC (11 record kinds as proper Postgres rows)
-- Turns the People / RBAC / onboarding JSON-blob rows into real, typed,
-- one-row-per-record tables (236 records across 11 kinds on 02-ESOC at migration time):
--   users                 one row per application user (identity = UserId, the username)
--   user_access_profiles  one row per person access profile (identity = id)
--   cifm_people           one row per CIFM person (identity = id)
--   craftspeople          one row per craftsperson (identity = id)
--   craftperson_absences  one row per absence / leave record (identity = id)
--   role_definitions      one row per RBAC role definition (identity = id)
--   site_role_assignments  one row per role-per-person assignment (identity = AssignmentId;
--                          PersonName is NOT unique across sites, so it cannot be the key)
--   site_role_mappings    one row per site (role -> userId mapping object)
--   trade_role_mappings   one row per site + trade (role -> userId mapping object)
--   stakeholder_teams     one row per stakeholder team (identity = id)
--   onboarding_requests   one row per staff onboarding request (identity = id)
-- PREREQUISITE: scripts/supabase-v51-location-tables.sql (Section 101) is applied:
-- cafm_blocks is the 8-part API view over cafm_blocks_store + the seven existing record
-- kinds (workRequests, deletedWorkRequests, equipment, rooms, buildings, floors, desks).
-- The application is deliberately untouched: the security_invoker VIEW cafm_blocks keeps
-- serving the exact same {site_id, kind, payload} rows to PostgREST, and cafm_save_state
-- keeps its exact contract (advisory lock, expected-revision check, SQLSTATE 40001
-- conflict, full-site replacement, revision bump). This file only widens the storage.
-- ROW OWNERS / FUTURE AUTH NOTE: the identity columns promoted here (users.user_id,
-- user_access_profiles.username, cifm_people.username, craftspeople.username,
-- onboarding_requests.submitted_by / assigned_team_leader_id / completed_person_id,
-- craftperson_absences.craftperson_id) are the natural join keys for a future per-user
-- authentication layer (an ESA IdP): binding auth.uid() to these columns is where
-- row-level RLS policies would attach. No separate "owner" column is added now: the
-- platform has a single trusted writer (the server's service role) and record ownership
-- is already expressed by existing fields, so owner columns would duplicate data and
-- guess at the auth model before it exists.
-- ESA PORTABILITY NOTE: this file is plain Postgres SQL. The schema uses no
-- Supabase-proprietary features (RLS and role grants are standard PG; security_invoker is
-- PG15+), so a pg_dump of schema+data can be restored onto ESA-internal Postgres with a
-- self-hosted PostgREST in front of it; only the SUPABASE_URL / service-role env vars
-- change. No Supabase Auth, FaaS or Storage is introduced.
-- Grants: explicit service_role SELECT inside the file (the V49 lesson; no Supabase
-- default privileges exist on this project).
-- Safe to run twice (idempotent). One transaction = atomic cutover.
-- EMERGENCY ROLLBACK: see the bottom of this file.

begin;

-- 0) Pre-migration snapshot of the eleven kinds being moved: permanent rollback
--    source (RLS-blocked).
do $snapshot$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_blocks_store')
     and not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v55_backup') then
    create table public.cafm_v55_backup (like public.cafm_blocks_store including indexes);
    insert into public.cafm_v55_backup
    select * from public.cafm_blocks_store where kind in ('users', 'userAccessProfiles', 'cifmPeople', 'craftspeople', 'craftpersonAbsences', 'roleDefinitions', 'siteRoleAssignments', 'siteRoleMappings', 'tradeRoleMappings', 'stakeholderTeams', 'onboardingRequests');
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v55_backup') then
    alter table public.cafm_v55_backup enable row level security;
  end if;
end
$snapshot$;

-- 1) The record tables. Column order must match the field order returned by the
--    cafm_*_row() functions further below.

-- Application users: system role, LJ roles, trades, site access
create table if not exists public.users (
  site_id                   text    not null ,
  seq                       bigint  not null , -- array order within the collection
  user_id                   text    not null , -- UserId (identity)
  data                      jsonb   not null , -- the complete record; guaranteed source for loads
  display_name              text             , -- DisplayName
  system_role               text             , -- SystemRole
  lj_roles                  jsonb            , -- LJRoles
  trades                    jsonb            , -- Trades
  can_access_all            boolean          , -- CanAccessAll
  assigned_site_ids         jsonb              -- AssignedSiteIds
);
create index if not exists users_site_seq on public.users (site_id, seq);
create index if not exists users_site_role on public.users (site_id, system_role);

-- Per-person access profiles: role flags, permissions, site/trade/building scoping
create table if not exists public.user_access_profiles (
  site_id                   text    not null ,
  seq                       bigint  not null , -- array order within the collection
  profile_id                text    not null , -- id (identity)
  data                      jsonb   not null , -- the complete record; guaranteed source for loads
  person_name               text             , -- personName
  full_name                 text             , -- fullName
  primary_role              text             , -- primaryRole
  email                     text             , -- email
  username                  text             , -- username
  phone                     text             , -- phone
  department                text             , -- department
  is_helpdesk               boolean          , -- isHelpdesk
  is_hr_admin               boolean          , -- isHrAdmin
  is_team_leader            boolean          , -- isTeamLeader
  is_craftperson            boolean          , -- isCraftperson
  is_qa_inspector           boolean          , -- isQAInspector
  is_site_admin             boolean          , -- isSiteAdmin
  is_super_admin            boolean          , -- isSuperAdmin
  site_access               jsonb            , -- siteAccess
  managed_site_ids          jsonb            , -- managedSiteIds
  vpa_trades                jsonb            , -- vpaTrades
  vpa_building_ids          jsonb            , -- vpaBuildingIds
  assigned_role_ids         jsonb            , -- assignedRoleIds
  permissions               jsonb            , -- permissions
  linked_craftperson_id     text               -- linkedCraftpersonId
);
create index if not exists user_access_profiles_site_seq on public.user_access_profiles (site_id, seq);
create index if not exists uap_site_primary_role on public.user_access_profiles (site_id, primary_role);
create index if not exists uap_site_username on public.user_access_profiles (site_id, username);
create index if not exists uap_site_person_name on public.user_access_profiles (site_id, person_name);

-- CIFM personnel master: employee data, stationing, roles, site access
create table if not exists public.cifm_people (
  site_id                   text    not null ,
  seq                       bigint  not null , -- array order within the collection
  person_id                 text    not null , -- id (identity)
  data                      jsonb   not null , -- the complete record; guaranteed source for loads
  employee_code             text             , -- employeeCode
  display_name              text             , -- displayName
  email                     text             , -- email
  phone                     text             , -- phone
  department_team           text             , -- departmentTeam
  stationed_site_id         text             , -- stationedSiteId
  stationed_building_id     text             , -- stationedBuildingId
  stationed_floor_id        text             , -- stationedFloorId
  stationed_room_id         text             , -- stationedRoomId
  is_fm_staff               boolean          , -- isFmStaff
  username                  text             , -- username
  system_role               text             , -- systemRole
  assigned_site_ids         jsonb            , -- assignedSiteIds
  site_admin_site_ids       jsonb            , -- siteAdminSiteIds
  trade_access              jsonb            , -- tradeAccess
  audit_trades              jsonb            , -- auditTrades
  lj_roles                  jsonb              -- ljRoles
);
create index if not exists cifm_people_site_seq on public.cifm_people (site_id, seq);
create index if not exists cifmp_site_username on public.cifm_people (site_id, username);
create index if not exists cifmp_site_employee on public.cifm_people (site_id, employee_code);
create index if not exists cifmp_site_department on public.cifm_people (site_id, department_team);

-- Craftspeople: trade, shift, rates, skills, overrides
create table if not exists public.craftspeople (
  site_id                   text    not null ,
  seq                       bigint  not null , -- array order within the collection
  craftperson_id            text    not null , -- id (identity)
  data                      jsonb   not null , -- the complete record; guaranteed source for loads
  name                      text             , -- Name
  last_name                 text             , -- LastName
  trade                     text             , -- Trade
  username                  text             , -- username
  base_shift_type           text             , -- baseShiftType
  shift_start               text             , -- shiftStart
  shift_end                 text             , -- shiftEnd
  hourly_rate               numeric          , -- HourlyRate
  shift_hours               numeric          , -- ShiftHours
  skill_level               integer          , -- SkillLevel
  shift_overrides           jsonb            , -- shiftOverrides
  secondary_trade_ids       jsonb              -- secondaryTradeIds
);
create index if not exists craftspeople_site_seq on public.craftspeople (site_id, seq);
create index if not exists craftsp_site_trade on public.craftspeople (site_id, trade);
create index if not exists craftsp_site_username on public.craftspeople (site_id, username);

-- Craftsperson absences / approved leave / unavailable hours
create table if not exists public.craftperson_absences (
  site_id                   text    not null ,
  seq                       bigint  not null , -- array order within the collection
  absence_id                text    not null , -- id (identity)
  data                      jsonb   not null , -- the complete record; guaranteed source for loads
  craftperson_id            text             , -- craftpersonId
  absence_type              text             , -- absenceType
  start_date                text             , -- startDate
  end_date                  text             , -- endDate
  status                    text             , -- status
  notes                     text             , -- notes
  start_time                text             , -- startTime
  end_time                  text             , -- endTime
  is_full_day               boolean          , -- isFullDay
  unavailable_hours_per_day numeric            -- unavailableHoursPerDay
);
create index if not exists craftperson_absences_site_seq on public.craftperson_absences (site_id, seq);
create index if not exists absence_site_craftperson on public.craftperson_absences (site_id, craftperson_id);
create index if not exists absence_site_start on public.craftperson_absences (site_id, start_date);

-- RBAC role catalogue with permission objects
create table if not exists public.role_definitions (
  site_id                   text    not null ,
  seq                       bigint  not null , -- array order within the collection
  role_id                   text    not null , -- id (identity)
  data                      jsonb   not null , -- the complete record; guaranteed source for loads
  name                      text             , -- name
  description               text             , -- description
  badge_color               text             , -- badgeColor
  base_role_type            text             , -- baseRoleType
  permissions               jsonb              -- permissions
);
create index if not exists role_definitions_site_seq on public.role_definitions (site_id, seq);
create index if not exists roledef_site_base_type on public.role_definitions (site_id, base_role_type);

-- Per-person role assignments by trade and site (PersonName is NOT unique across sites, so AssignmentId is the key)
create table if not exists public.site_role_assignments (
  site_id                   text    not null ,
  seq                       bigint  not null , -- array order within the collection
  assignment_id             text    not null , -- AssignmentId (identity)
  data                      jsonb   not null , -- the complete record; guaranteed source for loads
  trade                     text             , -- Trade
  role_code                 text             , -- RoleCode
  person_name               text             , -- PersonName
  assignment_level          text             , -- AssignmentLevel
  receive_notifications     boolean            -- ReceiveNotifications
);
create index if not exists site_role_assignments_site_seq on public.site_role_assignments (site_id, seq);
create index if not exists sra_site_role_code on public.site_role_assignments (site_id, role_code);
create index if not exists sra_site_trade on public.site_role_assignments (site_id, trade);
create index if not exists sra_site_person on public.site_role_assignments (site_id, person_name);

-- One row per site: the role-to-user mapping object
create table if not exists public.site_role_mappings (
  site_id                   text    not null ,
  seq                       bigint  not null , -- array order within the collection
  data                      jsonb   not null , -- the complete record; guaranteed source for loads
  assignments               jsonb              -- assignments
);
create index if not exists site_role_mappings_site_seq on public.site_role_mappings (site_id, seq);

-- Role-to-user mapping per trade, one row per site+trade
create table if not exists public.trade_role_mappings (
  site_id                   text    not null ,
  seq                       bigint  not null , -- array order within the collection
  trade                     text    not null , -- Trade (identity)
  data                      jsonb   not null , -- the complete record; guaranteed source for loads
  assignments               jsonb              -- assignments
);
create index if not exists trade_role_mappings_site_seq on public.trade_role_mappings (site_id, seq);

-- Stakeholder teams: notification lead times, contact, approval requirements
create table if not exists public.stakeholder_teams (
  site_id                   text    not null ,
  seq                       bigint  not null , -- array order within the collection
  team_id                   text    not null , -- id (identity)
  data                      jsonb   not null , -- the complete record; guaranteed source for loads
  code                      text             , -- code
  name                      text             , -- name
  color                     text             , -- color
  contact_info              text             , -- contactInfo
  description               text             , -- description
  default_lead_days         integer          , -- defaultLeadDays
  requires_approval         boolean          , -- requiresApproval
  active                    boolean          , -- active
  updated_at                text               -- updatedAt
);
create index if not exists stakeholder_teams_site_seq on public.stakeholder_teams (site_id, seq);
create index if not exists team_site_code on public.stakeholder_teams (site_id, code);
create index if not exists team_site_active on public.stakeholder_teams (site_id, active);

-- Staff onboarding funnel: track mix, approvals, capacity, completion
create table if not exists public.onboarding_requests (
  site_id                   text    not null ,
  seq                       bigint  not null , -- array order within the collection
  request_id                text    not null , -- id (identity)
  data                      jsonb   not null , -- the complete record; guaranteed source for loads
  track                     text             , -- track
  full_name                 text             , -- fullName
  email                     text             , -- email
  phone                     text             , -- phone
  employee_code             text             , -- employeeCode
  organization              text             , -- organization
  department_team           text             , -- departmentTeam
  stationed_site_id         text             , -- stationedSiteId
  stationed_building_id     text             , -- stationedBuildingId
  stationed_floor_id        text             , -- stationedFloorId
  stationed_room_id         text             , -- stationedRoomId
  start_date                text             , -- startDate
  submitted_by              text             , -- submittedBy
  submitted_at              text             , -- submittedAt
  notes                     text             , -- notes
  status                    text             , -- status
  fm_system_role            text             , -- fmSystemRole
  primary_trade             text             , -- primaryTrade
  assigned_team_leader_id   text             , -- assignedTeamLeaderId
  completed_at              text             , -- completedAt
  completed_person_id       text             , -- completedPersonId
  weekly_hours_capacity     numeric          , -- weeklyHoursCapacity
  allowed_trades            jsonb            , -- allowedTrades
  assigned_site_ids         jsonb            , -- assignedSiteIds
  team_leader_approval      jsonb            , -- teamLeaderApproval
  site_admin_approval       jsonb            , -- siteAdminApproval
  hr_approval               jsonb              -- hrApproval
);
create index if not exists onboarding_requests_site_seq on public.onboarding_requests (site_id, seq);
create index if not exists onb_site_status on public.onboarding_requests (site_id, status);
create index if not exists onb_site_track on public.onboarding_requests (site_id, track);
create index if not exists onb_site_email on public.onboarding_requests (site_id, email);

alter table public.users enable row level security;
alter table public.user_access_profiles enable row level security;
alter table public.cifm_people enable row level security;
alter table public.craftspeople enable row level security;
alter table public.craftperson_absences enable row level security;
alter table public.role_definitions enable row level security;
alter table public.site_role_assignments enable row level security;
alter table public.site_role_mappings enable row level security;
alter table public.trade_role_mappings enable row level security;
alter table public.stakeholder_teams enable row level security;
alter table public.onboarding_requests enable row level security;
-- RLS stays on with no policies: only the service role key used by the server
-- can read and write, exactly like the other CAFM record tables.

-- 2) Single source of truth for extracting a record into typed columns.
--    Field order matches the table column order above.

create or replace function public.cafm_user_row(p_site text, p_seq bigint, b jsonb)
returns public.users
language sql
stable
as $user$
  select p_site, p_seq, b->>'UserId', b,
         b->>'DisplayName',
         b->>'SystemRole',
         coalesce(b->'LJRoles', '[]'::jsonb),
         coalesce(b->'Trades', '[]'::jsonb),
         nullif(b->>'CanAccessAll', '')::boolean,
         coalesce(b->'AssignedSiteIds', '[]'::jsonb)
$user$;

create or replace function public.cafm_uap_row(p_site text, p_seq bigint, b jsonb)
returns public.user_access_profiles
language sql
stable
as $uap$
  select p_site, p_seq, b->>'id', b,
         b->>'personName',
         b->>'fullName',
         b->>'primaryRole',
         b->>'email',
         b->>'username',
         b->>'phone',
         b->>'department',
         nullif(b->>'isHelpdesk', '')::boolean,
         nullif(b->>'isHrAdmin', '')::boolean,
         nullif(b->>'isTeamLeader', '')::boolean,
         nullif(b->>'isCraftperson', '')::boolean,
         nullif(b->>'isQAInspector', '')::boolean,
         nullif(b->>'isSiteAdmin', '')::boolean,
         nullif(b->>'isSuperAdmin', '')::boolean,
         coalesce(b->'siteAccess', '[]'::jsonb),
         coalesce(b->'managedSiteIds', '[]'::jsonb),
         coalesce(b->'vpaTrades', '[]'::jsonb),
         coalesce(b->'vpaBuildingIds', '[]'::jsonb),
         coalesce(b->'assignedRoleIds', '[]'::jsonb),
         coalesce(b->'permissions', '{}'::jsonb),
         b->>'linkedCraftpersonId'
$uap$;

create or replace function public.cafm_cifmp_row(p_site text, p_seq bigint, b jsonb)
returns public.cifm_people
language sql
stable
as $cifmp$
  select p_site, p_seq, b->>'id', b,
         b->>'employeeCode',
         b->>'displayName',
         b->>'email',
         b->>'phone',
         b->>'departmentTeam',
         b->>'stationedSiteId',
         b->>'stationedBuildingId',
         b->>'stationedFloorId',
         b->>'stationedRoomId',
         nullif(b->>'isFmStaff', '')::boolean,
         b->>'username',
         b->>'systemRole',
         coalesce(b->'assignedSiteIds', '[]'::jsonb),
         coalesce(b->'siteAdminSiteIds', '[]'::jsonb),
         coalesce(b->'tradeAccess', '[]'::jsonb),
         coalesce(b->'auditTrades', '[]'::jsonb),
         coalesce(b->'ljRoles', '[]'::jsonb)
$cifmp$;

create or replace function public.cafm_craftsp_row(p_site text, p_seq bigint, b jsonb)
returns public.craftspeople
language sql
stable
as $craftsp$
  select p_site, p_seq, b->>'id', b,
         b->>'Name',
         b->>'LastName',
         b->>'Trade',
         b->>'username',
         b->>'baseShiftType',
         b->>'shiftStart',
         b->>'shiftEnd',
         nullif(b->>'HourlyRate', '')::numeric,
         nullif(b->>'ShiftHours', '')::numeric,
         nullif(b->>'SkillLevel', '')::integer,
         coalesce(b->'shiftOverrides', '{}'::jsonb),
         coalesce(b->'secondaryTradeIds', '[]'::jsonb)
$craftsp$;

create or replace function public.cafm_absence_row(p_site text, p_seq bigint, b jsonb)
returns public.craftperson_absences
language sql
stable
as $absence$
  select p_site, p_seq, b->>'id', b,
         b->>'craftpersonId',
         b->>'absenceType',
         b->>'startDate',
         b->>'endDate',
         b->>'status',
         b->>'notes',
         b->>'startTime',
         b->>'endTime',
         nullif(b->>'isFullDay', '')::boolean,
         nullif(b->>'unavailableHoursPerDay', '')::numeric
$absence$;

create or replace function public.cafm_roledef_row(p_site text, p_seq bigint, b jsonb)
returns public.role_definitions
language sql
stable
as $roledef$
  select p_site, p_seq, b->>'id', b,
         b->>'name',
         b->>'description',
         b->>'badgeColor',
         b->>'baseRoleType',
         coalesce(b->'permissions', '{}'::jsonb)
$roledef$;

create or replace function public.cafm_sra_row(p_site text, p_seq bigint, b jsonb)
returns public.site_role_assignments
language sql
stable
as $sra$
  select p_site, p_seq, b->>'AssignmentId', b,
         b->>'Trade',
         b->>'RoleCode',
         b->>'PersonName',
         b->>'AssignmentLevel',
         nullif(b->>'ReceiveNotifications', '')::boolean
$sra$;

create or replace function public.cafm_srm_row(p_site text, p_seq bigint, b jsonb)
returns public.site_role_mappings
language sql
stable
as $srm$
  select p_site, p_seq, b,
         coalesce(b->'assignments', '{}'::jsonb)
$srm$;

create or replace function public.cafm_trm_row(p_site text, p_seq bigint, b jsonb)
returns public.trade_role_mappings
language sql
stable
as $trm$
  select p_site, p_seq, b->>'Trade', b,
         coalesce(b->'assignments', '{}'::jsonb)
$trm$;

create or replace function public.cafm_team_row(p_site text, p_seq bigint, b jsonb)
returns public.stakeholder_teams
language sql
stable
as $team$
  select p_site, p_seq, b->>'id', b,
         b->>'code',
         b->>'name',
         b->>'color',
         b->>'contactInfo',
         b->>'description',
         nullif(b->>'defaultLeadDays', '')::integer,
         nullif(b->>'requiresApproval', '')::boolean,
         nullif(b->>'active', '')::boolean,
         b->>'updatedAt'
$team$;

create or replace function public.cafm_onboarding_row(p_site text, p_seq bigint, b jsonb)
returns public.onboarding_requests
language sql
stable
as $onboarding$
  select p_site, p_seq, b->>'id', b,
         b->>'track',
         b->>'fullName',
         b->>'email',
         b->>'phone',
         b->>'employeeCode',
         b->>'organization',
         b->>'departmentTeam',
         b->>'stationedSiteId',
         b->>'stationedBuildingId',
         b->>'stationedFloorId',
         b->>'stationedRoomId',
         b->>'startDate',
         b->>'submittedBy',
         b->>'submittedAt',
         b->>'notes',
         b->>'status',
         b->>'fmSystemRole',
         b->>'primaryTrade',
         b->>'assignedTeamLeaderId',
         b->>'completedAt',
         b->>'completedPersonId',
         nullif(b->>'weeklyHoursCapacity', '')::numeric,
         coalesce(b->'allowedTrades', '[]'::jsonb),
         coalesce(b->'assignedSiteIds', '[]'::jsonb),
         coalesce(b->'teamLeaderApproval', '{}'::jsonb),
         coalesce(b->'siteAdminApproval', '{}'::jsonb),
         coalesce(b->'hrApproval', '{}'::jsonb)
$onboarding$;

-- 3) Insert helpers used by saves and by the one-time data move below.

create or replace function public.cafm_user_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_user_s$
  with inserted as (
    insert into public.users
    select (public.cafm_user_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_user_s$;

create or replace function public.cafm_uap_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_uap_s$
  with inserted as (
    insert into public.user_access_profiles
    select (public.cafm_uap_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_uap_s$;

create or replace function public.cafm_cifmp_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_cifmp_s$
  with inserted as (
    insert into public.cifm_people
    select (public.cafm_cifmp_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_cifmp_s$;

create or replace function public.cafm_craftsp_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_craftsp_s$
  with inserted as (
    insert into public.craftspeople
    select (public.cafm_craftsp_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_craftsp_s$;

create or replace function public.cafm_absence_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_absence_s$
  with inserted as (
    insert into public.craftperson_absences
    select (public.cafm_absence_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_absence_s$;

create or replace function public.cafm_roledef_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_roledef_s$
  with inserted as (
    insert into public.role_definitions
    select (public.cafm_roledef_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_roledef_s$;

create or replace function public.cafm_sra_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_sra_s$
  with inserted as (
    insert into public.site_role_assignments
    select (public.cafm_sra_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_sra_s$;

create or replace function public.cafm_srm_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_srm_s$
  with inserted as (
    insert into public.site_role_mappings
    select (public.cafm_srm_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_srm_s$;

create or replace function public.cafm_trm_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_trm_s$
  with inserted as (
    insert into public.trade_role_mappings
    select (public.cafm_trm_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_trm_s$;

create or replace function public.cafm_team_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_team_s$
  with inserted as (
    insert into public.stakeholder_teams
    select (public.cafm_team_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_team_s$;

create or replace function public.cafm_onboarding_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_onboarding_s$
  with inserted as (
    insert into public.onboarding_requests
    select (public.cafm_onboarding_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_onboarding_s$;

-- 4) One-time data move: existing blob rows become record rows, then the blob rows
--    are removed.

insert into public.users
select (public.cafm_user_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'users';

insert into public.user_access_profiles
select (public.cafm_uap_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'userAccessProfiles';

insert into public.cifm_people
select (public.cafm_cifmp_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'cifmPeople';

insert into public.craftspeople
select (public.cafm_craftsp_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'craftspeople';

insert into public.craftperson_absences
select (public.cafm_absence_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'craftpersonAbsences';

insert into public.role_definitions
select (public.cafm_roledef_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'roleDefinitions';

insert into public.site_role_assignments
select (public.cafm_sra_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'siteRoleAssignments';

insert into public.site_role_mappings
select (public.cafm_srm_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'siteRoleMappings';

insert into public.trade_role_mappings
select (public.cafm_trm_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'tradeRoleMappings';

insert into public.stakeholder_teams
select (public.cafm_team_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'stakeholderTeams';

insert into public.onboarding_requests
select (public.cafm_onboarding_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'onboardingRequests';

delete from public.cafm_blocks_store where kind in ('users', 'userAccessProfiles', 'cifmPeople', 'craftspeople', 'craftpersonAbsences', 'roleDefinitions', 'siteRoleAssignments', 'siteRoleMappings', 'tradeRoleMappings', 'stakeholderTeams', 'onboardingRequests');


-- 5) The API view: now a 19-part union. All eighteen record kinds are driven by
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
;

-- 6) Grants (the V49 production lesson, baked in since): security_invoker views run
--    with the INVOKER's table grants and this project has no default privileges.
--    Skipped in vanilla local Postgres without Supabase roles.
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.cafm_blocks to service_role';
    execute 'grant select on public.users, public.user_access_profiles, public.cifm_people, public.craftspeople, public.craftperson_absences, public.role_definitions, public.site_role_assignments, public.site_role_mappings, public.trade_role_mappings, public.stakeholder_teams, public.onboarding_requests to service_role';
  end if;
end
$grant$;

-- 7) cafm_save_state: same signature and contract as V49-V51, now writing eighteen
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

  delete from cafm_blocks_store where site_id = p_site_id;
  insert into cafm_blocks_store (site_id, kind, payload)
  select p_site_id, key, value from jsonb_each(p_blocks)
  where key not in ('buildings', 'cifmPeople', 'craftpersonAbsences', 'craftspeople', 'deletedWorkRequests', 'desks', 'equipment', 'floors', 'onboardingRequests', 'roleDefinitions', 'rooms', 'siteRoleAssignments', 'siteRoleMappings', 'stakeholderTeams', 'tradeRoleMappings', 'userAccessProfiles', 'users', 'workRequests');
  insert into cafm_site_revision (site_id, revision)
  values (p_site_id, p_new_revision)
  on conflict (site_id) do update set revision = excluded.revision;
  return jsonb_build_object('revision', p_new_revision);
end
$save$;

-- 8) Legacy-blob migration path (fresh installs only; production is already on blocks):
--    repoint the V44 one-time migration at the store + all eighteen record tables.
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
    insert into cafm_blocks_store (site_id, kind, payload)
    select v_site, key, value from jsonb_each(coalesce(v_state -> 'state', '{}'::jsonb))
    where key not in ('buildings', 'cifmPeople', 'craftpersonAbsences', 'craftspeople', 'deletedWorkRequests', 'desks', 'equipment', 'floors', 'onboardingRequests', 'roleDefinitions', 'rooms', 'siteRoleAssignments', 'siteRoleMappings', 'stakeholderTeams', 'tradeRoleMappings', 'userAccessProfiles', 'users', 'workRequests');
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

select 'users' as table_name, count(*) as rows, pg_total_relation_size('public.users') as bytes_on_disk
from public.users
union all

select 'userAccessProfiles' as table_name, count(*) as rows, pg_total_relation_size('public.user_access_profiles') as bytes_on_disk
from public.user_access_profiles
union all

select 'cifmPeople' as table_name, count(*) as rows, pg_total_relation_size('public.cifm_people') as bytes_on_disk
from public.cifm_people
union all

select 'craftspeople' as table_name, count(*) as rows, pg_total_relation_size('public.craftspeople') as bytes_on_disk
from public.craftspeople
union all

select 'craftpersonAbsences' as table_name, count(*) as rows, pg_total_relation_size('public.craftperson_absences') as bytes_on_disk
from public.craftperson_absences
union all

select 'roleDefinitions' as table_name, count(*) as rows, pg_total_relation_size('public.role_definitions') as bytes_on_disk
from public.role_definitions
union all

select 'siteRoleAssignments' as table_name, count(*) as rows, pg_total_relation_size('public.site_role_assignments') as bytes_on_disk
from public.site_role_assignments
union all

select 'siteRoleMappings' as table_name, count(*) as rows, pg_total_relation_size('public.site_role_mappings') as bytes_on_disk
from public.site_role_mappings
union all

select 'tradeRoleMappings' as table_name, count(*) as rows, pg_total_relation_size('public.trade_role_mappings') as bytes_on_disk
from public.trade_role_mappings
union all

select 'stakeholderTeams' as table_name, count(*) as rows, pg_total_relation_size('public.stakeholder_teams') as bytes_on_disk
from public.stakeholder_teams
union all

select 'onboardingRequests' as table_name, count(*) as rows, pg_total_relation_size('public.onboarding_requests') as bytes_on_disk
from public.onboarding_requests
union all

select 'cafm_blocks_store', count(*), pg_total_relation_size('public.cafm_blocks_store')
from public.cafm_blocks_store
union all
select 'cafm_v55_backup', count(*), pg_total_relation_size('public.cafm_v55_backup')
from public.cafm_v55_backup;

-- 9b. Round-trip fidelity: the API view must reproduce the pre-migration payloads exactly.
with
  old as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_v55_backup group by site_id
  ),
  new as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_blocks
    where kind in ('users', 'userAccessProfiles', 'cifmPeople', 'craftspeople', 'craftpersonAbsences', 'roleDefinitions', 'siteRoleAssignments', 'siteRoleMappings', 'tradeRoleMappings', 'stakeholderTeams', 'onboardingRequests')
    group by site_id
  )
select o.site_id,
       o.state = n.state as state_identical,
       pg_column_size(o.state) as old_bytes,
       pg_column_size(n.state) as new_bytes
from old o join new n on n.site_id = o.site_id
order by o.site_id;

-- 9c. Kind census: one row per site+kind (27 store kinds + 18 record kinds = 45
--     distinct kinds for a fully migrated 02-ESOC):
select count(*) as kind_rows, count(distinct kind) as distinct_kinds
from public.cafm_blocks where site_id = '02-ESOC';

-- 9d. The classical-table feel: users and their access profiles side by side.
select u.user_id, u.display_name, u.system_role, u.can_access_all,
       up.primary_role, up.is_super_admin
from public.users u
left join public.user_access_profiles up
  on up.site_id = u.site_id and up.username = u.user_id
where u.site_id = '02-ESOC'
order by u.seq;

select person_id, employee_code, display_name, department_team, username, system_role,
       is_fm_staff, stationed_building_id
from public.cifm_people
where site_id = '02-ESOC'
order by seq
limit 25;

select craftperson_id, name, last_name, trade, username, base_shift_type,
       shift_start, shift_end, hourly_rate, shift_hours, skill_level
from public.craftspeople
where site_id = '02-ESOC'
order by seq;

-- 9e. The relational story, no jsonb gymnastics:
-- 9e-1. Every absence with its craftsperson as real columns.
select a.craftperson_id, c.name, c.last_name, c.trade,
       a.absence_type, a.start_date, a.end_date, a.status, a.unavailable_hours_per_day
from public.craftperson_absences a
join public.craftspeople c
  on c.site_id = a.site_id and c.craftperson_id = a.craftperson_id
where a.site_id = '02-ESOC'
order by a.start_date;

-- 9e-2. Access profiles linked to their craftsperson identity.
select p.person_name, p.primary_role, c.trade, c.username as craftsperson_username
from public.user_access_profiles p
join public.craftspeople c
  on c.site_id = p.site_id and c.craftperson_id = p.linked_craftperson_id
where p.site_id = '02-ESOC';

-- 9e-3. Onboarding funnel by status.
select status, count(*) as requests
from public.onboarding_requests
where site_id = '02-ESOC'
group by status
order by requests desc;

-- 9e-4. Role assignments per role code (the RBAC coverage story).
select role_code, count(*) as people
from public.site_role_assignments
where site_id = '02-ESOC'
group by role_code
order by people desc;

-- EMERGENCY ROLLBACK (V55 -> V54 layout). Only for a real emergency: writes made after
-- this migration live in the record tables, so the store is re-merged over the backup.
-- Post-migration record contents are NOT auto-merged back into blob rows by this
-- snippet; ask Vibe to help if a rollback is ever needed.
--   begin;
--   -- recreate the V51 8-part view from scripts/supabase-v51-location-tables.sql
--   -- (its section 5: the store row UNION plus workRequests/deletedWorkRequests/
--   -- equipment/rooms/buildings/floors/desks only);
--   drop function if exists public.cafm_save_state(text, bigint, bigint, jsonb);
--   drop function if exists public.cafm_migrate_v44();
--   -- restore V51's cafm_save_state/cafm_migrate_v44 bodies by re-running that
--   -- file's sections 7 and 8 (the V51 exclusion lists with only the seven kinds);
--   insert into public.cafm_blocks_store
--     select site_id, kind, payload from public.cafm_v55_backup
--   on conflict (site_id, kind) do update set payload = excluded.payload;
