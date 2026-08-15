create table if not exists public.periodos_operativos (
  id uuid primary key default gen_random_uuid(),
  periodo date not null unique check (periodo = date_trunc('month', periodo)::date),
  estado text not null default 'ABIERTO' check (estado in ('ABIERTO','CERRADO')),
  snapshot jsonb not null default '{}'::jsonb,
  abierto_por uuid references auth.users(id),
  cerrado_por uuid references auth.users(id),
  abierto_at timestamptz not null default now(),
  cerrado_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists periodos_operativos_estado_periodo_idx
  on public.periodos_operativos (estado, periodo desc);
create index if not exists pedidos_fecha_estado_dashboard_idx
  on public.pedidos (fecha desc, estado_operativo, estado_entrega, estado_cobranza);
create index if not exists pagos_fecha_estado_dashboard_idx
  on public.pagos (fecha desc, estado);
create index if not exists entregas_fecha_estado_dashboard_idx
  on public.entregas (fecha_entrega desc, estado);
create index if not exists gastos_fecha_estado_dashboard_idx
  on public.gastos (fecha desc, estado);

alter table public.periodos_operativos enable row level security;

insert into public.periodos_operativos(periodo, estado)
values (date_trunc('month', timezone('America/Lima', now()))::date, 'ABIERTO')
on conflict (periodo) do nothing;

create or replace function public.cerrar_periodo_operativo(p_usuario uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo date := date_trunc('month', timezone('America/Lima', now()))::date;
  v_fin date := (v_periodo + interval '1 month')::date;
  v_snapshot jsonb;
begin
  if exists(select 1 from public.periodos_operativos where periodo = v_periodo and estado = 'CERRADO') then
    raise exception 'El periodo ya se encuentra cerrado.';
  end if;

  select jsonb_build_object(
    'ventas', coalesce((select sum(total) from public.pedidos where fecha >= v_periodo and fecha < v_fin and estado_operativo <> 'ANULADO'), 0),
    'cobrado', coalesce((select sum(monto) from public.pagos where fecha >= v_periodo and fecha < v_fin and estado = 'APLICADO'), 0),
    'porCobrar', coalesce((select sum(total) from public.pedidos where fecha >= v_periodo and fecha < v_fin and estado_operativo <> 'ANULADO'), 0)
      - coalesce((select sum(monto) from public.pagos where fecha >= v_periodo and fecha < v_fin and estado = 'APLICADO'), 0),
    'gastos', coalesce((select sum(monto) from public.gastos where fecha >= v_periodo and fecha < v_fin and estado = 'APROBADO'), 0),
    'pedidosPendientes', (select count(*) from public.pedidos where estado_operativo in ('POR_COMPRAR','LISTO_PARA_ENTREGA') or estado_entrega = 'EN_RUTA'),
    'cobranzasPendientes', (select count(*) from public.pedidos where estado_cobranza in ('PENDIENTE_DE_COBRO','COBRANZA_URGENTE')),
    'rendicionesPendientes', (select count(*) from public.rendiciones where estado <> 'VALIDADA'),
    'cerradoAt', now()
  ) into v_snapshot;

  insert into public.periodos_operativos(periodo, estado, snapshot, cerrado_por, cerrado_at)
  values(v_periodo, 'CERRADO', v_snapshot, p_usuario, now())
  on conflict(periodo) do update set estado='CERRADO', snapshot=excluded.snapshot,
    cerrado_por=excluded.cerrado_por, cerrado_at=excluded.cerrado_at;

  insert into public.periodos_operativos(periodo, estado, abierto_por)
  values(v_fin, 'ABIERTO', p_usuario)
  on conflict(periodo) do nothing;

  return jsonb_build_object('ok', true, 'periodo', v_periodo, 'snapshot', v_snapshot, 'siguientePeriodo', v_fin);
end;
$$;

create or replace function public.proteger_periodo_cerrado()
returns trigger
language plpgsql
as $$
declare
  v_fecha date;
begin
  if current_setting('app.allow_closed_period_edit', true) = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  v_fecha := coalesce(
    nullif(to_jsonb(new)->>'fecha','')::timestamptz::date,
    nullif(to_jsonb(new)->>'fecha_entrega','')::timestamptz::date,
    nullif(to_jsonb(new)->>'created_at','')::timestamptz::date,
    nullif(to_jsonb(old)->>'fecha','')::timestamptz::date,
    nullif(to_jsonb(old)->>'fecha_entrega','')::timestamptz::date,
    nullif(to_jsonb(old)->>'created_at','')::timestamptz::date
  );
  if exists(select 1 from public.periodos_operativos where periodo=date_trunc('month',v_fecha)::date and estado='CERRADO') then
    raise exception 'El periodo % está cerrado. Use el mecanismo administrativo controlado.', to_char(v_fecha,'YYYY-MM');
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists proteger_periodo_pedidos on public.pedidos;
create trigger proteger_periodo_pedidos before insert or update or delete on public.pedidos
for each row execute function public.proteger_periodo_cerrado();
drop trigger if exists proteger_periodo_pagos on public.pagos;
create trigger proteger_periodo_pagos before insert or update or delete on public.pagos
for each row execute function public.proteger_periodo_cerrado();
drop trigger if exists proteger_periodo_gastos on public.gastos;
create trigger proteger_periodo_gastos before insert or update or delete on public.gastos
for each row execute function public.proteger_periodo_cerrado();
drop trigger if exists proteger_periodo_movimientos on public.movimientos_inventario;
create trigger proteger_periodo_movimientos before insert or update or delete on public.movimientos_inventario
for each row execute function public.proteger_periodo_cerrado();
