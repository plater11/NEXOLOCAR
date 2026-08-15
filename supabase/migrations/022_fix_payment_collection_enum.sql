-- Keep delivery and payment atomic when estado_cobranza is a PostgreSQL enum.
create or replace function public.registrar_pago_pedido(
  p_pedido_id uuid,
  p_idempotency_key text,
  p_detalle jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_total numeric;
  v_pagado numeric;
  v_monto numeric;
  v_pago uuid;
  v_cliente uuid;
begin
  if not public.es_rol(array['ADMINISTRADOR','REPARTIDOR','FINANZAS']) then
    raise exception 'Sin permiso';
  end if;

  select id,monto into v_pago,v_monto
  from pagos
  where idempotency_key=p_idempotency_key;

  if found then
    return jsonb_build_object('success',true,'pago_id',v_pago,'monto',v_monto,'duplicate',true);
  end if;

  select total,cliente_id into v_total,v_cliente
  from pedidos
  where id=p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  select coalesce(sum((x->>'monto')::numeric),0)
  into v_monto
  from jsonb_array_elements(p_detalle) x;

  select coalesce(sum(monto),0)
  into v_pagado
  from pagos
  where pedido_id=p_pedido_id and estado='APLICADO';

  if v_monto<=0 or v_pagado+v_monto>v_total+.01 then
    raise exception 'Monto de pago inválido';
  end if;

  insert into pagos(pedido_id,cliente_id,monto,usuario_id,idempotency_key)
  values(p_pedido_id,v_cliente,v_monto,auth.uid(),p_idempotency_key)
  returning id into v_pago;

  insert into pago_detalle(pago_id,medio,monto,referencia)
  select v_pago,x->>'medio',(x->>'monto')::numeric,x->>'referencia'
  from jsonb_array_elements(p_detalle) x
  on conflict do nothing;

  update pedidos
  set estado_cobranza=(case
        when v_pagado+v_monto>=v_total-.01 then 'COBRADO'
        else 'PENDIENTE_DE_COBRO'
      end)::public.estado_cobranza,
      version=version+1,
      updated_at=now()
  where id=p_pedido_id;

  perform registrar_evento(
    'PAGO_REGISTRADO','PEDIDO',p_pedido_id,'Pago registrado',v_monto
  );

  return jsonb_build_object(
    'success',true,'pago_id',v_pago,'monto',v_monto,'duplicate',false
  );
end
$$;

grant execute on function public.registrar_pago_pedido(uuid,text,jsonb) to authenticated;
