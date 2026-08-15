-- Global ERP synchronization and retry safety.
set timezone = 'America/Lima';
alter database postgres set timezone to 'America/Lima';

create unique index if not exists gastos_idempotency_key_uidx
  on public.gastos (idempotency_key) where idempotency_key is not null;
create unique index if not exists entregas_idempotency_key_uidx
  on public.entregas (idempotency_key) where idempotency_key is not null;
create unique index if not exists pagos_idempotency_key_uidx
  on public.pagos (idempotency_key) where idempotency_key is not null;
create unique index if not exists pago_detalle_pago_medio_uidx
  on public.pago_detalle (pago_id, medio);
create index if not exists entregas_fecha_estado_sync_idx on public.entregas (fecha_entrega desc, estado);
create index if not exists pedidos_operativo_cobranza_sync_idx on public.pedidos (estado_operativo, estado_cobranza, updated_at desc);
create index if not exists eventos_tipo_fecha_sync_idx on public.eventos (tipo, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array['pedidos','entregas','pagos','gastos','stock_actual','movimientos_inventario','jornadas','rendiciones','eventos'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

-- Backend clients can subscribe to one canonical stream instead of guessing which
-- underlying table changed. Existing transactional functions still write their
-- richer domain events explicitly.
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
    when 'gastos' then case when tg_op = 'INSERT' then 'EXPENSE_CREATED' else 'EXPENSE_' || coalesce(v_data->>'estado', 'UPDATED') end
    when 'rendiciones' then 'RENDITION_CLOSED'
    when 'movimientos_inventario' then 'STOCK_ADJUSTED'
    else upper(tg_table_name) || '_UPDATED'
  end;
  insert into public.eventos(tipo, entidad, entidad_id, descripcion, importe, usuario_id, metadata)
  values(v_type, v_entity, v_entity_id, v_type, coalesce(nullif(v_data->>'monto', '')::numeric, 0), auth.uid(), jsonb_build_object('operation', tg_op, 'source', tg_table_name));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists erp_evento_pago on public.pagos;
create trigger erp_evento_pago after insert on public.pagos
for each row execute function public.emitir_evento_erp_por_cambio();
drop trigger if exists erp_evento_gasto on public.gastos;
create trigger erp_evento_gasto after insert or update of estado on public.gastos
for each row execute function public.emitir_evento_erp_por_cambio();
drop trigger if exists erp_evento_rendicion on public.rendiciones;
create trigger erp_evento_rendicion after insert or update of estado on public.rendiciones
for each row execute function public.emitir_evento_erp_por_cambio();
drop trigger if exists erp_evento_inventario on public.movimientos_inventario;
create trigger erp_evento_inventario after insert on public.movimientos_inventario
for each row execute function public.emitir_evento_erp_por_cambio();
