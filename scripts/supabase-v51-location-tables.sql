-- V51 CAFM Database Stage C3: Location Trio (Buildings, Floors, Desks) as Proper Postgres Rows
-- Turns the buildings / floors / desks JSON-blob rows into real, typed,
-- one-row-per-record tables:
--   buildings one row per building (12 columns incl. data jsonb)
--   floors     one row per floor (10 columns incl. data jsonb)
--   desks      one row per extracted CAD desk (14 columns incl. data jsonb)
-- PREREQUISITE: scripts/supabase-v50-eq-rooms-tables.sql (Section 100) is applied:
-- cafm_blocks is the 5-part API view over cafm_blocks_store + the WR/equipment/
-- rooms record tables.
-- The application is deliberately untouched: the security_invoker VIEW cafm_blocks
-- keeps serving the exact same {site_id, kind, payload} rows to PostgREST, and
-- cafm_save_state keeps its exact contract (advisory lock, expected-revision check,
-- SQLSTATE 40001 conflict, full-site replacement, revision bump).
-- Natural keys: buildings PK (site_id, bl_id); floors PK (site_id, bl_id, level_name)
-- because FloorNumber alone is NOT unique per building in production data; desks PK
-- (site_id, desk_id) using the CAD extractor's id.
-- Grants: explicit service_role SELECT inside the file (the V49 lesson; no Supabase
-- default privileges exist on this project).
-- Safe to run twice (idempotent). One transaction = atomic cutover.
-- EMERGENCY ROLLBACK: see the bottom of this file.

begin;

-- 0) Pre-migration snapshot of the three kinds being moved: permanent rollback
--    source (RLS-blocked).
do $snapshot$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_blocks_store')
     and not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v51_backup') then
    create table public.cafm_v51_backup (like public.cafm_blocks_store including indexes);
    insert into public.cafm_v51_backup
    select * from public.cafm_blocks_store where kind in ('buildings', 'floors', 'desks');
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v51_backup') then
    alter table public.cafm_v51_backup enable row level security;
  end if;
end
$snapshot$;

-- 1) The record tables. Column order must match the field order returned by
--    cafm_building_row() / cafm_floor_row() / cafm_desk_row() further below.
create table if not exists public.buildings (
  site_id                text    not null,
  seq                    bigint  not null,  -- array order within the collection
  bl_id                  text    not null,
  data                   jsonb   not null,  -- the complete record; guaranteed source for loads
  name                   text,              -- Name
  address                text,              -- Address
  gps_latitude           numeric,           -- GPSCoordinates.latitude
  gps_longitude          numeric,           -- GPSCoordinates.longitude
  gps_elevation_meters   numeric,           -- GPSCoordinates.elevationMeters
  is_active              boolean,           -- IsActive
  created_at             text,              -- CreatedAt
  updated_at             text,              -- UpdatedAt
  primary key (site_id, bl_id)
);

create index if not exists buildings_site_seq    on public.buildings (site_id, seq);
create index if not exists buildings_site_active on public.buildings (site_id, is_active);

create table if not exists public.floors (
  site_id                text    not null,
  seq                    bigint  not null,
  bl_id                  text    not null,   -- bl_id (building)
  level_name             text    not null,   -- LevelName (floor identity)
  data                   jsonb   not null,
  floor_number           integer,            -- FloorNumber (not unique per building; display/ordering only)
  gross_area_m2          numeric,            -- GrossAreaM2
  floor_plan_url         text,               -- FloorPlanUrl
  floor_plan_format      text,               -- FloorPlanFormat (DWG/DXF/SVG/GEOJSON)
  is_active              boolean,            -- IsActive
  primary key (site_id, bl_id, level_name)
);

create index if not exists floors_site_seq      on public.floors (site_id, seq);
create index if not exists floors_site_building on public.floors (site_id, bl_id);

create table if not exists public.desks (
  site_id                text    not null,
  seq                    bigint  not null,
  desk_id                text    not null,   -- id (CAD extractor desk id)
  data                   jsonb   not null,
  name                   text,               -- name
  desk_type              text,               -- deskType
  bl_id                  text,               -- bl_id (building)
  level_name             text,               -- LevelName
  room_code              text,               -- RoomCode
  center_x               numeric,            -- centerX (CAD coordinates)
  center_y               numeric,            -- centerY
  width_m                numeric,            -- widthM
  height_m               numeric,            -- heightM
  is_permanent           boolean,            -- isPermanent
  primary key (site_id, desk_id)
);

create index if not exists desks_site_seq      on public.desks (site_id, seq);
create index if not exists desks_site_room     on public.desks (site_id, room_code);
create index if not exists desks_site_building on public.desks (site_id, bl_id);

alter table public.buildings enable row level security;
alter table public.floors     enable row level security;
alter table public.desks      enable row level security;
-- RLS stays on with no policies: only the service role key used by the server
-- can read and write, exactly like the other CAFM record tables.

-- 2) Single source of truth for extracting a record into typed columns.
--    Field order matches the table column order above.
create or replace function public.cafm_building_row(p_site text, p_seq bigint, b jsonb)
returns public.buildings
language sql
stable
as $brow$
  select p_site, p_seq, b->>'bl_id', b,
         b->>'Name', b->>'Address',
         nullif(b->'GPSCoordinates'->>'latitude', '')::numeric,
         nullif(b->'GPSCoordinates'->>'longitude', '')::numeric,
         nullif(b->'GPSCoordinates'->>'elevationMeters', '')::numeric,
         nullif(b->>'IsActive', '')::boolean,
         b->>'CreatedAt', b->>'UpdatedAt'
$brow$;

create or replace function public.cafm_floor_row(p_site text, p_seq bigint, f jsonb)
returns public.floors
language sql
stable
as $frow$
  select p_site, p_seq, f->>'bl_id', f->>'LevelName', f,
         nullif(f->>'FloorNumber', '')::integer,
         nullif(f->>'GrossAreaM2', '')::numeric,
         f->>'FloorPlanUrl', f->>'FloorPlanFormat',
         nullif(f->>'IsActive', '')::boolean
$frow$;

create or replace function public.cafm_desk_row(p_site text, p_seq bigint, d jsonb)
returns public.desks
language sql
stable
as $drow$
  select p_site, p_seq, d->>'id', d,
         d->>'name', d->>'deskType',
         d->>'bl_id', d->>'LevelName', d->>'RoomCode',
         nullif(d->>'centerX', '')::numeric, nullif(d->>'centerY', '')::numeric,
         nullif(d->>'widthM', '')::numeric, nullif(d->>'heightM', '')::numeric,
         nullif(d->>'isPermanent', '')::boolean
$drow$;

-- 3) Insert helpers used by saves and by the one-time data move below.
create or replace function public.cafm_building_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_b$
  with inserted as (
    insert into public.buildings
    select (public.cafm_building_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_b$;

create or replace function public.cafm_floor_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_f$
  with inserted as (
    insert into public.floors
    select (public.cafm_floor_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_f$;

create or replace function public.cafm_desk_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_d$
  with inserted as (
    insert into public.desks
    select (public.cafm_desk_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_d$;

-- 4) One-time data move: existing blob rows become record rows, then the blob rows
--    are removed.
insert into public.buildings
select (public.cafm_building_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'buildings';

insert into public.floors
select (public.cafm_floor_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'floors';

insert into public.desks
select (public.cafm_desk_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'desks';

delete from public.cafm_blocks_store where kind in ('buildings', 'floors', 'desks');

-- 5) The API view: now an 8-part union. All seven record kinds are driven by
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
  from public.cafm_site_revision r;

-- 6) Grants (the V49 production lesson, baked in since): security_invoker views run
--    with the INVOKER's table grants and this project has no default privileges.
--    Skipped in vanilla local Postgres without Supabase roles.
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.cafm_blocks to service_role';
    execute 'grant select on public.work_requests, public.deleted_work_requests to service_role';
    execute 'grant select on public.equipment, public.rooms to service_role';
    execute 'grant select on public.buildings, public.floors, public.desks to service_role';
  end if;
end
$grant$;

-- 7) cafm_save_state: same signature and contract as V49/V50, now writing seven
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
  delete from cafm_blocks_store where site_id = p_site_id;
  insert into cafm_blocks_store (site_id, kind, payload)
  select p_site_id, key, value from jsonb_each(p_blocks)
  where key not in ('workRequests', 'deletedWorkRequests', 'equipment', 'rooms',
                    'buildings', 'floors', 'desks');
  insert into cafm_site_revision (site_id, revision)
  values (p_site_id, p_new_revision)
  on conflict (site_id) do update set revision = excluded.revision;
  return jsonb_build_object('revision', p_new_revision);
end
$save$;

-- 8) Legacy-blob migration path (fresh installs only; production is already on blocks):
--    repoint the V44 one-time migration at the store + all seven record tables.
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
    insert into cafm_blocks_store (site_id, kind, payload)
    select v_site, key, value from jsonb_each(coalesce(v_state -> 'state', '{}'::jsonb))
    where key not in ('workRequests', 'deletedWorkRequests', 'equipment', 'rooms',
                      'buildings', 'floors', 'desks');
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
select 'buildings' as table_name, count(*) as rows, pg_total_relation_size('public.buildings') as bytes_on_disk
from public.buildings
union all
select 'floors', count(*), pg_total_relation_size('public.floors')
from public.floors
union all
select 'desks', count(*), pg_total_relation_size('public.desks')
from public.desks
union all
select 'cafm_blocks_store', count(*), pg_total_relation_size('public.cafm_blocks_store')
from public.cafm_blocks_store
union all
select 'cafm_v51_backup', count(*), pg_total_relation_size('public.cafm_v51_backup')
from public.cafm_v51_backup;

-- 9b. Round-trip fidelity: the API view must reproduce the pre-migration
--     buildings/floors/desks payloads exactly.
with
  old as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_v51_backup group by site_id
  ),
  new as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_blocks
    where kind in ('buildings', 'floors', 'desks')
    group by site_id
  )
select o.site_id,
       o.state = n.state as state_identical,
       pg_column_size(o.state) as old_bytes,
       pg_column_size(n.state) as new_bytes
from old o join new n on n.site_id = o.site_id
order by o.site_id;

-- 9c. Kind census: one row per site+kind (38 store kinds + 7 record kinds for 02-ESOC):
select count(*) as kind_rows, count(distinct kind) as distinct_kinds
from public.cafm_blocks where site_id = '02-ESOC';

-- 9d. The classical-table feel: the spatial hierarchy with real columns.
select bl_id, name, address, gps_latitude, gps_longitude, is_active
from public.buildings
where site_id = '02-ESOC'
order by seq;

select bl_id, level_name, floor_number, gross_area_m2, floor_plan_format, is_active
from public.floors
where site_id = '02-ESOC'
order by seq
limit 25;

select desk_id, name, desk_type, bl_id, level_name, room_code, is_permanent
from public.desks
where site_id = '02-ESOC'
order by seq
limit 25;

-- 9e. The relational story, no jsonb gymnastics: every room with its building and floor.
select r.room_code, r.name, r.level_name, f.floor_number, b.name as building, b.address
from public.rooms r
join public.floors f on f.site_id = r.site_id and f.bl_id = r.bl_id and f.level_name = r.level_name
join public.buildings b on b.site_id = r.site_id and b.bl_id = r.bl_id
where r.site_id = '02-ESOC'
order by r.seq
limit 10;

-- EMERGENCY ROLLBACK (V51 -> V50 layout). Only for a real emergency: writes made after
-- this migration live in cafm_blocks_store / the record tables, so the store is
-- re-merged over the backup. Post-migration buildings/floors/desks contents are NOT
-- auto-merged back into blob rows by this snippet; ask Vibe to help if a rollback is
-- ever needed.
--   begin;
--   -- recreate the V50 5-part view from scripts/supabase-v50-eq-rooms-tables.sql
--   -- (its section 5, the store row UNION plus workRequests/deletedWorkRequests/
--   -- equipment/rooms only);
--   drop function if exists public.cafm_save_state(text, bigint, bigint, jsonb);
--   drop function if exists public.cafm_migrate_v44();
--   -- restore V50's cafm_save_state/cafm_migrate_v44 bodies by re-running that
--   -- file's sections 7 and 8 (store exclusion list without buildings/floors/desks);
--   insert into public.cafm_blocks_store
--     select site_id, kind, payload from public.cafm_v51_backup
--   on conflict (site_id, kind) do update set payload = excluded.payload;
--   drop table if exists public.buildings;
--   drop table if exists public.floors;
--   drop table if exists public.desks;
--   drop function if exists public.cafm_building_row(text, bigint, jsonb);
--   drop function if exists public.cafm_floor_row(text, bigint, jsonb);
--   drop function if exists public.cafm_desk_row(text, bigint, jsonb);
--   drop function if exists public.cafm_building_store_rows(text, jsonb);
--   drop function if exists public.cafm_floor_store_rows(text, jsonb);
--   drop function if exists public.cafm_desk_store_rows(text, jsonb);
--   -- then re-grant select on public.cafm_blocks (view) to service_role when it exists.
--   commit;
