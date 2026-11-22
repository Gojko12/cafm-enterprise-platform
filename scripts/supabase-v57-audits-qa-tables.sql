-- V57 CAFM Database Stage C7: Audits & QA (8 record kinds as proper Postgres rows)
-- Turns the audits & QA JSON-blob rows into real, typed, one-row-per-record tables
-- (97 records across 8 kinds on 02-ESOC at migration time; 2 of the 8 are empty today
-- and their column sets come straight from the app zod schemas):
--   audit_findings            one row per finding (identity = id)
--   audit_inspections         one row per inspection-route entry (identity = id)
--   audit_campaigns           one row per audit campaign (identity = id)
--   audit_templates           one row per checkpoint template (identity = id)
--   audit_imports             one row per staged import (identity = id)
--   qa_inspector_assignments  one row per inspector assignment (identity = id)
--   qa_failure_reasons        one row per configured failure reason. This is the first
--                             string-list kind: the collection holds plain scalars, not
--                             objects, so the reason text itself plus (site_id, seq) is
--                             the identity; the API still round-trips it as string[].
--   qa_audit_reports          one row per generated QA report (identity = id)
-- Every id-keyed record also carries its own siteId field: that IS the leading site_id
-- column of its table (filled from the saving site), NOT a separate typed column.
-- auditAssurance deliberately stays a JSON blob: it is a settings/config map
-- (deadlineDays, SLA days, bonus/malus), not a record collection.
-- PREREQUISITE: scripts/supabase-v56-pm-scheduling-tables.sql (Section 106) is applied:
-- cafm_blocks is the 25-part API view over cafm_blocks_store + twenty-four record kinds.
-- The application is deliberately untouched: the security_invoker VIEW cafm_blocks keeps
-- serving the exact same {site_id, kind, payload} rows to PostgREST, and cafm_save_state
-- keeps its exact contract (advisory lock, expected-revision check, SQLSTATE 40001
-- conflict, full-site replacement, revision bump). This file only widens the storage.
-- Local verification note: the live 02-ESOC data was probed before generation: all five
-- id-keyed kinds are unique and never empty (findings 43/43, inspections 37/37,
-- campaigns 3/3, templates 5/5, qa assignments 3/3), every numeric/int/bool field casts
-- cleanly, findings.calculatedDeadline can be the literal 'No action' so it stays text,
-- and campaign overall ratings are z.number() bounded 0..100 (not necessarily integers)
-- so they cast to numeric, not integer.
-- Grants: explicit service_role SELECT inside the file (the V49 lesson; no Supabase
-- default privileges exist on this project).
-- Safe to run twice (idempotent). One transaction = atomic cutover.
-- EMERGENCY ROLLBACK: see the bottom of this file.

begin;

-- 0) Pre-migration snapshot of the eight kinds being moved: permanent rollback
--    source (RLS-blocked).
do $snapshot$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_blocks_store')
     and not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v57_backup') then
    create table public.cafm_v57_backup (like public.cafm_blocks_store including indexes);
    insert into public.cafm_v57_backup
    select * from public.cafm_blocks_store where kind in ('auditCampaigns', 'auditFindings', 'auditImports', 'auditInspections', 'auditTemplates', 'qaAuditReports', 'qaFailureReasons', 'qaInspectorAssignments');
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cafm_v57_backup') then
    alter table public.cafm_v57_backup enable row level security;
  end if;
end
$snapshot$;

-- 1) The record tables. Column order must match the field order returned by the
--    cafm_*_row() functions further below.

-- Audit findings: the technical register extracted from campaigns, with AI
--                             flags, evidence, verification and the full audit trail
create table if not exists public.audit_findings (
  site_id                    text   not null    , -- also the record's own siteId field
  seq                        bigint not null    , -- array order within the collection
  finding_id                 text   not null    , -- id (identity)
  data                       jsonb  not null    , -- the complete record; guaranteed source for loads
  campaign_id                text              , -- campaignId
  campaign_name              text              , -- campaignName
  building_id                text              , -- buildingId
  room_id                    text              , -- roomId
  system_name                text              , -- systemName
  equipment_id               text              , -- equipmentId
  equipment_name             text              , -- equipmentName
  component_name             text              , -- componentName
  checkpoint_name            text              , -- checkpointName
  finding_type               text              , -- findingType
  urgency                    text              , -- urgency
  condition_score            text              , -- conditionScore
  operational_status         text              , -- operationalStatus
  discovered_at              text              , -- discoveredAt
  calculated_deadline        text              , -- calculatedDeadline
  title                      text              , -- title
  observation                text              , -- observation
  recommended_remedy         text              , -- recommendedRemedy
  measurements               text              , -- measurements
  responsible_party          text              , -- responsibleParty
  contractor_name            text              , -- contractorName
  trade                      text              , -- trade
  inspector_name             text              , -- inspectorName
  inspector_signature        text              , -- inspectorSignature
  inspector_photos           jsonb             , -- inspectorPhotos
  validation_status          text              , -- validationStatus
  validation_justification   text              , -- validationJustification
  validated_by               text              , -- validatedBy
  validated_at               text              , -- validatedAt
  supporting_validation_evidence jsonb             , -- supportingValidationEvidence
  ai_intelligence_flags      jsonb             , -- aiIntelligenceFlags
  ai_recommended_classification text              , -- aiRecommendedClassification
  ai_confidence_score        numeric            , -- aiConfidenceScore
  ai_reasoning               text              , -- aiReasoning
  duplicate_of_finding_id    text              , -- duplicateOfFindingId
  previous_year_finding_id   text              , -- previousYearFindingId
  is_recurring               boolean            , -- isRecurring
  is_disputed                boolean            , -- isDisputed
  is_overdue                 boolean            , -- isOverdue
  corrective_action_type     text              , -- correctiveActionType
  linked_wr_id               text              , -- linkedWrId
  work_package_id            text              , -- workPackageId
  linked_pm_schedule_id      text              , -- linkedPmScheduleId
  investment_project_id      text              , -- investmentProjectId
  investment_proposal        jsonb             , -- investmentProposal
  assurance_state            text              , -- assuranceState
  evidence                   jsonb             , -- evidence
  verification               jsonb             , -- verification
  audit_trail                jsonb             , -- auditTrail
  severity                   text              , -- severity
  due_date                   text              , -- dueDate
  addressed_at               text              , -- addressedAt
  status                     text                 -- status
);
create index if not exists audit_findings_site_seq on public.audit_findings (site_id, seq);
create index if not exists adf_site_campaign on public.audit_findings (site_id, campaign_id);
create index if not exists adf_site_equipment on public.audit_findings (site_id, equipment_id);
create index if not exists adf_site_urgency on public.audit_findings (site_id, urgency);
create index if not exists adf_site_validation on public.audit_findings (site_id, validation_status);
create index if not exists adf_site_assurance on public.audit_findings (site_id, assurance_state);
create index if not exists adf_site_status on public.audit_findings (site_id, status);

-- Audit inspections: the per-equipment route plan plus completion facts
create table if not exists public.audit_inspections (
  site_id                    text   not null    , -- also the record's own siteId field
  seq                        bigint not null    , -- array order within the collection
  inspection_id              text   not null    , -- id (identity)
  data                       jsonb  not null    , -- the complete record; guaranteed source for loads
  campaign_id                text              , -- campaignId
  equipment_id               text              , -- equipmentId
  building_id                text              , -- buildingId
  system_name                text              , -- systemName
  checkpoint_name            text              , -- checkpointName
  inspector                  text              , -- inspector
  planned_date               text              , -- plannedDate
  route_order                integer            , -- routeOrder
  accessibility              text              , -- accessibility
  status                     text              , -- status
  completed_at               text                 -- completedAt
);
create index if not exists audit_inspections_site_seq on public.audit_inspections (site_id, seq);
create index if not exists adi_site_campaign on public.audit_inspections (site_id, campaign_id);
create index if not exists adi_site_status on public.audit_inspections (site_id, status);
create index if not exists adi_site_inspector on public.audit_inspections (site_id, inspector);

-- Audit campaigns: scope, inspectors, progress counters and ratings
create table if not exists public.audit_campaigns (
  site_id                    text   not null    , -- also the record's own siteId field
  seq                        bigint not null    , -- array order within the collection
  campaign_id                text   not null    , -- id (identity)
  data                       jsonb  not null    , -- the complete record; guaranteed source for loads
  name                       text              , -- name
  provider                   text              , -- provider
  building_ids               jsonb             , -- buildingIds
  systems                    jsonb             , -- systems
  start_date                 text              , -- startDate
  end_date                   text              , -- endDate
  inspectors                 jsonb             , -- inspectors
  methodology                text              , -- methodology
  selected_equipment_ids     jsonb             , -- selectedEquipmentIds
  planned_inspections_count  integer            , -- plannedInspectionsCount
  completed_inspections_count integer            , -- completedInspectionsCount
  inaccessible_equipment_ids jsonb             , -- inaccessibleEquipmentIds
  overall_condition_rating   numeric            , -- overallConditionRating
  overall_operational_rating numeric            , -- overallOperationalRating
  previous_campaign_id       text              , -- previousCampaignId
  workflow_stage             text              , -- workflowStage
  imported_documents         jsonb                -- importedDocuments
);
create index if not exists audit_campaigns_site_seq on public.audit_campaigns (site_id, seq);
create index if not exists adc_site_workflow on public.audit_campaigns (site_id, workflow_stage);

-- Audit checkpoint templates per equipment category
create table if not exists public.audit_templates (
  site_id                    text   not null    , -- also the record's own siteId field
  seq                        bigint not null    , -- array order within the collection
  template_id                text   not null    , -- id (identity)
  data                       jsonb  not null    , -- the complete record; guaranteed source for loads
  category                   text              , -- category
  checkpoints                jsonb                -- checkpoints
);
create index if not exists audit_templates_site_seq on public.audit_templates (site_id, seq);
create index if not exists adt_site_category on public.audit_templates (site_id, category);

-- Staged audit imports awaiting validation (0 rows on 02-ESOC today)
create table if not exists public.audit_imports (
  site_id                    text   not null    , -- also the record's own siteId field
  seq                        bigint not null    , -- array order within the collection
  import_id                  text   not null    , -- id (identity)
  data                       jsonb  not null    , -- the complete record; guaranteed source for loads
  campaign_id                text              , -- campaignId
  file_name                  text              , -- fileName
  created_at                 text              , -- createdAt
  rows                       jsonb                -- rows
);
create index if not exists audit_imports_site_seq on public.audit_imports (site_id, seq);
create index if not exists aim_site_campaign on public.audit_imports (site_id, campaign_id);

-- QA inspector assignments: who may audit which trades and WR types
create table if not exists public.qa_inspector_assignments (
  site_id                    text   not null    , -- also the record's own siteId field
  seq                        bigint not null    , -- array order within the collection
  assignment_id              text   not null    , -- id (identity)
  data                       jsonb  not null    , -- the complete record; guaranteed source for loads
  person_name                text              , -- personName
  trades                     jsonb             , -- trades
  wr_types                   jsonb                -- wrTypes
);
create index if not exists qa_inspector_assignments_site_seq on public.qa_inspector_assignments (site_id, seq);
create index if not exists qia_site_person on public.qa_inspector_assignments (site_id, person_name);

-- Generated QA audit reports (0 rows on 02-ESOC today)
create table if not exists public.qa_audit_reports (
  site_id                    text   not null    , -- also the record's own siteId field
  seq                        bigint not null    , -- array order within the collection
  report_id                  text   not null    , -- id (identity)
  data                       jsonb  not null    , -- the complete record; guaranteed source for loads
  created_at                 text              , -- createdAt
  inspector                  text              , -- inspector
  executive_summary          text              , -- executiveSummary
  recipients                 jsonb             , -- recipients
  total_inspected            integer            , -- totalInspected
  passed_count               integer            , -- passedCount
  failed_count               integer            , -- failedCount
  trade_stats                jsonb             , -- tradeStats
  items                      jsonb                -- items
);
create index if not exists qa_audit_reports_site_seq on public.qa_audit_reports (site_id, seq);
create index if not exists qar_site_inspector on public.qa_audit_reports (site_id, inspector);

-- QA failure reasons: the first string-list kind. The collection holds plain text
-- scalars (no object keys), so identity = (site_id, seq) with the reason text stored
-- as a real column; the API still round-trips it as string[].
create table if not exists public.qa_failure_reasons (
  site_id                    text   not null    ,
  seq                        bigint not null    , -- array order within the collection
  reason                     text   not null    , -- the reason text itself (the value IS the record)
  data                       jsonb  not null      -- the scalar as jsonb; guaranteed source for loads
);
create index if not exists qa_failure_reasons_site_seq on public.qa_failure_reasons (site_id, seq);

-- RLS stays on with no policies: only the service role key used by the server
-- can read and write, exactly like the other CAFM record tables.

alter table public.audit_findings enable row level security;
alter table public.audit_inspections enable row level security;
alter table public.audit_campaigns enable row level security;
alter table public.audit_templates enable row level security;
alter table public.audit_imports enable row level security;
alter table public.qa_inspector_assignments enable row level security;
alter table public.qa_audit_reports enable row level security;
alter table public.qa_failure_reasons enable row level security;

-- 2) Single source of truth for extracting a record into typed columns.
--    Field order matches the table column order above. The leading site_id comes from
--    the saving site (p_site), which equals every record's siteId field.

create or replace function public.cafm_adf_row(p_site text, p_seq bigint, b jsonb)
returns public.audit_findings
language sql
stable
as $adf$
  select p_site, p_seq, b->>'id', b,
         b->>'campaignId',
         b->>'campaignName',
         b->>'buildingId',
         b->>'roomId',
         b->>'systemName',
         b->>'equipmentId',
         b->>'equipmentName',
         b->>'componentName',
         b->>'checkpointName',
         b->>'findingType',
         b->>'urgency',
         b->>'conditionScore',
         b->>'operationalStatus',
         b->>'discoveredAt',
         b->>'calculatedDeadline',
         b->>'title',
         b->>'observation',
         b->>'recommendedRemedy',
         b->>'measurements',
         b->>'responsibleParty',
         b->>'contractorName',
         b->>'trade',
         b->>'inspectorName',
         b->>'inspectorSignature',
         coalesce(b->'inspectorPhotos', '[]'::jsonb),
         b->>'validationStatus',
         b->>'validationJustification',
         b->>'validatedBy',
         b->>'validatedAt',
         coalesce(b->'supportingValidationEvidence', '[]'::jsonb),
         coalesce(b->'aiIntelligenceFlags', '[]'::jsonb),
         b->>'aiRecommendedClassification',
         nullif(b->>'aiConfidenceScore', '')::numeric,
         b->>'aiReasoning',
         b->>'duplicateOfFindingId',
         b->>'previousYearFindingId',
         nullif(b->>'isRecurring', '')::boolean,
         nullif(b->>'isDisputed', '')::boolean,
         nullif(b->>'isOverdue', '')::boolean,
         b->>'correctiveActionType',
         b->>'linkedWrId',
         b->>'workPackageId',
         b->>'linkedPmScheduleId',
         b->>'investmentProjectId',
         coalesce(b->'investmentProposal', '{}'::jsonb),
         b->>'assuranceState',
         coalesce(b->'evidence', '{}'::jsonb),
         coalesce(b->'verification', '{}'::jsonb),
         coalesce(b->'auditTrail', '[]'::jsonb),
         b->>'severity',
         b->>'dueDate',
         b->>'addressedAt',
         b->>'status'
$adf$;

create or replace function public.cafm_adi_row(p_site text, p_seq bigint, b jsonb)
returns public.audit_inspections
language sql
stable
as $adi$
  select p_site, p_seq, b->>'id', b,
         b->>'campaignId',
         b->>'equipmentId',
         b->>'buildingId',
         b->>'systemName',
         b->>'checkpointName',
         b->>'inspector',
         b->>'plannedDate',
         nullif(b->>'routeOrder', '')::integer,
         b->>'accessibility',
         b->>'status',
         b->>'completedAt'
$adi$;

create or replace function public.cafm_adc_row(p_site text, p_seq bigint, b jsonb)
returns public.audit_campaigns
language sql
stable
as $adc$
  select p_site, p_seq, b->>'id', b,
         b->>'name',
         b->>'provider',
         coalesce(b->'buildingIds', '[]'::jsonb),
         coalesce(b->'systems', '[]'::jsonb),
         b->>'startDate',
         b->>'endDate',
         coalesce(b->'inspectors', '[]'::jsonb),
         b->>'methodology',
         coalesce(b->'selectedEquipmentIds', '[]'::jsonb),
         nullif(b->>'plannedInspectionsCount', '')::integer,
         nullif(b->>'completedInspectionsCount', '')::integer,
         coalesce(b->'inaccessibleEquipmentIds', '[]'::jsonb),
         nullif(b->>'overallConditionRating', '')::numeric,
         nullif(b->>'overallOperationalRating', '')::numeric,
         b->>'previousCampaignId',
         b->>'workflowStage',
         coalesce(b->'importedDocuments', '[]'::jsonb)
$adc$;

create or replace function public.cafm_adt_row(p_site text, p_seq bigint, b jsonb)
returns public.audit_templates
language sql
stable
as $adt$
  select p_site, p_seq, b->>'id', b,
         b->>'category',
         coalesce(b->'checkpoints', '[]'::jsonb)
$adt$;

create or replace function public.cafm_aim_row(p_site text, p_seq bigint, b jsonb)
returns public.audit_imports
language sql
stable
as $aim$
  select p_site, p_seq, b->>'id', b,
         b->>'campaignId',
         b->>'fileName',
         b->>'createdAt',
         coalesce(b->'rows', '[]'::jsonb)
$aim$;

create or replace function public.cafm_qia_row(p_site text, p_seq bigint, b jsonb)
returns public.qa_inspector_assignments
language sql
stable
as $qia$
  select p_site, p_seq, b->>'id', b,
         b->>'personName',
         coalesce(b->'trades', '[]'::jsonb),
         coalesce(b->'wrTypes', '[]'::jsonb)
$qia$;

create or replace function public.cafm_qar_row(p_site text, p_seq bigint, b jsonb)
returns public.qa_audit_reports
language sql
stable
as $qar$
  select p_site, p_seq, b->>'id', b,
         b->>'createdAt',
         b->>'inspector',
         b->>'executiveSummary',
         coalesce(b->'recipients', '[]'::jsonb),
         nullif(b->>'totalInspected', '')::integer,
         nullif(b->>'passedCount', '')::integer,
         nullif(b->>'failedCount', '')::integer,
         coalesce(b->'tradeStats', '[]'::jsonb),
         coalesce(b->'items', '[]'::jsonb)
$qar$;

create or replace function public.cafm_qfr_row(p_site text, p_seq bigint, b jsonb)
returns public.qa_failure_reasons
language sql
stable
as $qfr$
  select p_site, p_seq, b #>> '{}', b
$qfr$;

-- 3) Insert helpers used by saves and by the one-time data move below.

create or replace function public.cafm_adf_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_adf_s$
  with inserted as (
    insert into public.audit_findings
    select (public.cafm_adf_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_adf_s$;


create or replace function public.cafm_adi_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_adi_s$
  with inserted as (
    insert into public.audit_inspections
    select (public.cafm_adi_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_adi_s$;


create or replace function public.cafm_adc_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_adc_s$
  with inserted as (
    insert into public.audit_campaigns
    select (public.cafm_adc_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_adc_s$;


create or replace function public.cafm_adt_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_adt_s$
  with inserted as (
    insert into public.audit_templates
    select (public.cafm_adt_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_adt_s$;


create or replace function public.cafm_aim_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_aim_s$
  with inserted as (
    insert into public.audit_imports
    select (public.cafm_aim_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_aim_s$;


create or replace function public.cafm_qia_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_qia_s$
  with inserted as (
    insert into public.qa_inspector_assignments
    select (public.cafm_qia_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_qia_s$;


create or replace function public.cafm_qar_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_qar_s$
  with inserted as (
    insert into public.qa_audit_reports
    select (public.cafm_qar_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_qar_s$;


create or replace function public.cafm_qfr_store_rows(p_site_id text, p_items jsonb) returns bigint
language sql volatile as $store_qfr_s$
  with inserted as (
    insert into public.qa_failure_reasons
    select (public.cafm_qfr_row(p_site_id, t.ord, t.i)).*
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord)
    returning 1
  )
  select count(*) from inserted;
$store_qfr_s$;

-- 4) One-time data move: existing blob rows become record rows, then the blob rows
--    are removed. (Idempotent: after the first run the store holds none of these kinds.)

insert into public.audit_findings
select (public.cafm_adf_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'auditFindings';

insert into public.audit_inspections
select (public.cafm_adi_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'auditInspections';

insert into public.audit_campaigns
select (public.cafm_adc_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'auditCampaigns';

insert into public.audit_templates
select (public.cafm_adt_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'auditTemplates';

insert into public.audit_imports
select (public.cafm_aim_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'auditImports';

insert into public.qa_inspector_assignments
select (public.cafm_qia_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'qaInspectorAssignments';

insert into public.qa_audit_reports
select (public.cafm_qar_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'qaAuditReports';

insert into public.qa_failure_reasons
select (public.cafm_qfr_row(b.site_id, t.ord, t.i)).*
from public.cafm_blocks_store b,
     lateral jsonb_array_elements(b.payload) with ordinality as t(i, ord)
where b.kind = 'qaFailureReasons';

delete from public.cafm_blocks_store where kind in ('auditCampaigns', 'auditFindings', 'auditImports', 'auditInspections', 'auditTemplates', 'qaAuditReports', 'qaFailureReasons', 'qaInspectorAssignments');

-- 5) The API view: now a 33-part union. All thirty-two record kinds are driven by
--    cafm_site_revision so every known site always emits them ([] when empty).
create or replace view public.cafm_blocks with (security_invoker = true) as
  select site_id, kind, payload
  from public.cafm_blocks_store

  union all
  select r.site_id, 'workRequests',
         coalesce((select jsonb_agg(w.data order by w.seq)
                   from public.work_requests w
                   where w.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'deletedWorkRequests',
         coalesce((select jsonb_agg(w.data order by w.seq)
                   from public.deleted_work_requests w
                   where w.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'equipment',
         coalesce((select jsonb_agg(e.data order by e.seq)
                   from public.equipment e
                   where e.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'rooms',
         coalesce((select jsonb_agg(rm.data order by rm.seq)
                   from public.rooms rm
                   where rm.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'buildings',
         coalesce((select jsonb_agg(b.data order by b.seq)
                   from public.buildings b
                   where b.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'floors',
         coalesce((select jsonb_agg(f.data order by f.seq)
                   from public.floors f
                   where f.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'desks',
         coalesce((select jsonb_agg(d.data order by d.seq)
                   from public.desks d
                   where d.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'users',
         coalesce((select jsonb_agg(u.data order by u.seq)
                   from public.users u
                   where u.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'userAccessProfiles',
         coalesce((select jsonb_agg(up.data order by up.seq)
                   from public.user_access_profiles up
                   where up.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'cifmPeople',
         coalesce((select jsonb_agg(cp.data order by cp.seq)
                   from public.cifm_people cp
                   where cp.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'craftspeople',
         coalesce((select jsonb_agg(cr.data order by cr.seq)
                   from public.craftspeople cr
                   where cr.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'craftpersonAbsences',
         coalesce((select jsonb_agg(ab.data order by ab.seq)
                   from public.craftperson_absences ab
                   where ab.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'roleDefinitions',
         coalesce((select jsonb_agg(rd.data order by rd.seq)
                   from public.role_definitions rd
                   where rd.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'siteRoleAssignments',
         coalesce((select jsonb_agg(sra.data order by sra.seq)
                   from public.site_role_assignments sra
                   where sra.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'siteRoleMappings',
         coalesce((select jsonb_agg(srm.data order by srm.seq)
                   from public.site_role_mappings srm
                   where srm.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'tradeRoleMappings',
         coalesce((select jsonb_agg(trm.data order by trm.seq)
                   from public.trade_role_mappings trm
                   where trm.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'stakeholderTeams',
         coalesce((select jsonb_agg(st.data order by st.seq)
                   from public.stakeholder_teams st
                   where st.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'onboardingRequests',
         coalesce((select jsonb_agg(onb.data order by onb.seq)
                   from public.onboarding_requests onb
                   where onb.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'schedules',
         coalesce((select jsonb_agg(ps.data order by ps.seq)
                   from public.pm_schedules ps
                   where ps.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'pmCoordination',
         coalesce((select jsonb_agg(pc.data order by pc.seq)
                   from public.pm_coordination pc
                   where pc.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'suppressedPmOccurrences',
         coalesce((select jsonb_agg(spo.data order by spo.seq)
                   from public.suppressed_pm_occurrences spo
                   where spo.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'locationFreezes',
         coalesce((select jsonb_agg(fz.data order by fz.seq)
                   from public.location_freezes fz
                   where fz.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'missionEvents',
         coalesce((select jsonb_agg(mv.data order by mv.seq)
                   from public.mission_events mv
                   where mv.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'blueprints',
         coalesce((select jsonb_agg(bp.data order by bp.seq)
                   from public.pm_blueprints bp
                   where bp.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'auditFindings',
         coalesce((select jsonb_agg(af.data order by af.seq)
                   from public.audit_findings af
                   where af.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'auditInspections',
         coalesce((select jsonb_agg(ins.data order by ins.seq)
                   from public.audit_inspections ins
                   where ins.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'auditCampaigns',
         coalesce((select jsonb_agg(cmp.data order by cmp.seq)
                   from public.audit_campaigns cmp
                   where cmp.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'auditTemplates',
         coalesce((select jsonb_agg(tmp.data order by tmp.seq)
                   from public.audit_templates tmp
                   where tmp.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'auditImports',
         coalesce((select jsonb_agg(imp.data order by imp.seq)
                   from public.audit_imports imp
                   where imp.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'qaInspectorAssignments',
         coalesce((select jsonb_agg(qia.data order by qia.seq)
                   from public.qa_inspector_assignments qia
                   where qia.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'qaFailureReasons',
         coalesce((select jsonb_agg(qfr.data order by qfr.seq)
                   from public.qa_failure_reasons qfr
                   where qfr.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

  union all
  select r.site_id, 'qaAuditReports',
         coalesce((select jsonb_agg(qar.data order by qar.seq)
                   from public.qa_audit_reports qar
                   where qar.site_id = r.site_id), '[]'::jsonb)
  from public.cafm_site_revision r

;

-- 6) Grants (the V49 production lesson, baked in since): security_invoker views run
--    with the INVOKER's table grants and this project has no default privileges.
--    Skipped in vanilla local Postgres without Supabase roles.
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.cafm_blocks to service_role';
    execute 'grant select on public.work_requests, public.deleted_work_requests, public.equipment, public.rooms, public.buildings, public.floors, public.desks, public.users, public.user_access_profiles, public.cifm_people, public.craftspeople, public.craftperson_absences, public.role_definitions, public.site_role_assignments, public.site_role_mappings, public.trade_role_mappings, public.stakeholder_teams, public.onboarding_requests, public.pm_schedules, public.pm_coordination, public.suppressed_pm_occurrences, public.location_freezes, public.mission_events, public.pm_blueprints, public.audit_findings, public.audit_inspections, public.audit_campaigns, public.audit_templates, public.audit_imports, public.qa_inspector_assignments, public.qa_failure_reasons, public.qa_audit_reports to service_role';
  end if;
end
$grant$;

-- 7) cafm_save_state: same signature and contract as V49-V56, now writing thirty-two
--    record kinds.
create or replace function public.cafm_save_state(
  p_site_id           text,
  p_expected_revision bigint,
  p_new_revision      bigint,
  p_blocks            jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $save$
begin
  perform pg_advisory_xact_lock(hashtext('cafm-save:' || p_site_id));
  if coalesce((select revision from cafm_site_revision where site_id = p_site_id), 0)
     <> coalesce(p_expected_revision, 0) then
    raise exception 'State has changed; reload and resolve the conflict.'
      using errcode = '40001';
  end if;
  delete from work_requests where site_id = p_site_id;
  perform cafm_wr_store_rows(p_site_id, p_blocks->'workRequests');
  delete from deleted_work_requests where site_id = p_site_id;
  perform cafm_dwr_store_rows(p_site_id, p_blocks->'deletedWorkRequests');
  delete from equipment where site_id = p_site_id;
  perform cafm_eq_store_rows(p_site_id, p_blocks->'equipment');
  delete from rooms where site_id = p_site_id;
  perform cafm_room_store_rows(p_site_id, p_blocks->'rooms');
  delete from buildings where site_id = p_site_id;
  perform cafm_building_store_rows(p_site_id, p_blocks->'buildings');
  delete from floors where site_id = p_site_id;
  perform cafm_floor_store_rows(p_site_id, p_blocks->'floors');
  delete from desks where site_id = p_site_id;
  perform cafm_desk_store_rows(p_site_id, p_blocks->'desks');
  delete from users where site_id = p_site_id;
  perform cafm_user_store_rows(p_site_id, p_blocks->'users');
  delete from user_access_profiles where site_id = p_site_id;
  perform cafm_uap_store_rows(p_site_id, p_blocks->'userAccessProfiles');
  delete from cifm_people where site_id = p_site_id;
  perform cafm_cifmp_store_rows(p_site_id, p_blocks->'cifmPeople');
  delete from craftspeople where site_id = p_site_id;
  perform cafm_craftsp_store_rows(p_site_id, p_blocks->'craftspeople');
  delete from craftperson_absences where site_id = p_site_id;
  perform cafm_absence_store_rows(p_site_id, p_blocks->'craftpersonAbsences');
  delete from role_definitions where site_id = p_site_id;
  perform cafm_roledef_store_rows(p_site_id, p_blocks->'roleDefinitions');
  delete from site_role_assignments where site_id = p_site_id;
  perform cafm_sra_store_rows(p_site_id, p_blocks->'siteRoleAssignments');
  delete from site_role_mappings where site_id = p_site_id;
  perform cafm_srm_store_rows(p_site_id, p_blocks->'siteRoleMappings');
  delete from trade_role_mappings where site_id = p_site_id;
  perform cafm_trm_store_rows(p_site_id, p_blocks->'tradeRoleMappings');
  delete from stakeholder_teams where site_id = p_site_id;
  perform cafm_team_store_rows(p_site_id, p_blocks->'stakeholderTeams');
  delete from onboarding_requests where site_id = p_site_id;
  perform cafm_onboarding_store_rows(p_site_id, p_blocks->'onboardingRequests');
  delete from pm_schedules where site_id = p_site_id;
  perform cafm_pms_store_rows(p_site_id, p_blocks->'schedules');
  delete from pm_coordination where site_id = p_site_id;
  perform cafm_pmc_store_rows(p_site_id, p_blocks->'pmCoordination');
  delete from suppressed_pm_occurrences where site_id = p_site_id;
  perform cafm_spo_store_rows(p_site_id, p_blocks->'suppressedPmOccurrences');
  delete from location_freezes where site_id = p_site_id;
  perform cafm_frz_store_rows(p_site_id, p_blocks->'locationFreezes');
  delete from mission_events where site_id = p_site_id;
  perform cafm_mev_store_rows(p_site_id, p_blocks->'missionEvents');
  delete from pm_blueprints where site_id = p_site_id;
  perform cafm_bpl_store_rows(p_site_id, p_blocks->'blueprints');
  delete from audit_findings where site_id = p_site_id;
  perform cafm_adf_store_rows(p_site_id, p_blocks->'auditFindings');
  delete from audit_inspections where site_id = p_site_id;
  perform cafm_adi_store_rows(p_site_id, p_blocks->'auditInspections');
  delete from audit_campaigns where site_id = p_site_id;
  perform cafm_adc_store_rows(p_site_id, p_blocks->'auditCampaigns');
  delete from audit_templates where site_id = p_site_id;
  perform cafm_adt_store_rows(p_site_id, p_blocks->'auditTemplates');
  delete from audit_imports where site_id = p_site_id;
  perform cafm_aim_store_rows(p_site_id, p_blocks->'auditImports');
  delete from qa_inspector_assignments where site_id = p_site_id;
  perform cafm_qia_store_rows(p_site_id, p_blocks->'qaInspectorAssignments');
  delete from qa_failure_reasons where site_id = p_site_id;
  perform cafm_qfr_store_rows(p_site_id, p_blocks->'qaFailureReasons');
  delete from qa_audit_reports where site_id = p_site_id;
  perform cafm_qar_store_rows(p_site_id, p_blocks->'qaAuditReports');

  delete from cafm_blocks_store where site_id = p_site_id;
  insert into cafm_blocks_store (site_id, kind, payload)
  select p_site_id, key, value from jsonb_each(p_blocks)
  where key not in ('auditCampaigns', 'auditFindings', 'auditImports', 'auditInspections', 'auditTemplates', 'blueprints', 'buildings', 'cifmPeople', 'craftpersonAbsences', 'craftspeople', 'deletedWorkRequests', 'desks', 'equipment', 'floors', 'locationFreezes', 'missionEvents', 'onboardingRequests', 'pmCoordination', 'qaAuditReports', 'qaFailureReasons', 'qaInspectorAssignments', 'roleDefinitions', 'rooms', 'schedules', 'siteRoleAssignments', 'siteRoleMappings', 'stakeholderTeams', 'suppressedPmOccurrences', 'tradeRoleMappings', 'userAccessProfiles', 'users', 'workRequests');
  insert into cafm_site_revision (site_id, revision)
  values (p_site_id, p_new_revision)
  on conflict (site_id) do update set revision = excluded.revision;
  return jsonb_build_object('revision', p_new_revision);
end
$save$;

-- 8) Legacy-blob migration path (fresh installs only; production is already on blocks):
--    repoint the V44 one-time migration at the store + all thirty-two record tables.
create or replace function public.cafm_migrate_v44() returns jsonb
language plpgsql
security definer
set search_path = public
as $mig$
declare
  v_legacy jsonb;
  v_site   text;
  v_state  jsonb;
  v_sites  int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('cafm-migrate'));
  if exists (select 1 from cafm_blocks_store limit 1)
     or exists (select 1 from work_requests limit 1)
     or exists (select 1 from deleted_work_requests limit 1)
     or exists (select 1 from equipment limit 1)
     or exists (select 1 from rooms limit 1)
     or exists (select 1 from buildings limit 1)
     or exists (select 1 from floors limit 1)
     or exists (select 1 from desks limit 1)
     or exists (select 1 from users limit 1)
     or exists (select 1 from user_access_profiles limit 1)
     or exists (select 1 from cifm_people limit 1)
     or exists (select 1 from craftspeople limit 1)
     or exists (select 1 from craftperson_absences limit 1)
     or exists (select 1 from role_definitions limit 1)
     or exists (select 1 from site_role_assignments limit 1)
     or exists (select 1 from site_role_mappings limit 1)
     or exists (select 1 from trade_role_mappings limit 1)
     or exists (select 1 from stakeholder_teams limit 1)
     or exists (select 1 from onboarding_requests limit 1)
     or exists (select 1 from pm_schedules limit 1)
     or exists (select 1 from pm_coordination limit 1)
     or exists (select 1 from suppressed_pm_occurrences limit 1)
     or exists (select 1 from location_freezes limit 1)
     or exists (select 1 from mission_events limit 1)
     or exists (select 1 from pm_blueprints limit 1)
     or exists (select 1 from audit_findings limit 1)
     or exists (select 1 from audit_inspections limit 1)
     or exists (select 1 from audit_campaigns limit 1)
     or exists (select 1 from audit_templates limit 1)
     or exists (select 1 from audit_imports limit 1)
     or exists (select 1 from qa_inspector_assignments limit 1)
     or exists (select 1 from qa_failure_reasons limit 1)
     or exists (select 1 from qa_audit_reports limit 1)
     or exists (select 1 from cafm_site_revision limit 1) then
    return jsonb_build_object('migratedSites', 0, 'reason', 'already migrated');
  end if;
  if to_regclass('public.cafm_state') is null then
    return jsonb_build_object('migratedSites', 0, 'reason', 'no legacy state table');
  end if;
  select payload into v_legacy from public.cafm_state where id = 'default' limit 1;
  if v_legacy is null then
    return jsonb_build_object('migratedSites', 0, 'reason', 'legacy state empty');
  end if;
  for v_site, v_state in
    select key, value from jsonb_each(v_legacy -> 'sites')
  loop
    delete from cafm_blocks_store where site_id = v_site;
    perform cafm_wr_store_rows(v_site, v_state -> 'state' -> 'workRequests');
    perform cafm_dwr_store_rows(v_site, v_state -> 'state' -> 'deletedWorkRequests');
    perform cafm_eq_store_rows(v_site, v_state -> 'state' -> 'equipment');
    perform cafm_room_store_rows(v_site, v_state -> 'state' -> 'rooms');
    perform cafm_building_store_rows(v_site, v_state -> 'state' -> 'buildings');
    perform cafm_floor_store_rows(v_site, v_state -> 'state' -> 'floors');
    perform cafm_desk_store_rows(v_site, v_state -> 'state' -> 'desks');
    perform cafm_user_store_rows(v_site, v_state -> 'state' -> 'users');
    perform cafm_uap_store_rows(v_site, v_state -> 'state' -> 'userAccessProfiles');
    perform cafm_cifmp_store_rows(v_site, v_state -> 'state' -> 'cifmPeople');
    perform cafm_craftsp_store_rows(v_site, v_state -> 'state' -> 'craftspeople');
    perform cafm_absence_store_rows(v_site, v_state -> 'state' -> 'craftpersonAbsences');
    perform cafm_roledef_store_rows(v_site, v_state -> 'state' -> 'roleDefinitions');
    perform cafm_sra_store_rows(v_site, v_state -> 'state' -> 'siteRoleAssignments');
    perform cafm_srm_store_rows(v_site, v_state -> 'state' -> 'siteRoleMappings');
    perform cafm_trm_store_rows(v_site, v_state -> 'state' -> 'tradeRoleMappings');
    perform cafm_team_store_rows(v_site, v_state -> 'state' -> 'stakeholderTeams');
    perform cafm_onboarding_store_rows(v_site, v_state -> 'state' -> 'onboardingRequests');
    perform cafm_pms_store_rows(v_site, v_state -> 'state' -> 'schedules');
    perform cafm_pmc_store_rows(v_site, v_state -> 'state' -> 'pmCoordination');
    perform cafm_spo_store_rows(v_site, v_state -> 'state' -> 'suppressedPmOccurrences');
    perform cafm_frz_store_rows(v_site, v_state -> 'state' -> 'locationFreezes');
    perform cafm_mev_store_rows(v_site, v_state -> 'state' -> 'missionEvents');
    perform cafm_bpl_store_rows(v_site, v_state -> 'state' -> 'blueprints');
    perform cafm_adf_store_rows(v_site, v_state -> 'state' -> 'auditFindings');
    perform cafm_adi_store_rows(v_site, v_state -> 'state' -> 'auditInspections');
    perform cafm_adc_store_rows(v_site, v_state -> 'state' -> 'auditCampaigns');
    perform cafm_adt_store_rows(v_site, v_state -> 'state' -> 'auditTemplates');
    perform cafm_aim_store_rows(v_site, v_state -> 'state' -> 'auditImports');
    perform cafm_qia_store_rows(v_site, v_state -> 'state' -> 'qaInspectorAssignments');
    perform cafm_qfr_store_rows(v_site, v_state -> 'state' -> 'qaFailureReasons');
    perform cafm_qar_store_rows(v_site, v_state -> 'state' -> 'qaAuditReports');

    insert into cafm_blocks_store (site_id, kind, payload)
    select v_site, key, value from jsonb_each(coalesce(v_state -> 'state', '{}'::jsonb))
    where key not in ('auditCampaigns', 'auditFindings', 'auditImports', 'auditInspections', 'auditTemplates', 'blueprints', 'buildings', 'cifmPeople', 'craftpersonAbsences', 'craftspeople', 'deletedWorkRequests', 'desks', 'equipment', 'floors', 'locationFreezes', 'missionEvents', 'onboardingRequests', 'pmCoordination', 'qaAuditReports', 'qaFailureReasons', 'qaInspectorAssignments', 'roleDefinitions', 'rooms', 'schedules', 'siteRoleAssignments', 'siteRoleMappings', 'stakeholderTeams', 'suppressedPmOccurrences', 'tradeRoleMappings', 'userAccessProfiles', 'users', 'workRequests');
    insert into cafm_site_revision (site_id, revision)
    values (v_site, coalesce((v_state ->> 'revision')::bigint, 0))
    on conflict (site_id) do update set revision = excluded.revision;
    v_sites := v_sites + 1;
  end loop;
  return jsonb_build_object('migratedSites', v_sites);
end
$mig$;

commit;

-- 9) Verification (eyeball the results in the SQL editor):
-- 9a. Record counts and storage sizes:

select 'audit_findings' as table_name, count(*) as rows, pg_total_relation_size('public.audit_findings') as bytes_on_disk
from public.audit_findings
union all

select 'audit_inspections' as table_name, count(*) as rows, pg_total_relation_size('public.audit_inspections') as bytes_on_disk
from public.audit_inspections
union all

select 'audit_campaigns' as table_name, count(*) as rows, pg_total_relation_size('public.audit_campaigns') as bytes_on_disk
from public.audit_campaigns
union all

select 'audit_templates' as table_name, count(*) as rows, pg_total_relation_size('public.audit_templates') as bytes_on_disk
from public.audit_templates
union all

select 'audit_imports' as table_name, count(*) as rows, pg_total_relation_size('public.audit_imports') as bytes_on_disk
from public.audit_imports
union all

select 'qa_inspector_assignments' as table_name, count(*) as rows, pg_total_relation_size('public.qa_inspector_assignments') as bytes_on_disk
from public.qa_inspector_assignments
union all

select 'qa_audit_reports' as table_name, count(*) as rows, pg_total_relation_size('public.qa_audit_reports') as bytes_on_disk
from public.qa_audit_reports
union all

select 'qa_failure_reasons' as table_name, count(*) as rows, pg_total_relation_size('public.qa_failure_reasons') as bytes_on_disk
from public.qa_failure_reasons
union all

select 'cafm_blocks_store', count(*), pg_total_relation_size('public.cafm_blocks_store')
from public.cafm_blocks_store
union all
select 'cafm_v57_backup', count(*), pg_total_relation_size('public.cafm_v57_backup')
from public.cafm_v57_backup;

-- 9b. Round-trip fidelity: the API view must reproduce the pre-migration payloads
--     exactly (including the two kinds that are empty arrays today).
with
  old as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_v57_backup group by site_id
  ),
  new as (
    select site_id, jsonb_object_agg(kind, payload order by kind) as state
    from public.cafm_blocks
    where kind in ('auditCampaigns', 'auditFindings', 'auditImports', 'auditInspections', 'auditTemplates', 'qaAuditReports', 'qaFailureReasons', 'qaInspectorAssignments')
    group by site_id
  )
select o.site_id,
       o.state = n.state as state_identical,
       pg_column_size(o.state) as old_bytes,
       pg_column_size(n.state) as new_bytes
from old o join new n on n.site_id = o.site_id
order by o.site_id;

-- 9c. Kind census: one row per site+kind (13 store kinds + 32 record kinds = 45
--     distinct kinds for a fully migrated 02-ESOC):
select count(*) as kind_rows, count(distinct kind) as distinct_kinds
from public.cafm_blocks where site_id = '02-ESOC';

-- 9d. The classical-table feel: findings and inspections with real columns.
select finding_id, campaign_id, finding_type, urgency, condition_score, operational_status,
       discovered_at, calculated_deadline, responsible_party, trade, validation_status,
       assurance_state, severity, status, is_overdue
from public.audit_findings
where site_id = '02-ESOC'
order by seq
limit 25;

select inspection_id, campaign_id, equipment_id, building_id, checkpoint_name, inspector,
       planned_date, route_order, accessibility, status, completed_at
from public.audit_inspections
where site_id = '02-ESOC'
order by seq
limit 25;

select person_name, trades, wr_types
from public.qa_inspector_assignments
where site_id = '02-ESOC'
order by seq;

select reason
from public.qa_failure_reasons
where site_id = '02-ESOC'
order by seq;

-- 9e. The relational story, no jsonb gymnastics:
-- 9e-1. Every finding resolved to its campaign, as real columns.
select f.finding_id, f.urgency, f.assurance_state,
       c.name as campaign, c.provider, c.workflow_stage
from public.audit_findings f
join public.audit_campaigns c
  on c.site_id = f.site_id and c.campaign_id = f.campaign_id
where f.site_id = '02-ESOC'
order by f.seq
limit 15;

-- 9e-2. Findings by urgency and validation status.
select urgency, validation_status, count(*) as findings
from public.audit_findings
where site_id = '02-ESOC'
group by urgency, validation_status
order by urgency, validation_status;

-- 9e-3. The inspection funnel per campaign: planned vs completed vs inaccessible.
select c.name as campaign,
       count(i.inspection_id) as inspections,
       count(i.inspection_id) filter (where i.status = 'Completed') as completed,
       count(i.inspection_id) filter (where i.accessibility = 'Inaccessible') as inaccessible
from public.audit_campaigns c
left join public.audit_inspections i
  on i.site_id = c.site_id and i.campaign_id = c.campaign_id
where c.site_id = '02-ESOC'
group by c.campaign_id, c.name, c.seq
order by c.seq;

-- 9e-4. Findings joined to the equipment typed table (the V51/V53 rename cascade holds).
select f.finding_id, f.equipment_id, f.equipment_name, e.equipment_name as register_name,
       f.building_id
from public.audit_findings f
left join public.equipment e
  on e.site_id = f.site_id and e.equipment_code = f.equipment_id
where f.site_id = '02-ESOC'
order by f.seq
limit 15;

-- 9e-5. Campaign ratings and progress at a glance.
select campaign_id, name, provider, workflow_stage,
       planned_inspections_count, completed_inspections_count,
       overall_condition_rating, overall_operational_rating
from public.audit_campaigns
where site_id = '02-ESOC'
order by seq;

-- EMERGENCY ROLLBACK (V57 -> V56 layout). Only for a real emergency: writes made after
-- this migration live in the record tables, so the store is re-merged over the backup.
-- Post-migration record contents are NOT auto-merged back into blob rows by this
-- snippet; ask Vibe to help if a rollback is ever needed.
--   begin;
--   -- recreate the V56 25-part view from scripts/supabase-v56-pm-scheduling-tables.sql
--   -- (its section 5: the store UNION plus the twenty-four record kinds only);
--   drop function if exists public.cafm_save_state(text, bigint, bigint, jsonb);
--   drop function if exists public.cafm_migrate_v44();
--   -- restore V56's cafm_save_state/cafm_migrate_v44 bodies by re-running that
--   -- file's sections 7 and 8 (the V56 exclusion lists with only its twenty-four kinds);
--   insert into public.cafm_blocks_store
--     select site_id, kind, payload from public.cafm_v57_backup
--   on conflict (site_id, kind) do update set payload = excluded.payload;
