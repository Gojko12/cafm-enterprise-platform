-- ============================================================================
-- V76 (Section 126) rollback: remove all equipment association blocks.
--
-- WHAT THIS DOES
--   Deletes every 'equipmentAssociations' block from public.cafm_blocks and
--   bumps the revision for each affected site so every client refetches
--   immediately. Equipment rows, work requests, schedules and all other
--   data are untouched: associations are a separate side collection.
--
-- IMPORTANT
--   - Full return to V75: revert the V76 commit (git revert), deploy, then
--     run this script. Running it alone is also safe, and safe to run twice
--     (the second pass finds nothing). No schema change.
--   - Paste this WHOLE file into the Supabase SQL editor and Run.
--   - Expect "Success. No rows returned" plus one notice per affected site.
-- ============================================================================

begin;

do $assoc$
declare
  v_site  record;
  v_count bigint;
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_blocks') then
    raise notice 'public.cafm_blocks not found: nothing to roll back.';
    return;
  end if;

  select count(*) into v_count from public.cafm_blocks where kind = 'equipmentAssociations';
  if v_count = 0 then
    raise notice 'No equipment associations found; nothing to roll back.';
    return;
  end if;

  create temp table v76_assoc_sites on commit drop as
    select distinct site_id from public.cafm_blocks where kind = 'equipmentAssociations';

  delete from public.cafm_blocks where kind = 'equipmentAssociations';

  for v_site in select site_id from v76_assoc_sites order by site_id loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_site_revision') then
      update public.cafm_site_revision r
        set revision = r.revision + 1
        where r.site_id = v_site.site_id;
      if not found then
        insert into public.cafm_site_revision (site_id, revision) values (v_site.site_id, 1);
      end if;
      raise notice 'V76 rollback %: associations removed, revision bumped.', v_site.site_id;
    else
      raise notice 'cafm_site_revision not found: revision not bumped for %; clients may need a manual reload.', v_site.site_id;
    end if;
  end loop;

  raise notice 'V76 rollback: removed % association row(s) across % site(s).', v_count, (select count(*) from v76_assoc_sites);
end
$assoc$;

commit;
