// Bump this on every platform release, in the same rhythm as apps/mobile-app/src/version.ts.
// V56 = PM & scheduling database batch (Stage C6): the six preventive-maintenance
// collections (schedules, pmCoordination, suppressedPmOccurrences, locationFreezes,
// missionEvents, blueprints) move from jsonb blobs to proper typed Postgres tables in
// scripts/supabase-v56-pm-scheduling-tables.sql. The API contract is unchanged: the
// cafm_blocks view serves identical payloads and cafm_save_state keeps its signature,
// now writing twenty-four record kinds. pm_schedules keys on ScheduleId, pm_blueprints
// keys on ChecklistCode (frequencyCode is NOT unique across families), schedules keeps
// both key spellings (level_name/room_code and level_name_key/room_code_key). Plain
// Postgres + PostgREST only: pg_dump-able onto ESA-internal servers.
// MASTER_SPEC Section 106.
export const PLATFORM_VERSION = "V56";
