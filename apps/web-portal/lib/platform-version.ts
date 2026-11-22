// Bump this on every platform release, in the same rhythm as apps/mobile-app/src/version.ts.
// V58 = Fast Job notifications batch (Stage C8): the fjNotifications collection
// (351 records, all FJ_DISSATISFACTION) moves from a jsonb blob to a proper typed
// Postgres table in scripts/supabase-v58-fj-notifications-table.sql. Identity lesson:
// the blob record id is only a slug (3 distinct values across 351 records), so the
// table keys on (site_id, wr_id, recipient), the pair the app already dedupes on;
// id lives on as notification_slug. The API contract is unchanged: the cafm_blocks
// view becomes a 34-part union serving identical payloads and cafm_save_state keeps
// its signature and diff guards, now skipping unchanged kinds across thirty-three
// record kinds. Notifications join to work_requests on real columns; the read flag
// is a boolean column with a partial unread index. Plain Postgres + PostgREST only:
// pg_dump-able onto ESA-internal servers.
// MASTER_SPEC Section 108.
export const PLATFORM_VERSION = "V58";
