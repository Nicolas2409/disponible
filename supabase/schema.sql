-- Disponible: todos los datos se guardan como un documento JSON en una sola fila.
-- Pegar y ejecutar en Supabase → SQL Editor.

create table if not exists public.app_state (
  id integer primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Bloquea el acceso público: solo el servidor (service_role) puede leer/escribir.
alter table public.app_state enable row level security;
revoke all on public.app_state from anon, authenticated;
