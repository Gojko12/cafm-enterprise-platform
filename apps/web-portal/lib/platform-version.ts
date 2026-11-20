// Bump this on every platform release, in the same rhythm as apps/mobile-app/src/version.ts.
// V44 = Database split stage A: server storage moves from the single cafm_state JSON blob to per-site, per-collection Postgres rows (cafm_blocks + cafm_site_revision, atomic cafm_save_state function). MASTER_SPEC Section 94.
export const PLATFORM_VERSION = "V44";
