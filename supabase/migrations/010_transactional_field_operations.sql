create table if not exists public.preparacion_pedido (
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  cantidad_preparada numeric(16,4) not null default 0,
  estado text not null default 'PENDIENTE' check(estado in ('PENDIENTE','PREPARADO','FALTANTE','OBSERVADO')),
  cantidad_faltante numeric(16,4) not null default 0,
  motivo text not null default '',
  observacion text not null default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(pedido_id,producto_id)
);
alter table public.preparacion_pedido enable row level security;
create policy "operations read preparation" on public.preparacion_pedido for select to authenticated using(public.es_rol(array['ADMINISTRADOR','PREVENTISTA','ALMACENERO','REPARTIDOR']));
create policy "warehouse manage preparation" on public.preparacion_pedido for all to authenticated using(public.es_rol(array['ADMINISTRADOR','ALMACENERO'])) with check(public.es_rol(array['ADMINISTRADOR','ALMACENERO']));

create or replace function public.crear_pedido(p_codigo text,p_cliente_id uuid,p_items jsonb,p_descuento numeric,p_observaciones text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_subtotal numeric; v_existing boolean := false;
begin
  if not public.es_rol(array['ADMINISTRADOR','PREVENTISTA']) then raise exception 'Sin permiso para crear pedidos'; end if;
  select id into v_id from pedidos where idempotency_key=p_idempotency_key;
  if v_id is not null then return jsonb_build_object('success',true,'pedido_id',v_id,'total',(select total from pedidos where id=v_id),'duplicate',true); end if;
  select coalesce(sum((x->>'cantidad_presentacion')::numeric*(x->>'precio_aplicado')::numeric),0) into v_subtotal from jsonb_array_elements(p_items)x;
  insert into pedidos(codigo_pedido,cliente_id,subtotal,descuento,total,observaciones,usuario_creacion,idempotency_key)
  values(p_codigo,p_cliente_id,v_subtotal,coalesce(p_descuento,0),greatest(v_subtotal-coalesce(p_descuento,0),0),p_observaciones,auth.uid(),p_idempotency_key) returning id into v_id;
  insert into pedido_detalle(pedido_id,producto_id,presentacion_id,cantidad_presentacion,fraccion,factor_presentacion,cantidad_unidades_base,precio_presentacion,precio_aplicado,subtotal)
  select v_id,(x->>'producto_id')::uuid,nullif(x->>'presentacion_id','')::uuid,(x->>'cantidad_presentacion')::numeric,coalesce((x->>'fraccion')::numeric,0),(x->>'factor_presentacion')::numeric,(x->>'cantidad_unidades_base')::numeric,(x->>'precio_presentacion')::numeric,(x->>'precio_aplicado')::numeric,((x->>'cantidad_presentacion')::numeric*(x->>'precio_aplicado')::numeric) from jsonb_array_elements(p_items)x;
  insert into pedido_historial_estado(pedido_id,tipo_estado,estado_nuevo,usuario_id) values(v_id,'OPERATIVO','POR_COMPRAR',auth.uid());
  perform registrar_evento('NUEVO_PEDIDO','PEDIDO',v_id,'Nuevo pedido',v_subtotal,jsonb_build_object('idempotency_key',p_idempotency_key));
  return jsonb_build_object('success',true,'pedido_id',v_id,'total',greatest(v_subtotal-coalesce(p_descuento,0),0),'duplicate',v_existing);
end $$;

create or replace function public.guardar_preparacion_pedido(p_pedido_id uuid,p_lineas jsonb,p_marcar_listo boolean,p_almacen_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb;
begin
  if not public.es_rol(array['ADMINISTRADOR','ALMACENERO']) then raise exception 'Sin permiso para preparar pedidos'; end if;
  perform 1 from pedidos where id=p_pedido_id for update; if not found then raise exception 'Pedido no encontrado'; end if;
  for item in select * from jsonb_array_elements(p_lineas) loop
    insert into preparacion_pedido(pedido_id,producto_id,cantidad_preparada,estado,cantidad_faltante,motivo,observacion,updated_by)
    values(p_pedido_id,(item->>'producto_id')::uuid,coalesce((item->>'cantidad_preparada')::numeric,0),coalesce(item->>'estado','PENDIENTE'),coalesce((item->>'cantidad_faltante')::numeric,0),coalesce(item->>'motivo',''),coalesce(item->>'observacion',''),auth.uid())
    on conflict(pedido_id,producto_id) do update set cantidad_preparada=excluded.cantidad_preparada,estado=excluded.estado,cantidad_faltante=excluded.cantidad_faltante,motivo=excluded.motivo,observacion=excluded.observacion,updated_by=auth.uid(),updated_at=now();
  end loop;
  if p_marcar_listo then
    if exists(select 1 from preparacion_pedido where pedido_id=p_pedido_id and estado<>'PREPARADO') then raise exception 'Todas las líneas deben estar preparadas'; end if;
    perform public.reservar_stock_pedido(p_pedido_id,p_almacen_id);
  end if;
  return jsonb_build_object('success',true,'pedido_id',p_pedido_id,'listo',p_marcar_listo);
end $$;

create or replace function public.procesar_entrega_cobro(p_pedido_id uuid,p_entrega jsonb,p_pago jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare delivery_result jsonb; payment_result jsonb := '{}'::jsonb; payment_total numeric := 0;
begin
  if not public.es_rol(array['ADMINISTRADOR','REPARTIDOR','FINANZAS']) then raise exception 'Sin permiso para procesar entrega y cobro'; end if;
  if exists(select 1 from entregas where idempotency_key=p_idempotency_key||':ENTREGA') then
    return jsonb_build_object('success',true,'duplicate',true,'pedido_id',p_pedido_id);
  end if;
  delivery_result := public.registrar_entrega_pedido(p_pedido_id,p_entrega||jsonb_build_object('idempotency_key',p_idempotency_key||':ENTREGA'));
  select coalesce(sum((value->>'monto')::numeric),0) into payment_total from jsonb_array_elements(coalesce(p_pago->'medios','[]'::jsonb));
  if payment_total>0 then payment_result := public.registrar_pago_pedido(p_pedido_id,p_idempotency_key||':PAGO',p_pago->'medios'); end if;
  return jsonb_build_object('success',true,'delivery',delivery_result,'payment',payment_result,'pedido_id',p_pedido_id,'duplicate',false);
end $$;

grant execute on function public.guardar_preparacion_pedido(uuid,jsonb,boolean,uuid),public.procesar_entrega_cobro(uuid,jsonb,jsonb,text) to authenticated;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='preparacion_pedido') then
    alter publication supabase_realtime add table public.preparacion_pedido;
  end if;
end $$;
