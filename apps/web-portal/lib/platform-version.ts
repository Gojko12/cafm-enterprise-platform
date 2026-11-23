// Bump this on every platform release, in the same rhythm as apps/mobile-app/src/version.ts.
// V59 = Rename audit logging (Section 109): every applied building/floor/room
// rename appends one entry to the new locationRenameLog blob collection
// (actor, from, to, per-collection impact counts, capped at 100 entries, no
// database change), and the Locations workbench shows a persistent Rename
// history panel below the 50/50 split. The rename cascade itself is untouched;
// the cafm_save_state pipeline stores the new blob kind in cafm_blocks_store
// automatically. Plain Postgres + PostgREST only.
// MASTER_SPEC Section 109.
export const PLATFORM_VERSION = "V59";
