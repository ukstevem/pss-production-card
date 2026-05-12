-- ============================================================
-- Welding registers — canonical here, source of truth for:
--   welding_wps                       Weld Procedure Specifications
--   welding_welder_qualification      per-welder qualification to use WPS
--
-- Imported initially from assets/Welding Control Register (rev 2)
-- updated DECEMBER 25.xlsx by app/scripts/import-wps.ts (issue pc-shg).
-- ============================================================

-- welding_wps -------------------------------------------------------
-- One row per WPS. Attributes match sheet 3 of the Welding Control
-- Register. range_of_qualification is a structured jsonb block holding
-- the RoQ columns from the spreadsheet (joint type, fillet throat,
-- thickness range, diameter range, material grades, transfer, gas,
-- position).
create table if not exists welding_wps (
  id                       uuid        primary key default gen_random_uuid(),
  wps_no                   text        not null unique,           -- 'PSS 031A'
  standard                 text,                                  -- 'EN ISO 15614-1'
  process                  text,                                  -- 'MAG (135)'
  joint_type               text,
  material_grade           text,
  thickness                text,                                  -- as printed ('12', '7.11 - 24 O/D 168.3')
  diameter                 text,
  consumable_spec          text,                                  -- 'EN ISO 14341-A G38 4M-G3SiL'
  gas_flux                 text,
  position                 text,                                  -- 'PA','PB','PF'…
  mode_of_transfer         text,
  preheat                  text,
  charpy_test              text,
  range_of_qualification   jsonb       not null default '{}'::jsonb,
  -- Extra structured fields from v3 register (current/volts/polarity/heat-input/PWHT/NDT/WPQR/approver/issue-date etc.)
  -- Kept as jsonb so the register can evolve without schema churn.
  attributes               jsonb       not null default '{}'::jsonb,
  pdf_doc_id               uuid,                                  -- → document_incoming_scan(id) when WPS PDF filed
  active                   boolean     not null default true,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_welding_wps_active
  on welding_wps (active);

-- welding_welder_qualification -------------------------------------
-- One row per (welder, WPS-or-range). A welder may have multiple rows
-- if their qualification covers several distinct WPS or covers a range
-- (described in qualification_range text).
create table if not exists welding_welder_qualification (
  id                       uuid        primary key default gen_random_uuid(),
  welder_employee_id       uuid        not null references employees(id) on delete restrict,
  wps_id                   uuid        references welding_wps(id) on delete restrict,
  qualification_range      text,                                  -- e.g. 'WPS 044, 046, 048 …' when covering a range
  qualified_from           date,
  expires_at               date,
  status                   text        not null default 'active'
                                       check (status in ('active','expired','awaiting_qual','suspended','revoked')),
  qualification_doc_id     uuid,                                  -- → document_incoming_scan(id) for the qual cert PDF
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- At least one of (wps_id, qualification_range) must be present
  check (wps_id is not null or qualification_range is not null)
);

create index if not exists idx_welding_welder_qualification_welder
  on welding_welder_qualification (welder_employee_id);

create index if not exists idx_welding_welder_qualification_wps
  on welding_welder_qualification (wps_id);

create index if not exists idx_welding_welder_qualification_status
  on welding_welder_qualification (status);

create index if not exists idx_welding_welder_qualification_expires
  on welding_welder_qualification (expires_at)
  where status = 'active';

-- RLS ---------------------------------------------------------------
alter table welding_wps                       enable row level security;
alter table welding_welder_qualification      enable row level security;

create policy "Authenticated users can read welding_wps"
  on welding_wps for select to authenticated using (true);
create policy "Authenticated users can write welding_wps"
  on welding_wps for all to authenticated using (true) with check (true);

create policy "Authenticated users can read welding_welder_qualification"
  on welding_welder_qualification for select to authenticated using (true);
create policy "Authenticated users can write welding_welder_qualification"
  on welding_welder_qualification for all to authenticated using (true) with check (true);

-- Triggers ----------------------------------------------------------
drop trigger if exists trg_welding_wps_updated_at on welding_wps;
create trigger trg_welding_wps_updated_at
  before update on welding_wps
  for each row execute function set_updated_at();

drop trigger if exists trg_welding_welder_qualification_updated_at on welding_welder_qualification;
create trigger trg_welding_welder_qualification_updated_at
  before update on welding_welder_qualification
  for each row execute function set_updated_at();
