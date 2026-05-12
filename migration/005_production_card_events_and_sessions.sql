-- ============================================================
-- Kiosk events + derived sessions view.
--
-- Each tap+scan produces one production_card_event row.
-- Sessions are pairs of (start, stop) on the same employee + op,
-- exposed via a view that pairs consecutive events with window funcs.
--
-- Auto-close on shift-end clock-out (per Q22-a in design grill) is
-- handled by a separate trigger on timecard_events (issue pc-2wl).
-- ============================================================

-- production_card_event --------------------------------------------
-- Append-only event log. Never UPDATE — only INSERT.
create table if not exists production_card_event (
  id                          uuid        primary key default gen_random_uuid(),
  kiosk_id                    text        not null,
  ts                          timestamptz not null default now(),
  employee_id                 uuid        not null references employees(id) on delete restrict,
  card_part_op_id             uuid        not null references production_card_part_op(id) on delete restrict,
  action                      text        not null
                                          check (action in ('start','stop','reject')),
  consumable_heat             text,                                         -- only for weld starts
  reason                      text,                                         -- e.g. 'auto_shift_end','qual_expired'
  meta                        jsonb       not null default '{}'::jsonb,
  created_at                  timestamptz not null default now()
);

-- Index for the most common queries: 'who's open right now on op X'
-- and 'all events for op X'.
create index if not exists idx_production_card_event_op_ts
  on production_card_event (card_part_op_id, ts);

create index if not exists idx_production_card_event_employee_ts
  on production_card_event (employee_id, ts);

create index if not exists idx_production_card_event_kiosk_ts
  on production_card_event (kiosk_id, ts);

-- production_card_op_session (VIEW) --------------------------------
-- Pairs each 'start' with the next 'stop' for the same (employee_id,
-- card_part_op_id). An unmatched final 'start' surfaces as a row with
-- stopped_at = NULL — that's the operator's currently open session.
create or replace view production_card_op_session as
with starts as (
  select
    id              as start_event_id,
    employee_id,
    card_part_op_id,
    ts              as started_at,
    consumable_heat,
    meta            as start_meta,
    row_number() over (
      partition by employee_id, card_part_op_id
      order by ts
    )                as start_idx
  from production_card_event
  where action = 'start'
),
stops as (
  select
    id              as stop_event_id,
    employee_id,
    card_part_op_id,
    ts              as stopped_at,
    reason          as stop_reason,
    meta            as stop_meta,
    row_number() over (
      partition by employee_id, card_part_op_id
      order by ts
    )                as stop_idx
  from production_card_event
  where action = 'stop'
)
select
  s.start_event_id,
  s.employee_id,
  s.card_part_op_id,
  s.started_at,
  p.stopped_at,
  s.consumable_heat,
  p.stop_reason,
  case
    when p.stopped_at is not null
      then extract(epoch from (p.stopped_at - s.started_at))::int
    else null
  end                                       as duration_seconds,
  s.start_meta,
  p.stop_meta
from starts s
left join stops p
  on p.employee_id     = s.employee_id
 and p.card_part_op_id = s.card_part_op_id
 and p.stop_idx        = s.start_idx;

-- RLS ---------------------------------------------------------------
alter table production_card_event enable row level security;

create policy "Authenticated users can read production_card_event"
  on production_card_event for select to authenticated using (true);

-- Writes only via service role from the kiosk endpoint (no policy
-- for authenticated users — the kiosk uses a server-side route with
-- the service-role key after HMAC validation).
