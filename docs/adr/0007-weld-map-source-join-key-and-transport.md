# 0007 — Weld Map: source, join key, seam identity and transport

ADR 0002 snapshots Seams from an external **Weld Map** at card issue (EXC ≥ 3) but left the Weld
Map itself open (bd `cjw`). Four decisions close the part that blocks design; the field-level
contract is `docs/weld-map-contract.md`.

**Source.** `cad-automation-stage3` produces the Weld Map. Its `cas_connection` table already
numbers welds and carries reviewer ratification (size, procedure, length factor, shop/site). As of
2026-09-14 a weld's number and review survive re-detection, verified on live rows.

**Join key.** A Part finds its welds by **(project number, weldment mark)**. The project number is
`project_register_items.projectnumber`, which is the same text as stage3's `project_ref`. The mark
is stage3's piece or assembly mark for the weldment. Stage3 allocates marks per project and part
fingerprint and reuses them across revisions, so a revised model keeps the key. `production_card_part`
gains a column to carry the mark.

**Seam identity.** A seam is numbered per weldment **type**: `A00001-W003` is the same seam on
every copy of that weldment. The physical weld is seam × paint-pen piece serial (ADR 0003), so
pieces need no numbering of their own here.

**Transport.** Stage3 exports an IFC-shaped JSON file per weldment, and this app imports the picked
seams into `production_card_part_seam` at issue. A snapshot is a copy anyway, and the two systems
do not yet share a database.

Rejected: the primary drawing's doc number as the join key (stage3 does not know drawing numbers;
only 1 of 12 analysed models even had drawing-like part names). Rejected: stage3's internal
model id (a re-ingested revision gets a new id, breaking every link). Rejected: a seam number per
physical piece (rows multiply by quantity, stage3 stores welds per weldment type, and serials
already distinguish pieces). Rejected: reading stage3's rows directly (stage3 is not on Supabase
yet). Rejected: a full IFC file (the heaviest option, and it would need an IFC parser here).
