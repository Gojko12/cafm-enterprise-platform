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
// V61 = Section 111: locationRenameLog blob kind moved to the typed record table
// public.location_rename_log (supabase-v61-location-rename-log-table.sql);
// cafm_blocks view widened to 35 parts, cafm_save_state diff-saves 34 kinds.
// App untouched; API payloads byte-identical.
// V62 = Section 112: dedicated change_log record table (old_key/new_key/old_value/
// new_value/modified_by/modified_date/modified_time/site_id) + generic logger in
// the save pipeline + SuperAdmin-editable rule list (changeLogSettings) + /change-log page.
// V63 = Section 113: the dashboard Recent Activity panel became a full history
// browser: keyword search across WR id, user, kind and text; the first 20
// matching entries render and further batches render only while you scroll
// (never the whole history at once); the list keeps its own fixed-height
// scroll area so the dashboard layout stays stable. Client-side only, the
// kind `workRequests` Activity streams stay the payload source.
// MASTER_SPEC Section 113.
// V64 = Section 114: global search in the TopBar (components/modules/
// GlobalSearch.tsx, wired into MainLayout): one box searches the live client
// state across work requests, buildings, floors, rooms, equipment, PM
// schedules, freeze periods, craftspeople and CIFM people at once; results
// show grouped with per-category caps, counters and "+N more" module links;
// "/" focuses the box; ArrowUp/ArrowDown/Enter keyboard navigation; each hit
// deep-links to the owning module page. V1 navigates to the module; focus
// hand-off to the exact item inside each module is a future candidate.
// MASTER_SPEC Section 114.
// V65 = Section 115: global search focus hand-off + equipment split-pane
// scroll. Work request search hits now deep-link to the queue that owns
// the WR (/preventive-maintenance, /fast-jobs, /long-jobs) and the ?wr=
// effect opens the WR details popup right away, also when the hit is
// clicked while already on that page (the query is stripped after
// applying, so re-clicking the same hit reopens it). Equipment hits go
// to /equipment?eq=<code>, which preselects the item and opens its
// details panel. The equipment registry list and details panel now each
// get their own viewport-height scrollbar on lg screens, so selecting a
// row deep down the table never requires scrolling the page to find the
// details; below lg the details panel scrolls into view on selection.
// MASTER_SPEC Section 115.
// V66 = Section 116: per-person permission exceptions. The new brainstorm
// tab in People & Permissions ("6. Person Permission Exceptions") layers
// exceptions on top of the role defaults: emerald = granted beyond the
// roles, rose = denied despite the roles, slate = exactly the role
// defaults. Covers module access (sidebar entry hidden + page blocked,
// e.g. Fast Jobs), feature permissions (useApp.canAccess) and the
// operational capability flags (resolveEffectivePermissions). Grants are
// protect-railed: QA/audit and strictly role-determined capabilities can
// be denied but never granted, hard-locked features are never granted, and
// Super Admins are never restricted. New optional profile field
// permissionExceptions, accepted by the save route (no DB migration;
// userAccessProfiles stays a blob kind). Role editing is untouched.
// MASTER_SPEC Section 116.

export const PLATFORM_VERSION = "V66";
