create or replace function public.registrar_movimiento_inventario(
  p_producto_id uuid, p_almacen_id uuid, p_tipo text, p_cantidad numeric,
  p_observacion text default '', p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actual numeric; v_nuevo numeric; v_tipo text;
  v_key text := coalesce(nullif(p_idempotency_key, ''), gen_random_uuid()::text);
begin
  if p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  if exists(select 1 from movimientos_inventario where idempotency_key=v_key) then return jsonb_build_object('ok',true,'duplicado',true); end if;
  v_tipo := case upper(p_tipo) when 'INGRESO' then 'INGRESO_COMPRA' when 'SALIDA' then 'SALIDA_ENTREGA' else upper(p_tipo) end;
  insert into stock_actual(producto_id,almacen_id,stock_fisico) values(p_producto_id,p_almacen_id,0) on conflict do nothing;
  select stock_fisico into v_actual from stock_actual where producto_id=p_producto_id and almacen_id=p_almacen_id for update;
  v_nuevo := v_actual + case when v_tipo in ('INGRESO_COMPRA','AJUSTE_POSITIVO','DEVOLUCION') then p_cantidad else -p_cantidad end;
  if v_nuevo < 0 then raise exception 'Stock insuficiente'; end if;
  update stock_actual set stock_fisico=v_nuevo,updated_at=now() where producto_id=p_producto_id and almacen_id=p_almacen_id;
  insert into movimientos_inventario(producto_id,almacen_id,tipo_movimiento,cantidad,saldo_anterior,saldo_nuevo,usuario_id,idempotency_key,observacion)
  values(p_producto_id,p_almacen_id,v_tipo,p_cantidad,v_actual,v_nuevo,auth.uid(),v_key,p_observacion);
  return jsonb_build_object('ok',true,'saldoAnterior',v_actual,'saldoNuevo',v_nuevo);
end $$;
grant execute on function public.registrar_movimiento_inventario(uuid,uuid,text,numeric,text,text) to authenticated;
