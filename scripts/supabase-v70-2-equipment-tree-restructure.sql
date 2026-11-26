-- ============================================================================
-- V70.2 addendum to Section 120 (pairs with the V73 Section 123 app change):
-- restructure the seeded equipment trees in the live database.
--
-- WHAT THIS DOES
--   The old demo seed created every system as a generic trio
--   "<System> Installation / <System> SubEquipment / <System> Component",
--   which produced rows like "Diesel Generator SubEquipment" with local codes
--   like S01-BL-111_GEN1_GEN1. This script replaces that structure with the
--   domain-correct kits the V73 seed now generates, e.g. for the generator:
--     Diesel Generator   S01-BL-111_GEN1        (renamed, "Installation" dropped)
--       Gas pump         S01-BL-111_GEN1_PUMP   (old SubEquipment row, renamed)
--         Gas meter      S01-BL-111_GEN1_PUMP_MET
--         Gas filter     S01-BL-111_GEN1_PUMP_FIL
--       Cooling          S01-BL-111_GEN1_COOL
--         Thermometer    S01-BL-111_GEN1_COOL_TEMP
--       Oil pump         S01-BL-111_GEN1_OPUMP
--         Oil filter     S01-BL-111_GEN1_OPUMP_FIL
--   - Every recognised installation is renamed (the "Installation" suffix is
--     dropped) and gets a [building]_[TYPE][seq] local code.
--   - Its existing subequipment / component rows are renamed and re-pointed
--     onto the kit slots, keeping their EquipmentCode, Status, Manufacturer
--     and activity history, so work requests keep resolving.
--   - Missing kit rows are INSERTED with fresh fully-numeric codes.
--   - Installations the pattern table does not recognise, and installations
--     that already carry a hand-built subtree of more than 3 rows, are left
--     completely untouched.
--   - NOTHING is deleted anywhere; EquipmentCode values never change.
--
-- IMPORTANT
--   - Safe to run twice: deterministic ordering regenerates the same names
--     and codes; already-complete kits are recognised and skipped.
--   - Pure data update: no schema, app or permission change. Deploy V73
--     first, then paste this WHOLE file into the Supabase SQL editor and Run.
--   - The kit contents mirror apps/web-portal/lib/section20-seed.ts exactly.
-- ============================================================================

begin;

do $kits$
declare
  v_inst      record;
  v_slot      record;
  v_site      record;
  v_inst_seq  int;
  v_inst_code text;
  v_cat       text;
  v_trade     text;
  v_bl        text;
  v_level_name text;
  v_room      text;
  v_new_code  text;
  v_new_num   bigint;
  v_seq       bigint;
  v_json      jsonb;
  v_lec       text;
  v_parent_code text;
  v_parent_lec text;
  v_level     text;
begin
  -- 0) Guards: the V50 record-table layout must be live and no legacy
  --    equipment blobs may still sit in the store.
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'equipment') then
    raise exception 'public.equipment not found: apply scripts/supabase-v50-eq-rooms-tables.sql first.';
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_blocks_store')
     and exists (select 1 from public.cafm_blocks_store where kind = 'equipment') then
    raise exception 'Legacy equipment blobs still live in cafm_blocks_store: apply the V50 migration first.';
  end if;

  -- 1) The kit catalogue. SUB slots list the subequipment of the
  --    installation, COMP slots the components of a SUB slot (parent_ord).
  --    Order inside a kit is significant: the first SUB and first COMP slot
  --    reuse the old generic rows. Mirrors section20-seed.ts systemKits.
  create temp table kit_def (ord int, type_key text, level text, parent_ord int, name text, abbr text) on commit drop;
  insert into kit_def (ord, type_key, level, parent_ord, name, abbr) values
    -- CHIL: Chiller
    ( 1, 'CHIL', 'SUB', null, 'Compressor',         'COMP'),
    ( 2, 'CHIL', 'COMP', 1,    'Oil filter',         'OILF'),
    ( 3, 'CHIL', 'SUB', null, 'Condenser',           'COND'),
    ( 4, 'CHIL', 'COMP', 3,    'Condenser fan',      'FAN'),
    ( 5, 'CHIL', 'SUB', null, 'Evaporator',          'EVAP'),
    ( 6, 'CHIL', 'COMP', 5,    'Refrigerant filter', 'FILT'),
    ( 7, 'CHIL', 'SUB', null, 'Chilled water pump', 'CHWP'),
    ( 8, 'CHIL', 'COMP', 7,    'Flow meter',         'MET'),
    -- GEN: Diesel Generator
    ( 9, 'GEN', 'SUB', null, 'Gas pump',            'PUMP'),
    (10, 'GEN', 'COMP', 9,    'Gas meter',          'MET'),
    (11, 'GEN', 'COMP', 9,    'Gas filter',        'FIL'),
    (12, 'GEN', 'SUB', null, 'Cooling',             'COOL'),
    (13, 'GEN', 'COMP', 12,   'Thermometer',        'TEMP'),
    (14, 'GEN', 'SUB', null, 'Oil pump',            'OPUMP'),
    (15, 'GEN', 'COMP', 14,   'Oil filter',        'FIL'),
    -- UPS: UPS System
    (16, 'UPS', 'SUB', null, 'Battery bank',        'BATT'),
    (17, 'UPS', 'COMP', 16,   'Battery monitor',    'MON'),
    (18, 'UPS', 'SUB', null, 'Inverter',            'INV'),
    (19, 'UPS', 'COMP', 18,   'Cooling fan',        'FAN'),
    (20, 'UPS', 'SUB', null, 'Static bypass',      'BYP'),
    -- FDMP: Fire Damper
    (21, 'FDMP', 'SUB', null, 'Actuator',           'ACT'),
    (22, 'FDMP', 'COMP', 21,  'Position sensor',    'SENS'),
    (23, 'FDMP', 'SUB', null, 'Blade set',          'BLAD'),
    -- AHU: Cleanroom AHU
    (24, 'AHU', 'SUB', null, 'Supply fan',          'SFAN'),
    (25, 'AHU', 'COMP', 24,   'Vibration sensor',   'VIB'),
    (26, 'AHU', 'SUB', null, 'Filter stage',        'FILT'),
    (27, 'AHU', 'COMP', 26,   'Pre-filter',         'PRE'),
    (28, 'AHU', 'COMP', 26,   'Final filter',       'FIN'),
    (29, 'AHU', 'SUB', null, 'Heating coil',        'HEAT'),
    (30, 'AHU', 'COMP', 29,   'Control valve',      'VALV'),
    (31, 'AHU', 'SUB', null, 'Cooling coil',       'CCOIL'),
    (32, 'AHU', 'COMP', 31,   'Temperature sensor', 'TEMP'),
    -- RDRN: Roof Drain
    (33, 'RDRN', 'SUB', null, 'Drain grate',        'GRAT'),
    (34, 'RDRN', 'SUB', null, 'Downpipe',           'DPIP'),
    (35, 'RDRN', 'COMP', 34,  'Leaf filter',        'FIL'),
    -- CRAN: Heavy Crane
    (36, 'CRAN', 'SUB', null, 'Hoist winch',        'HOIST'),
    (37, 'CRAN', 'COMP', 36,  'Brake',              'BRK'),
    (38, 'CRAN', 'SUB', null, 'Trolley drive',      'TROL'),
    (39, 'CRAN', 'COMP', 38,  'Drive motor',        'MOT'),
    (40, 'CRAN', 'SUB', null, 'Crane control panel','CPNL'),
    -- KEXT: Kitchen Extraction
    (41, 'KEXT', 'SUB', null, 'Extraction fan',     'EFAN'),
    (42, 'KEXT', 'COMP', 41,  'Fan motor',          'MOT'),
    (43, 'KEXT', 'SUB', null, 'Grease filter',      'GFIL'),
    (44, 'KEXT', 'SUB', null, 'Extraction duct',    'DUCT'),
    -- LIFT: Lift Controller
    (45, 'LIFT', 'SUB', null, 'Drive motor',        'DMOT'),
    (46, 'LIFT', 'SUB', null, 'Door operator',      'DOP'),
    (47, 'LIFT', 'COMP', 46,  'Door sensor',        'SENS'),
    (48, 'LIFT', 'SUB', null, 'Safety gear',        'SGEAR'),
    -- WPUMP: Domestic Water Pump
    (49, 'WPUMP', 'SUB', null, 'Pump set',          'PSET'),
    (50, 'WPUMP', 'COMP', 49, 'Pressure sensor',    'PRESS'),
    (51, 'WPUMP', 'COMP', 49, 'Flow meter',         'MET'),
    (52, 'WPUMP', 'SUB', null, 'Pressure vessel',   'PVES'),
    -- CLEAN: Cleaning Equipment
    (53, 'CLEAN', 'SUB', null, 'Scrubber dryer',    'SCRB'),
    (54, 'CLEAN', 'COMP', 53, 'Brush motor',        'MOT'),
    (55, 'CLEAN', 'SUB', null, 'Wet vacuum',        'WVAC'),
    -- ELGT: Emergency Lighting
    (56, 'ELGT', 'SUB', null, 'Central battery',   'CBAT'),
    (57, 'ELGT', 'COMP', 56, 'Battery monitor',    'MON'),
    (58, 'ELGT', 'SUB', null, 'Luminaire circuit',  'LCIRC'),
    -- CAIR: Compressed Air Compressor
    (59, 'CAIR', 'SUB', null, 'Air end',           'AEND'),
    (60, 'CAIR', 'SUB', null, 'Air dryer',          'DRY'),
    (61, 'CAIR', 'COMP', 60, 'Auto drain valve',    'VALV'),
    (62, 'CAIR', 'SUB', null, 'Receiver tank',      'RCV'),
    (63, 'CAIR', 'COMP', 62, 'Pressure gauge',      'GAUG'),
    -- SITE: Site Installation
    (64, 'SITE', 'SUB', null, 'Site transformer',  'STRF'),
    (65, 'SITE', 'SUB', null, 'Site distribution',  'SDIST'),
    (66, 'SITE', 'COMP', 65, 'Meter',              'MET'),
    -- BOIL: Heating Boiler
    (67, 'BOIL', 'SUB', null, 'Burner',            'BURN'),
    (68, 'BOIL', 'COMP', 67, 'Gas valve',           'VALV'),
    (69, 'BOIL', 'SUB', null, 'Circulation pump',  'CPUMP'),
    (70, 'BOIL', 'SUB', null, 'Expansion vessel',  'EXPV'),
    -- FOIL: Fuel Oil System
    (71, 'FOIL', 'SUB', null, 'Storage tank',      'TANK'),
    (72, 'FOIL', 'COMP', 71, 'Level gauge',         'GAUG'),
    (73, 'FOIL', 'SUB', null, 'Transfer pump',      'TPUMP'),
    (74, 'FOIL', 'COMP', 73, 'Suction filter',     'FIL');

  -- 2) Every installation in every site, with a kit type recognised from
  --    its English or local name. Unrecognised installations get type_key
  --    null and are skipped entirely (their trees keep the V70.1 codes).
  create temp table kit_inst (site_id text, equipment_code text, seq bigint, loc text, type_key text) on commit drop;
  insert into kit_inst (site_id, equipment_code, seq, loc, type_key)
  select s.site_id, s.equipment_code, s.seq, s.loc,
         case
           when s.lname ~ 'diesel'                                            then 'GEN'
           when s.lname ~ '\mups\M|usv'                                      then 'UPS'
           when s.lname ~ 'generator'                                        then 'GEN'
           when s.lname ~ 'fire damper|brandschutz|brandklep|serranda'       then 'FDMP'
           when s.lname ~ 'chiller|kältemaschine|keltemaschine|koelmachine|refrigeratore' then 'CHIL'
           when s.lname ~ 'cleanroom|ahu|air handling|lüftungsanlage|luchtbehandeling|trattamento aria' then 'AHU'
           when s.lname ~ 'roof drain|dachablauf|dakafvoer|scarico tetto'    then 'RDRN'
           when s.lname ~ 'crane|kran|\mgru\M'                                then 'CRAN'
           when s.lname ~ 'kitchen|küchen|keuken|cucina|abzug|afzuiging|aspirazione' then 'KEXT'
           when s.lname ~ 'lift|aufzug|ascensore|elevator'                    then 'LIFT'
           when s.lname ~ 'water pump|wasserpumpe|waterpomp|pompa acqua'     then 'WPUMP'
           when s.lname ~ 'cleaning|reinig'                                   then 'CLEAN'
           when s.lname ~ 'emergency|emergenza|notbeleuchtung|noodverlichting' then 'ELGT'
           when s.lname ~ 'compressor|kompressor|perslucht|druckluft'         then 'CAIR'
           when s.lname ~ 'site installation|standortanlage|terrein|impianto sito' then 'SITE'
           when s.lname ~ 'boiler|kessel|ketel|caldaia'                       then 'BOIL'
           when s.lname ~ 'fuel oil|heizöl|heizol|stookolie|gasolio'         then 'FOIL'
         end
  from (
    select e.site_id, e.equipment_code, e.seq,
           coalesce(nullif(regexp_replace(upper(coalesce(e.bl_id, e.data->>'bl_id', 'SITE')), '[^A-Z0-9-]', '', 'g'), ''), 'SITE') as loc,
           lower(coalesce(e.equipment_name, '') || ' ' || coalesce(e.equipment_name_local, '')) as lname
    from public.equipment e
    where coalesce(e.is_installation, false) or coalesce(e.hierarchy_level, '') = 'Installation'
  ) s;

  -- 3) Per-site statistics and the per-installation slot scratch tables.
  create temp table kit_stat (site_id text primary key, renamed int, updated int, added int) on commit drop;
  create temp table kit_slots (ord int, level text, name text, abbr text, parent_ord int, eq_code text, lec text) on commit drop;
  create temp table kit_assign (equipment_code text, ord int) on commit drop;

  -- 4) Main loop. Installations are processed in a deterministic order so
  --    the [TYPE][seq] numbering is reproducible. The guard skips any
  --    installation whose subtree already has more than 3 rows (a hand-built
  --    tree or a previously completed kit with 4+ children).
  for v_inst in
    select i.* from kit_inst i
    where i.type_key is not null
      and (select count(*)
           from public.equipment c
           where c.site_id = i.site_id
             and (c.parent_equipment_code = i.equipment_code
                  or c.parent_equipment_code in (select p.equipment_code
                                                  from public.equipment p
                                                  where p.site_id = i.site_id
                                                    and p.parent_equipment_code = i.equipment_code))) <= 3
    order by i.site_id, i.loc, i.type_key, i.seq, i.equipment_code
  loop
    -- 4a) Which occurrence of this kit type is this, inside the building?
    select count(*) + 1 into v_inst_seq
    from kit_inst x
    where x.site_id = v_inst.site_id and x.loc = v_inst.loc and x.type_key = v_inst.type_key
      and (x.seq, x.equipment_code) < (v_inst.seq, v_inst.equipment_code);
    v_inst_code := v_inst.loc || '_' || v_inst.type_key || v_inst_seq;

    -- 4b) Installation template values for the rows we may insert.
    select coalesce(e.data->>'Category', e.category, ''),
           coalesce(nullif(e.data->>'PrimaryTradeId', ''), e.primary_trade_id, ''),
           coalesce(e.bl_id, e.data->>'bl_id', ''),
           coalesce(e.level_name, e.data->>'LevelName', ''),
           coalesce(e.room_code, e.data->>'RoomCode', '')
      into v_cat, v_trade, v_bl, v_level_name, v_room
    from public.equipment e
    where e.site_id = v_inst.site_id and e.equipment_code = v_inst.equipment_code;

    -- 4c) Rename the installation: drop the "Installation" suffix (both the
    --     English name and the "· Installation" local suffix) and give it the
    --     [building]_[TYPE][seq] local code. EquipmentCode is untouched.
    update public.equipment e set
      equipment_name = regexp_replace(e.equipment_name, '\s*Installation\s*$', '', 'i'),
      equipment_name_local = case when e.equipment_name_local is null then null
                                  else regexp_replace(e.equipment_name_local, '\s*·\s*Installation\s*$', '', 'i') end,
      local_equipment_code = v_inst_code,
      data = jsonb_set(jsonb_set(jsonb_set(jsonb_set(e.data,
        '{LocalEquipmentCode}', to_jsonb(v_inst_code)),
        '{EquipmentName}',     to_jsonb(coalesce(regexp_replace(e.equipment_name, '\s*Installation\s*$', '', 'i'), ''))),
        '{EquipmentNameLocal}', to_jsonb(case when e.equipment_name_local is null then ''
                                  else regexp_replace(e.equipment_name_local, '\s*·\s*Installation\s*$', '', 'i') end)),
        '{HierarchyLevel}',    to_jsonb('Installation'::text))
    where e.site_id = v_inst.site_id and e.equipment_code = v_inst.equipment_code;

    insert into kit_stat (site_id, renamed, updated, added) values (v_inst.site_id, 1, 0, 0)
    on conflict (site_id) do update set renamed = kit_stat.renamed + 1;

    -- 4d) Lay out this kit's slots and map the existing subtree onto them.
    --     Direct children (the old subequipment rows) fill SUB slots, their
    --     children (the old component rows) fill COMP slots, both in stable
    --     seq/code order, so the old rows keep their identity.
    delete from kit_slots;
    insert into kit_slots (ord, level, name, abbr, parent_ord)
    select d.ord, d.level, d.name, d.abbr, d.parent_ord from kit_def d
    where d.type_key = v_inst.type_key;

    delete from kit_assign;
    insert into kit_assign (equipment_code, ord)
    select c.equipment_code, s.ord
    from (select equipment_code,
                 case when parent_equipment_code = v_inst.equipment_code then 'SUB' else 'COMP' end as lvl,
                 row_number() over (partition by case when parent_equipment_code = v_inst.equipment_code then 'SUB' else 'COMP' end
                                    order by seq, equipment_code) as rn
          from public.equipment
          where site_id = v_inst.site_id
            and (parent_equipment_code = v_inst.equipment_code
                 or parent_equipment_code in (select p.equipment_code
                                               from public.equipment p
                                               where p.site_id = v_inst.site_id
                                                 and p.parent_equipment_code = v_inst.equipment_code))) c
    join (select ord, level, row_number() over (partition by level order by ord) as srn
          from kit_slots where eq_code is null) s
      on s.level = c.lvl and s.srn = c.rn;

    update kit_slots k set eq_code = a.equipment_code from kit_assign a where a.ord = k.ord;

    -- 4e) Walk the slots in order (parents always come before children) and
    --     rename, adopt or create each row.
    for v_slot in select * from kit_slots order by ord loop
      if v_slot.level = 'SUB' then
        v_parent_code := v_inst.equipment_code;
        v_parent_lec  := v_inst_code;
      else
        select s.eq_code, s.lec into v_parent_code, v_parent_lec
        from kit_slots s where s.ord = v_slot.parent_ord;
      end if;
      v_lec   := v_parent_lec || '_' || v_slot.abbr;
      v_level := case when v_slot.level = 'SUB' then 'SubEquipment' else 'Component' end;

      if v_slot.eq_code is not null then
        -- existing row (old generic sub/component): rename and re-point it
        update public.equipment e set
          equipment_name = v_slot.name,
          local_equipment_code = v_lec,
          parent_equipment_code = v_parent_code,
          hierarchy_level = v_level,
          data = jsonb_set(jsonb_set(jsonb_set(jsonb_set(e.data,
            '{EquipmentName}',        to_jsonb(v_slot.name)),
            '{LocalEquipmentCode}',   to_jsonb(v_lec)),
            '{ParentEquipmentCode}',  to_jsonb(v_parent_code)),
            '{HierarchyLevel}',       to_jsonb(v_level))
        where e.site_id = v_inst.site_id and e.equipment_code = v_slot.eq_code;
        update kit_stat set updated = updated + 1 where site_id = v_inst.site_id;

      elsif exists (select 1 from public.equipment
                    where site_id = v_inst.site_id and local_equipment_code = v_lec) then
        -- idempotent re-run: the row was created by a previous pass, adopt it
        update public.equipment e set
          equipment_name = v_slot.name,
          parent_equipment_code = v_parent_code,
          hierarchy_level = v_level,
          data = jsonb_set(jsonb_set(jsonb_set(e.data,
            '{EquipmentName}',        to_jsonb(v_slot.name)),
            '{ParentEquipmentCode}',  to_jsonb(v_parent_code)),
            '{HierarchyLevel}',       to_jsonb(v_level))
        where e.site_id = v_inst.site_id and e.local_equipment_code = v_lec;
        update kit_slots set eq_code = (select equipment_code from public.equipment
                                        where site_id = v_inst.site_id and local_equipment_code = v_lec)
        where ord = v_slot.ord;
        update kit_stat set updated = updated + 1 where site_id = v_inst.site_id;

      else
        -- missing kit row: insert it with a fresh fully-numeric code
        select coalesce(max(equipment_code::bigint), 0) + 1 into v_new_num
        from public.equipment
        where site_id = v_inst.site_id and equipment_code ~ '^[0-9]+$';
        v_new_code := lpad(v_new_num::text, 10, '0');
        select coalesce(max(seq), 0) + 1 into v_seq
        from public.equipment where site_id = v_inst.site_id;

        v_json := jsonb_build_object(
          'EquipmentCode', v_new_code,
          'EquipmentName', v_slot.name,
          'LocalEquipmentCode', v_lec,
          'Category', v_cat,
          'HierarchyLevel', v_level,
          'IsInstallation', 'false',
          'Status', 'In Service',
          'Criticality', 'Medium',
          'Manufacturer', 'Campus Systems',
          'TechnicalSpecifications', jsonb_build_object('service', v_slot.name, 'location', v_room),
          'Activity', jsonb_build_array(jsonb_build_object(
            'id', v_new_code || '-log', 'kind', 'log',
            'actorId', 'Mark', 'actorName', 'Mark', 'actorRole', 'ESA_TM',
            'createdAt', '2026-10-10T09:00:00Z',
            'text', 'Equipment registered for maintenance.')),
          'bl_id', v_bl,
          'SiteId', v_inst.site_id,
          'LevelName', v_level_name,
          'RoomCode', v_room,
          'ParentEquipmentCode', v_parent_code,
          'PrimaryTradeId', v_trade);

        insert into public.equipment select (public.cafm_eq_row(v_inst.site_id, v_seq, v_json)).*;
        update kit_slots set eq_code = v_new_code where ord = v_slot.ord;
        update kit_stat set added = added + 1 where site_id = v_inst.site_id;
      end if;

      update kit_slots set lec = v_lec where ord = v_slot.ord;
    end loop;
  end loop;

  -- 5) Bump the per-site revision so every portal and mobile client
  --    refetches instead of serving its cached copy.
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_site_revision') then
    update public.cafm_site_revision r
    set revision = r.revision + 1
    where exists (select 1 from kit_stat k where k.site_id = r.site_id);
  else
    raise notice 'cafm_site_revision not found: revision not bumped; clients may need a manual reload.';
  end if;

  for v_site in select * from kit_stat order by site_id loop
    raise notice 'V70.2 %: % installations restructured, % rows renamed, % rows added',
      v_site.site_id, v_site.renamed, v_site.updated, v_site.added;
  end loop;
  raise notice 'V70.2 done: run cafm_integrity_report(''02-ESOC'') afterwards if you want the tree health check.';
end
$kits$;

commit;
