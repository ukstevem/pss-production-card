# pss-production-card — architecture

Captures the end-state design agreed during the initial design grill (2026-05-11). Drives the MVP bd issues. Edit when a decision changes.

---

## What this app does

A digital production traveller for items moving through the workshop and through site installation. Replaces the current paper jobcard. Captures **contemporaneous** evidence (who, when, what op, on which part, with which WPS / consumable heat) so the audit trail is built as work happens, not reconstructed after.

The traveller paper still exists — printed at issue time, follows the parts, scanned at the kiosk. Paper is the human-facing fallback; the database is the source of truth.

---

## Where this app fits

```
┌─ pss-production-card ──────────────────────────────────────────┐
│  Web app  (planning, QC, inspection, WPS+welder registers)    │
│  Kiosk firmware (M5Stack RFID + barcode)                      │
└──────┬──────────────────────────────────────────────────────┬──┘
       │                                                      │
       │ POST /api/file (61355 number + PDF archive)          │
       ▼                                                      │
┌────────────────────┐    ┌──────────────────┐    ┌──────────┴─────┐
│ pss-document-      │    │ pss-matl-cert    │    │ pss-employee-  │
│ service            │    │                  │    │ presence       │
│ (canonical IDs)    │    │ (material certs; │    │ (employee_cards│
│                    │    │  consumables P2) │    │  RFID lookup)  │
└────────────────────┘    └──────────────────┘    └────────────────┘

Phase 3+ (placeholders today, free-text in MVP):
┌──────────────────┐    ┌──────────────────┐
│ Drawing app      │    │ BOM app          │
└──────────────────┘    └──────────────────┘
```

- **Gateway**: `http://10.0.0.75:3000/production-card/`
- **Port**: `3014` (reserved in `platform-portal/docs/PORTS.md`)
- **Service / container**: `production-card`
- **basePath**: `/production-card`
- **Image**: `ghcr.io/ukstevem/production-card`

---

## Locked decisions

### Tracking model

- **Granularity**: A **card** decomposes into one or more **subcards** — one per primary drawing (`production_card_part` rows). Each subcard prints its own cover sheet with a **subcard QR** encoding `{card.doc_number}/{primary_drawing.doc_number}`. No QR on physical pieces. Physical pieces (when `qty > 1`) marked with **paint-pen serials** (001, 002, …) per subcard, captured retrospectively at session-stop. (See `docs/adr/0003-subcard-identity-and-piece-serials.md`.)
- **Concurrency**: One open session per operator across the whole shop. Scanning a new thing auto-closes any prior. Same-part re-scan = stop.
- **Op resolution at scan-in**: Operator scans subcard QR → `employees.role` filters routing on that subcard → kiosk presents eligible ops for 1-tap pick. The serial picker is the second tap, at session-stop (operator declares which paint-pen serials they completed; for weld ops also per-piece heat). Otherwise reject (no eligible op for this role).
- **Shift-end**: existing `pss-employee-presence` clock-out cascades to close any open production-card sessions for that employee.

### Routing

- Per-part routing authored at card-issue time from a master op library + routing templates by **process family**: Fabrication, Machining, Assembly, Site Install. Finishing ops (paint, galv, blast, pickle-passivate) appended via a second dropdown.
- Op library (initial):
  - `mark, cut, drill, bevel, plating, weld, fettle, straighten, shot-blast, paint, galvanise, pickle-passivate`
  - `machine-setup, mill, turn, bore, debur, assemble`
  - `final-inspect, pack, dispatch`
  - `site-offload, site-position, site-bolt-up, site-weld, site-snag, handover`
- Each op carries `required_role` and an optional `hold_point_after` flag.

### Welding traceability (EN 1090)

- **Op-level enforcement** at `weld` scan-in: WPS pre-filtered to the welder's current quals + the part's material/process, consumable heat scanned/picked, welder qualification expiry checked. Blocks scan-in if any pre-flight fails.
- **EXC class** stored **per item** on `project_register_items.exc_class` (since one project can carry items of different EXC classes — e.g. structural EXC3 plus secondary EXC2 on the same job). One card is scoped to exactly one project_register_items row, so exc_class is denormalised once onto `production_card.exc_class` at issue time and applies to every part on the card. Inspection record fidelity adapts per card: lightweight by default; structured per-defect (ISO 5817 levels, photos required) auto-enabled when card's exc_class ≥ 3.
- **Registers**:
  - `wps` (canonical here, imported from `Welding Control Register (rev 2)`)
  - `welder_qualifications` (canonical here, imported from same workbook)
  - Consumables stay on monday.com short-term; nightly cache; migrate to `pss-matl-cert` long-term.

### Hold-points

`material identity → fit-up → visual weld → NDT (if specified) → pre-paint/pre-galv → pickle-passivate (stainless) → final inspection → pre-dispatch`

### Material traceability

- Per-part `material_spec` (free text) plus optional FK to `purchase_orders` or `document_matl_cert` — captured at planning, not scan time.
- Consumable **heat** scanned at every `weld` op (mandatory pre-flight).
- Pieces (when `qty > 1`) hand-marked with paint pen per subcard at the start of routing. Operator declares completed serials at session-stop via the kiosk's touch-grid **serial picker** — persisted as text breadcrumbs in `production_card_event.meta` jsonb (per-piece, with optional per-piece welding heat for weld ops). Future: scribe machine for pre-allocated serials.

### Card lifecycle

```
draft
  └─[dual signoff: planner + qc]→ issued
                                    └─[first scan]→ in_progress
                                                      ├─[manual]→ on_hold ─→ in_progress
                                                      └─[all ops closed]→ awaiting_final_inspection
                                                                            └─[inspector signs]→ complete
                                                                                                  └─[qc closes]→ closed (immutable)
draft → cancelled

issued | in_progress | awaiting_final_inspection → superseded
  (when a replacement card is issued; predecessor's superseded_by_card_id
   points forward; any open sessions auto-close; event log preserved)
```

- **Dual e-signoff** at issue: Planner *and* QC must press accept. Replaces the red "APPROVED FOR PRODUCTION" stamp.
- **Segregation of duties** — four rules:
  - **R1** — `production_card.issued_by` ≠ `closed_by` (issuer ≠ closer) — **DB CHECK**
  - **R2** — `production_card_inspection.inspector_employee_id` (op-scope rows) ≠ any `production_card_event.employee_id` on the same op (operator ≠ acceptor) — **app layer (cross-table)**
  - **R3** — `production_card.issued_by` ≠ `qc_signed_by` (dual issue requires 2 people) — **DB CHECK**
  - **R4** — `production_card.closed_by` ≠ any `production_card_inspection.inspector_employee_id` where `card_id = this.id` (closer ≠ final-inspector) — **app layer (cross-table)**
- **Close is a two-actor model**: after all required final inspections sign `pass`, card → `complete`. The QC then reviews paperwork + clicks close → `closed`. The closer's paperwork-review IS the close action; no separate paperwork-inspector role.
- **Closed = immutable**: only an NCR or formal amendment can change records after close.

### Numbering — IEC 61355 via doc service

- Format: `{project_number}-M&DC-{NNNN}` (e.g. `10358-M&DC-0001`)
- Tech area `M` (Mechanical), subclass `DC` (Instructions and Manuals)
- Description ID `66` (MANUFACTURING INSTRUCTIONS) for shop cards, `67` (INSTALLATION INSTRUCTIONS) for site cards
- Single serial pool per project across shop+site variants
- Number minted by `pss-document-service` via `mint_iso_doc_serial` RPC on issue
- **No card revisions.** When a card must change after issue, the planner creates a **new card** with a fresh doc-service number. The predecessor's `superseded_by_card_id` points to the replacement and its state moves to `superseded`. `card_rev` column is vestigial — to be dropped. The doc-service `refile_override` path is unused for cards.
- **Two docs per card lifecycle** (per ADR-0005): at issue, mint and file the as-planned PDF → `production_card.issued_doc_id`. At close, mint a NEW doc with the same `iso_description_id` and file the as-built PDF → `production_card.closed_doc_id`. Both immutable in doc-service. Same DCC pool, sequential numbering.
- Old `PF-2a` / `PF-3a` suffixes (EXC class smuggled into doc code) abandoned. EXC class is a project attribute, not a doc-code attribute.

### Roles

| Role | Can | Cannot |
|---|---|---|
| `viewer` | view, search, print copies | edit |
| `operator` | scan in/out at kiosk only | use web app |
| `planner` | create draft, edit routing, attach docs | issue, accept, NCR |
| `qc` | sign issue, run inspections, raise NCR, close cards, manage WPS register, manage welder quals | edit a draft |
| `inspector` | run inspections, sign hold-points, accept ops | issue cards, manage registers |
| `welding_engineer` | manage WPS register + welder quals; raise WPQR | issue cards, run inspections (unless also inspector) |
| `supervisor` | view all, override-close stuck ops, hold cards, oversight reports | edit routing, issue, accept |
| `admin` | role grants, system config | (everything else audited) |

- Multi-role allowed; segregation-of-duties enforced at op + card level.
- Identity: web via `auth_users`; kiosk via `employee_cards.card_id`. Join: `employees.auth_user_id` nullable FK.

### Kiosk

- **Hardware: Raspberry Pi 4 + 7" capacitive touchscreen** in a wall-mount enclosure. USB barcode scanner + USB RFID reader (both present as keyboards via HID profile). No firmware. (See `docs/adr/0004-kiosk-pi-web-app.md`.)
- **Same Next.js app** as the planner UI, locked to a `/kiosk` route in browser kiosk mode (Chromium `--kiosk`). Same Docker pipeline, same Supabase, same auth model.
- Events table `production_card_event` — separate from `timecard_events` (presence). Reuses `employee_cards` for RFID lookup.
- Touch-friendly layouts; physical input not assumed. The serial picker at session-stop is the primary touch-heavy surface.
- Auth: LAN-only endpoint with HMAC-signed POSTs; secret in `KIOSK_HMAC_SECRET`.

### Site (deferred — same process for now)

Site ops are op types in the routing; logged via the same shop kiosk for MVP. Future iteration: phone PWA (supervisor scans QR on parts at site, captures photos + client signature, offline-capable). Out of MVP.

---

## Data model (high level)

Naming conventions:
- snake_case singular
- card-scoped tables prefixed `production_card_`
- welding registers prefixed `welding_`
- generic production registers prefixed `production_`
- views named without a `v_` prefix; their card-scoped name carries the domain prefix anyway

```
project_register                  (existing — pss-orderbook / platform-portal)
  └── project_register_items      (existing)
        └── exc_class             (new column; smallint; per item — items on a single project can differ)

employees                         (existing — pss-employee-presence)
  ├── role: text[]                (new column — operator trades: welder/fabricator/painter/fitter/inspector/qc/site)
  ├── auth_user_id: uuid          (new column; nullable FK → auth_users.id)
  └── employee_cards              (existing — RFID UID lookup)

production_card                  -- a card is scoped to exactly one project_register_items row (one sub-project)
  ├── id (uuid)
  ├── issued_doc_id (uuid → document_incoming_scan.id)  -- as-planned PDF; populated at issue
  ├── closed_doc_id (uuid → document_incoming_scan.id)  -- as-built PDF; populated at close (ADR-0005)
  ├── project_register_item_id (uuid → project_register_items.id)
  ├── variant ('shop' | 'site')
  ├── exc_class (smallint, denormalised at issue from project_register_items)
  ├── state (text, enum incl. 'superseded')
  ├── issued_by (uuid → employees), issued_at, qc_signed_by, qc_signed_at
  ├── closed_by, closed_at                              -- 2-actor close: closer ≠ any final-inspector (R4 app-layer)
  ├── required_final_inspections (text[])               -- codes from production_inspection_type register
  ├── ndt_coverage_percent (smallint, 1..100; null when no NDT required)
  └── superseded_by_card_id (self-FK; non-null when state='superseded')
  -- card_rev column dropped; replacement = new card via supersede chain
  -- paperwork_signed_by/_at: NOT added (2-actor close model — closer's review IS the close)

production_card_part             -- a "subcard"; one per primary drawing on the card
  ├── id, card_id
  ├── primary_drawing_doc_id (FK → document_incoming_scan.id; mandatory at issue)
  ├── description, qty, weight
  ├── material_spec (text)
  ├── material_doc_id (FK → document_matl_cert nullable)
  ├── material_po_id (FK → purchase_orders nullable)
  └── state
  -- no project_register_item_id, no exc_class — both inherited from card
  -- drawing_number/drawing_rev text columns dropped (FK is source of truth;
  --   title-block number is read live from doc-service for display)

production_card_part_op
  ├── id, card_part_id, seq
  ├── op_code (FK → production_op_library.code)
  ├── required_role
  ├── hold_point_after (bool)
  ├── wps_id (FK → welding_wps, nullable; required if op_code='weld')
  └── state ('pending' | 'in_progress' | 'awaiting_inspection' | 'accepted' | 'rework')

production_card_event
  ├── id, kiosk_id, ts
  ├── employee_id (FK → employees)
  ├── card_part_op_id (FK)
  ├── action ('start' | 'stop' | 'reject')
  ├── consumable_heat (text, nullable; only for weld starts)
  └── meta (jsonb)

production_card_op_session              (view, derived from production_card_event)
  ├── employee_id, card_part_op_id
  └── started_at, stopped_at, duration

production_card_inspection
  ├── id, card_id (nullable), card_part_op_id (nullable)  -- exactly one is set
  ├── inspection_type (text, nullable)  -- required for card-level final; NULL for hold-point ops
  │                                       -- codes from production_inspection_type register
  ├── inspector_employee_id
  ├── result ('pass' | 'fail' | 'rework')
  ├── level_iso5817 (text, nullable)
  ├── defects (jsonb)         -- structured if EXC ≥ 3
  ├── photo_ids (jsonb)       -- doc service references
  └── signed_at

production_inspection_type    -- register; seeded with 6 codes for EXC ≤ 2 MVP
  ├── code (PK; e.g. 'geometric','weld_visual','weld_mpi','weld_dpi','cosmetic','client_specific')
  ├── label, category, description
  └── created_at, updated_at

production_card_signoff
  ├── id, card_id, role, type ('issue' | 'hold' | 'close')
  └── employee_id, signed_at, notes

production_op_library
  ├── code (PK), label, required_role, default_hold_point_after, category

production_routing_template / production_routing_template_op
  └── process_family, name, seq → op_code

welding_wps
  ├── wps_no, standard, process, material_grade, thickness_range, position,
  └── joint_type, consumable_spec, gas_flux, mode_of_transfer, preheat, charpy_test

welding_welder_qualification
  ├── welder_employee_id, wps_id_or_range
  └── expires_at, status, qualification_doc_id
```

---

## MVP (phase 1)

Issues filed in beads (see `bd ready`). Summary:

1. Repo bootstrap + Next.js scaffold + Dockerfile + compose + basePath wiring + nginx route
2. Supabase migrations for the data model above
3. Import scripts: WPS register + welder quals (xlsx → tables); op library + routing templates seed
4. Web: project picker → card draft → parts → routing
5. Web: dual e-signoff issue flow → mint 61355 number → generate + file traveller PDF
6. Web: WPS register CRUD; welder qualifications CRUD
7. Kiosk web app (`/kiosk` route on Pi + 7" touchscreen): RFID + subcard QR scan → POST event with HMAC; weld pre-flight (welder qual + WPS match); retrospective serial picker at session-stop (per-piece + per-heat)
8. Auto-close logic on shift-end clock-out (reactive to `timecard_events`)
9. Web: lightweight inspections (pass/fail/signer) + final inspection + close

## Out of MVP (later bd issues)

- EXC3+ structured inspection records (defects per ISO 5817, photos required, dim record sheet)
- Site PWA (phone, offline, client signature)
- Drawing app + integration
- BOM app + integration
- Consumables migration to matl-cert; barcode-from-spool resolution
- Reporting / dashboards (WIP map, OEE, dwell time, welder load)
- Notifications (qual expiring, NCR raised, card stuck on hold)
- Scribe-machine integration for sub-piece labels
- Cover-page-with-multiple-cards print mode (multi-part batch traveller)

---

## References

- `assets/Jobcard 3355.docm` — existing paper card; what we're replacing
- `assets/Welding Control Register (rev 2) updated DECEMBER 25.xlsx` — WPS register + WPQR + welder qual range; import source
- `assets/WELDING_CONSUMABLE_1778510275.xlsx` — monday.com consumable export; reference for the read-only sync layer
- `../pss-document-service/INTEGRATION.md` — POST /api/file contract, 61355 minting
- `../platform-portal/supabase/migrations/030_iso61355_reference.sql` — 61355 classification tables
- `../pss-employee-presence/migration/001_employee_cards.sql` — RFID lookup we reuse
- `../platform-portal/docs/PORTS.md` — port registry (3014 reserved for this app)
- `../platform-portal/docs/NEW_STANDALONE_APP.md` — scaffold templates for Dockerfile / compose / next.config / etc.
