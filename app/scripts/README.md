# Scripts

One-shot, idempotent. Run with `tsx` against the production-card Supabase project. Each script logs what it changed.

## Setup

1. Apply the migrations under `../migration/` first (Supabase SQL editor).
2. Create `app/.env.local` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`).
3. `npm install` if not already.

## Run

```bash
cd app
npm run seed:ops         # seed production_op_library (~27 ops)
npm run seed:routing     # seed production_routing_template + production_routing_template_op (4 templates)
npm run import:wps       # upsert welding_wps from scripts/data/wps.json (97 procedures)
npm run seed:all         # all three in order
```

All three are idempotent — re-running upserts on `(code)`, `(process_family, name)`, and `wps_no` respectively.

## What's NOT auto-imported

- **Welder qualifications** (`welding_welder_qualification`). The Welding Control Register's qual sheet (`assets/Welding Control Register (rev 2) updated DECEMBER 25.xlsx`, sheet "WELDER QUAL RANGE") is hand-edited and inconsistent — auto-parse would mis-attribute ranges. **Plan**: populate via the WPS/qual CRUD UI in issue pc-zr5. Each row needs:
  - welder (existing employee)
  - wps_id (FK to welding_wps) — or qualification_range text if the cert covers many WPS
  - expires_at
  - status
  - qualification_doc_id (link to scanned cert via the documents app)

## Data sources

- `scripts/data/wps.json` — 97 WPS rows extracted from `assets/PSS Welding Procedure Register v3.xlsx` (the cleaned-from-PDFs register). Re-extract if the spreadsheet is updated.
- Op library + routing templates are inline in their seed scripts. Edit there; re-run the script to apply.
