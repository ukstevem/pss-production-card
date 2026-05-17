# 0005 — As-issued and as-built are two separate doc-service identities

A card produces two distinct documents in pss-document-service across its
lifecycle:

- **As-issued** — minted at the moment of issue (`submitted_for_qc → issued`).
  Stored on `production_card.issued_doc_id`. PDF contains the as-planned
  traveller (cover, routing, signoff blocks, QRs). This is what the shop floor
  prints and follows.
- **As-built** — minted at the moment of close (`complete → closed`). Stored
  on `production_card.closed_doc_id`. PDF contains the same card but
  populated with all signoffs, session timestamps, inspection results, and
  linked material/WPS references. This is the quality record.

Both documents use the same `iso_description_id` (`66` for shop cards, `67`
for site) — they're two stages of the same document family, so they sit in
the same sequential numbering pool. The as-issued vs as-built distinction is
captured by **which FK column on `production_card`** references each, not by
a different doc-code.

Rejected: **refile_override on the same `doc_number`**. Overwriting the
as-issued PDF with the as-built content loses the provenance — you can't
look at what the planner committed to at issue alongside what was actually
built. With two stable identities, both stages remain queryable forever.

Rejected: **distinct iso_description_id for as-built** (e.g. a code in the QC
family). Would require coordinating a new filing rule with doc-service admin;
the field-column separation on `production_card` is enough to distinguish
without changing the doc-code. Can be revisited later if quality-pack
assembly queries make "show me all as-built records" a hot path.

Rejected: **single doc, no as-built record**. Loses the audit trail of work
actually done vs work planned. The architecture's "closed = immutable" rule
applies to the database; the as-built PDF gives an external, doc-service-archived
mirror of that record.
