// Bump this on every platform release, in the same rhythm as apps/mobile-app/src/version.ts.
// V57 = Audits & QA database batch (Stage C7): the eight audits/QA collections
// (auditFindings, auditInspections, auditCampaigns, auditTemplates, auditImports,
// qaInspectorAssignments, qaFailureReasons, qaAuditReports) move from jsonb blobs to
// proper typed Postgres tables in scripts/supabase-v57-audits-qa-tables.sql. The API
// contract is unchanged: the cafm_blocks view becomes a 33-part union serving identical
// payloads and cafm_save_state keeps its signature, now writing thirty-two record
// kinds. audit_findings keys on id and keeps calculatedDeadline as text (it can be
// the literal "No action"); qa_failure_reasons is the first string-list kind (the
// reason text itself is the column, seq is the identity); auditAssurance stays a
// settings blob on purpose. Plain Postgres + PostgREST only: pg_dump-able onto
// ESA-internal servers.
// MASTER_SPEC Section 107.
export const PLATFORM_VERSION = "V57";
