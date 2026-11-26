-- ============================================================================
-- V70.4 addendum to Section 120 (pairs with the V75 Section 125 app change):
-- renumber the big equipment codes that the V70.2 / V70.3 kit scripts
-- inserted, so EQ IDs continue the site's own small sequence.
--
-- WHAT THIS DOES
--   The V70.2 and V70.3 scripts inserted the new kit rows with
--   "max numeric code + 1" codes. On databases where a real asset already
--   carries a huge numeric code (e.g. 9047930755), that logic produced codes
--   like 9047930756 instead of continuing the site's demo sequence
--   (0000000001..0000000048). The user wants small sequential IDs:
--   0000000049, 0000000050, ...
--   - Per site, this script finds ONLY the rows the kit scripts inserted:
--     fully-numeric 10-digit codes >= 9000000000, not an installation, has
--     a parent, Manufacturer 'Campus Systems', and the seeded registration
--     activity text. Demo trio rows (codes 1..48) and real BIM assets never
--     match this signature.
--   - Each matching row gets the next small code, in creation order
--     (seq, then old code), so a family reads 49, 50, 51...
--   - Children's ParentEquipmentCode references follow their renamed
--     parent automatically (parents are renamed first: they were inserted
--     first, so their seq is lower).
--   - Work request and PM schedule references inside the data payloads are
--     rewritten as a safety net (the seeded ones reference installations,
--     which keep their codes, so normally nothing matches here).
--   - Nothing else changes: names, local codes, statuses, activities and
--     the installation rows are untouched.
--
-- IMPORTANT
--   - Run AFTER V70.2 and V70.3. Safe to run twice: the second pass finds
--     no codes >= 9000000000 with the kit signature and does nothing.
--   - Pure data update: no schema, app or permission change. Deploy V75
--     first, then paste this WHOLE file into the Supabase SQL editor and Run.
--   - Expect "Success. No rows returned" plus one notice per touched site.
-- ============================================================================

begin;

do $renum$
declare
  v_site      record;
  v_row       record;
  v_next      bigint;
  v_new_code  text;
  v_wr        int;
  v_pms       int;
  v_site_done int;
  v_total     int := 0;
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

  -- 1) One pass per site that still holds big kit codes.
  for v_site in
    select e.site_id
    from public.equipment e
    where e.equipment_code ~ '^[0-9]{10}$'
      and e.equipment_code::bigint >= 9000000000
    group by e.site_id
    order by e.site_id
  loop
    -- The first free small code: right after the site's largest "small"
    -- numeric code (the demo trio rows), never colliding with the big
    -- real-asset codes.
    select coalesce(max(equipment_code::bigint), 0) + 1 into v_next
    from public.equipment
    where site_id = v_site.site_id
      and equipment_code ~ '^[0-9]+$'
      and equipment_code::bigint < 9000000000;

    v_site_done := 0;
    v_wr := 0;
    v_pms := 0;

    -- 2) Renumber in creation order: parents first (lower seq), so
    --    children still carry the old parent code when their parent is
    --    renamed and the reference fix below can find them.
    for v_row in
      select e.equipment_code, e.seq
      from public.equipment e
      where e.site_id = v_site.site_id
        and e.equipment_code ~ '^[0-9]{10}$'
        and e.equipment_code::bigint >= 9000000000
        and coalesce(e.is_installation, false) = false
        and e.parent_equipment_code is not null
        and coalesce(e.manufacturer, e.data->>'Manufacturer') = 'Campus Systems'
        and e.data->'Activity'->0->>'text' = 'Equipment registered for maintenance.'
      order by e.seq, e.equipment_code
    loop
      v_new_code := lpad(v_next::text, 10, '0');

      -- rename the row itself (mirror column + jsonb payload)
      update public.equipment
      set equipment_code = v_new_code,
          data = jsonb_set(data, '{EquipmentCode}', to_jsonb(v_new_code))
      where site_id = v_site.site_id
        and equipment_code = v_row.equipment_code;

      -- children follow their renamed parent (a child may be renamed
      -- later in this same loop; the match is on the parent field)
      update public.equipment
      set parent_equipment_code = v_new_code,
          data = jsonb_set(data, '{ParentEquipmentCode}', to_jsonb(v_new_code))
      where site_id = v_site.site_id
        and parent_equipment_code = v_row.equipment_code;

      -- safety net: work request payloads that reference the code
      if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'work_requests') then
        update public.work_requests
        set data = jsonb_set(data, '{EquipmentCodes}',
          (select coalesce(jsonb_agg(case when elem = to_jsonb(v_row.equipment_code) then to_jsonb(v_new_code) else elem end), '[]'::jsonb)
           from jsonb_array_elements(coalesce(data->'EquipmentCodes', '[]'::jsonb)) elem))
        where site_id = v_site.site_id
          and data->'EquipmentCodes' @> to_jsonb(v_row.equipment_code);
        v_wr := v_wr + 1;
      end if;

      -- safety net: PM schedule mirrors and payloads
      if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'pm_schedules') then
        update public.pm_schedules
        set equipment_code = case when equipment_code = v_row.equipment_code then v_new_code else equipment_code end,
            target_key = case when target_key = v_row.equipment_code and coalesce(target_type, '') ilike '%equipment%' then v_new_code else target_key end,
            data = case
              when data ? 'EquipmentCodes' then jsonb_set(
                case when data ? 'equipmentCode' and data->>'equipmentCode' = v_row.equipment_code
                     then jsonb_set(data, '{equipmentCode}', to_jsonb(v_new_code)) else data end,
                '{EquipmentCodes}',
                (select coalesce(jsonb_agg(case when elem = to_jsonb(v_row.equipment_code) then to_jsonb(v_new_code) else elem end), '[]'::jsonb)
                 from jsonb_array_elements(data->'EquipmentCodes') elem))
              when data ? 'equipmentCode' and data->>'equipmentCode' = v_row.equipment_code
                then jsonb_set(data, '{equipmentCode}', to_jsonb(v_new_code))
              else data end
        where site_id = v_site.site_id
          and (equipment_code = v_row.equipment_code
               or target_key = v_row.equipment_code
               or data->'EquipmentCodes' @> to_jsonb(v_row.equipment_code)
               or data->>'equipmentCode' = v_row.equipment_code);
        v_pms := v_pms + 1;
      end if;

      v_next := v_next + 1;
      v_site_done := v_site_done + 1;
    end loop;

    if v_site_done > 0 then
      -- bump the per-site revision so every client refetches
      if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_site_revision') then
        update public.cafm_site_revision r
        set revision = r.revision + 1
        where r.site_id = v_site.site_id;
      else
        raise notice 'cafm_site_revision not found: revision not bumped; clients may need a manual reload.';
      end if;
      raise notice 'V70.4 %: % equipment codes renumbered to small sequential IDs.',
        v_site.site_id, v_site_done;
      v_total := v_total + v_site_done;
    end if;
  end loop;

  raise notice 'V70.4 done: % equipment codes renumbered in total.', v_total;
end
$renum$;

commit;
