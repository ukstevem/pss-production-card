-- ============================================================
-- Column additions to existing tables.
--
-- Touches:
--   employees                  — adds role (operator trades) + auth_user_id
--   project_register_items     — adds exc_class (per-item, not per-project)
--
-- See docs/ARCHITECTURE.md for rationale.
-- Run in Supabase SQL editor (production-card project DB).
-- ============================================================

-- employees: operator trades + link to auth_users for web sign-in.
-- Trades drive op resolution at kiosk scan-in (next pending op whose
-- required_role matches the operator's role). auth_user_id is NULL for
-- shop-floor-only operators who never use the web app.
alter table employees
  add column if not exists role          text[]  not null default '{}',
  add column if not exists auth_user_id  uuid    references auth_users(id);

create index if not exists idx_employees_role_gin
  on employees using gin (role);

create index if not exists idx_employees_auth_user_id
  on employees (auth_user_id);

-- project_register_items: EXC class lives per item, since one project
-- can carry items of different EXC classes (e.g. structural EXC3 plus
-- secondary EXC2 on the same job). Production_card denormalises this
-- onto itself at issue time.
alter table project_register_items
  add column if not exists exc_class smallint
    check (exc_class is null or exc_class between 1 and 4);

create index if not exists idx_project_register_items_exc_class
  on project_register_items (exc_class)
  where exc_class is not null;
