# 0006 — Welding control extracted to pss-welding-control

The welding-engineering domain (WPS register, welder qualifications, future
WPQR) has been extracted from this app into a new standalone app
`pss-welding-control` (sibling repo at `../pss-welding-control/`).

## Why

Welding-engineering data has its own domain, lifecycle, and owners:

- WPS publication and welder qualification renewals run on a different cadence
  than production-card flow.
- Future consumers of welding data include `pss-matl-cert` (for consumable
  cross-references) and potentially a welder training app — production-card
  isn't the only future reader.
- Production cards CONSUME welding data; they don't OWN it.

The decision at the 2026-05-11 design grill — "WPS and welder qualifications
canonical *in* `pss-production-card`" — has been re-examined and reversed.

## What changed

- `welding_wps` and `welding_welder_qualification` tables: canonical home moves
  to `pss-welding-control`. The Supabase DB is shared; ownership semantics change.
- This app stops being canonical for those tables. The kiosk weld preflight in
  `qvp` reads via cross-app DB access (same Supabase, RLS-restricted).
- The WPS + welder qualification CRUD UI (formerly `bd-zr5` here) moves to
  `pss-welding-control` — closed here.
- `migration/002_welding_registers.sql` stays as historical record but is no
  longer maintained. Future schema for `welding_*` lives in welding-control's
  migrations.

## What's preserved here

- `production_card_part_op.wps_id` continues to FK into `welding_wps(id)` — the
  FK doesn't care which app writes the parent table.
- Kiosk preflight (`qvp`) queries welding_* tables for "is welder X qualified
  for WPS Y today" — query unchanged, just read-only access via RLS.
- All other production-card tables and code unchanged.

## Consequences

- Cross-app data access pattern: shared Supabase + RLS-restricted reads for MVP.
  HTTP API considered later if coupling becomes painful.
- Coordination needed on schema evolution: any change to `welding_*` shape
  must consider production-card's read patterns. Live in welding-control's
  ADRs going forward.
- Deployment grows: welding-control gets its own port, service, container,
  gateway route. Tracked in welding-control's bd backlog.

Rejected: keeping welding tables canonical here. Worked for MVP but mixed
two ownership zones in one app, with production-card "owning" data it
doesn't actually own. Bad smell for future cross-app reuse.

Rejected: HTTP-only data exchange (no shared DB). Adds latency to the
kiosk hot path and requires welding-control to be up for production-card
to function. Shared DB with RLS is the lighter coupling.
