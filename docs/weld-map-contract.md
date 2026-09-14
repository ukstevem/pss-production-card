# Weld Map contract

**Status: draft.** The four decisions in §1 were agreed with Steve on 2026-09-14 and are recorded in
ADR 0007. Everything in §7 is still open. Tracks bd `cjw`.

The Weld Map is the dataset ADR 0002 snapshots Seams from at card issue, when a card's EXC class is 3
or higher. This document is the contract between the system that produces it, cad-automation-stage3,
and the one that consumes it, this app.

---

## 1. Decisions

| | Decided | Why |
|---|---|---|
| **Source** | cad-automation-stage3 | Its `cas_connection` table already numbers welds and carries reviewer ratification. A weld's number and review survive re-detection (stage3 bd `5mn`, verified on live rows). |
| **Join key** | (project number, weldment mark) | Stage3 allocates marks per project and part fingerprint and reuses them across revisions. |
| **Seam identity** | `<mark>-W<nnn>`, per weldment type | Stage3 stores welds per weldment type, and physical pieces are already paint-pen serials (ADR 0003). |
| **Transport** | IFC-shaped JSON per weldment, copied in at issue | A snapshot is a copy anyway, and the two systems don't share a database yet. |

---

## 2. Join key

**Project.** `production_card.project_register_item_id` leads to `project_register_items.projectnumber`,
which is text such as `10353`. Stage3 stores the same text in `cas_source_model.project_ref` and
`cas_piece_mark.project_ref`. Checked on live data 2026-09-14: stage3's models carry `10335`, `10353`
and `10364`.

**Mark.** The weldment's row in stage3's `cas_piece_mark`, keyed by `project_ref` and `prototype_id`.
A mark is allocated once per project and part fingerprint and never moves, so an unchanged weldment
keeps its mark through a re-ingested revision. A weldment whose geometry changes gets a new
fingerprint, and so a new mark. That is by design.

Two things to handle:

- **Treat the mark as opaque text.** It is not always an `A` mark. Stage3's `allocate_mark` returns
  whatever mark a (project, weldment) pair already has, and an `A` mark is only allocated when a
  weldment is exploded. A weldment that was produced first keeps a class-prefixed mark such as
  `U00012`. On live data, 29 of about 5,700 marks were `A` marks.
- **No project number, no Weld Map.** A stage3 model without a `project_ref` has no marks. The export
  refuses it rather than inventing a key.

**Change needed in this app.** `production_card_part` has no mark column today. It needs one,
proposed as `weld_map_mark text`, null until set. A Subcard is identified by its drawing (ADR 0003),
and a fabrication drawing normally shows the weldment's mark in its title block, so the planner
confirms the link rather than the system guessing it.

---

## 3. Seam identity and numbering

- A seam number is `<mark>-W<nnn>`, counted within the weldment and shared by every copy of it.
- The physical weld is seam × piece serial. Serials stay as text breadcrumbs, as ADR 0003 has them.
- **A number, once issued, is issued.** Re-detection keeps a weld's number and review. A new weld
  gets the next unused number, and a removed weld leaves a gap. Nothing is renumbered into a gap.

**Where stage3 is today:**

| | State |
|---|---|
| Numbers and review survive re-detection within a model | Done: stage3 bd `5mn` |
| Duplicate weld runs no longer recorded | Done: stage3 bd `ujb8` |
| Weldment-relative `<mark>-W<nnn>` | Not built: stage3 bd `ry4s`. Numbers are global per model today (`W1` to `Wn`). |
| Numbers carried across a re-ingested revision | Not built: stage3 bd `jjlu` |
| The export itself | Not built: stage3 bd `ybx0`, which depends on `ry4s` |

Until `ry4s` and `jjlu` both land, a seam number isn't stable across a drawing revision. The export
therefore emits `weld_map_id` as null (§4), which the planned Seam table already allows.

---

## 4. The export

One JSON document per weldment, shaped like IFC4 so that a later IFC export is a serialisation step
rather than a remodel. The shape follows the stage2 sidecar in
`cad-automation-stage2/docs/weld-identification-and-ifc.md` §6.

### Envelope

| Field | Source | Notes |
|---|---|---|
| `schema` | `"IFC4"` | IFC4X3 renamed the weld measures, so the version matters |
| `generator`, `exported_at` | stage3 | |
| `project` | `cas_source_model.project_ref` | |
| `source_model` | `{id, name, sha256, revision, doc_ref}` | `revision` and `doc_ref` are null on every live model today; see §7 |
| `assembly` | `{mark, prototype_key, qty}` | `qty` is how many copies of the weldment the model contains |
| `frame` | `"weldment-local, mm"` | Weld paths are in the weldment's own frame |
| `welds` | list | See below |

### Per weld

| Field | Source (stage3 `cas_connection`) | Notes |
|---|---|---|
| `seam_no` (IFC `Name`, `Tag`) | mark + weld number | Weldment-relative once `ry4s` lands |
| `weld_map_id` (IFC `GlobalId`) | derived from project, mark and `seam_no` | **Null** until `ry4s` and `jjlu` land |
| `PredefinedType` | `"WELD"` | |
| `ConnectedTo` | `solid_a`, `solid_b` | Solid indices within the weldment |
| `status` | `weld_status` | `detected` or `undetected`. `excluded` is never exported. |
| `source` | `weld_source` | `detected` or `manual` |
| `location` | `weld_location` | `shop` or `site` |
| `Pset_FastenerWeld.Type1` | `weld_method` | Only when known; see §7 on vocabulary |
| `Pset_PSS_WeldGeometry.MeasuredLengthMm` | `weld_length_mm` × `weld_length_factor` | The reviewer's length correction applied |
| `Pset_PSS_WeldGeometry.DetectedLengthMm` | `weld_length_mm` | |
| `Pset_PSS_WeldGeometry.Size` | `weld_size` | Ratified free text; see §7 |
| WPS reference (`IfcClassificationReference`) | `weld_procedure` | Should equal a pss-welding-control `wps_no` |
| `Representation` | `weld_paths` | Polylines |

### Rules

- **Emit only what is known.** A missing property means "not specified yet". A null would claim it
  had been specified as nothing.
- **Measured length never goes in IFC's `l`.** `l` is the length of one weld element, so a total
  length there would misstate any intermittent weld. It goes in the PSS Pset instead.
- **Excluded welds are left out.** Undetected welds, which a reviewer ratified but detection no longer
  finds, are included with their status so a planner sees them.
- **Refuse, don't guess.** A model with no `project_ref` or a weldment with no mark is refused with a
  reason.

---

## 5. Snapshot at card issue

This is this app's side (bd `boj`, `bf6`).

- **Only at EXC ≥ 3.** At EXC ≤ 2 the single synthetic Seam per weld op stays, as ADR 0002 has it.
- For each Subcard with a weld op, load the export for (`projectnumber`, `weld_map_mark`) and let the
  planner pick seams (`bf6`). Picked seams are **copied** into `production_card_part_seam`.
- **Filter by card variant.** A shop card offers `shop` seams, and a site card offers `site` seams.
- **Proposed columns**, extending `boj`'s `seam_no`, `weld_map_source`, `weld_map_id` and `state`:
  `weld_map_source` holds the export's sha256 plus the stage3 model id, and the new columns are
  `status_at_issue`, `location`, `length_mm`, `size_text`, `wps_no` and `method`.
- **Immutable after issue.** A changed Weld Map reaches the floor only through a replacement card
  (ADR 0003).

---

## 6. What the Weld Map does not carry

These are engineering decisions that come from the WPS and the card, not from geometry.

| Not in the Weld Map | Comes from |
|---|---|
| Welding process (ISO 4063) | `welding_wps.process` |
| Welding position | `welding_wps.position`, but see §7 |
| Throat or leg, unless ratified | The reviewer, through `weld_size` |
| Intermittent pattern | Engineering |
| Quality level and NDT | `production_card.required_final_inspections`, `ndt_coverage_percent` |

---

## 7. Open questions

1. **Throat or leg.** Stage3's `weld_size` is free text covering "leg / throat". Expected Minutes needs
   the throat, and ISO 2553 keeps them apart (`a` is throat, `z` is leg). Should stage3 store them as
   separate fields?
2. **Joint-type vocabulary.** Stage3's methods are `coplanar`, `t-joint` and `manual`. The WPS
   register's `joint_type` is descriptive text such as "Single Sided Fillet Weld". Neither is an
   ISO 2553 seam type. Map them, or leave `Type1` empty?
3. **Which revision.** `revision` and `doc_ref` are null on every live stage3 model, so an export can't
   say which drawing revision it reflects. Should they be recorded at ingest?
4. **Controlled document.** A weld map is an EN 1090 record. Should each export be filed in
   pss-document-service, making `weld_map_source` a document id?
5. **Undetected seams at issue.** Block the pick, warn, or allow it?
6. **Seam WPS vs op WPS.** ADR 0002 keeps the WPS on the weld op. Can a seam's WPS differ from its op's?
7. **Position.** A WPS position is the range the procedure is qualified for, not the position a seam
   is actually welded in. Where does the seam's own position come from?
8. **Lengths can still move.** A cross-part weld length overstated by about 1.65× was fixed on
   2026-09-14 (stage3 `ujb8`), and the orientation-blind coplanar test (stage3 `ur4o`) is still open.
   Should the export record which detection it reflects, so a changed length can be explained?

---

## References

- This repo: ADR 0002 (welding evidence model), ADR 0003 (subcard identity and piece serials), ADR 0007
  (this decision); bd `cjw`, `boj`, `bf6`
- cad-automation-stage3: `sql/018_connections.sql`, `sql/004_piece_mark.sql`,
  `sql/033_weld_identity.sql`, `app/decide/weld_identity.py`, `app/decide/marks.py`; bd `5mn`, `ujb8`,
  `ry4s`, `jjlu`, `ybx0`, `ur4o`
- cad-automation-stage2: `docs/weld-identification-and-ifc.md`
- pss-welding-control: `CONTEXT.md` (WPS, welder qualifications)
