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
// V67 = Section 117: person permission exceptions normalized for SQL and for
// the audit trail (the first recorded graduation item of Section 116).
// scripts/supabase-v67-person-permission-exceptions.sql adds the
// public.person_permission_exceptions VIEW: one row per person and permission
// key (person, role, permission_key, mode added/removed, updated_by,
// updated_at, all sites at once) as a pure projection of the
// user_access_profiles guaranteed source - deliberately no synced child table
// and no triggers, because cafm_save_state deletes and reinserts every
// profile row of a site on each save; a projection cannot drift. The app
// never reads the view (SQL-editor query surface); rollback = drop view.
// The history rides the existing change log: CHANGE_LOG_TYPES gained
// person.permissionException, the save-pipeline diff now compares prev vs
// next userAccessProfiles per person (recordKey = personName with id
// fallback), so every exception set/change/reset lands in change_log with
// who/when/old->new and shows on /change-log; recordKey person, cap 500
// unchanged. change_log.change_type is free text, so no SQL table change is
// needed for the history part; the view paste is the single SQL step.
// ChangeLogSettingsCard now merges the full type catalogue into the shown /
// toggled rules, so sites with pre-V67 saved settings still see and switch
// the new rule (missing rules stay enabled by default).
// MASTER_SPEC Section 117.
// V68 = Section 118: remote ESA ground stations catalogue + Gaussian-splats
// showcase library (management-demo preparation; requested after V66/V67).
// New page /ground-stations (Workspace section, module key groundStations,
// revocable through the V66 person exceptions like every other module):
// tab 1 is the typed read-only station catalogue lib/remote-stations.ts -
// the seven ESA-owned ESTRACK stations (Kourou, Santa Maria, Kiruna, Redu/
// ESEC, Cebreros, Malargue, New Norcia; ESA public material, Nov 2026) with
// coordinates (OpenStreetMap link), timezone, antennas (id/dish/bands/
// purpose), the max-5-rooms technical building, helipad where known and the
// STANDARD STATION KIT checklist (antenna+RF+timing, UPS + diesel generator
// + distribution, ops computers + ESOC links, KaBa access, fire + intruder
// alarm, CCTV, HVAC, fence, lightning protection) - the same kit at every
// station because they are unstaffed day to day and visited by selected
// technicians (clearance management is planned on top of the V66 person
// exceptions). Tab 2 is the splat library: a NEW persisted collection
// splatShowcases (SplatShowcaseSchema in shared-schema; blob kind stored via
// the generic cafm_blocks_store fallback, no SQL migration) whose entries
// frame superspl.at (PlayCanvas SuperSplat public gallery) scenes as
// iframes - paste the Embed-dialog iframe code or a scene URL; only
// superspl.at hosts may be framed; categories showcase / training /
// stationCapture, optional binding to a station or a free-text room target
// (ESOC power plant, EAC ISS rooms), per-site partitioned, SiteAdmin+
// managed. The in-app splat viewer itself is deliberately OUT of scope until
// the viewer test in the other project concludes; embedded examples serve
// the management demo and future technician training.
// MASTER_SPEC Section 118.
// V69 = Section 119: splat library editing + annotated share links + a real
// manage permission. Investigation (2026-11-24, wire-verified): superspl.at
// share links (https://superspl.at/s?id=<splat-hash>) are complete standalone
// viewer pages with NO frame restrictions; the sse-bootstrap JSON carries
// the owner's settings including the numbered annotation points with their
// own click-to-zoom cameras, so embedding the SHARE link (not the plain
// Embed-dialog iframe, whose splat may have no annotations) is the right
// training artefact. SplatLibrary: paste accepts share links, scene links
// and iframe code (unchanged superspl.at-only host rule); iframes now send
// allow="fullscreen; xr-spatial-tracking"; every card gained Open-full-page,
// Edit (pencil, prefilled form, saves editedBy/editedAt on the entry while
// addedBy/addedAt stay the creation record) and the unchanged delete; the
// explainer box tells the training story; training cards show the click-
// the-numbered-points hint. New permission groundStations.manage (shared-
// schema Permission enum + SiteAdministrator default; FEATURE_GROUPS row):
// editing the library is no longer hardwired to SuperAdmin/SiteAdmin roles
// but follows canAccess, so it is configurable per role in the Feature
// Matrix and per person (+ / -) in the V66 exceptions tab, which both pick
// the new row up automatically. Seeing the module was already revocable per
// person (module.groundStations, V68).
// MASTER_SPEC Section 119.
// V70 = Section 120: Local Equipment Code + full equipment filtering. The
// LocalEquipmentCode field (already in the shared schema, never the primary
// key: EquipmentCode stays the immutable internal ID) becomes a first-class
// operational identifier: flat-table column, quick-search and global-search
// field, editable in the details panel and settable at creation, with the
// [Location]_[Installation]_[Subcomponent] structure as guidance (soft
// amber warning, never a hard block, so legacy values keep parsing and
// renaming stays free). New filter engine (lib/equipment-filters.ts +
// components/modules/equipment/EquipmentFilterPanel.tsx) shared by all
// three registry views (equipment tree, location tree, flat table):
// per-field "contains" rows (AND with search and status) and an advanced
// AND/OR condition builder evaluated top to bottom, with a live match
// count; tree views therefore filter by any field exactly like the flat
// table. AddEquipmentModal extracted to components/modules/equipment/.
// No schema, DB, SQL or mobile change.
// MASTER_SPEC Section 120.
// V71 = Section 121: discreet filter UI + demo Local Equipment Code
// seeding. The V70 filter panel was a full-width band that pushed the
// registry content down; the filter rows now live in a compact dropdown
// popover anchored to the Filters button (a details element, the same
// pattern as the status dropdown), the long explanation sentences became
// hover tooltips, the match counter only renders while a filter is active,
// and the hook no longer returns a separate panel element. Addendum
// scripts/supabase-v70-1-local-equipment-codes.sql (belongs to Section 120,
// no new section number): generates [Location]_[Installation]_
// [Subcomponent] demo codes for every equipment row from a recognisable-
// abbreviation dictionary (DOOR, LADD, WIND, ALAR, FEXT, UV, CHIL, AHU,
// GEN, P, FT, ...), writes them to the data jsonb plus the
// local_equipment_code mirror and bumps the per-site revision. Data-only;
// no schema and no mobile change.
// MASTER_SPEC Section 121.
// V72 = Section 122: filter popover layout fix + loud active-filter
// indicator (two follow-ups from V71 live use). (1) In the popover the
// field select took its full natural width so the "contains" label, the
// value input and the remove button collapsed away; every select now has
// a fixed width (shrink-0), the value inputs keep a minimum width and the
// popover widened to 34rem, so a filter row is always fully visible.
// (2) Active filters are now impossible to miss: while any filter is on,
// the Filters button turns solid blue and reads "⚑ Filters (n)", and an
// amber strip appears under the toolbar in every registry view with the
// active filter count, the live "showing X of Y equipment" count and a
// Clear all filters button (the search box included), so nobody forgets
// that a filter is hiding equipment.
// MASTER_SPEC Section 122.
// V73 = Section 123: domain-correct equipment kits + registry layout
// follow-ups (three fixes from V72 live use). (1) Equipment kits: the demo
// seed no longer generates the generic "<System> Installation /
// SubEquipment / Component" trio (which produced rows like "Diesel
// Generator SubEquipment" and codes like GEN1_GEN1); every installation
// now carries a small, domain-correct kit, e.g. the diesel generator gets
// Gas pump (Gas meter, Gas filter), Cooling (Thermometer), Oil pump (Oil
// filter), with local codes S01-BL-111_GEN1_PUMP_MET and so on; section20
// seed + Addendum scripts/supabase-v70-2-equipment-tree-restructure.sql
// (belongs to Section 120, no new section number) restructures the live
// database the same way: installations renamed ("Installation" suffix
// dropped, codes [building]_[TYPE][seq]), old child rows renamed and
// re-pointed keeping their EquipmentCode and history, missing kit rows
// inserted, hand-built trees of more than 3 rows left untouched, nothing
// deleted. (2) Registry layout: tree/location/flat headers are sticky while
// scrolling, the left list scrolls horizontally, and a drag handle between
// list and details lets you squeeze the details panel to any width
// (15-85%, persisted per browser).
// MASTER_SPEC Section 123.

export const PLATFORM_VERSION = "V73";
