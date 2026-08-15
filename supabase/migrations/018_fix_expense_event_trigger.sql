-- Fix enum coercion when the expense event trigger handles an update.
create or replace function public.emitir_evento_erp_por_cambio() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_data jsonb;
  v_type text;
  v_entity text := upper(tg_table_name);
  v_entity_id uuid;
begin
  v_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_entity_id := nullif(v_data->>'id', '')::uuid;
  v_type := case tg_table_name
    when 'pagos' then 'PAYMENT_REGISTERED'
    when 'gastos' then case when tg_op = 'INSERT' then 'EXPENSE_CREATED' else 'EXPENSE_' || coalesce(new.estado::text, 'UPDATED') end
    when 'rendiciones' then 'RENDITION_CLOSED'
    when 'movimientos_inventario' then 'STOCK_ADJUSTED'
    else upper(tg_table_name) || '_UPDATED'
  end;
  insert into public.eventos(tipo, entidad, entidad_id, descripcion, importe, usuario_id, metadata)
  values(v_type, v_entity, v_entity_id, v_type, coalesce(nullif(v_data->>'monto', '')::numeric, 0), auth.uid(), jsonb_build_object('operation', tg_op, 'source', tg_table_name));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
