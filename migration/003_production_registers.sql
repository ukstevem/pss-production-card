-- ============================================================
-- Production registers — shop-floor master data:
--   production_op_library            master list of named ops
--   production_routing_template      named templates per process family
--   production_routing_template_op   template → ordered ops
--
-- Seeded by app/scripts/seed-op-library.ts + seed-routing-templates.ts
-- (issue pc-shg).
-- ============================================================

-- production_op_library --------------------------------------------
-- Master list of named operations. code is the short identifier used
-- everywhere (foreign-keyed by card_part_op.op_code and routing
-- templates). required_role is the operator trade required at scan-in.
-- default_hold_point_after marks ops that, by default, drop a hold
-- point after closing — planner can override per-routing.
create table if not exists production_op_library (
  code                       text        primary key,            -- 'weld','plating','fettle' …
  label                      text        not null,
  required_role              text        not null,
  default_hold_point_after   boolean     not null default false,
  category                   text        not null,               -- 'prep','fab','finish','machine','asm','qc','site','dispatch'
  description                text,
  active                     boolean     not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists idx_production_op_library_category
  on production_op_library (category);

-- production_routing_template --------------------------------------
create table if not exists production_routing_template (
  id                         uuid        primary key default gen_random_uuid(),
  name                       text        not null,                -- 'Standard Fabrication'
  process_family             text        not null
                                         check (process_family in ('Fabrication','Machining','Assembly','Site Install','Finishing')),
  description                text,
  active                     boolean     not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (process_family, name)
);

create index if not exists idx_production_routing_template_family
  on production_routing_template (process_family);

-- production_routing_template_op -----------------------------------
-- Ordered ops within a template. seq within (template_id) is unique.
create table if not exists production_routing_template_op (
  template_id                uuid        not null references production_routing_template(id) on delete cascade,
  seq                        smallint    not null check (seq >= 0),
  op_code                    text        not null references production_op_library(code) on delete restrict,
  hold_point_after           boolean,                              -- null = inherit from op_library default
  primary key (template_id, seq)
);

create index if not exists idx_production_routing_template_op_op_code
  on production_routing_template_op (op_code);

-- RLS ---------------------------------------------------------------
alter table production_op_library             enable row level security;
alter table production_routing_template       enable row level security;
alter table production_routing_template_op    enable row level security;

create policy "Authenticated users can read production_op_library"
  on production_op_library for select to authenticated using (true);
create policy "Authenticated users can write production_op_library"
  on production_op_library for all to authenticated using (true) with check (true);

create policy "Authenticated users can read production_routing_template"
  on production_routing_template for select to authenticated using (true);
create policy "Authenticated users can write production_routing_template"
  on production_routing_template for all to authenticated using (true) with check (true);

create policy "Authenticated users can read production_routing_template_op"
  on production_routing_template_op for select to authenticated using (true);
create policy "Authenticated users can write production_routing_template_op"
  on production_routing_template_op for all to authenticated using (true) with check (true);

-- Triggers ----------------------------------------------------------
drop trigger if exists trg_production_op_library_updated_at on production_op_library;
create trigger trg_production_op_library_updated_at
  before update on production_op_library
  for each row execute function set_updated_at();

drop trigger if exists trg_production_routing_template_updated_at on production_routing_template;
create trigger trg_production_routing_template_updated_at
  before update on production_routing_template
  for each row execute function set_updated_at();
