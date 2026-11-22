// Bump this on every platform release, in the same rhythm as apps/mobile-app/src/version.ts.
// V55 = People & RBAC database batch (Stage C5): the eleven People / RBAC / onboarding
// collections (users, userAccessProfiles, cifmPeople, craftspeople, craftpersonAbsences,
// roleDefinitions, siteRoleAssignments, siteRoleMappings, tradeRoleMappings,
// stakeholderTeams, onboardingRequests) move from jsonb blobs to proper typed Postgres
// tables in scripts/supabase-v55-people-rbac-tables.sql. The API contract is unchanged:
// the cafm_blocks view serves identical payloads and cafm_save_state keeps its signature,
// now writing eighteen record kinds. Identity columns (usernames, craftperson ids,
// submitted_by / team leader / completion ids) are the future RLS binding points for
// per-user auth (ESA IdP); no owner columns added. Plain Postgres + PostgREST only:
// pg_dump-able onto ESA-internal servers.
// MASTER_SPEC Section 105.
export const PLATFORM_VERSION = "V55";
