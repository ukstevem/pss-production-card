-- ============================================================
-- Declare the FKs from `*_doc_id` / `*_pdf_doc_id` /
-- `dim_record_doc_id` columns to document_incoming_scan(id).
--
-- Migrations 002, 004, 006 declared these as plain uuid columns with
-- only a comment saying "→ document_incoming_scan(id)". PostgREST
-- can't traverse implicit relationships, so nested selects like
-- `production_card.document_incoming_scan(doc_number)` fail with
-- PGRST200. This migration wires them up explicitly.
-- ============================================================

alter table production_card
  add constraint production_card_doc_id_fkey
  foreign key (doc_id)
  references document_incoming_scan(id)
  on delete restrict
  deferrable initially deferred;

alter table welding_wps
  add constraint welding_wps_pdf_doc_id_fkey
  foreign key (pdf_doc_id)
  references document_incoming_scan(id)
  on delete set null;

alter table welding_welder_qualification
  add constraint welding_welder_qualification_qualification_doc_id_fkey
  foreign key (qualification_doc_id)
  references document_incoming_scan(id)
  on delete set null;

alter table production_card_inspection
  add constraint production_card_inspection_dim_record_doc_id_fkey
  foreign key (dim_record_doc_id)
  references document_incoming_scan(id)
  on delete set null;
