create sequence if not exists public.lotes_stock_numero_seq;

create table if not exists public.lotes_stock (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  idempotency_key text not null unique,
  estado text not null default 'APLICADO' check (estado in ('APLICADO','REVERTIDO')),
  total_productos integer not null default 0,
  total_presentaciones numeric(16,4) not null default 0,
  valor_estimado numeric(16,2) not null default 0,
  usuario_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  revertido_at timestamptz,
  revertido_por uuid references auth.users(id),
  motivo_reversion text
);

create table if not exists public.lote_stock_detalle (
  id uuid primary key default gen_random_uuid(), lote_id uuid not null references public.lotes_stock(id),
  producto_id uuid not null references public.productos(id), presentacion_id uuid not null references public.presentaciones(id),
  cantidad_presentacion numeric(16,4) not null check (cantidad_presentacion > 0), factor numeric(16,4) not null check (factor > 0),
  cantidad_base numeric(16,4) not null check (cantidad_base > 0), stock_anterior_base numeric(16,4) not null,
  stock_nuevo_base numeric(16,4) not null, costo_anterior_base numeric(16,4) not null,
  costo_nuevo_presentacion numeric(16,4), observacion text,
  unique(lote_id, producto_id, presentacion_id)
);

alter table public.movimientos_inventario add column if not exists lote_id uuid references public.lotes_stock(id);
create index if not exists movimientos_inventario_lote_idx on public.movimientos_inventario(lote_id);
create index if not exists lotes_stock_created_idx on public.lotes_stock(created_at desc);
alter table public.lotes_stock enable row level security;
alter table public.lote_stock_detalle enable row level security;
create policy "inventory batches read" on public.lotes_stock for select to authenticated using (true);
create policy "inventory batch details read" on public.lote_stock_detalle for select to authenticated using (true);
revoke insert, update, delete on public.lotes_stock, public.lote_stock_detalle from authenticated;

create or replace function public.procesar_carga_masiva_stock(p_items jsonb,p_usuario_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lote_id uuid; v_codigo text; v_almacen_id uuid; v_item jsonb; v_producto public.productos%rowtype;
  v_presentacion public.presentaciones%rowtype; v_stock numeric; v_cantidad numeric; v_base numeric;
  v_costo_nuevo numeric; v_total numeric := 0; v_productos integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'El lote no contiene filas para importar.'; end if;
  if exists(select 1 from public.lotes_stock where idempotency_key=p_idempotency_key) then
    select id,codigo into v_lote_id,v_codigo from public.lotes_stock where idempotency_key=p_idempotency_key;
    return jsonb_build_object('ok',true,'duplicado',true,'loteId',v_lote_id,'codigoLote',v_codigo);
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) x group by x->>'productoId',x->>'presentacionId' having count(*)>1)
    then raise exception 'Existen productos o presentaciones duplicados en el archivo.'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) x where coalesce(nullif(x->>'nuevoCosto','')::numeric,0)>0
    group by x->>'productoId' having count(distinct nullif(x->>'nuevoCosto','')::numeric/nullif((x->>'factor')::numeric,0))>1)
    then raise exception 'Un producto tiene costos nuevos inconsistentes entre presentaciones.'; end if;
  select id into v_almacen_id from public.almacenes where codigo='PRINCIPAL' and activo=true limit 1;
  if v_almacen_id is null then raise exception 'No existe el almacén PRINCIPAL activo.'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_producto from public.productos where id=(v_item->>'productoId')::uuid and activo=true;
    if not found then raise exception 'Producto inválido en la fila %.',v_item->>'filaExcel'; end if;
    select * into v_presentacion from public.presentaciones where id=(v_item->>'presentacionId')::uuid and producto_id=v_producto.id and activo=true;
    if not found then raise exception 'Presentación inválida para %.',v_producto.codigo; end if;
    v_cantidad := (v_item->>'cantidad')::numeric;
    if v_cantidad<=0 then raise exception 'Cantidad inválida para %.',v_producto.codigo; end if;
    if not v_presentacion.permite_fraccionamiento and trunc(v_cantidad)<>v_cantidad then raise exception '% no admite cantidades fraccionadas en %.',v_producto.codigo,v_presentacion.nombre; end if;
    if (v_item->>'factor')::numeric<>v_presentacion.factor then raise exception 'El factor de % cambió. Descarga una plantilla nueva.',v_producto.codigo; end if;
    v_costo_nuevo:=nullif(v_item->>'nuevoCosto','')::numeric;
    if v_costo_nuevo is not null and v_costo_nuevo<=0 then raise exception 'Costo inválido para %.',v_producto.codigo; end if;
  end loop;

  v_codigo:='ING-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.lotes_stock_numero_seq')::text,4,'0');
  insert into public.lotes_stock(codigo,idempotency_key,usuario_id) values(v_codigo,p_idempotency_key,p_usuario_id) returning id into v_lote_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_producto from public.productos where id=(v_item->>'productoId')::uuid;
    select * into v_presentacion from public.presentaciones where id=(v_item->>'presentacionId')::uuid;
    v_cantidad:=(v_item->>'cantidad')::numeric; v_base:=v_cantidad*v_presentacion.factor; v_costo_nuevo:=nullif(v_item->>'nuevoCosto','')::numeric;
    insert into public.stock_actual(producto_id,almacen_id,stock_fisico) values(v_producto.id,v_almacen_id,0) on conflict do nothing;
    select stock_fisico into v_stock from public.stock_actual where producto_id=v_producto.id and almacen_id=v_almacen_id for update;
    update public.stock_actual set stock_fisico=v_stock+v_base,updated_at=now() where producto_id=v_producto.id and almacen_id=v_almacen_id;
    insert into public.lote_stock_detalle(lote_id,producto_id,presentacion_id,cantidad_presentacion,factor,cantidad_base,stock_anterior_base,stock_nuevo_base,costo_anterior_base,costo_nuevo_presentacion,observacion)
    values(v_lote_id,v_producto.id,v_presentacion.id,v_cantidad,v_presentacion.factor,v_base,v_stock,v_stock+v_base,v_producto.costo_actual,v_costo_nuevo,nullif(v_item->>'observacion',''));
    insert into public.movimientos_inventario(producto_id,almacen_id,tipo_movimiento,cantidad,referencia_tipo,referencia_id,saldo_anterior,saldo_nuevo,usuario_id,idempotency_key,observacion,lote_id)
    values(v_producto.id,v_almacen_id,'INGRESO_COMPRA',v_base,'LOTE_STOCK',v_lote_id,v_stock,v_stock+v_base,p_usuario_id,p_idempotency_key||':'||v_presentacion.id,coalesce(v_item->>'observacion','Carga masiva '||v_codigo),v_lote_id);
    if v_costo_nuevo is not null and v_costo_nuevo<>v_producto.costo_actual*v_presentacion.factor then
      update public.productos set costo_actual=v_costo_nuevo/v_presentacion.factor,updated_at=now() where id=v_producto.id;
      insert into public.auditoria(tabla,registro_id,accion,estado_anterior,estado_nuevo,usuario_id)
      values('productos',v_producto.id,'ACTUALIZAR_COSTO',jsonb_build_object('costo_actual',v_producto.costo_actual),jsonb_build_object('costo_actual',v_costo_nuevo/v_presentacion.factor,'lote',v_codigo),p_usuario_id);
    end if;
    v_total:=v_total+v_cantidad*coalesce(v_costo_nuevo,v_producto.costo_actual*v_presentacion.factor);
  end loop;
  select count(distinct producto_id) into v_productos from public.lote_stock_detalle where lote_id=v_lote_id;
  update public.lotes_stock set total_productos=v_productos,total_presentaciones=(select sum(cantidad_presentacion) from public.lote_stock_detalle where lote_id=v_lote_id),valor_estimado=round(v_total,2) where id=v_lote_id;
  insert into public.eventos(tipo,entidad,entidad_id,descripcion,importe,usuario_id,metadata)
  values('NUEVO_STOCK','LOTE_STOCK',v_lote_id,'Carga masiva de stock '||v_codigo,round(v_total,2),p_usuario_id,jsonb_build_object('codigoLote',v_codigo,'productos',v_productos));
  return jsonb_build_object('ok',true,'loteId',v_lote_id,'codigoLote',v_codigo,'productos',v_productos,'valorEstimado',round(v_total,2));
end $$;

create or replace function public.revertir_carga_masiva_stock(p_lote_id uuid,p_usuario_id uuid,p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lote public.lotes_stock%rowtype; v_det public.lote_stock_detalle%rowtype; v_almacen uuid; v_stock numeric;
begin
  if length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Indica un motivo de reversión válido.'; end if;
  select * into v_lote from public.lotes_stock where id=p_lote_id for update;
  if not found then raise exception 'Lote no encontrado.'; end if;
  if v_lote.estado='REVERTIDO' then raise exception 'El lote ya fue revertido.'; end if;
  select id into v_almacen from public.almacenes where codigo='PRINCIPAL' limit 1;
  for v_det in select * from public.lote_stock_detalle where lote_id=p_lote_id loop
    select stock_fisico into v_stock from public.stock_actual where producto_id=v_det.producto_id and almacen_id=v_almacen for update;
    if v_stock<v_det.cantidad_base then raise exception 'No hay stock suficiente para revertir el lote %.',v_lote.codigo; end if;
  end loop;
  for v_det in select * from public.lote_stock_detalle where lote_id=p_lote_id loop
    select stock_fisico into v_stock from public.stock_actual where producto_id=v_det.producto_id and almacen_id=v_almacen for update;
    update public.stock_actual set stock_fisico=v_stock-v_det.cantidad_base,updated_at=now() where producto_id=v_det.producto_id and almacen_id=v_almacen;
    insert into public.movimientos_inventario(producto_id,almacen_id,tipo_movimiento,cantidad,referencia_tipo,referencia_id,saldo_anterior,saldo_nuevo,usuario_id,idempotency_key,observacion,lote_id)
    values(v_det.producto_id,v_almacen,'AJUSTE_NEGATIVO',v_det.cantidad_base,'REVERSION_LOTE',p_lote_id,v_stock,v_stock-v_det.cantidad_base,p_usuario_id,'REV:'||p_lote_id||':'||v_det.presentacion_id,'Reversión: '||trim(p_motivo),p_lote_id);
  end loop;
  update public.lotes_stock set estado='REVERTIDO',revertido_at=now(),revertido_por=p_usuario_id,motivo_reversion=trim(p_motivo) where id=p_lote_id;
  insert into public.eventos(tipo,entidad,entidad_id,descripcion,usuario_id,metadata) values('REVERSION_STOCK','LOTE_STOCK',p_lote_id,'Reversión de '||v_lote.codigo,p_usuario_id,jsonb_build_object('motivo',trim(p_motivo)));
  return jsonb_build_object('ok',true,'codigoLote',v_lote.codigo,'mensaje','Lote revertido correctamente.');
end $$;

grant execute on function public.procesar_carga_masiva_stock(jsonb,uuid,text) to service_role;
grant execute on function public.revertir_carga_masiva_stock(uuid,uuid,text) to service_role;
