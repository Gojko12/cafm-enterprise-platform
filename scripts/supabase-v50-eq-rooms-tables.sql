-- V50 CAFM Database Stage C2: Equipment and Rooms as Proper Postgres Rows
-- Turns the equipment / rooms JSON-blob rows into real, typed, one-row-per-record
-- tables:
--   equipment one row per equipment record (43 columns incl. data jsonb)
--   rooms     one row per room record (16 columns incl. data jsonb)
-- PREREQUISITE: scripts/supabase-v49-wr-tables.sql (Section 99) is already applied,
-- i.e. cafm_blocks is the API view over cafm_blocks_store + the WR record tables.
-- The application is deliberately untouched (route.ts, mobile V35, delta sync, V48
-- conditional GET all keep working): the security_invoker VIEW cafm_blocks keeps
-- serving the exact same {site_id, kind, payload} rows to PostgREST, and
-- cafm_save_state keeps its exact contract (advisory lock, expected-revision check,
-- SQLSTATE 40001 conflict, full-site replacement, revision bump).
-- Grants: this project manages grants EXPLICITLY (no Supabase default privileges,
-- the V49 production incident on 20-11-2026). The grant block near the bottom gives
-- service_role SELECT on the new record tables; without it every API read fails.
-- Safe to run twice (idempotent). One transaction = atomic cutover.
-- EMERGENCY ROLLBACK: see the bottom of this file.

begin;

-- 0) Pre-migration snapshot of the two kinds being moved: kept as a permanent
--    rollback source (RLS-blocked). Only the backup of the kinds that still live in
--    the store is needed; work requests already have cafm_v49_backup.
do $snapshot$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_blocks_store')
     and not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v50_backup') then
    create table public.cafm_v50_backup (like public.cafm_blocks_store including indexes);
    insert into public.cafm_v50_backup
    select * from public.cafm_blocks_store where kind in ('equipment', 'rooms');
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v50_backup') then
    alter table public.cafm_v50_backup enable row level security;
  end if;
end
$snapshot$;

-- 1) The record tables. Column order must match the field order returned by
--    cafm_eq_row() / cafm_room_row() further below.
create table if not exists public.equipment (
  site_id                     text    not null,
  seq                         bigint  not null,  -- array order within the collection
  equipment_code              text    not null,  -- EquipmentCode
  data                        jsonb   not null,  -- the complete record; guaranteed source for loads
  equipment_name              text,              -- EquipmentName
  equipment_name_local        text,              -- EquipmentNameLocal
  local_equipment_code        text,              -- LocalEquipmentCode
  category                    text,              -- Category (A..Q)
  hierarchy_level             text,              -- HierarchyLevel
  status                      text,              -- Status
  is_installation             boolean,           -- IsInstallation
  criticality                 text,               -- Criticality
  manufacturer                text,              -- Manufacturer
  model                       text,              -- Model
  serial_number               text,              -- SerialNumber
  manufacturer_article_id    text,              -- ManufacturerArticleId
  replacement_cost_eur       numeric,           -- ReplacementCostEur
  length_cm                   numeric,          -- LengthCm
  width_cm                    numeric,           -- WidthCm
  height_cm                   numeric,           -- HeightCm
  weight_kg                   numeric,           -- WeightKg
  primary_trade_id            text,              -- PrimaryTradeId
  parent_equipment_code       text,              -- ParentEquipmentCode
  bl_id                       text,              -- bl_id (building)
  level_name                  text,              -- LevelName
  room_code                   text,              -- RoomCode
  installation_date           text,              -- InstallationDate
  warranty_expiry_date        text,              -- WarrantyExpiryDate
  documentation_url           text,              -- DocumentationUrl
  equipment_standard_id       text,              -- EquipmentStandardId
  equipment_standard_description text,           -- EquipmentStandardDescription
  equipment_use_english       text,              -- EquipmentUseEnglish
  qr_code_url                 text,              -- QRCodeUrl
  technical_specifications    jsonb,             -- TechnicalSpecifications (object)
  activity                    jsonb,             -- Activity (comments/logs array)
  documents                   jsonb,             -- Documents (attachments array)
  bim_global_id               text,              -- bimGlobalId
  bim_express_id              bigint,            -- bimExpressId (web-ifc expressID lookup)
  bim_building_id             text,              -- bimBuildingId
  bim_category                text,              -- bimCategory
  bim_type_name               text,              -- bimTypeName
  created_at                  text,              -- CreatedAt
  updated_at                  text,              -- UpdatedAt
  primary key (site_id, equipment_code)
);

create index if not exists equipment_site_seq      on public.equipment (site_id, seq);
create index if not exists equipment_site_status   on public.equipment (site_id, status);
create index if not exists equipment_site_location on public.equipment (site_id, bl_id, room_code);
create index if not exists equipment_site_trade    on public.equipment (site_id, primary_trade_id);
create index if not exists equipment_site_category on public.equipment (site_id, category);
create index if not exists equipment_site_critical on public.equipment (site_id, criticality);
create index if not exists equipment_site_parent   on public.equipment (site_id, parent_equipment_code);
create index if not exists equipment_site_bim      on public.equipment (site_id, bim_express_id);

create table if not exists public.rooms (
  site_id                     text    not null,
  seq                         bigint  not null,
  room_code                   text    not null,   -- RoomCode
  data                        jsonb   not null,
  name                        text,              -- Name
  room_category               text,              -- RoomCategory
  usage                       text,              -- Usage
  department                  text,              -- Department
  cost_center                 text,              -- CostCenter
  net_area_m2                 numeric,           -- NetAreaM2
  bl_id                       text,              -- bl_id (building)
  level_name                  text,              -- LevelName
  polygon                     jsonb,             -- Polygon (GeoJSON object)
  polygon_source              text,               -- PolygonSource
  is_desk_reservable          boolean,           -- IsDeskReservable
  is_active                   boolean,           -- IsActive
  primary key (site_id, room_code)
);

create index if not exists rooms_site_seq   on public.rooms (site_id, seq);
create index if not exists rooms_site_floor on public.rooms (site_id, bl_id, level_name);
create index if not exists rooms_site_active on public.rooms (site_id, is_active);

alter table public.equipment enable row level security;
alter table public.rooms     enable row level security;
-- RLS stays on with no policies: only the service role key used by the server
-- can read and write, exactly like the other CAFM tables.

-- 2) Single source of truth for extracting a record into typed columns.
--    Field order matches the table column order above.
create or replace function public.cafm_eq_row(p_site text, p_seq bigint, e jsonb)
returns public.equipment
language sql
stable
as $eqrow$
  select p_site, p_seq, e->>'EquipmentCode', e,
         e->>'EquipmentName', e->>'EquipmentNameLocal', e->>'LocalEquipmentCode',
         e->>'Category', e->>'HierarchyLevel', e->>'Status',
         nullif(e->>'IsInstallation', '')::boolean,
         e->>'Criticality',
         e->>'Manufacturer', e->>'Model', e->>'SerialNumber', e->>'ManufacturerArticleId',
         nullif(e->>'ReplacementCostEur', '')::numeric,
         nullif(e->>'LengthCm', '')::numeric,
         nullif(e->>'WidthCm', '')::numeric,
         nullif(e->>'HeightCm', '')::numeric,
         nullif(e->>'WeightKg', '')::numeric,
         e->>'PrimaryTradeId', e->>'ParentEquipmentCode',
         e->>'bl_id', e->>'LevelName', e->>'RoomCode',
         e->>'InstallationDate', e->>'WarrantyExpiryDate',
         e->>'DocumentationUrl',
         e->>'EquipmentStandardId', e->>'EquipmentStandardDescription',
         e->>'EquipmentUseEnglish', e->>'QRCodeUrl',
         case when jsonb_typeof(e->'TechnicalSpecifications') = 'object' then e->'TechnicalSpecifications' end,
         case when jsonb_typeof(e->'Activity') = 'array'                then e->'Activity' end,
         case when jsonb_typeof(e->'Documents') = 'array'               then e->'Documents' end,
         e->>'bimGlobalId', nullif(e->>'bimExpressId', '')::bigint,
         e->>'bimBuildingId', e->>'bimCategory', e->>'bimTypeName',
         e->>'CreatedAt', e->>'UpdatedAt'
$eqrow$;

create or replace function public.cafm_room_row(p_site text, p_seq bigint, r jsonb)
returns public.rooms
language sql
stable
as $roomrow$
  select p_site, p_seq, r->>'RoomCode', r,
         r->>'Name', r->>'RoomCategory', r->>'Usage', r->>'Department', r->>'CostCenter',
         nullif(r->>'NetAreaM2', '')::numeric,
         r->>'bl_id', r->>'LevelName',
         case when jsonb_typeof(r->'Polygon') = 'object' then r->'Polygon' end,
         r->>'PolygonSource',
         nullif(r->>'IsDeskReservable', '')::boolean,
         nullif(r->>'IsActive', '')::boolean
$roomrow$;

-- 3) Insert helpers used by saves and by the one-time data move below.
create or replace function public.cafm_eq_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_eq$
  with inserted as (
    insert into public.equipment
    select (public.cafm_eq_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_eq$;

create or replace function public.cafm_room_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_room$
  with inserted as (
    insert into public.rooms
    select (public.cafm_room_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_room$;

-- 4) One-time data move: existing blob rows become record rows, then the blob rows
--    are removed.
insert into public.equipment
select (public.cafm_eq_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'equipment';

insert into public.rooms
select (public.cafm_room_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'rooms';

delete from public.cafm_blocks_store where kind in ('equipment', 'rooms');

-- 5) The API view: same three columns PostgREST has always served, now assembled from
--    the store table and the four record tables. All four record kinds are driven by
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
  from public.cafm_site_revision r;

-- 6) Grants, the hard-won V49 lesson (20-11-2026 production incident): security_invoker
--    views execute with the INVOKER's table-level grants, and this project has NO
--    default privileges, so every new underlying table needs an explicit service_role
--    SELECT grant or every API read fails instantly. Skipped in vanilla local Postgres.
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.cafm_blocks to service_role';
    execute 'grant select on public.work_requests, public.deleted_work_requests to service_role';
    execute 'grant select on public.equipment, public.rooms to service_role';
  end if;
end
$grant$;

-- 7) cafm_save_state: same signature and contract as V44/V49, but the two equipment
--    kinds are now also written as record rows instead of whole-collection blobs.
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
  delete from cafm_blocks_store where site_id = p_site_id;
  insert into cafm_blocks_store (site_id, kind, payload)
  select p_site_id, key, value from jsonb_each(p_blocks)
  where key not in ('workRequests', 'deletedWorkRequests', 'equipment', 'rooms');
  insert into cafm_site_revision (site_id, revision)
  values (p_site_id, p_new_revision)
  on conflict (site_id) do update set revision = excluded.revision;
  return jsonb_build_object('revision', p_new_revision);
end
$save$;

-- 8) Legacy-blob migration path (fresh installs only; production is already on blocks):
--    repoint the V44 one-time migration at the store + all four record tables.
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
    insert into cafm_blocks_store (site_id, kind, payload)
    select v_site, key, value from jsonb_each(coalesce(v_state -> 'state', '{}'::jsonb))
    where key not in ('workRequests', 'deletedWorkRequests', 'equipment', 'rooms');
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
select 'equipment' as table_name, count(*) as rows, pg_total_relation_size('public.equipment') as bytes_on_disk
from public.equipment
union all
select 'rooms', count(*), pg_total_relation_size('public.rooms')
from public.rooms
union all
select 'cafm_blocks_store', count(*), pg_total_relation_size('public.cafm_blocks_store')
from public.cafm_blocks_store
union all
select 'cafm_v50_backup', count(*), pg_total_relation_size('public.cafm_v50_backup')
from public.cafm_v50_backup;

-- 9b. Round-trip fidelity: the API view must reproduce the pre-migration
--     equipment/rooms payloads exactly.
with
  old as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_v50_backup group by site_id
  ),
  new as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_blocks
    where kind in ('equipment', 'rooms')
    group by site_id
  )
select o.site_id,
       o.state = n.state as state_identical,
       pg_column_size(o.state) as old_bytes,
       pg_column_size(n.state) as new_bytes
from old o join new n on n.site_id = o.site_id
order by o.site_id;

-- 9c. Kind census: one row per site+kind (0 duplicate rows expected before this
--     query would reveal them), 41 store kinds + 4 record kinds for 02-ESOC:
select count(*) as kind_rows, count(distinct kind) as distinct_kinds
from public.cafm_blocks where site_id = '02-ESOC';

-- 9d. The classical-table feel: query equipment and rooms with plain column filters.
select equipment_code, equipment_name, category, status, criticality,
       primary_trade_id, bl_id, level_name, room_code, manufacturer, model
from public.equipment
where site_id = '02-ESOC'
order by seq
limit 25;

select room_code, name, room_category, usage, department, cost_center,
       net_area_m2, bl_id, level_name, is_desk_reservable, is_active
from public.rooms
where site_id = '02-ESOC'
order by seq
limit 25;

-- EMERGENCY ROLLBACK (V50 -> V49 layout). Only for a real emergency: writes made after
-- this migration live in cafm_blocks_store / the record tables, so the store is
-- re-merged over the backups. Post-migration equipment/room contents are NOT
-- auto-merged back into blob rows by this snippet; ask Vibe to help if a rollback is
-- ever needed.
--   begin;
--   create or replace view public.cafm_blocks with (security_invoker = true) as
--     select site_id, kind, payload
--     from public.cafm_blocks_store
--     union all
--     select r.site_id, 'workRequests',
--            coalesce((select jsonb_agg(w.data order by w.seq)
--                      from public.work_requests w
--                      where w.site_id = r.site_id), '[]'::jsonb)
--     from public.cafm_site_revision r
--     union all
--     select r.site_id, 'deletedWorkRequests',
--            coalesce((select jsonb_agg(w.data order by w.seq)
--                      from public.deleted_work_requests w
--                      where w.site_id = r.site_id), '[]'::jsonb)
--     from public.cafm_site_revision r;
--   drop function if exists public.cafm_save_state(text, bigint, bigint, jsonb);
--   drop function if exists public.cafm_migrate_v44();
--   -- restore V49's cafm_save_state/cafm_migrate_v44 bodies from
--   -- scripts/supabase-v49-wr-tables.sql (sections 7 and 8 there),
--   -- then re-run that file's view + cafm_save_state definitions.
--   insert into public.cafm_blocks_store
--     select site_id, kind, payload from public.cafm_v50_backup
--   on conflict (site_id, kind) do update set payload = excluded.payload;
--   drop table if exists public.equipment;
--   drop table if exists public.rooms;
--   drop function if exists public.cafm_eq_row(text, bigint, jsonb);
--   drop function if exists public.cafm_room_row(text, bigint, jsonb);
--   drop function if exists public.cafm_eq_store_rows(text, jsonb);
--   drop function if exists public.cafm_room_store_rows(text, jsonb);
--   double-check: re-grant select on public.cafm_blocks, public.work_requests,
--   --              public.deleted_work_requests to service_role when it exists.
--   commit;
