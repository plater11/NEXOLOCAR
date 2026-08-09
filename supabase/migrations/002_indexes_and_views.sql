create index clientes_nombre_trgm_idx on public.clientes using gin(nombre gin_trgm_ops);
create index clientes_telefono_idx on public.clientes(telefono);
create index clientes_estado_idx on public.clientes(estado);
create index productos_nombre_trgm_idx on public.productos using gin(nombre gin_trgm_ops);
create index productos_categoria_idx on public.productos(categoria_id);
create index pedidos_cliente_idx on public.pedidos(cliente_id);
create index pedidos_fecha_idx on public.pedidos(fecha desc);
create index pedidos_operativo_idx on public.pedidos(estado_operativo,fecha desc);
create index pedidos_entrega_idx on public.pedidos(estado_entrega,fecha desc);
create index pedidos_cobranza_idx on public.pedidos(estado_cobranza,fecha desc);
create index pedido_detalle_pedido_idx on public.pedido_detalle(pedido_id);
create index movimientos_producto_fecha_idx on public.movimientos_inventario(producto_id,created_at desc);
create index reservas_pedido_estado_idx on public.reservas_stock(pedido_id,estado);
create index pagos_pedido_idx on public.pagos(pedido_id,fecha desc);
create index pagos_cliente_fecha_idx on public.pagos(cliente_id,fecha desc);
create index entregas_pedido_fecha_idx on public.entregas(pedido_id,fecha_entrega desc);
create index gastos_fecha_estado_idx on public.gastos(fecha desc,estado);
create index gastos_jornada_idx on public.gastos(jornada_id);
create index eventos_fecha_idx on public.eventos(created_at desc);

create view public.v_saldos_pedido with (security_invoker=true) as
select p.id,p.codigo_pedido,p.cliente_id,p.total,coalesce(sum(pa.monto) filter(where pa.estado='APLICADO'),0)::numeric(16,2) total_cobrado,
       greatest(p.total-coalesce(sum(pa.monto) filter(where pa.estado='APLICADO'),0),0)::numeric(16,2) saldo,
       max(e.fecha_entrega) filter(where e.estado in ('ENTREGA_COMPLETA','ENTREGA_PARCIAL')) fecha_entrega,
       (max(e.fecha_entrega) filter(where e.estado in ('ENTREGA_COMPLETA','ENTREGA_PARCIAL'))::date+3) fecha_vencimiento
from public.pedidos p left join public.pagos pa on pa.pedido_id=p.id left join public.entregas e on e.pedido_id=p.id group by p.id;

create view public.v_resumen_jornada with (security_invoker=true) as
select j.id jornada_id,j.fecha,count(jp.pedido_id) pedidos_asignados,
 count(*) filter(where p.estado_entrega='ENTREGA_COMPLETA') entregados,
 count(*) filter(where p.estado_entrega not in ('ENTREGA_COMPLETA')) no_entregados,
 coalesce(sum(p.total) filter(where p.estado_entrega='ENTREGA_COMPLETA'),0) ventas_entregadas,
 coalesce(sum(s.total_cobrado),0) cobrado_total,coalesce(sum(s.saldo),0) saldo_pendiente,
 coalesce((select sum(g.monto) from public.gastos g where g.jornada_id=j.id),0) gastos_registrados,
 coalesce((select sum(g.monto) from public.gastos g where g.jornada_id=j.id and g.estado='APROBADO'),0) gastos_aprobados
from public.jornadas j left join public.jornada_pedidos jp on jp.jornada_id=j.id left join public.pedidos p on p.id=jp.pedido_id left join public.v_saldos_pedido s on s.id=p.id group by j.id;
