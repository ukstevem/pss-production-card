-- ============================================================
-- Inspections + signoffs.
--
-- Inspections: one row per hold-point or final check. Lightweight by
-- default; structured defect log auto-enabled when card.exc_class ≥ 3
-- (enforced at app layer via the form, not the DB).
--
-- Signoffs: one row per signature event (issue / hold / close).
-- Together with employees and timestamps these form the audit trail
-- that the card.issued_by / closed_by columns summarise.
-- ============================================================

-- production_card_inspection ---------------------------------------
-- Either card-level (final inspection) or op-level (hold-point). One
-- of (card_id, card_part_op_id) must be set — both is invalid.
create table if not exists production_card_inspection (
  id                          uuid        primary key default gen_random_uuid(),
  card_id                     uuid        references production_card(id) on delete restrict,
  card_part_op_id             uuid        references production_card_part_op(id) on delete restrict,
  inspector_employee_id       uuid        not null references employees(id) on delete restrict,

  result                      text        not null
                                          check (result in ('pass','fail','rework')),

  -- Lightweight fields
  notes                       text,

  -- Structured fields (populated when EXC class ≥ 3; otherwise often NULL)
  level_iso5817               text,                                          -- 'B','C','D'
  defects                     jsonb       not null default '[]'::jsonb,      -- array of {location, type, action}
  photo_doc_ids               jsonb       not null default '[]'::jsonb,      -- array of document_incoming_scan ids
  dim_record_doc_id           uuid,                                          -- → document_incoming_scan(id) for dim sheet

  signed_at                   timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- Exactly one scope
  check (
    (card_id is not null and card_part_op_id is null)
    or
    (card_id is null and card_part_op_id is not null)
  )
);

create index if not exists idx_production_card_inspection_card
  on production_card_inspection (card_id)
  where card_id is not null;

create index if not exists idx_production_card_inspection_op
  on production_card_inspection (card_part_op_id)
  where card_part_op_id is not null;

create index if not exists idx_production_card_inspection_inspector
  on production_card_inspection (inspector_employee_id);

create index if not exists idx_production_card_inspection_result
  on production_card_inspection (result);

-- production_card_signoff ------------------------------------------
-- Audit trail for issue / hold / close events. Same person cannot
-- both issue and final-inspect-and-close (segregation of duties)
-- — enforced at app layer when inserting.
create table if not exists production_card_signoff (
  id                          uuid        primary key default gen_random_uuid(),
  card_id                     uuid        not null references production_card(id) on delete restrict,
  role                        text        not null
                                          check (role in ('planner','qc','inspector','supervisor','welding_engineer')),
  type                        text        not null
                                          check (type in ('issue','hold','close','release','cancel')),
  employee_id                 uuid        not null references employees(id) on delete restrict,
  notes                       text,
  signed_at                   timestamptz not null default now(),
  created_at                  timestamptz not null default now()
);

create index if not exists idx_production_card_signoff_card
  on production_card_signoff (card_id);

create index if not exists idx_production_card_signoff_employee
  on production_card_signoff (employee_id);

create index if not exists idx_production_card_signoff_type
  on production_card_signoff (type);

-- RLS ---------------------------------------------------------------
alter table production_card_inspection     enable row level security;
alter table production_card_signoff        enable row level security;

create policy "Authenticated users can read production_card_inspection"
  on production_card_inspection for select to authenticated using (true);
create policy "Authenticated users can write production_card_inspection"
  on production_card_inspection for all to authenticated using (true) with check (true);

create policy "Authenticated users can read production_card_signoff"
  on production_card_signoff for select to authenticated using (true);
create policy "Authenticated users can write production_card_signoff"
  on production_card_signoff for all to authenticated using (true) with check (true);

-- Triggers ----------------------------------------------------------
drop trigger if exists trg_production_card_inspection_updated_at on production_card_inspection;
create trigger trg_production_card_inspection_updated_at
  before update on production_card_inspection
  for each row execute function set_updated_at();

-- production_card_signoff is intentionally append-only — no updated_at trigger.
