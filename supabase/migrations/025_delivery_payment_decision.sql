create or replace function public.procesar_entrega_cobro(p_pedido_id uuid,p_entrega jsonb,p_pago jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare delivery_result jsonb; payment_result jsonb:='{}'; payment_total numeric:=0; order_total numeric; delivery_state text; paid_total numeric; follow_up date;
begin
  if not public.es_rol(array['ADMINISTRADOR','REPARTIDOR','FINANZAS']) then raise exception 'Sin permiso para procesar entrega y cobro'; end if;
  if exists(select 1 from entregas where idempotency_key=p_idempotency_key||':ENTREGA') then return jsonb_build_object('success',true,'duplicate',true,'pedido_id',p_pedido_id); end if;
  delivery_state:=p_entrega->>'estado';
  follow_up:=coalesce(nullif(p_entrega->>'fecha_promesa','')::date,current_date+2);
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
      fecha_vencimiento_cobro=case when paid_total>=order_total-.01 then null else follow_up end,
      motivo_incidencia=case when paid_total>=order_total-.01 then null else coalesce(nullif(p_entrega->>'observacion',''),'Faltó el pago') end,
      updated_at=now() where id=p_pedido_id;
  else
    update pedidos set estado_operativo='OBSERVADO'::estado_pedido,subestado_operativo=delivery_state,
      motivo_incidencia=coalesce(nullif(p_entrega->>'observacion',''),'Incidencia de entrega'),
      fecha_reprogramada=follow_up,updated_at=now() where id=p_pedido_id;
  end if;
  perform registrar_evento(case when delivery_state='ENTREGA_COMPLETA' and paid_total>=order_total-.01 then 'ENTREGADO_Y_COBRADO' when delivery_state='ENTREGA_COMPLETA' then 'ENTREGADO_SIN_COBRAR' else delivery_state end,'PEDIDO',p_pedido_id,'Resultado de entrega: '||delivery_state,payment_total,jsonb_build_object('idempotency_key',p_idempotency_key,'fecha_seguimiento',follow_up));
  return jsonb_build_object('success',true,'delivery',delivery_result,'payment',payment_result,'pedido_id',p_pedido_id,'duplicate',false);
end $$;

grant execute on function public.procesar_entrega_cobro(uuid,jsonb,jsonb,text) to authenticated;
