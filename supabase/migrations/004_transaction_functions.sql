create or replace function public.registrar_evento(p_tipo text,p_entidad text,p_entidad_id uuid,p_descripcion text,p_importe numeric default 0,p_metadata jsonb default '{}') returns uuid language plpgsql security definer set search_path=public as $$ declare v_id uuid; begin insert into eventos(tipo,entidad,entidad_id,descripcion,importe,usuario_id,metadata) values(p_tipo,p_entidad,p_entidad_id,p_descripcion,p_importe,auth.uid(),p_metadata) returning id into v_id; return v_id; end $$;

create or replace function public.reservar_stock_pedido(p_pedido_id uuid,p_almacen_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r record; v_key text; begin
  if not public.es_rol(array['ADMINISTRADOR','ALMACENERO']) then raise exception 'Sin permiso para reservar stock'; end if;
  perform 1 from pedidos where id=p_pedido_id for update; if not found then raise exception 'Pedido no encontrado'; end if;
  for r in select producto_id,sum(cantidad_unidades_base) cantidad from pedido_detalle where pedido_id=p_pedido_id group by producto_id loop
    perform 1 from stock_actual where producto_id=r.producto_id and almacen_id=p_almacen_id for update;
    if not found or (select stock_disponible from stock_actual where producto_id=r.producto_id and almacen_id=p_almacen_id)<r.cantidad then raise exception 'Stock insuficiente para %',r.producto_id; end if;
    v_key='RESERVA:'||p_pedido_id||':'||r.producto_id;
    insert into reservas_stock(pedido_id,producto_id,almacen_id,cantidad,estado,idempotency_key) values(p_pedido_id,r.producto_id,p_almacen_id,r.cantidad,'RESERVADA',v_key) on conflict(idempotency_key) do nothing;
    if found then update stock_actual set stock_reservado=stock_reservado+r.cantidad,updated_at=now() where producto_id=r.producto_id and almacen_id=p_almacen_id; insert into movimientos_inventario(producto_id,almacen_id,tipo_movimiento,cantidad,referencia_tipo,referencia_id,saldo_anterior,saldo_nuevo,usuario_id,idempotency_key,observacion) select r.producto_id,p_almacen_id,'RESERVA',r.cantidad,'PEDIDO',p_pedido_id,stock_fisico,stock_fisico,auth.uid(),v_key,'Reserva transaccional' from stock_actual where producto_id=r.producto_id and almacen_id=p_almacen_id; end if;
  end loop;
  update pedidos set estado_operativo='LISTO_PARA_ENTREGA',version=version+1,updated_at=now() where id=p_pedido_id;
  insert into pedido_historial_estado(pedido_id,tipo_estado,estado_anterior,estado_nuevo,usuario_id) values(p_pedido_id,'OPERATIVO','POR_COMPRAR','LISTO_PARA_ENTREGA',auth.uid());
  perform registrar_evento('LISTO_ENTREGA','PEDIDO',p_pedido_id,'Pedido listo y stock reservado'); return jsonb_build_object('success',true,'pedido_id',p_pedido_id);
end $$;

create or replace function public.asignar_pedido_jornada(p_pedido_id uuid,p_jornada_id uuid,p_orden integer default 0) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.es_rol(array['ADMINISTRADOR','ALMACENERO','REPARTIDOR']) then raise exception 'Sin permiso'; end if;
  perform 1 from pedidos where id=p_pedido_id for update; insert into jornada_pedidos(jornada_id,pedido_id,orden_visita) values(p_jornada_id,p_pedido_id,p_orden) on conflict(jornada_id,pedido_id) do update set orden_visita=excluded.orden_visita;
  update stock_actual s set stock_reservado=s.stock_reservado-r.cantidad,stock_en_ruta=s.stock_en_ruta+r.cantidad,updated_at=now() from reservas_stock r where r.pedido_id=p_pedido_id and r.estado='RESERVADA' and s.producto_id=r.producto_id and s.almacen_id=r.almacen_id;
  update reservas_stock set estado='EN_RUTA',updated_at=now() where pedido_id=p_pedido_id and estado='RESERVADA'; update pedidos set estado_entrega='EN_RUTA',version=version+1,updated_at=now() where id=p_pedido_id; perform registrar_evento('ASIGNADO_JORNADA','PEDIDO',p_pedido_id,'Pedido asignado a jornada'); return jsonb_build_object('success',true);
end $$;

create or replace function public.registrar_pago_pedido(p_pedido_id uuid,p_idempotency_key text,p_detalle jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_total numeric;v_pagado numeric;v_monto numeric;v_pago uuid;v_cliente uuid;begin
  if not public.es_rol(array['ADMINISTRADOR','REPARTIDOR','FINANZAS']) then raise exception 'Sin permiso'; end if;
  select total,cliente_id into v_total,v_cliente from pedidos where id=p_pedido_id for update; if not found then raise exception 'Pedido no encontrado'; end if;
  select coalesce(sum((x->>'monto')::numeric),0) into v_monto from jsonb_array_elements(p_detalle) x; select coalesce(sum(monto),0) into v_pagado from pagos where pedido_id=p_pedido_id and estado='APLICADO'; if v_monto<=0 or v_pagado+v_monto>v_total+.01 then raise exception 'Monto de pago inválido'; end if;
  insert into pagos(pedido_id,cliente_id,monto,usuario_id,idempotency_key) values(p_pedido_id,v_cliente,v_monto,auth.uid(),p_idempotency_key) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into v_pago;
  insert into pago_detalle(pago_id,medio,monto,referencia) select v_pago,x->>'medio',(x->>'monto')::numeric,x->>'referencia' from jsonb_array_elements(p_detalle)x on conflict do nothing;
  update pedidos set estado_cobranza=case when v_pagado+v_monto>=v_total-.01 then 'COBRADO' else 'PENDIENTE_DE_COBRO' end,version=version+1,updated_at=now() where id=p_pedido_id; perform registrar_evento('PAGO_REGISTRADO','PEDIDO',p_pedido_id,'Pago registrado',v_monto); return jsonb_build_object('success',true,'pago_id',v_pago,'monto',v_monto);
end $$;

create or replace function public.actualizar_cobranza_vencida() returns integer language plpgsql security definer set search_path=public as $$ declare n integer; begin update pedidos p set estado_cobranza='COBRANZA_URGENTE',updated_at=now() from v_saldos_pedido s where s.id=p.id and s.saldo>0 and s.fecha_vencimiento<current_date and p.estado_operativo='ENTREGADO' and p.estado_cobranza<>'COBRADO'; get diagnostics n=row_count; return n; end $$;

grant execute on function public.reservar_stock_pedido(uuid,uuid),public.asignar_pedido_jornada(uuid,uuid,integer),public.registrar_pago_pedido(uuid,text,jsonb) to authenticated;
