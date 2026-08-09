alter table public.productos
  add column if not exists grupo text not null default 'General',
  add column if not exists stock_min numeric(16,4) not null default 0,
  add column if not exists imagen text,
  add column if not exists promocion_activa boolean not null default false,
  add column if not exists cantidad_promo numeric(16,4) not null default 0,
  add column if not exists precio_promo numeric(16,4) not null default 0,
  add column if not exists descripcion_promo text,
  add column if not exists controla_decimales boolean not null default false;

create index if not exists idx_productos_grupo on public.productos(grupo) where activo;
