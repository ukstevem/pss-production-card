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

- **Granularity**: Hybrid. Card-level QR on cover sheet; part-level QR on each part row. App resolves the op implicitly from operator role + part state.
- **Concurrency**: One open session per operator across the whole shop. Scanning a new thing auto-closes any prior. Same-part re-scan = stop.
- **Op resolution at scan-in**: `employees.role` filters routing → take the next pending op whose `required_role` matches on this part. If exactly one → start (zero clicks). If multiple → 1-tap pick. Otherwise reject (no eligible op).
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
- Sub-pieces hand-marked until scribe machine is in place.

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
```

- **Dual e-signoff** at issue: Planner *and* QC must press accept. Replaces the red "APPROVED FOR PRODUCTION" stamp.
- **Segregation of duties**: same person cannot operate and accept the same op. Same person cannot issue and final-inspect the same card.
- **Closed = immutable**: only an NCR or formal amendment can change records after close.

### Numbering — IEC 61355 via doc service

- Format: `{project_number}-M&DC-{NNNN}` (e.g. `10358-M&DC-0001`)
- Tech area `M` (Mechanical), subclass `DC` (Instructions and Manuals)
- Description ID `66` (MANUFACTURING INSTRUCTIONS) for shop cards, `67` (INSTALLATION INSTRUCTIONS) for site cards
- Single serial pool per project across shop+site variants
- Number minted by `pss-document-service` via `mint_iso_doc_serial` RPC on issue
- Card revisions: internal `card_rev` integer field (1, 2, 3…); refile PDF with `-r2` suffix per `pss-document-service` migration `014_refile_override`
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

- Hardware: existing M5Stack with RFID module + barcode scanner unit
- Events table `production_card_events` — separate from `timecard_events` (presence). Reuses `employee_cards` for operator lookup.
- Firmware lives in `firmware/` in this repo, mirroring the `pss-employee-presence/firmware/roll-call/` pattern.
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
  ├── doc_id (uuid → document_incoming_scan.id)         -- doc_number resolved via JOIN
  ├── project_register_item_id (uuid → project_register_items.id)  -- projectnumber + item_seq via JOIN
  ├── variant ('shop' | 'site')
  ├── exc_class (smallint, denormalised at issue from project_register_items)
  ├── card_rev (int, default 1)
  ├── state (text, enum)
  ├── issued_by (uuid → employees), issued_at, qc_signed_by, qc_signed_at
  ├── closed_by, closed_at
  └── superseded_by_card_id (self-FK, rev chain)

production_card_part
  ├── id, card_id
  ├── drawing_number, drawing_rev, description, qty, weight
  ├── material_spec (text)
  ├── material_doc_id (FK → document_matl_cert nullable)
  ├── material_po_id (FK → purchase_orders nullable)
  └── state
  -- no project_register_item_id, no exc_class — both inherited from card

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
  ├── id, card_part_op_id (nullable — also card-level for final)
  ├── inspector_employee_id
  ├── result ('pass' | 'fail' | 'rework')
  ├── level_iso5817 (text, nullable)
  ├── defects (jsonb)         -- structured if EXC ≥ 3
  ├── photo_ids (jsonb)       -- doc service references
  └── signed_at

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
7. Kiosk firmware: RFID + QR scan → POST event with HMAC; pre-flight welder qual + WPS match for weld ops
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
