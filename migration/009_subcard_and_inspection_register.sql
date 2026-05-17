-- ============================================================
-- Migration 009 — Subcard identity + close model + inspection register
--
-- Consolidates schema changes from:
--   - ADR-0003 (subcard identity, paint-pen piece serials)
--   - ADR-0005 (as-issued vs as-built doc identity)
--   - b5t walkthrough (submitted_for_qc state, request_changes signoff,
--                      dual issue SoD R3, no card_rev)
--   - 3wk walkthrough (final inspection register, ndt coverage,
--                      inspection_type on rows, 2-actor close —
--                      no paperwork_signed_by column)
--
-- References:
--   docs/adr/0003-subcard-identity-and-piece-serials.md
--   docs/adr/0005-as-issued-vs-as-built-doc-identity.md
-- ============================================================


-- ============================================================
-- production_inspection_type — NEW register table
-- Canonical set of inspection types referenced by
-- production_card.required_final_inspections (text[]) and
-- production_card_inspection.inspection_type (text).
-- App layer validates array elements against this register.
-- ============================================================

create table if not exists production_inspection_type (
  code                  text        primary key,
  label                 text        not null,
  category              text,        -- 'dimensional' | 'weld' | 'finish' | 'client' | ...
  description           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- MVP seed set per 3wk walkthrough (2026-05-17)
insert into production_inspection_type (code, label, category, description) values
  ('geometric',       'Geometric / dimensional',      'dimensional', 'Dimensional check against drawing tolerances'),
  ('weld_visual',     'Visual weld inspection',       'weld',        'Visual weld inspection per EN ISO 17637 by an independent inspector'),
  ('weld_mpi',        'Magnetic particle inspection', 'weld',        'NDT of welds via MPI — ferromagnetic materials'),
  ('weld_dpi',        'Dye penetrant inspection',     'weld',        'NDT of welds via DPI — any non-porous material'),
  ('cosmetic',        'Cosmetic / surface finish',    'finish',      'Surface finish acceptance against client or shop standard'),
  ('client_specific', 'Client-specific requirement',  'client',      'Client-defined acceptance criteria; see card notes for detail')
on conflict (code) do nothing;

alter table production_inspection_type enable row level security;

create policy "Authenticated users can read production_inspection_type"
  on production_inspection_type for select to authenticated using (true);
create policy "Authenticated users can write production_inspection_type"
  on production_inspection_type for all to authenticated using (true) with check (true);

drop trigger if exists trg_production_inspection_type_updated_at on production_inspection_type;
create trigger trg_production_inspection_type_updated_at
  before update on production_inspection_type
  for each row execute function set_updated_at();


-- ============================================================
-- production_card_part — subcard identity (ADR-0003)
-- ============================================================

-- New FK column: every subcard is produced to a primary drawing filed in
-- doc-service. Nullable in draft; app layer requires non-null at issue.
alter table production_card_part
  add column if not exists primary_drawing_doc_id uuid
    references document_incoming_scan(id) on delete restrict;

create index if not exists idx_production_card_part_primary_drawing
  on production_card_part (primary_drawing_doc_id)
  where primary_drawing_doc_id is not null;

-- Drop the free-text drawing columns: drawing identity now lives in the FK,
-- and the human-readable title-block number is read live from doc-service.
-- No existing production data — these columns were planning scaffolding.
alter table production_card_part drop column if exists drawing_number;
alter table production_card_part drop column if exists drawing_rev;


-- ============================================================
-- production_card — issued/closed doc split, state extensions,
-- required_final_inspections, NDT coverage, dual-issue SoD,
-- dropped card_rev (ADR-0005, b5t, 3wk)
-- ============================================================

-- Rename doc_id → issued_doc_id to reflect its role under ADR-0005:
-- the as-planned doc filed at issue. The as-built doc at close lives on
-- the new closed_doc_id column.
alter table production_card rename column doc_id to issued_doc_id;

-- closed_doc_id — as-built PDF filed at close. New doc-service identity
-- (NOT a refile_override on issued_doc_id). Provenance trail: both
-- documents are immutable and queryable in doc-service.
alter table production_card
  add column if not exists closed_doc_id uuid
    references document_incoming_scan(id) on delete restrict;

create index if not exists idx_production_card_closed_doc_id
  on production_card (closed_doc_id)
  where closed_doc_id is not null;

-- card_rev is vestigial — replacement = a NEW card via supersede chain.
-- Drop the column; the supersede mechanism stays via superseded_by_card_id.
alter table production_card drop column if exists card_rev;

-- Extend the lifecycle state machine:
--   + 'submitted_for_qc' (b5t D1 — between draft and issued)
--   + 'superseded'       (ADR-0003 — replacement card minted)
-- The existing column-level CHECK from migration 004 is auto-named.
alter table production_card drop constraint if exists production_card_state_check;
alter table production_card add constraint production_card_state_check
  check (state in (
    'draft',
    'submitted_for_qc',
    'issued',
    'in_progress',
    'on_hold',
    'awaiting_final_inspection',
    'complete',
    'closed',
    'cancelled',
    'superseded'
  ));

-- required_final_inspections — array of codes from production_inspection_type
-- specifying which final-inspection types this card requires. Set at issue by
-- planner + welding supervisor; app layer adds 'geometric' always and
-- 'weld_visual' when exc_class >= 2 AND card has a weld op.
alter table production_card
  add column if not exists required_final_inspections text[] not null default '{}'::text[];

-- ndt_coverage_percent — the spec for NDT coverage (e.g. 80 means "80% of
-- welds tested under the chosen NDT method"). App layer requires this column
-- to be non-null when 'weld_mpi' or 'weld_dpi' is in required_final_inspections.
alter table production_card
  add column if not exists ndt_coverage_percent smallint;
alter table production_card
  add constraint production_card_ndt_coverage_percent_check
    check (ndt_coverage_percent is null
           or (ndt_coverage_percent between 1 and 100));

-- Segregation of duties — DB-enforced where it's a same-row check:
--   R1: issued_by ≠ closed_by
--   R3: issued_by ≠ qc_signed_by
-- R2 and R4 are cross-table and enforced at the app layer.
-- The existing R1 constraint from migration 004 is the anonymous table-level
-- CHECK on production_card; drop it (if present) and add named replacements.
alter table production_card drop constraint if exists production_card_check;
alter table production_card add constraint production_card_sod_r1_check
  check (issued_by is null or closed_by is null
         or issued_by <> closed_by);
alter table production_card add constraint production_card_sod_r3_check
  check (issued_by is null or qc_signed_by is null
         or issued_by <> qc_signed_by);


-- ============================================================
-- production_card_inspection — inspection_type column (3wk)
-- ============================================================

-- inspection_type — code from production_inspection_type. Set on card-level
-- final inspection rows (one row per required type); NULL on hold-point /
-- op-level rows (those are gated by op state, not by inspection type).
alter table production_card_inspection
  add column if not exists inspection_type text;

create index if not exists idx_production_card_inspection_type
  on production_card_inspection (inspection_type)
  where inspection_type is not null;


-- ============================================================
-- production_card_signoff — request_changes signoff type (b5t D2)
-- ============================================================

-- Extend signoff.type to include 'request_changes' — the QC bounce-to-draft
-- action when reviewing a submitted_for_qc card. Drops existing column-level
-- CHECK and replaces with extended set.
alter table production_card_signoff drop constraint if exists production_card_signoff_type_check;
alter table production_card_signoff add constraint production_card_signoff_type_check
  check (type in (
    'issue',
    'hold',
    'close',
    'release',
    'cancel',
    'request_changes'
  ));


-- ============================================================
-- App-layer responsibilities (NOT enforced in SQL)
-- ============================================================
--
-- These constraints live in app code:
--
--   • primary_drawing_doc_id is non-null when card state moves out of 'draft'
--   • required_final_inspections always contains 'geometric'
--   • required_final_inspections contains 'weld_visual' when
--     production_card.exc_class >= 2 AND card has a weld op
--   • ndt_coverage_percent is non-null when 'weld_mpi' or 'weld_dpi' is in
--     required_final_inspections
--   • SoD R2: production_card_inspection.inspector_employee_id (op-scope row)
--     ≠ any production_card_event.employee_id for that op
--   • SoD R4: production_card.closed_by ≠ any production_card_inspection.
--     inspector_employee_id where card_id = this.id (final-inspector rows)
--   • At close: regenerate as-built PDF and file as a NEW doc in
--     pss-document-service (NOT refile_override). Store returned id in
--     production_card.closed_doc_id.
--   • Drawing identity at display: read title-block number live from
--     doc-service via primary_drawing_doc_id. Subcard QR payload encodes
--     {card.issued_doc.doc_number}/{primary_drawing.doc_number}.
