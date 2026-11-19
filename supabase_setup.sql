-- Run in Supabase SQL Editor. Public display names only: never store private emails here.
create table if not exists public.cell_reservations (
  cell_number integer primary key check (cell_number between 1 and 384),
  display_name text not null check (char_length(trim(display_name)) between 1 and 100),
  reserved_at timestamptz not null default now()
);
alter table public.cell_reservations enable row level security;
-- Public can see which cells are reserved and their chosen display names.
create policy "Public may view reservations"
on public.cell_reservations for select to anon using (true);
-- Public may claim a free cell. The primary key prevents duplicate claims.
create policy "Public may reserve a cell"
on public.cell_reservations for insert to anon with check (true);
-- No public update or delete policies: visitors cannot change existing reservations.
grant usage on schema public to anon;
grant select (cell_number, display_name), insert (cell_number, display_name)
on public.cell_reservations to anon;
