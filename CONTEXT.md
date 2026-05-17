# pss-production-card

The digital traveller for parts moving through the workshop and site install. Captures contemporaneous evidence of who did what op, on which part, with which procedure and materials. Replaces the paper jobcard.

## Language

### Core domain

**Card**:
A digital production traveller (`production_card`) scoped to exactly one `project_register_items` row.
_Avoid_: Jobcard, ticket, traveller (the *paper* is the traveller; the database row is the **Card**).

**Part**:
A single trackable unit on a **Card** (`production_card_part`), tied to a **primary drawing** (FK to doc-service). Carries `qty` — the count of physical pieces under that drawing. Has its own **Routing**.
_Avoid_: Item, line, component.

**Subcard**:
A **Part** viewed through the operational lens — the printed unit on the traveller, the scannable unit at the kiosk. One per primary drawing on a Card. Identity = `(card.doc_number, primary_drawing.doc_number)`. Cover sheet displays the drawing's title-block number for humans; the **Subcard QR** encodes the doc-service identity for the system.
_Avoid_: Line, sub-card (one word, no hyphen).

**Op**:
A single step in a **Part**'s **Routing** (`production_card_part_op`). Carries a `required_role` and may carry hold-point, WPS, etc.
_Avoid_: Step, task, operation. Use "Op" everywhere.

**Routing**:
The ordered sequence of **Ops** for a **Part**, authored at card-issue time from a routing template plus finishing dropdown.

**Operator**:
An **Employee** with a trade role (welder, fabricator, painter, fitter, inspector, qc, site) who scans in at the kiosk. Distinct from a **Web User** who uses the planning UI.
_Avoid_: Worker, staff, user (overloaded with auth).

### Kiosk identification

**Subcard QR**:
The QR code printed on a **Subcard** cover sheet. Encodes `{card.doc_number}/{primary_drawing.doc_number}` — system identities, parseable by the kiosk. A single scan resolves to (Card, Subcard); operator picks Op and pieces from there.

**Piece Serial**:
A paint-pen mark (`001`, `002`, …) on a physical piece within a Subcard with `qty > 1`. Operator-applied breadcrumb, scoped per Subcard. Not pre-allocated or validated by the system; persisted as text in `production_card_event.meta` at session-stop.
_Avoid_: Item number, piece number, instance ID.

**Serial Picker**:
The kiosk's touch-grid UX shown at session-stop. Operator taps the **Piece Serials** they completed this session. For weld sessions, also captures per-piece **Heat** (consumable batch) — a "+ Add heat change" button lets the welder declare a mid-session consumable swap so subsequent piece-taps attribute to the new heat.

### Quality

**Inspection Type**:
A code from the `production_inspection_type` register identifying the kind of inspection (`geometric`, `weld_visual`, `weld_mpi`, `weld_dpi`, `cosmetic`, `client_specific`). Hold-point inspections (per-op) carry no `inspection_type`. Card-level final inspections each carry one — a card with two required final types produces two `production_card_inspection` rows.

**Final Inspection**:
The card-level inspection that happens once all op-level work is accepted. Composed of one inspection row per code in `production_card.required_final_inspections`. Card transitions to `complete` only when every required type has a `pass`-result row.

**NDT Coverage**:
The percentage of welds to be tested under MPI or DPI (e.g. 80, 100). Stored on `production_card.ndt_coverage_percent`. Required when `weld_mpi` or `weld_dpi` is in the required-inspections list. Not enforced by the system at inspection time — it's the spec the inspector confirms compliance with.

**As-issued doc** / **As-built doc**:
Two distinct doc-service identities for one card (per ADR-0005). The as-issued doc is the as-planned traveller filed at issue; the as-built doc is the same traveller populated with all signoffs + session results + linked material/WPS references, filed at close. Both immutable in doc-service. Same `iso_description_id`, different sequential doc_numbers. Stored on `production_card.issued_doc_id` + `closed_doc_id` respectively.

**pss-pdf-render** _(planned, not built)_:
The future cross-app PDF generation service. Takes `{ template_name, data }` and returns PDF bytes. Calling app then POSTs bytes to `pss-document-service` for filing + 61355 numbering. **Not built yet** — production-card's MVP generates the traveller PDF in-app via `@react-pdf/renderer`, isolated behind a single `generateTravellerPdf(cardData) → bytes` function so the migration to `pss-pdf-render` is one call-site change.
_Avoid_: pdf-service (too generic), document-render (conflicts with pss-document-service).

**NCR** (Non-Conformance Report):
A formal record of a defect found in production — what's wrong, why, and how to resolve it (use-as-is / rework / repair / scrap / return). _Not modelled in MVP_ — placeholder concept reserved for a future system. When implemented, will attach via FK to the originating **Inspection**, **Op** (in `rework` state), or **Card** (driving a future `under_amendment` state). Failed inspections (`result='fail'`) and the `rework` op state are the natural integration points. NCR is the only mechanism that can mutate a closed (immutable) Card.
_Avoid_: Defect ticket, deviation note (sub-cases — NCR is the umbrella).

### Welding-specific

**Weld Op**:
A single weld step on a **Part**'s **Routing**. Always decomposes into one or more **Seams** underneath.

**Seam**:
The canonical unit of welding evidence. One row per joint to be welded. **Sessions**, **Inspections**, defects, and photos all attach to a Seam — never directly to a Weld Op.
- At EXC ≤ 2: one Seam auto-created per Weld Op. Hidden from the planner and kiosk UI ("flattened wrapper" — the user sees "weld this part").
- At EXC ≥ 3: planner picks Seams from the **Weld Map** at issue time. Kiosk shows the Seam list for operator pick. Inspection is per-Seam.
_Avoid_: Joint, bead, pass, run (these are welding sub-units we don't model).

**Weld Map**:
The external dataset that enumerates and numbers every weld for a **Part**. Source of truth for Seam identity at EXC ≥ 3. Lives outside this app — current direction is Supabase rows / JSON sidecar / enriched IFC. Independent of whether a drawing PDF exists. At card-issue time the relevant Seams are **snapshotted** into `production_card_part_seam`; later upstream changes don't propagate without a `card_rev` bump.
_Avoid_: Weld list, weld register (we have a `welding_wps` register — different concept).

**Pass**:
A single traverse of the welding arc on a **Seam**. Carries a `pass_type` (`root` / `fill` / `cap` / `other`) and FKs to the **Session** that produced it. Multiple operators can do different Passes on one Seam across a shift.
- **Declaration is retrospective**, not live. Welder scans in, works, scans out, and at scan-out keys *how many passes* they completed this session. System creates that many Pass rows attributed to the session.
- Pass-type defaults: first Pass ever on a Seam → `root`; last Pass when the Seam closes → `cap`; middle → `fill`. Welder can override at scan-out; inspector can amend at inspection.
- At EXC ≤ 2: synthetic single Pass; Pass UI never surfaces.
- At EXC ≥ 3: Pass log visible to inspector per Seam.
- Inspection target remains the **Seam**; `pass_id` FK on inspection records is used only when an NDT result genuinely attaches to one specific Pass (e.g. radiography of the root).
_Avoid_: Run, bead, weld layer.

**Heat**:
A unique batch identifier for a welding consumable (e.g. `LF20-447`). Required at weld session-start. Per-piece in the **Serial Picker** when the consumable changes mid-session. EN 1090 traceability requirement.
_Avoid_: Batch, lot, spool ID.

**Session**:
A contiguous block of work by one **Operator** on one **Subcard**'s Op. Opened by RFID + Subcard QR scan, closed by scan-out, another scan-in elsewhere (auto-close), or shift-end clock-out. At close, the **Serial Picker** captures completed **Piece Serials** and (for weld) per-piece **Heat**. Pass count (welding) also keyed in at close.

### Pull-flow vocabulary

**Plant**:
A named physical production asset (weld-set-A, saw-2, drill-5, paint-booth-1). The unit of **production-planning capacity** — when planners ask "can this op start?", the answer turns on Plant availability, not operator availability. Carries a `plant_type` and a `state` (`available` / `in_use` / `maintenance` / `retired`).
_Avoid_: Equipment (overloaded), tool (overloaded with hand tools), machine (too narrow — paint booth isn't a machine).

**Plant Type**:
A category of Plant: `weld_set`, `saw`, `drill`, `paint_booth`, `bevel_machine`, `grinder`, etc. **Ops** carry a `required_plant_type` (nullable; null for hand ops like `mark` or `fettle`).

**Station**:
The queue of pending **Ops** for one **Plant Type**. Capacity of a Station = count of Plant of that type with state=`available`. The unit at which WIP limits, sequencing, and andon apply.
_Avoid_: Workstation (use "Plant" when you mean the asset), post.

**Queue**:
The pending **Ops** eligible for a **Station**, ordered by the sequencing rule. Filtered down further at scan-in by operator role + qualifications.
_Avoid_: Backlog, list.

**Pull**:
Capacity-led work selection. A **Plant** consumes from its **Station**'s **Queue** when an **Operator** is free and qualified. Work is never pushed onto a Plant or a Station.

**Operator** _(refinement)_:
**Labor axis** of work, not the production-planning axis. An Operator is qualified to *use* certain Plant Types and to *perform* certain ops. Operator availability is a secondary constraint on top of Plant availability — being plant-limited is the planner's problem, being labor-limited is the shift planner's problem, and they're different alarms.

**Cell** _(deliberately not used in MVP)_:
A physical workspace grouping (e.g. "Weld Bay 1"). With **Plant** modelled explicitly, Cell becomes an emergent property of where Plant sits — we don't need a separate concept. Reserved term to prevent reintroduction without an ADR.

### Throughput & WIP

**Expected Minutes**:
The predicted duration of an **Op**, computed at card issue and snapshotted onto `production_card_part_op.expected_minutes`. For weld ops it derives from WPS (deposition rate, process) + Weld Map (seam length, throat, position). For non-weld ops it derives from op-library base time × Part **Complexity Score** × op-specific factor. Refines over time from session actuals.
_Avoid_: Estimated minutes, planned minutes (they're synonymous but pick one — Expected Minutes is canonical).

**Complexity Score**:
An integer 1–5 per **Part**, planner-entered at planning time. Default 3 (average). Multiplier into non-weld op expected times. Refinable per-Part as actuals come in.

**Takt**:
A **Station**'s pacing time: `available_minutes_per_day / target_throughput`. Drives the WIP cap calculation. Per-Station config; planner-tunable; expected to be parameter-tuned over time, not derived from a single shop-wide target.

**WIP Cap**:
The headroom of a **Station**, computed as `takt × cap_window − current_backlog`. Enforced at **card issue** — a card that would push a Station over cap blocks (or warns hard) before it lands on the floor. *Not* enforced at the kiosk — the floor pulls freely, the gate is the gate.

## Relationships

- A **Card** has one or more **Parts**.
- A **Part** has one or more **Ops** (its **Routing**).
- An **Op** is assigned to exactly one **Station** (via `required_role`).
- A **Station** has exactly one **Queue** at any time.
- An **Operator** belongs to one or more **Stations** (via `employees.role[]`).
- Multiple **Operators** may concurrently work on the same **Op** when the part footprint allows (e.g. several welders on a large assembly).

## Example dialogue

> **Planner:** "Is the welder station overloaded?"
> **System:** "The welder **Queue** has 14 pending **Ops**. Two welders are currently in sessions, both on Card 10358-M&DC-0007 Part 3 — same **Op**, fanning out the seam."
> **Planner:** "So the **Station** is at headcount cap, not because of an op cap?"
> **System:** "Correct. There are 3 welders on shift, 2 currently scanned in, 1 free."

## Flagged ambiguities

- **Station vs Cell**: resolved — **Station** is a role-keyed staffing queue (MVP); **Cell** is a physical workspace grouping (deferred, not modelled).
- **Operator vs Web User**: resolved — same person can be both, but identity flows differently (RFID at kiosk vs `auth_users` on web). Use "Operator" only when talking about a kiosk session.
