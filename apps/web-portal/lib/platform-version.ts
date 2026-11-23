// Bump this on every platform release, in the same rhythm as apps/mobile-app/src/version.ts.
// V60 = Data integrity health check (Section 110): the rename cascade now also
// rewrites the PM targetKey snapshot on work requests (and the location-keyed
// audit family: campaigns, findings, inspections, CIFM people, onboarding),
// a server-side heal keeps stale browser copies consistent, and the
// supabase-v60-integrity-report.sql migration repairs the six drifted PM
// snapshots plus the frozen legacy audit rows, backs every repaired row up,
// and installs the 42-check cafm_integrity_report function backed by
// cafm_v60_repair_backup. Plain Postgres + PostgREST only.
// MASTER_SPEC Section 110.
// V60.1 = addendum to Section 110 (no new section number): report-only fix in
// supabase-v60-1-integrity-report-cifm.sql - cafm_integrity_report's
// cifm_stationed_building_missing now joins buildings on the person's home
// stationed_site_id instead of the partition site. No data changed; the warn
// family stays 26 on 02-ESOC until the other four sites are seeded.

export const PLATFORM_VERSION = "V60.1";
