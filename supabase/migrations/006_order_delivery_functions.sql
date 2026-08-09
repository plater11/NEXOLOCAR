create or replace function public.crear_pedido(p_codigo text,p_cliente_id uuid,p_items jsonb,p_descuento numeric,p_observaciones text,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_subtotal numeric;begin
  if not public.es_rol(array['ADMINISTRADOR','PREVENTISTA']) then raise exception 'Sin permiso para crear pedidos'; end if;
  select coalesce(sum((x->>'cantidad_presentacion')::numeric*(x->>'precio_aplicado')::numeric),0) into v_subtotal from jsonb_array_elements(p_items)x;
  insert into pedidos(codigo_pedido,cliente_id,subtotal,descuento,total,observaciones,usuario_creacion,idempotency_key) values(p_codigo,p_cliente_id,v_subtotal,coalesce(p_descuento,0),greatest(v_subtotal-coalesce(p_descuento,0),0),p_observaciones,auth.uid(),p_idempotency_key) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into v_id;
  insert into pedido_detalle(pedido_id,producto_id,presentacion_id,cantidad_presentacion,fraccion,factor_presentacion,cantidad_unidades_base,precio_presentacion,precio_aplicado,subtotal)
  select v_id,(x->>'producto_id')::uuid,nullif(x->>'presentacion_id','')::uuid,(x->>'cantidad_presentacion')::numeric,coalesce((x->>'fraccion')::numeric,0),(x->>'factor_presentacion')::numeric,(x->>'cantidad_unidades_base')::numeric,(x->>'precio_presentacion')::numeric,(x->>'precio_aplicado')::numeric,((x->>'cantidad_presentacion')::numeric*(x->>'precio_aplicado')::numeric) from jsonb_array_elements(p_items)x on conflict(pedido_id,producto_id,presentacion_id) do nothing;
  insert into pedido_historial_estado(pedido_id,tipo_estado,estado_nuevo,usuario_id) values(v_id,'OPERATIVO','POR_COMPRAR',auth.uid()); perform registrar_evento('NUEVO_PEDIDO','PEDIDO',v_id,'Nuevo pedido',v_subtotal); return jsonb_build_object('success',true,'pedido_id',v_id,'total',greatest(v_subtotal-coalesce(p_descuento,0),0));
end $$;

create or replace function public.registrar_entrega_pedido(p_pedido_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_entrega uuid;v_estado public.estado_entrega;v_item record;v_stock record;v_key text;begin
  if not public.es_rol(array['ADMINISTRADOR','REPARTIDOR']) then raise exception 'Sin permiso para registrar entregas'; end if;
  v_estado=(p_payload->>'estado')::public.estado_entrega; perform 1 from pedidos where id=p_pedido_id for update; if not found then raise exception 'Pedido no encontrado'; end if;
  insert into entregas(pedido_id,jornada_id,estado,fecha_entrega,repartidor_id,observacion,idempotency_key) values(p_pedido_id,nullif(p_payload->>'jornada_id','')::uuid,v_estado,coalesce((p_payload->>'fecha_entrega')::timestamptz,now()),auth.uid(),p_payload->>'observacion',p_payload->>'idempotency_key') on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into v_entrega;
  if v_estado in ('ENTREGA_COMPLETA','ENTREGA_PARCIAL') then
    for v_item in select (x->>'producto_id')::uuid producto_id,(x->>'cantidad_pedida')::numeric pedida,(x->>'cantidad_entregada')::numeric entregada from jsonb_array_elements(p_payload->'items')x loop
      insert into entrega_detalle(entrega_id,producto_id,cantidad_pedida,cantidad_entregada) values(v_entrega,v_item.producto_id,v_item.pedida,v_item.entregada);
      select * into v_stock from reservas_stock where pedido_id=p_pedido_id and producto_id=v_item.producto_id and estado='EN_RUTA' for update; if not found then raise exception 'Reserva en ruta no encontrada'; end if;
      update stock_actual set stock_fisico=stock_fisico-v_item.entregada,stock_en_ruta=stock_en_ruta-v_stock.cantidad,stock_reservado=stock_reservado+greatest(v_stock.cantidad-v_item.entregada,0),updated_at=now() where producto_id=v_item.producto_id and almacen_id=v_stock.almacen_id;
      v_key='ENTREGA:'||v_entrega||':'||v_item.producto_id; insert into movimientos_inventario(producto_id,almacen_id,tipo_movimiento,cantidad,referencia_tipo,referencia_id,saldo_anterior,saldo_nuevo,usuario_id,idempotency_key,observacion) select v_item.producto_id,v_stock.almacen_id,'SALIDA_ENTREGA',v_item.entregada,'ENTREGA',v_entrega,stock_fisico+v_item.entregada,stock_fisico,auth.uid(),v_key,'Salida definitiva por entrega' from stock_actual where producto_id=v_item.producto_id and almacen_id=v_stock.almacen_id;
      update reservas_stock set cantidad=greatest(cantidad-v_item.entregada,0),estado=case when cantidad-v_item.entregada>0 then 'RESERVADA' else 'CONSUMIDA' end,updated_at=now() where id=v_stock.id;
    end loop;
    update pedidos set estado_operativo=case when v_estado='ENTREGA_COMPLETA' then 'ENTREGADO' else 'OBSERVADO' end,estado_entrega=v_estado,estado_cobranza='PENDIENTE_DE_COBRO',version=version+1,updated_at=now() where id=p_pedido_id;
  elsif v_estado in ('RECHAZADO','DIRECCION_INCORRECTA') then
    update stock_actual s set stock_en_ruta=s.stock_en_ruta-r.cantidad,updated_at=now() from reservas_stock r where r.pedido_id=p_pedido_id and r.estado='EN_RUTA' and s.producto_id=r.producto_id and s.almacen_id=r.almacen_id; update reservas_stock set estado='LIBERADA',updated_at=now() where pedido_id=p_pedido_id and estado='EN_RUTA'; update pedidos set estado_operativo='OBSERVADO',estado_entrega=v_estado,version=version+1,updated_at=now() where id=p_pedido_id;
  else update pedidos set estado_operativo='OBSERVADO',estado_entrega=v_estado,version=version+1,updated_at=now() where id=p_pedido_id; end if;
  perform registrar_evento('ENTREGA_REALIZADA','PEDIDO',p_pedido_id,'Resultado: '||v_estado); return jsonb_build_object('success',true,'entrega_id',v_entrega,'estado',v_estado);
end $$;

grant execute on function public.crear_pedido(text,uuid,jsonb,numeric,text,text),public.registrar_entrega_pedido(uuid,jsonb) to authenticated;

create policy "authenticated read categories" on public.categorias for select to authenticated using(true);
create policy "authenticated read brands" on public.marcas for select to authenticated using(true);
create policy "authenticated read warehouses" on public.almacenes for select to authenticated using(true);
