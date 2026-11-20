// Bump this on every platform release, in the same rhythm as apps/mobile-app/src/version.ts.
// V47 = Stage B delta sync: the client POSTs only changed collections and changed WR records (lib/sync-delta.ts), the API applies deltas onto the stored state with the same governance pipeline, useActiveUserPermissions extracted to its own module. MASTER_SPEC Section 97.
export const PLATFORM_VERSION = "V47";
