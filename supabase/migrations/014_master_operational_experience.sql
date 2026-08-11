alter table public.eventos add column if not exists cliente_id uuid references public.clientes(id);
alter table public.eventos add column if not exists comentario text;
create index if not exists eventos_created_at_idx on public.eventos(created_at desc);
create index if not exists eventos_cliente_created_idx on public.eventos(cliente_id,created_at desc);

create or replace function public.registrar_evento(
  p_tipo text,
  p_entidad text,
  p_entidad_id uuid,
  p_descripcion text,
  p_importe numeric default 0,
  p_metadata jsonb default '{}'
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_cliente_id uuid;
begin
  if p_entidad='PEDIDO' then
    select cliente_id into v_cliente_id from pedidos where id=p_entidad_id;
  end if;
  insert into eventos(tipo,entidad,entidad_id,cliente_id,descripcion,comentario,importe,usuario_id,metadata)
  values(p_tipo,p_entidad,p_entidad_id,v_cliente_id,p_descripcion,p_descripcion,p_importe,auth.uid(),p_metadata)
  returning id into v_id;
  return v_id;
end $$;

update public.eventos e
set cliente_id=p.cliente_id
from public.pedidos p
where e.entidad='PEDIDO' and e.entidad_id=p.id and e.cliente_id is null;

-- Picking is entered and validated in the presentation sold to the customer.
-- Base units remain exclusive to stock reservation and inventory movements.
create or replace function public.guardar_preparacion_pedido(
  p_pedido_id uuid,
  p_lineas jsonb,
  p_marcar_listo boolean,
  p_almacen_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; requerida_presentacion numeric; preparada_presentacion numeric; calculado text;
begin
  if not public.es_rol(array['ADMINISTRADOR','ALMACENERO']) then raise exception 'Sin permiso para preparar pedidos'; end if;
  perform 1 from pedidos where id=p_pedido_id and estado_operativo='POR_COMPRAR' for update;
  if not found then raise exception 'El pedido no está disponible para preparación'; end if;

  for item in select * from jsonb_array_elements(p_lineas) loop
    select cantidad_presentacion into requerida_presentacion
    from pedido_detalle
    where pedido_id=p_pedido_id and producto_id=(item->>'producto_id')::uuid;
    if requerida_presentacion is null then raise exception 'Producto ajeno al pedido'; end if;

    preparada_presentacion:=greatest(least(coalesce((item->>'cantidad_preparada')::numeric,0),requerida_presentacion),0);
    calculado:=case when preparada_presentacion=0 then 'PENDIENTE' when preparada_presentacion>=requerida_presentacion then 'PREPARADO' else 'FALTANTE' end;
    insert into preparacion_pedido(pedido_id,producto_id,cantidad_preparada,estado,cantidad_faltante,motivo,observacion,updated_by)
    values(p_pedido_id,(item->>'producto_id')::uuid,preparada_presentacion,calculado,greatest(requerida_presentacion-preparada_presentacion,0),coalesce(item->>'motivo',''),coalesce(item->>'observacion',''),auth.uid())
    on conflict(pedido_id,producto_id) do update set cantidad_preparada=excluded.cantidad_preparada,estado=excluded.estado,cantidad_faltante=excluded.cantidad_faltante,motivo=excluded.motivo,observacion=excluded.observacion,updated_by=auth.uid(),updated_at=now();
  end loop;

  if p_marcar_listo then
    if exists(
      select 1 from pedido_detalle d
      left join preparacion_pedido pp on pp.pedido_id=d.pedido_id and pp.producto_id=d.producto_id
      where d.pedido_id=p_pedido_id and coalesce(pp.cantidad_preparada,0)<d.cantidad_presentacion
    ) then raise exception 'No se puede completar el pedido: faltan materiales por preparar'; end if;
    perform public.reservar_stock_pedido(p_pedido_id,p_almacen_id);
    update pedidos set estado_operativo='LISTO_PARA_ENTREGA',subestado_operativo='PICKING_COMPLETO',updated_at=now(),version=version+1 where id=p_pedido_id;
    insert into pedido_historial_estado(pedido_id,tipo_estado,estado_anterior,estado_nuevo,observacion,usuario_id)
    values(p_pedido_id,'OPERATIVO','POR_COMPRAR','LISTO_PARA_ENTREGA','Picking completo y stock reservado',auth.uid());
    perform registrar_evento('LISTO_ENTREGA','PEDIDO',p_pedido_id,'Picking completado; pedido listo para entregar',0,'{}');
  end if;
  return jsonb_build_object('success',true,'pedido_id',p_pedido_id,'listo',p_marcar_listo);
end $$;

grant execute on function public.guardar_preparacion_pedido(uuid,jsonb,boolean,uuid) to authenticated;
