-- ============================================================
-- Production card core: card + parts + per-part ops.
--
-- Lifecycle:
--   draft → issued (dual signoff) → in_progress → on_hold? →
--     awaiting_final_inspection → complete → closed (immutable)
--
-- One card scopes to exactly one project_register_items row.
-- doc_number lives on document_incoming_scan (61355 minting service);
-- we FK to its id and JOIN for display.
--
-- See docs/ARCHITECTURE.md for the full design.
-- ============================================================

-- production_card --------------------------------------------------
create table if not exists production_card (
  id                          uuid        primary key default gen_random_uuid(),

  -- Identity (FK only — doc_number resolved via JOIN to document_incoming_scan)
  doc_id                      uuid,                              -- → document_incoming_scan(id), populated on 'issued'
  project_register_item_id    uuid        not null references project_register_items(id) on delete restrict,

  variant                     text        not null
                                          check (variant in ('shop','site')),

  -- Denormalised at issue from project_register_items.exc_class
  exc_class                   smallint
                                          check (exc_class is null or exc_class between 1 and 4),

  card_rev                    smallint    not null default 1 check (card_rev >= 1),

  state                       text        not null default 'draft'
                                          check (state in (
                                            'draft','issued','in_progress',
                                            'on_hold','awaiting_final_inspection',
                                            'complete','closed','cancelled'
                                          )),

  -- Signoff trail summary columns (full audit lives in production_card_signoff)
  issued_by                   uuid        references employees(id),
  issued_at                   timestamptz,
  qc_signed_by                uuid        references employees(id),
  qc_signed_at                timestamptz,
  closed_by                   uuid        references employees(id),
  closed_at                   timestamptz,

  -- Rev chain
  superseded_by_card_id       uuid        references production_card(id),

  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- Segregation of duties: issuer cannot be the final-inspection signer
  -- (final-inspect is tracked via production_card_inspection — soft-checked
  -- at app layer; this constraint just guards the direct-signoff fields).
  check (issued_by is null or closed_by is null or issued_by <> closed_by)
);

create index if not exists idx_production_card_project_item
  on production_card (project_register_item_id);

create index if not exists idx_production_card_doc_id
  on production_card (doc_id)
  where doc_id is not null;

create index if not exists idx_production_card_state
  on production_card (state);

create index if not exists idx_production_card_variant
  on production_card (variant);

create unique index if not exists uniq_production_card_doc_id
  on production_card (doc_id)
  where doc_id is not null;

-- production_card_part ---------------------------------------------
-- One row per drawing/part on the card. Parts share the card's
-- project_register_item_id and exc_class (no per-part columns for those).
create table if not exists production_card_part (
  id                          uuid        primary key default gen_random_uuid(),
  card_id                     uuid        not null references production_card(id) on delete cascade,
  seq                         smallint    not null check (seq >= 1),         -- order on the printed traveller

  drawing_number              text,
  drawing_rev                 text,
  description                 text,
  qty                         int         not null default 1 check (qty >= 1),
  weight                      numeric,                                       -- kg per unit

  -- Material traceability (set at planning, not weld scan-in)
  material_spec               text,                                          -- 'S355 J2+N 12mm PL'
  material_doc_id             uuid        references document_matl_cert(id), -- → matl-cert when known
  material_po_id              uuid,                                          -- → purchase_orders.id when known

  state                       text        not null default 'pending'
                                          check (state in (
                                            'pending','in_progress',
                                            'awaiting_final','accepted','rejected','cancelled'
                                          )),

  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  unique (card_id, seq)
);

create index if not exists idx_production_card_part_card
  on production_card_part (card_id);

create index if not exists idx_production_card_part_drawing
  on production_card_part (drawing_number);

-- production_card_part_op ------------------------------------------
-- One row per planned op on a part. State machine drives the kiosk +
-- inspection flows. wps_id required when op_code = 'weld' (enforced
-- at app layer for clarity; DB allows NULL during routing edit).
create table if not exists production_card_part_op (
  id                          uuid        primary key default gen_random_uuid(),
  card_part_id                uuid        not null references production_card_part(id) on delete cascade,
  seq                         smallint    not null check (seq >= 0),

  op_code                     text        not null references production_op_library(code) on delete restrict,
  required_role               text        not null,                          -- denormed from op_library at routing time
  hold_point_after            boolean     not null default false,

  wps_id                      uuid        references welding_wps(id),        -- required when op_code='weld' (app-enforced)

  state                       text        not null default 'pending'
                                          check (state in (
                                            'pending','in_progress','awaiting_inspection',
                                            'accepted','rework','skipped'
                                          )),

  planned_duration_minutes    int,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  unique (card_part_id, seq)
);

create index if not exists idx_production_card_part_op_part
  on production_card_part_op (card_part_id);

create index if not exists idx_production_card_part_op_state
  on production_card_part_op (state);

create index if not exists idx_production_card_part_op_wps
  on production_card_part_op (wps_id)
  where wps_id is not null;

-- RLS ---------------------------------------------------------------
alter table production_card                enable row level security;
alter table production_card_part           enable row level security;
alter table production_card_part_op        enable row level security;

create policy "Authenticated users can read production_card"
  on production_card for select to authenticated using (true);
create policy "Authenticated users can write production_card"
  on production_card for all to authenticated using (true) with check (true);

create policy "Authenticated users can read production_card_part"
  on production_card_part for select to authenticated using (true);
create policy "Authenticated users can write production_card_part"
  on production_card_part for all to authenticated using (true) with check (true);

create policy "Authenticated users can read production_card_part_op"
  on production_card_part_op for select to authenticated using (true);
create policy "Authenticated users can write production_card_part_op"
  on production_card_part_op for all to authenticated using (true) with check (true);

-- Triggers ----------------------------------------------------------
drop trigger if exists trg_production_card_updated_at on production_card;
create trigger trg_production_card_updated_at
  before update on production_card
  for each row execute function set_updated_at();

drop trigger if exists trg_production_card_part_updated_at on production_card_part;
create trigger trg_production_card_part_updated_at
  before update on production_card_part
  for each row execute function set_updated_at();

drop trigger if exists trg_production_card_part_op_updated_at on production_card_part_op;
create trigger trg_production_card_part_op_updated_at
  before update on production_card_part_op
  for each row execute function set_updated_at();
