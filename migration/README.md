# Migrations

Numbered SQL files. Run in order in the Supabase SQL editor against the production-card project DB.

## Order

| # | File | What it does |
|---|---|---|
| 001 | `existing_table_columns.sql` | Adds `employees.role` + `employees.auth_user_id`; adds `project_register_items.exc_class` |
| 002 | `welding_registers.sql` | `welding_wps`, `welding_welder_qualification` |
| 003 | `production_registers.sql` | `production_op_library`, `production_routing_template`, `production_routing_template_op` |
| 004 | `production_card.sql` | `production_card`, `production_card_part`, `production_card_part_op` (the card + parts + ops) |
| 005 | `production_card_events_and_sessions.sql` | `production_card_event` (append-only) + `production_card_op_session` view |
| 006 | `production_card_inspections_and_signoffs.sql` | `production_card_inspection`, `production_card_signoff` |

## Assumptions

- `set_updated_at()` already exists in the shared Supabase (defined in `platform-portal/supabase/migrations/001_timesheets.sql`). All `before update` triggers reference it.
- The existing tables we extend (`employees`, `project_register_items`, `document_incoming_scan`, `document_matl_cert`, `auth_users`) live in the same Supabase project.
- After applying all six, the schema matches `docs/ARCHITECTURE.md` § Data model.

## Conventions

- snake_case singular tables (matches `document_matl_cert`, `project_register`).
- Card-scoped tables prefixed `production_card_`; welding registers `welding_`; generic production registers `production_`.
- IDs are `uuid` with `gen_random_uuid()` default.
- Enum-like fields use `text` with `CHECK` constraints.
- All tables have `created_at` + `updated_at` (`timestamptz`, default `now()`); update is wired through `set_updated_at` trigger except for `production_card_event` and `production_card_signoff` which are append-only.
- RLS: authenticated users can read; writes vary (some authenticated, some service-role-only — see comments per file).

## Seeding

- WPS + welder qualifications: imported from `assets/Welding Control Register (rev 2) updated DECEMBER 25.xlsx` by `app/scripts/import-wps.ts` (issue pc-shg).
- Op library + routing templates: seeded by `app/scripts/seed-op-library.ts` + `app/scripts/seed-routing-templates.ts` (issue pc-shg).
