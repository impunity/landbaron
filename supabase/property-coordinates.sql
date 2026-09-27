-- Store geocoded coordinates so satellite and Street View links can be exact.
-- Additive and idempotent; existing rows are untouched and keep working via
-- address-based lookup until coordinates are filled in.

alter table public.properties
  add column if not exists latitude numeric;

alter table public.properties
  add column if not exists longitude numeric;
