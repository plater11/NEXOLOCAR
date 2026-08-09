create table if not exists public.dispositivos_push (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  activo boolean not null default true,
  ultimo_uso timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.conflictos_sincronizacion (
  id uuid primary key default gen_random_uuid(),
  operacion_id text not null unique,
  usuario_id uuid references auth.users(id),
  tipo text not null,
  payload jsonb not null default '{}',
  motivo text not null,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','RESUELTO','DESCARTADO')),
  resolucion jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.registro_operaciones (
  id uuid primary key default gen_random_uuid(),
  operacion_id text not null,
  usuario_id uuid references auth.users(id),
  funcion text not null,
  estado text not null check (estado in ('RECIBIDA','PROCESANDO','COMPLETADA','FALLIDA','CONFLICTO')),
  duracion_ms integer,
  error text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists registro_operaciones_created_idx on public.registro_operaciones(created_at desc);
create index if not exists registro_operaciones_funcion_idx on public.registro_operaciones(funcion,estado);

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id),
  tipo text not null,
  titulo text not null,
  mensaje text not null,
  entidad text,
  entidad_id uuid,
  prioridad text not null default 'NORMAL',
  leida boolean not null default false,
  enviada boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.dispositivos_push enable row level security;
alter table public.conflictos_sincronizacion enable row level security;
alter table public.registro_operaciones enable row level security;
alter table public.notificaciones enable row level security;
create policy "users manage own push devices" on public.dispositivos_push for all to authenticated using(usuario_id=auth.uid()) with check(usuario_id=auth.uid());
create policy "users read own conflicts" on public.conflictos_sincronizacion for select to authenticated using(usuario_id=auth.uid() or public.es_rol(array['ADMINISTRADOR']));
create policy "admin read operation logs" on public.registro_operaciones for select to authenticated using(public.es_rol(array['ADMINISTRADOR']));
create policy "users read own notifications" on public.notificaciones for select to authenticated using(usuario_id=auth.uid() or usuario_id is null);
create policy "users mark own notifications" on public.notificaciones for update to authenticated using(usuario_id=auth.uid()) with check(usuario_id=auth.uid());

insert into storage.buckets(id,name,public) values ('productos','productos',true) on conflict(id) do nothing;
create policy "authenticated upload product images" on storage.objects for insert to authenticated with check(bucket_id='productos' and public.es_rol(array['ADMINISTRADOR','ALMACENERO']));
create policy "public read product images" on storage.objects for select using(bucket_id='productos');

do $$
declare table_name text;
begin
  foreach table_name in array array['clientes','productos','stock_actual','pagos','jornadas','entregas','notificaciones'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name
    ) then execute format('alter publication supabase_realtime add table public.%I', table_name); end if;
    execute format('alter table public.%I replica identity full', table_name);
  end loop;
end $$;

create or replace function public.generar_alertas_operativas() returns integer
language plpgsql security definer set search_path=public as $$
declare inserted integer := 0;
begin
  insert into notificaciones(tipo,titulo,mensaje,entidad,entidad_id,prioridad,metadata)
  select 'STOCK_BAJO','Stock bajo',p.nombre||' tiene '||s.stock_disponible||' unidades disponibles','PRODUCTO',p.id,'ALTA',jsonb_build_object('codigo',p.codigo,'stock',s.stock_disponible)
  from productos p join stock_actual s on s.producto_id=p.id
  where p.activo and s.stock_disponible<=p.stock_min
    and not exists(select 1 from notificaciones n where n.tipo='STOCK_BAJO' and n.entidad_id=p.id and n.created_at>now()-interval '12 hours');
  get diagnostics inserted = row_count;
  insert into notificaciones(tipo,titulo,mensaje,entidad,entidad_id,prioridad,metadata)
  select 'PEDIDO_RETRASADO','Pedido pendiente',codigo_pedido||' continúa pendiente desde '||fecha::date,'PEDIDO',id,'ALTA',jsonb_build_object('codigo',codigo_pedido)
  from pedidos where estado_operativo not in ('ENTREGADO','ANULADO') and fecha<now()-interval '24 hours'
    and not exists(select 1 from notificaciones n where n.tipo='PEDIDO_RETRASADO' and n.entidad_id=pedidos.id and n.created_at>now()-interval '12 hours');
  return inserted;
end $$;

do $$ begin
  create extension if not exists pg_cron;
  if not exists(select 1 from cron.job where jobname='nexoventa-alertas-operativas') then
    perform cron.schedule('nexoventa-alertas-operativas','*/15 * * * *','select public.generar_alertas_operativas()');
  end if;
exception when insufficient_privilege then null;
end $$;
