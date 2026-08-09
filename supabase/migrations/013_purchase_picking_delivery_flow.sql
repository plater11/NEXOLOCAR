alter table public.pedidos add column if not exists subestado_operativo text;
alter table public.pedidos add column if not exists motivo_incidencia text;
alter table public.pedidos add column if not exists fecha_reprogramada date;
alter table public.pedidos add column if not exists fecha_vencimiento_cobro date;

create index if not exists pedidos_fecha_estado_idx on public.pedidos(fecha desc,estado_operativo,estado_entrega);
create index if not exists pedido_detalle_producto_idx on public.pedido_detalle(producto_id,presentacion_id,pedido_id);

create or replace function public.obtener_consolidado_compra(
  p_desde date,
  p_hasta date,
  p_pedido_ids uuid[] default null
) returns jsonb
language sql security definer set search_path=public as $$
with seleccion as (
  select p.id,p.codigo_pedido,p.fecha,p.cliente_id
  from pedidos p
  where p.estado_operativo='POR_COMPRAR'
    and p.fecha >= p_desde::timestamptz
    and p.fecha < (p_hasta+1)::timestamptz
    and (p_pedido_ids is null or p.id=any(p_pedido_ids))
), base as (
  select d.producto_id,d.presentacion_id,pr.codigo,pr.nombre producto,
    coalesce(ps.nombre,pr.unidad_base) presentacion,
    coalesce(ps.factor,d.factor_presentacion,1) factor,pr.unidad_base,
    sum(d.cantidad_unidades_base) cantidad_requerida
  from seleccion s join pedido_detalle d on d.pedido_id=s.id
  join productos pr on pr.id=d.producto_id
  left join presentaciones ps on ps.id=d.presentacion_id
  group by d.producto_id,d.presentacion_id,pr.codigo,pr.nombre,ps.nombre,ps.factor,d.factor_presentacion,pr.unidad_base
), compra as (
  select b.*,coalesce(sum(sa.stock_disponible),0) stock_disponible,
    coalesce(sum(sa.stock_reservado),0) reservado,
    greatest(b.cantidad_requerida-coalesce(sum(sa.stock_disponible),0),0) compra_sugerida
  from base b left join stock_actual sa on sa.producto_id=b.producto_id
  group by b.producto_id,b.presentacion_id,b.codigo,b.producto,b.presentacion,b.factor,b.unidad_base,b.cantidad_requerida
), origen as (
  select s.codigo_pedido pedido,c.nombre cliente,s.fecha,pr.codigo,pr.nombre producto,
    coalesce(ps.nombre,pr.unidad_base) presentacion,d.cantidad_presentacion,d.cantidad_unidades_base
  from seleccion s join clientes c on c.id=s.cliente_id
  join pedido_detalle d on d.pedido_id=s.id join productos pr on pr.id=d.producto_id
  left join presentaciones ps on ps.id=d.presentacion_id
)
select jsonb_build_object(
  'consolidado',coalesce((select jsonb_agg(to_jsonb(compra) order by producto,presentacion) from compra),'[]'::jsonb),
  'origen',coalesce((select jsonb_agg(to_jsonb(origen) order by fecha,pedido,producto) from origen),'[]'::jsonb)
);
$$;

create or replace function public.guardar_preparacion_pedido(p_pedido_id uuid,p_lineas jsonb,p_marcar_listo boolean,p_almacen_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; requerida numeric; preparada numeric; calculado text;
begin
  if not public.es_rol(array['ADMINISTRADOR','ALMACENERO']) then raise exception 'Sin permiso para preparar pedidos'; end if;
  perform 1 from pedidos where id=p_pedido_id and estado_operativo='POR_COMPRAR' for update;
  if not found then raise exception 'El pedido no está disponible para preparación'; end if;
  for item in select * from jsonb_array_elements(p_lineas) loop
    select cantidad_unidades_base into requerida from pedido_detalle where pedido_id=p_pedido_id and producto_id=(item->>'producto_id')::uuid;
    if requerida is null then raise exception 'Producto ajeno al pedido'; end if;
    preparada:=greatest(least(coalesce((item->>'cantidad_preparada')::numeric,0),requerida),0);
    calculado:=case when preparada=0 then 'PENDIENTE' when preparada>=requerida then 'PREPARADO' else 'FALTANTE' end;
    insert into preparacion_pedido(pedido_id,producto_id,cantidad_preparada,estado,cantidad_faltante,motivo,observacion,updated_by)
    values(p_pedido_id,(item->>'producto_id')::uuid,preparada,calculado,greatest(requerida-preparada,0),coalesce(item->>'motivo',''),coalesce(item->>'observacion',''),auth.uid())
    on conflict(pedido_id,producto_id) do update set cantidad_preparada=excluded.cantidad_preparada,estado=excluded.estado,cantidad_faltante=excluded.cantidad_faltante,motivo=excluded.motivo,observacion=excluded.observacion,updated_by=auth.uid(),updated_at=now();
  end loop;
  if p_marcar_listo then
    if exists(select 1 from pedido_detalle d left join preparacion_pedido pp on pp.pedido_id=d.pedido_id and pp.producto_id=d.producto_id where d.pedido_id=p_pedido_id and coalesce(pp.cantidad_preparada,0)<d.cantidad_unidades_base) then
      raise exception 'No se puede completar el pedido: existen productos pendientes';
    end if;
    perform public.reservar_stock_pedido(p_pedido_id,p_almacen_id);
    update pedidos set estado_operativo='LISTO_PARA_ENTREGA',subestado_operativo='PICKING_COMPLETO',updated_at=now(),version=version+1 where id=p_pedido_id;
    insert into pedido_historial_estado(pedido_id,tipo_estado,estado_anterior,estado_nuevo,observacion,usuario_id) values(p_pedido_id,'OPERATIVO','POR_COMPRAR','LISTO_PARA_ENTREGA','Picking completo y stock reservado',auth.uid());
    perform registrar_evento('PEDIDO_LISTO','PEDIDO',p_pedido_id,'Picking completado; pedido listo para entregar',0,'{}');
  end if;
  return jsonb_build_object('success',true,'pedido_id',p_pedido_id,'listo',p_marcar_listo);
end $$;

create or replace function public.bulk_update_orders(p_pedido_ids uuid[],p_accion text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare pid uuid; procesados uuid[]:='{}'; rechazados jsonb:='[]'; estado_actual estado_pedido; entrega_actual estado_entrega; almacen uuid;
begin
  if not public.es_rol(array['ADMINISTRADOR','ALMACENERO','REPARTIDOR']) then raise exception 'Sin permiso para acciones masivas'; end if;
  select id into almacen from almacenes where codigo='PRINCIPAL' limit 1;
  foreach pid in array p_pedido_ids loop
    begin
      select estado_operativo,estado_entrega into estado_actual,entrega_actual from pedidos where id=pid for update;
      if not found then raise exception 'Pedido no encontrado'; end if;
      if upper(p_accion)='LISTO_PARA_ENTREGA' then
        if estado_actual<>'POR_COMPRAR' then raise exception 'Transición incompatible'; end if;
        perform public.guardar_preparacion_pedido(pid,coalesce(p_payload->'lineas','[]'::jsonb),true,almacen);
      elsif upper(p_accion)='EN_RUTA' then
        if estado_actual<>'LISTO_PARA_ENTREGA' or entrega_actual not in ('PENDIENTE','REPROGRAMADO') then raise exception 'Solo pedidos listos pueden salir a ruta'; end if;
        update reservas_stock set estado='EN_RUTA',updated_at=now() where pedido_id=pid and estado='RESERVADA';
        update stock_actual s set stock_reservado=s.stock_reservado-r.cantidad,stock_en_ruta=s.stock_en_ruta+r.cantidad,updated_at=now()
          from (select producto_id,almacen_id,sum(cantidad) cantidad from reservas_stock where pedido_id=pid and estado='EN_RUTA' group by producto_id,almacen_id) r
          where s.producto_id=r.producto_id and s.almacen_id=r.almacen_id;
        update pedidos set estado_entrega='EN_RUTA',subestado_operativo='EN_RUTA',updated_at=now(),version=version+1 where id=pid;
        insert into pedido_historial_estado(pedido_id,tipo_estado,estado_anterior,estado_nuevo,usuario_id) values(pid,'ENTREGA',entrega_actual::text,'EN_RUTA',auth.uid());
        perform registrar_evento('PEDIDO_EN_RUTA','PEDIDO',pid,'Pedido enviado a ruta',0,p_payload);
      else raise exception 'Acción masiva no soportada'; end if;
      procesados:=array_append(procesados,pid);
    exception when others then rechazados:=rechazados||jsonb_build_array(jsonb_build_object('pedido_id',pid,'error',sqlerrm)); end;
  end loop;
  return jsonb_build_object('procesados',procesados,'rechazados',rechazados,'errores',jsonb_array_length(rechazados));
end $$;

grant execute on function public.obtener_consolidado_compra(date,date,uuid[]),public.bulk_update_orders(uuid[],text,jsonb) to authenticated;

create or replace function public.procesar_entrega_cobro(p_pedido_id uuid,p_entrega jsonb,p_pago jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare delivery_result jsonb; payment_result jsonb:='{}'; payment_total numeric:=0; order_total numeric; delivery_state text; paid_total numeric;
begin
  if not public.es_rol(array['ADMINISTRADOR','REPARTIDOR','FINANZAS']) then raise exception 'Sin permiso para procesar entrega y cobro'; end if;
  if exists(select 1 from entregas where idempotency_key=p_idempotency_key||':ENTREGA') then return jsonb_build_object('success',true,'duplicate',true,'pedido_id',p_pedido_id); end if;
  delivery_state:=p_entrega->>'estado';
  delivery_result:=public.registrar_entrega_pedido(p_pedido_id,p_entrega||jsonb_build_object('idempotency_key',p_idempotency_key||':ENTREGA'));
  select coalesce(sum((value->>'monto')::numeric),0) into payment_total from jsonb_array_elements(coalesce(p_pago->'medios','[]'));
  if payment_total>0 then
    payment_result:=public.registrar_pago_pedido(p_pedido_id,p_idempotency_key||':PAGO',p_pago->'medios');
    insert into movimientos_financieros(fecha,tipo,categoria,concepto,monto,referencia_tipo,referencia_id,usuario_id)
    select current_date,'INGRESO','INGRESO POR COBRO','Cobro real de pedido '||codigo_pedido,payment_total,'PEDIDO',id,auth.uid() from pedidos where id=p_pedido_id
    and not exists(select 1 from movimientos_financieros where referencia_tipo='PEDIDO' and referencia_id=p_pedido_id and concepto like 'Cobro real%');
  end if;
  select p.total,coalesce(sum(pg.monto) filter(where pg.estado='APLICADO'),0) into order_total,paid_total from pedidos p left join pagos pg on pg.pedido_id=p.id where p.id=p_pedido_id group by p.total;
  if delivery_state='ENTREGA_COMPLETA' then
    update pedidos set estado_operativo=case when paid_total>=order_total-.01 then 'ENTREGADO'::estado_pedido else 'OBSERVADO'::estado_pedido end,
      subestado_operativo=case when paid_total>=order_total-.01 then 'ENTREGADO_Y_COBRADO' else 'ENTREGADO_SIN_COBRAR' end,
      estado_cobranza=case when paid_total>=order_total-.01 then 'COBRADO'::estado_cobranza else 'PENDIENTE_DE_COBRO'::estado_cobranza end,
      fecha_vencimiento_cobro=case when paid_total>=order_total-.01 then null else current_date+3 end,updated_at=now() where id=p_pedido_id;
  elsif delivery_state='RECHAZADO' then update pedidos set subestado_operativo='RECHAZADO',motivo_incidencia=coalesce(p_entrega->>'observacion','Sin motivo'),updated_at=now() where id=p_pedido_id;
  elsif delivery_state='REPROGRAMADO' then update pedidos set subestado_operativo='REPROGRAMADO',motivo_incidencia=coalesce(p_entrega->>'observacion',''),fecha_reprogramada=nullif(p_entrega->>'fecha_reprogramada','')::date,updated_at=now() where id=p_pedido_id;
  end if;
  perform registrar_evento(case when delivery_state='ENTREGA_COMPLETA' and paid_total>=order_total-.01 then 'ENTREGADO_Y_COBRADO' when delivery_state='ENTREGA_COMPLETA' then 'ENTREGADO_SIN_COBRAR' else delivery_state end,'PEDIDO',p_pedido_id,'Resultado de entrega: '||delivery_state,payment_total,jsonb_build_object('idempotency_key',p_idempotency_key));
  return jsonb_build_object('success',true,'delivery',delivery_result,'payment',payment_result,'pedido_id',p_pedido_id,'duplicate',false);
end $$;

grant execute on function public.procesar_entrega_cobro(uuid,jsonb,jsonb,text) to authenticated;
