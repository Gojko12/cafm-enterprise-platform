-- ============================================================================
-- V70.1 addendum to Section 120 (no new section number):
-- Generate demo Local Equipment Codes (LEC) for every equipment record.
--
-- WHAT THIS DOES
--   For every row in public.equipment (all sites) it builds a human-readable
--   operational code following the [Location]_[Installation]_[Subcomponent]
--   convention from Section 120, e.g. E-1_CHIL1 = the first chiller in
--   building E-1, E-1_CHIL1_P1 = its first pump, E-1_CHIL1_FT1 = its filter.
--   - Location part: the building id (bl_id), uppercased, non [A-Z0-9-]
--     characters stripped (falls back to SITE when the building is unknown).
--   - Installation part: a recognisable abbreviation picked from the
--     equipment name via a dictionary (DOOR, LADD, WIND, ALAR, FEXT, UV,
--     CHIL, AHU, GEN, P, FT, ...), plus a sequence number per site+building+
--     abbreviation. Anything the dictionary does not recognise falls back to
--     the first word of the name (max 4 letters).
--   - Subcomponent part: the child's own abbreviation and sequence, appended
--     to the parent's full code, one hierarchy level per pass
--     (Installation -> SubEquipment -> Component).
--   The codes are written BOTH to the local_equipment_code mirror column and
--   into the data jsonb (the payload the API serves), then the per-site
--   revision is bumped so every portal and mobile client refetches.
--
-- IMPORTANT
--   - This OVERWRITES every existing LocalEquipmentCode value in every site
--     (EquipmentCode, the immutable internal ID, is never touched).
--   - Safe to run twice: deterministic ordering makes it regenerate the
--     same codes.
--   - Pure data update: no schema change, no app change, no permission
--     change. V70 (Section 120) must already be deployed so the portal shows
--     the codes; paste this in the Supabase SQL editor and Run.
-- ============================================================================

begin;

do $lec$
declare
  v_pass  int;
  v_codes bigint;
  v_site  record;
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

  -- 1) Recognisable-abbreviation dictionary. First match wins, so specific
  --    patterns are ordered before generic ones.
  create temp table lec_abbr (ord int, pattern text, abbr text) on commit drop;
  insert into lec_abbr (ord, pattern, abbr) values
    (1,  'fire extinguish',        'FEXT'),
    (2,  'extinguish',             'FEXT'),
    (3,  'ultraviolet',            'UV'),
    (4,  '\muv\M',                 'UV'),
    (5,  'smoke detect',           'FIRE'),
    (6,  'fire detection',         'FIRE'),
    (7,  'sprinkler',              'SPRK'),
    (8,  'ladder',                 'LADD'),
    (9,  'window',                 'WIND'),
    (10, 'door',                   'DOOR'),
    (11, 'gate|barrier',           'GATE'),
    (12, 'fence',                  'FENC'),
    (13, 'alarm',                  'ALAR'),
    (14, 'outdoor air',            'ARLT'),
    (15, 'fresh air',              'ARLT'),
    (16, 'intake air',             'ARLT'),
    (17, 'air handling',           'AHU'),
    (18, '\mahu\M',                'AHU'),
    (19, 'hvac',                   'AHU'),
    (20, 'air condition',          'ACC'),
    (21, 'climate',                'ACC'),
    (22, 'ventilat',              'VENT'),
    (23, 'exhaust',               'VENT'),
    (24, 'chiller',               'CHIL'),
    (25, 'cooling tower',         'CTWR'),
    (26, 'compressor',            'COMP'),
    (27, 'pump',                  'P'),
    (28, 'filter',                'FT'),
    (29, 'fan',                   'FAN'),
    (30, 'damper',                'DMP'),
    (31, 'duct',                  'DUCT'),
    (32, 'louver|louvre',         'LOUV'),
    (33, 'boiler',                'BOIL'),
    (34, 'heating|heater',        'HEAT'),
    (35, 'generator',            'GEN'),
    (36, 'transformer',           'TRAF'),
    (37, '\mups?\M',              'UPS'),
    (38, 'batter',                'UPS'),
    (39, 'panel|switchboard|distribution', 'PNL'),
    (40, '\mlift|elevator',       'LIFT'),
    (41, 'light|lamp|luminaire',   'LGT'),
    (42, 'camera|cctv',           'CAM'),
    (43, 'sensor|meter|detector', 'SENS'),
    (44, 'valve',                 'VALV'),
    (45, 'motor',                 'MOT'),
    (46, 'crane|hoist|winch',     'CRAN'),
    (47, 'escalator|escalat',     'ESC'),
    (48, 'kitchen',               'KIT'),
    (49, 'server|rack',           'SRV'),
    (50, 'sewage|drain|waste',    'DRN'),
    (51, 'water',                 'WTR'),
    (52, 'tank',                  'TANK'),
    (53, 'roof',                  'ROOF');

  -- 2) One working row per equipment record.
  create temp table lec_eq (
    site_id        text,
    equipment_code text,
    ord            bigint,
    loc            text,
    lname          text,
    is_inst        boolean,
    parent_code    text,
    abbr           text,
    lec            text
  ) on commit drop;

  insert into lec_eq (site_id, equipment_code, ord, loc, lname, is_inst, parent_code)
  select e.site_id,
         e.equipment_code,
         e.seq,
         nullif(regexp_replace(upper(coalesce(e.bl_id, e.data->>'bl_id', 'SITE')), '[^A-Z0-9-]', '', 'g'), ''),
         lower(coalesce(e.equipment_name, e.data->>'EquipmentName', e.equipment_code)),
         (coalesce(e.hierarchy_level, '') = 'Installation')
           or (nullif(e.parent_equipment_code, '') is null and coalesce(e.is_installation, false)),
         nullif(e.parent_equipment_code, '')
  from public.equipment e;

  update lec_eq set loc = 'SITE' where loc is null;

  -- 3) Abbreviation per record: dictionary match, else the first word of the
  --    name (max 4 letters), else EQ.
  update lec_eq t set abbr = (
    select a.abbr from lec_abbr a where t.lname ~* a.pattern order by a.ord limit 1);
  update lec_eq set abbr = upper(left(coalesce((regexp_match(lname, '[a-z]+'))[1], 'eq'), 4))
  where abbr is null;
  update lec_eq set abbr = 'EQ' where abbr is null or abbr = '';

  -- 4) Installations first: [Location]_[ABBR][n] per site + building +
  --    abbreviation, in stable array order.
  update lec_eq t set lec = t.loc || '_' || t.abbr || s.n
  from (
    select site_id, equipment_code,
           row_number() over (partition by site_id, loc, abbr order by ord, equipment_code) as n
    from lec_eq
    where is_inst
  ) s
  where s.site_id = t.site_id and s.equipment_code = t.equipment_code and t.is_inst;

  -- 5) Then children, one hierarchy level per pass: the parent's full code +
  --    '_' + the child's own abbreviation and sequence.
  for v_pass in 1..5 loop
    with kids as (
      select site_id, equipment_code, parent_code, abbr,
             row_number() over (partition by site_id, parent_code, abbr order by ord, equipment_code) as n
      from lec_eq
      where lec is null and parent_code is not null
    )
    update lec_eq c
    set lec = p.lec || '_' || c.abbr || k.n
    from kids k
    join lec_eq p on p.site_id = k.site_id and p.equipment_code = k.parent_code
    where c.site_id = k.site_id and c.equipment_code = k.equipment_code and p.lec is not null;
    exit when not found;
  end loop;

  -- 6) Anything still unassigned (top-level records without the installation
  --    flag, or orphans whose parent never got a code): location-based codes
  --    that continue the numbers already used by that prefix.
  update lec_eq c set lec = c.loc || '_' || c.abbr || (s.taken + s.n)
  from (
    select k.site_id, k.equipment_code,
           row_number() over (partition by k.site_id, k.loc, k.abbr order by k.ord, k.equipment_code) as n,
           (select count(*) from lec_eq x
             where x.site_id = k.site_id and x.lec like k.loc || '_' || k.abbr || '%') as taken
    from lec_eq k
    where k.lec is null
  ) s
  where s.site_id = c.site_id and s.equipment_code = c.equipment_code and c.lec is null;

  -- 7) Write the codes into the record rows: the mirror column AND the data
  --    jsonb (the payload source the API serves).
  update public.equipment e
  set local_equipment_code = l.lec,
      data = jsonb_set(e.data, '{LocalEquipmentCode}', to_jsonb(l.lec))
  from lec_eq l
  where e.site_id = l.site_id and e.equipment_code = l.equipment_code and l.lec is not null;
  get diagnostics v_codes = row_count;

  -- 8) Bump the per-site revision so every portal and mobile client
  --    refetches instead of serving its cached copy.
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_site_revision') then
    update public.cafm_site_revision r
    set revision = r.revision + 1
    where exists (select 1 from lec_eq l where l.site_id = r.site_id);
  else
    raise notice 'cafm_site_revision not found: revision not bumped; clients may need a manual reload.';
  end if;

  for v_site in select site_id, count(*) as n from lec_eq group by site_id order by site_id loop
    raise notice 'V70.1 %: % local equipment codes assigned', v_site.site_id, v_site.n;
  end loop;
  raise notice 'V70.1 done: % equipment rows updated in total.', v_codes;
end
$lec$;

commit;
