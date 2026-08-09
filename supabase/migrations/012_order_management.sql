alter table public.pedidos add column if not exists codigo_impresion text unique, add column if not exists fecha_impresion timestamptz;

create or replace function public.corregir_pedido(p_pedido_id uuid,p_cliente_id uuid,p_items jsonb,p_observaciones text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_item jsonb; v_total numeric:=0; v_estado estado_pedido;
begin
  select estado_operativo into v_estado from pedidos where id=p_pedido_id for update;
  if v_estado is null then raise exception 'Pedido no encontrado'; end if;
  if v_estado not in ('POR_COMPRAR','OBSERVADO') then raise exception 'Solo se editan pedidos pendientes u observados'; end if;
  if exists(select 1 from pagos where pedido_id=p_pedido_id and estado='APLICADO') then raise exception 'No se puede editar un pedido con cobros'; end if;
  delete from reservas_stock where pedido_id=p_pedido_id and estado='RESERVADA';
  delete from preparacion_pedido where pedido_id=p_pedido_id;
  delete from pedido_detalle where pedido_id=p_pedido_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into pedido_detalle(pedido_id,producto_id,presentacion_id,cantidad_presentacion,fraccion,factor_presentacion,cantidad_unidades_base,precio_presentacion,precio_aplicado,subtotal)
    values(p_pedido_id,(v_item->>'producto_id')::uuid,nullif(v_item->>'presentacion_id','')::uuid,(v_item->>'cantidad')::numeric,0,coalesce((v_item->>'factor')::numeric,1),(v_item->>'cantidad_base')::numeric,(v_item->>'precio')::numeric,(v_item->>'precio')::numeric,(v_item->>'subtotal')::numeric);
    v_total:=v_total+(v_item->>'subtotal')::numeric;
  end loop;
  update pedidos set cliente_id=p_cliente_id,subtotal=v_total,total=v_total,observaciones=p_observaciones,version=version+1,updated_at=now() where id=p_pedido_id;
  insert into pedido_historial_estado(pedido_id,tipo_estado,estado_anterior,estado_nuevo,observacion,usuario_id) values(p_pedido_id,'EDICION',v_estado::text,v_estado::text,'Pedido editado',auth.uid());
  return jsonb_build_object('ok',true,'total',v_total);
end $$;
grant execute on function public.corregir_pedido(uuid,uuid,jsonb,text) to authenticated;
