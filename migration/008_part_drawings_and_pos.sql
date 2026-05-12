-- ============================================================
-- Junction tables for production_card_part → drawings + POs.
--
-- A part can reference many drawings (filed via the document service)
-- and many POs (from purchase_orders). The dropdown selection in the
-- planner UI is the canonical "this drawing/PO applies to this part".
-- Uploading a drawing files it in the doc service AND makes it
-- available in the dropdown — but the upload alone does NOT auto-link
-- the new drawing to the part; the planner must tick it in the picker.
-- ============================================================

create table if not exists production_card_part_drawing (
  card_part_id  uuid        not null references production_card_part(id) on delete cascade,
  doc_id        uuid        not null references document_incoming_scan(id) on delete restrict,
  added_at      timestamptz not null default now(),
  primary key (card_part_id, doc_id)
);

create index if not exists idx_pc_part_drawing_doc
  on production_card_part_drawing (doc_id);

create table if not exists production_card_part_po (
  card_part_id  uuid        not null references production_card_part(id) on delete cascade,
  po_id         uuid        not null references purchase_orders(id) on delete restrict,
  added_at      timestamptz not null default now(),
  primary key (card_part_id, po_id)
);

create index if not exists idx_pc_part_po_po
  on production_card_part_po (po_id);

-- RLS — same pattern as the rest of production_card_*.
alter table production_card_part_drawing enable row level security;
alter table production_card_part_po      enable row level security;

create policy "Authenticated users can read production_card_part_drawing"
  on production_card_part_drawing for select to authenticated using (true);
create policy "Authenticated users can write production_card_part_drawing"
  on production_card_part_drawing for all to authenticated using (true) with check (true);

create policy "Authenticated users can read production_card_part_po"
  on production_card_part_po for select to authenticated using (true);
create policy "Authenticated users can write production_card_part_po"
  on production_card_part_po for all to authenticated using (true) with check (true);
