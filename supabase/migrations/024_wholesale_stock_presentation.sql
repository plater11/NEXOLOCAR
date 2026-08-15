-- Products with a conversion factor are sold and displayed by wholesale pack.
update public.presentaciones
set nombre='Paquete'
where activo=true
  and factor>1
  and upper(btrim(nombre)) in ('UNIDAD','UNIDADES','UND');

-- Correct the explicitly verified physical count for PT00045:
-- 63 sellable packs x 10 units = 630 base units.
with target as (
  select p.id as producto_id,s.almacen_id,s.stock_fisico
  from public.productos p
  join public.stock_actual s on s.producto_id=p.id
  where p.codigo='PT00045'
)
insert into public.movimientos_inventario(
  producto_id,almacen_id,tipo_movimiento,cantidad,referencia_tipo,
  saldo_anterior,saldo_nuevo,idempotency_key,observacion
)
select
  producto_id,almacen_id,'AJUSTE_NEGATIVO',stock_fisico-630,'CONTEO_FISICO',
  stock_fisico,630,'CORRECCION-MAYORISTA-PT00045-20260815',
  'Corrección a 63 paquetes x10 confirmada por conteo del usuario'
from target
where stock_fisico>630
on conflict(idempotency_key) do nothing;

update public.stock_actual s
set stock_fisico=630,updated_at=now()
from public.productos p
where p.id=s.producto_id
  and p.codigo='PT00045'
  and s.stock_reservado+s.stock_en_ruta<=630;
