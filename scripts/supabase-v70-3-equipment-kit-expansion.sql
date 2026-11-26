-- ============================================================================
-- V70.3 addendum to Section 120 (pairs with the V74 Section 124 app change):
-- expand the equipment kits in the live database with more realistic
-- subequipment and components per installation.
--
-- WHAT THIS DOES
--   The V70.2 restructure gave every recognised installation a small
--   domain-correct kit (e.g. the diesel generator got Gas pump, Cooling,
--   Oil pump). The user wants deeper, more realistic trees, so this script
--   adds the extra kit rows, e.g. the generator now reads:
--     Diesel Generator   S01-BL-111_GEN1
--       Gas pump         S01-BL-111_GEN1_PUMP   (Gas meter, Gas filter)
--       Cooling          S01-BL-111_GEN1_COOL   (Thermometer)
--       Oil pump         S01-BL-111_GEN1_OPUMP  (Oil filter)
--       Fuel tank        S01-BL-111_GEN1_TANK   (Level gauge)      [new]
--       Starter battery  S01-BL-111_GEN1_BATT   (Battery monitor) [new]
--       Control panel    S01-BL-111_GEN1_CPNL   (Relay)           [new]
--       Exhaust muffler  S01-BL-111_GEN1_EXST                      [new]
--   - It ONLY inserts rows that are missing: for every slot of the full
--     extended kit it computes the expected local code and skips the slot
--     when a row with that code already exists. Existing rows are never
--     renamed, moved or deleted; EquipmentCode values never change.
--   - Installations are only processed when their current local code
--     already equals the [building]_[TYPE][seq] code that V70.2 assigned,
--     so installations V70.2 skipped (unrecognised, or with a hand-built
--     tree) are skipped here as well.
--
-- IMPORTANT
--   - Run V70.2 (supabase-v70-2-equipment-tree-restructure.sql) first.
--   - Safe to run twice: every slot resolves to the same local code, so
--     the second pass finds everything already present.
--   - Pure data update: no schema, app or permission change. Deploy V74
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
  v_cur_lec   text;
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
  v_skipped   int := 0;
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

  -- 1) The full extended kit catalogue (129 slots). Order inside a kit is
  --    significant only for processing: a SUB slot always precedes its own
  --    COMP slots (parent_ord < ord). Mirrors section20-seed.ts systemKits.
  create temp table kit_def (ord int, type_key text, level text, parent_ord int, name text, abbr text) on commit drop;
  insert into kit_def (ord, type_key, level, parent_ord, name, abbr) values
    -- CHIL: Chiller
    (  1, 'CHIL', 'SUB', null, 'Compressor',          'COMP'),
    (  2, 'CHIL', 'COMP', 1,    'Oil filter',          'OILF'),
    (  3, 'CHIL', 'SUB', null, 'Condenser',           'COND'),
    (  4, 'CHIL', 'COMP', 3,    'Condenser fan',       'FAN'),
    (  5, 'CHIL', 'SUB', null, 'Evaporator',          'EVAP'),
    (  6, 'CHIL', 'COMP', 5,    'Refrigerant filter', 'FILT'),
    (  7, 'CHIL', 'SUB', null, 'Chilled water pump', 'CHWP'),
    (  8, 'CHIL', 'COMP', 7,    'Flow meter',          'MET'),
    (  9, 'CHIL', 'SUB', null, 'Oil separator',      'OSEP'),
    ( 10, 'CHIL', 'SUB', null, 'Control panel',       'CPNL'),
    ( 11, 'CHIL', 'COMP', 10,   'Controller',          'CONT'),
    -- GEN: Diesel Generator
    ( 12, 'GEN', 'SUB', null, 'Gas pump',            'PUMP'),
    ( 13, 'GEN', 'COMP', 12,   'Gas meter',          'MET'),
    ( 14, 'GEN', 'COMP', 12,   'Gas filter',        'FIL'),
    ( 15, 'GEN', 'SUB', null, 'Cooling',             'COOL'),
    ( 16, 'GEN', 'COMP', 15,   'Thermometer',        'TEMP'),
    ( 17, 'GEN', 'SUB', null, 'Oil pump',            'OPUMP'),
    ( 18, 'GEN', 'COMP', 17,   'Oil filter',        'FIL'),
    ( 19, 'GEN', 'SUB', null, 'Fuel tank',           'TANK'),
    ( 20, 'GEN', 'COMP', 19,   'Level gauge',        'GAUG'),
    ( 21, 'GEN', 'SUB', null, 'Starter battery',     'BATT'),
    ( 22, 'GEN', 'COMP', 21,   'Battery monitor',    'MON'),
    ( 23, 'GEN', 'SUB', null, 'Control panel',      'CPNL'),
    ( 24, 'GEN', 'COMP', 23,   'Relay',              'RLY'),
    ( 25, 'GEN', 'SUB', null, 'Exhaust muffler',     'EXST'),
    -- UPS: UPS System
    ( 26, 'UPS', 'SUB', null, 'Battery bank',        'BATT'),
    ( 27, 'UPS', 'COMP', 26,   'Battery monitor',    'MON'),
    ( 28, 'UPS', 'SUB', null, 'Inverter',            'INV'),
    ( 29, 'UPS', 'COMP', 28,   'Cooling fan',        'FAN'),
    ( 30, 'UPS', 'SUB', null, 'Static bypass',      'BYP'),
    ( 31, 'UPS', 'SUB', null, 'Rectifier',           'RECT'),
    ( 32, 'UPS', 'COMP', 31,   'Fuse',              'FUSE'),
    ( 33, 'UPS', 'SUB', null, 'Distribution board',  'DBRD'),
    ( 34, 'UPS', 'COMP', 33,   'Breaker',            'BRK'),
    -- FDMP: Fire Damper
    ( 35, 'FDMP', 'SUB', null, 'Actuator',           'ACT'),
    ( 36, 'FDMP', 'COMP', 35,  'Position sensor',    'SENS'),
    ( 37, 'FDMP', 'SUB', null, 'Blade set',          'BLAD'),
    ( 38, 'FDMP', 'SUB', null, 'Frame',              'FRAM'),
    ( 39, 'FDMP', 'SUB', null, 'Fusible link',      'LINK'),
    -- AHU: Cleanroom AHU
    ( 40, 'AHU', 'SUB', null, 'Supply fan',          'SFAN'),
    ( 41, 'AHU', 'COMP', 40,   'Vibration sensor',   'VIB'),
    ( 42, 'AHU', 'SUB', null, 'Filter stage',        'FILT'),
    ( 43, 'AHU', 'COMP', 42,   'Pre-filter',         'PRE'),
    ( 44, 'AHU', 'COMP', 42,   'Final filter',       'FIN'),
    ( 45, 'AHU', 'SUB', null, 'Heating coil',        'HEAT'),
    ( 46, 'AHU', 'COMP', 45,   'Control valve',      'VALV'),
    ( 47, 'AHU', 'SUB', null, 'Cooling coil',       'CCOIL'),
    ( 48, 'AHU', 'COMP', 47,   'Temperature sensor', 'TEMP'),
    ( 49, 'AHU', 'SUB', null, 'Return fan',          'RFAN'),
    ( 50, 'AHU', 'COMP', 49,   'Fan motor',          'MOT'),
    ( 51, 'AHU', 'SUB', null, 'Humidifier',          'HUM'),
    ( 52, 'AHU', 'COMP', 51,   'Steam valve',        'VALV'),
    ( 53, 'AHU', 'SUB', null, 'Damper set',          'DMP'),
    ( 54, 'AHU', 'COMP', 53,   'Actuator',           'ACT'),
    ( 55, 'AHU', 'SUB', null, 'Heat recovery wheel','HRW'),
    -- RDRN: Roof Drain
    ( 56, 'RDRN', 'SUB', null, 'Drain grate',        'GRAT'),
    ( 57, 'RDRN', 'SUB', null, 'Downpipe',           'DPIP'),
    ( 58, 'RDRN', 'COMP', 57,  'Leaf filter',        'FIL'),
    ( 59, 'RDRN', 'SUB', null, 'Gully trap',         'TRAP'),
    ( 60, 'RDRN', 'SUB', null, 'Rain gutter',        'GUTT'),
    -- CRAN: Heavy Crane
    ( 61, 'CRAN', 'SUB', null, 'Hoist winch',        'HOIST'),
    ( 62, 'CRAN', 'COMP', 61,  'Brake',              'BRK'),
    ( 63, 'CRAN', 'SUB', null, 'Trolley drive',      'TROL'),
    ( 64, 'CRAN', 'COMP', 63,  'Drive motor',        'MOT'),
    ( 65, 'CRAN', 'SUB', null, 'Crane control panel','CPNL'),
    ( 66, 'CRAN', 'SUB', null, 'Hook block',         'HOOK'),
    ( 67, 'CRAN', 'SUB', null, 'Limit switch',       'LSW'),
    -- KEXT: Kitchen Extraction
    ( 68, 'KEXT', 'SUB', null, 'Extraction fan',     'EFAN'),
    ( 69, 'KEXT', 'COMP', 68,  'Fan motor',          'MOT'),
    ( 70, 'KEXT', 'SUB', null, 'Grease filter',      'GFIL'),
    ( 71, 'KEXT', 'SUB', null, 'Extraction duct',    'DUCT'),
    ( 72, 'KEXT', 'SUB', null, 'Fire damper',       'FDM'),
    ( 73, 'KEXT', 'SUB', null, 'Carbon filter',     'CFIL'),
    -- LIFT: Lift Controller
    ( 74, 'LIFT', 'SUB', null, 'Drive motor',        'DMOT'),
    ( 75, 'LIFT', 'SUB', null, 'Door operator',      'DOP'),
    ( 76, 'LIFT', 'COMP', 75,  'Door sensor',        'SENS'),
    ( 77, 'LIFT', 'SUB', null, 'Safety gear',        'SGEAR'),
    ( 78, 'LIFT', 'SUB', null, 'Guide rails',        'RAIL'),
    ( 79, 'LIFT', 'SUB', null, 'Rope sheave',       'SHEA'),
    ( 80, 'LIFT', 'SUB', null, 'Counterweight',      'CW'),
    ( 81, 'LIFT', 'SUB', null, 'Buffer',            'BUFF'),
    -- WPUMP: Domestic Water Pump
    ( 82, 'WPUMP', 'SUB', null, 'Pump set',          'PSET'),
    ( 83, 'WPUMP', 'COMP', 82, 'Pressure sensor',    'PRESS'),
    ( 84, 'WPUMP', 'COMP', 82, 'Flow meter',         'MET'),
    ( 85, 'WPUMP', 'SUB', null, 'Pressure vessel',   'PVES'),
    ( 86, 'WPUMP', 'SUB', null, 'Booster panel',     'BPNL'),
    ( 87, 'WPUMP', 'COMP', 86, 'Controller',         'CONT'),
    ( 88, 'WPUMP', 'SUB', null, 'Suction manifold',  'SMAN'),
    ( 89, 'WPUMP', 'COMP', 88, 'Strainer',           'STRN'),
    ( 90, 'WPUMP', 'SUB', null, 'Non-return valve',  'NRV'),
    -- CLEAN: Cleaning Equipment
    ( 91, 'CLEAN', 'SUB', null, 'Scrubber dryer',    'SCRB'),
    ( 92, 'CLEAN', 'COMP', 91, 'Brush motor',        'MOT'),
    ( 93, 'CLEAN', 'SUB', null, 'Wet vacuum',        'WVAC'),
    ( 94, 'CLEAN', 'SUB', null, 'Floor polisher',    'POL'),
    ( 95, 'CLEAN', 'SUB', null, 'Pressure washer',   'HPW'),
    -- ELGT: Emergency Lighting
    ( 96, 'ELGT', 'SUB', null, 'Central battery',   'CBAT'),
    ( 97, 'ELGT', 'COMP', 96, 'Battery monitor',    'MON'),
    ( 98, 'ELGT', 'SUB', null, 'Luminaire circuit', 'LCIRC'),
    ( 99, 'ELGT', 'SUB', null, 'Exit signage',      'ESIG'),
    (100, 'ELGT', 'SUB', null, 'Test switch',       'TSW'),
    -- CAIR: Compressed Air Compressor
    (101, 'CAIR', 'SUB', null, 'Air end',           'AEND'),
    (102, 'CAIR', 'SUB', null, 'Air dryer',          'DRY'),
    (103, 'CAIR', 'COMP', 102, 'Auto drain valve',   'VALV'),
    (104, 'CAIR', 'SUB', null, 'Receiver tank',      'RCV'),
    (105, 'CAIR', 'COMP', 104, 'Pressure gauge',     'GAUG'),
    (106, 'CAIR', 'SUB', null, 'Aftercooler',       'AFTC'),
    (107, 'CAIR', 'SUB', null, 'Line filter',       'LFIL'),
    (108, 'CAIR', 'SUB', null, 'Condensate trap',   'CTRP'),
    -- SITE: Site Installation
    (109, 'SITE', 'SUB', null, 'Site transformer',  'STRF'),
    (110, 'SITE', 'SUB', null, 'Site distribution',  'SDIST'),
    (111, 'SITE', 'COMP', 110, 'Meter',              'MET'),
    (112, 'SITE', 'SUB', null, 'Site lighting',     'SLGT'),
    (113, 'SITE', 'COMP', 112, 'Photocell',          'PCEL'),
    (114, 'SITE', 'SUB', null, 'Site gate',          'GATE'),
    (115, 'SITE', 'COMP', 114, 'Gate motor',         'MOT'),
    -- BOIL: Heating Boiler
    (116, 'BOIL', 'SUB', null, 'Burner',            'BURN'),
    (117, 'BOIL', 'COMP', 116, 'Gas valve',           'VALV'),
    (118, 'BOIL', 'SUB', null, 'Circulation pump',  'CPUMP'),
    (119, 'BOIL', 'SUB', null, 'Expansion vessel',  'EXPV'),
    (120, 'BOIL', 'SUB', null, 'Flue system',       'FLUE'),
    (121, 'BOIL', 'SUB', null, 'Dosing pump',       'DPMP'),
    (122, 'BOIL', 'SUB', null, 'Low-water cutoff',  'LWCO'),
    -- FOIL: Fuel Oil System
    (123, 'FOIL', 'SUB', null, 'Storage tank',      'TANK'),
    (124, 'FOIL', 'COMP', 123, 'Level gauge',        'GAUG'),
    (125, 'FOIL', 'SUB', null, 'Transfer pump',      'TPUMP'),
    (126, 'FOIL', 'COMP', 125, 'Suction filter',     'FIL'),
    (127, 'FOIL', 'SUB', null, 'Day tank',           'DTANK'),
    (128, 'FOIL', 'COMP', 127, 'Level switch',       'LSW'),
    (129, 'FOIL', 'SUB', null, 'Bund alarm',        'BALM');

  -- 2) Every installation with its kit type and its current local code. The
  --    type recognition is identical to V70.2 so both scripts agree on
  --    which installation is which kit.
  create temp table kit_inst (site_id text, equipment_code text, seq bigint, loc text, type_key text, cur_lec text) on commit drop;
  insert into kit_inst (site_id, equipment_code, seq, loc, type_key, cur_lec)
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
         end,
         s.cur_lec
  from (
    select e.site_id, e.equipment_code, e.seq, e.local_equipment_code as cur_lec,
           coalesce(nullif(regexp_replace(upper(coalesce(e.bl_id, e.data->>'bl_id', 'SITE')), '[^A-Z0-9-]', '', 'g'), ''), 'SITE') as loc,
           lower(coalesce(e.equipment_name, '') || ' ' || coalesce(e.equipment_name_local, '')) as lname
    from public.equipment e
    where coalesce(e.is_installation, false) or coalesce(e.hierarchy_level, '') = 'Installation'
  ) s;

  -- 3) Per-site statistics and the slot scratch table.
  create temp table kit_stat (site_id text primary key, expanded int, added int) on commit drop;
  create temp table kit_slots (ord int, level text, name text, abbr text, parent_ord int, eq_code text, lec text) on commit drop;

  -- 4) Main loop, in the same deterministic order as V70.2 so the
  --    [TYPE][seq] numbering matches.
  for v_inst in select * from kit_inst
    where type_key is not null
    order by site_id, loc, type_key, seq, equipment_code
  loop
    select count(*) + 1 into v_inst_seq
    from kit_inst x
    where x.site_id = v_inst.site_id and x.loc = v_inst.loc and x.type_key = v_inst.type_key
      and (x.seq, x.equipment_code) < (v_inst.seq, v_inst.equipment_code);
    v_inst_code := v_inst.loc || '_' || v_inst.type_key || v_inst_seq;

    -- Only installations that V70.2 already normalised carry this exact
    -- code; everything else keeps its tree untouched.
    if v_inst.cur_lec is distinct from v_inst_code then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Template values from the installation for the rows we may insert.
    select coalesce(e.data->>'Category', e.category, ''),
           coalesce(nullif(e.data->>'PrimaryTradeId', ''), e.primary_trade_id, ''),
           coalesce(e.bl_id, e.data->>'bl_id', ''),
           coalesce(e.level_name, e.data->>'LevelName', ''),
           coalesce(e.room_code, e.data->>'RoomCode', '')
      into v_cat, v_trade, v_bl, v_level_name, v_room
    from public.equipment e
    where e.site_id = v_inst.site_id and e.equipment_code = v_inst.equipment_code;

    insert into kit_stat (site_id, expanded, added) values (v_inst.site_id, 1, 0)
    on conflict (site_id) do update set expanded = kit_stat.expanded + 1;

    delete from kit_slots;
    insert into kit_slots (ord, level, name, abbr, parent_ord)
    select d.ord, d.level, d.name, d.abbr, d.parent_ord from kit_def d
    where d.type_key = v_inst.type_key;

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

      -- Remember the parent resolution so nested slots can follow it.
      update kit_slots set lec = v_lec where ord = v_slot.ord;

      if not exists (select 1 from public.equipment
                     where site_id = v_inst.site_id and local_equipment_code = v_lec) then
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
      else
        update kit_slots set eq_code = (select equipment_code from public.equipment
                                         where site_id = v_inst.site_id and local_equipment_code = v_lec)
        where ord = v_slot.ord;
      end if;
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
    raise notice 'V70.3 %: % installations expanded, % kit rows added',
      v_site.site_id, v_site.expanded, v_site.added;
  end loop;
  raise notice 'V70.3 done: % installations skipped (not normalised by V70.2).', v_skipped;
end
$kits$;

commit;
