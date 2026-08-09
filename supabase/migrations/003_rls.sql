create or replace function public.rol_actual() returns text language sql stable security definer set search_path=public as $$ select rol from public.usuarios_perfil where id=auth.uid() and activo=true $$;
create or replace function public.es_rol(roles text[]) returns boolean language sql stable security definer set search_path=public as $$ select public.rol_actual()=any(roles) $$;

do $$ declare t text; begin
  foreach t in array array['usuarios_perfil','clientes','categorias','marcas','proveedores','vehiculos','almacenes','productos','presentaciones','pedidos','pedido_detalle','pedido_historial_estado','stock_actual','movimientos_inventario','reservas_stock','recepciones','recepcion_detalle','ajustes_inventario','jornadas','jornada_pedidos','entregas','entrega_detalle','evidencias_entrega','pagos','pago_detalle','compromisos_pago','gestiones_cobranza','gastos','rendiciones','cuentas_financieras','movimientos_financieros','presupuestos','presupuesto_detalle','objetivos','proyecciones','metas_periodo','eventos','auditoria','configuracion'] loop execute format('alter table public.%I enable row level security',t); end loop;
end $$;

create policy "authenticated read clients" on public.clientes for select to authenticated using (public.es_rol(array['ADMINISTRADOR','PREVENTISTA','ALMACENERO','REPARTIDOR','FINANZAS']));
create policy "sales manage clients" on public.clientes for all to authenticated using (public.es_rol(array['ADMINISTRADOR','PREVENTISTA'])) with check (public.es_rol(array['ADMINISTRADOR','PREVENTISTA']));
create policy "authenticated read catalog" on public.productos for select to authenticated using (true);
create policy "authenticated read presentations" on public.presentaciones for select to authenticated using (true);
create policy "warehouse manage products" on public.productos for all to authenticated using (public.es_rol(array['ADMINISTRADOR','ALMACENERO'])) with check (public.es_rol(array['ADMINISTRADOR','ALMACENERO']));
create policy "warehouse manage presentations" on public.presentaciones for all to authenticated using (public.es_rol(array['ADMINISTRADOR','ALMACENERO'])) with check (public.es_rol(array['ADMINISTRADOR','ALMACENERO']));
create policy "orders read by operations" on public.pedidos for select to authenticated using (public.es_rol(array['ADMINISTRADOR','PREVENTISTA','ALMACENERO','REPARTIDOR','FINANZAS']));
create policy "sales insert orders" on public.pedidos for insert to authenticated with check (public.es_rol(array['ADMINISTRADOR','PREVENTISTA']) and (usuario_creacion=auth.uid() or usuario_creacion is null));
create policy "order details read" on public.pedido_detalle for select to authenticated using (true);
create policy "inventory read" on public.stock_actual for select to authenticated using (true);
create policy "events read" on public.eventos for select to authenticated using (true);
create policy "route read journeys" on public.jornadas for select to authenticated using (public.es_rol(array['ADMINISTRADOR','REPARTIDOR','FINANZAS']));
create policy "finance read expenses" on public.gastos for select to authenticated using (public.es_rol(array['ADMINISTRADOR','REPARTIDOR','FINANZAS']));
create policy "route insert expenses" on public.gastos for insert to authenticated with check (public.es_rol(array['ADMINISTRADOR','REPARTIDOR']));
create policy "admin profile read" on public.usuarios_perfil for select to authenticated using (id=auth.uid() or public.es_rol(array['ADMINISTRADOR']));

-- Las mutaciones críticas se conceden exclusivamente mediante funciones SECURITY DEFINER.
revoke insert,update,delete on public.stock_actual,public.movimientos_inventario,public.reservas_stock,public.pagos,public.entregas from authenticated;
