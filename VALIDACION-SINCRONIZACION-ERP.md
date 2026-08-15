# Validación de sincronización ERP

## Causas raíz

1. Las escrituras disparaban únicamente `nexo:activity`; Inicio, Pedidos, Cobranza, Inventario y Finanzas conservaban sus estados y cachés hasta navegar o refrescar.
2. Supabase Realtime observaba un subconjunto de tablas y reutilizaba `refresh()`, cuya consulta dependía del módulo visible.
3. La entrega generaba una clave idempotente, pero no la incluía dentro de `p_entrega`; la función SQL recibía `NULL`.
4. El alta idempotente de gastos ignoraba la segunda fila, pero insertaba nuevamente el evento operativo.
5. Venta real y cuentas por cobrar incluían pedidos no entregados. Resultado operativo descontaba compras de inventario como si fueran costo de ventas.

## Solución aplicada

- Bus central `refreshRelatedModules(eventType)` con un mapa único evento → módulos.
- Invalidación inmediata después de confirmación del backend y actualización transversal en segundo plano.
- Realtime ampliado a pedidos, entregas, pagos, gastos, stock, jornadas, rendiciones y eventos.
- Finanzas escucha invalidaciones aunque permanezca montada con datos previamente cacheados.
- Toast global con estados visuales de éxito, advertencia y error; banner de procesamiento y botones bloqueados durante escrituras.
- Clave idempotente propagada a entrega y cobro; eventos de gasto emitidos solamente cuando la inserción fue real.
- Fórmula oficial: venta real = pedidos entregados válidos en el período. Por cobrar = saldo de pedidos entregados. Resultado operativo = venta real − gastos aprobados.
- Timezone de negocio `America/Lima` en consultas, UI y migración.

## Eventos conectados

`ORDER_CREATED`, `ORDER_READY`, `ORDER_IN_ROUTE`, `ORDER_DELIVERED`, `ORDER_UPDATED`, `PAYMENT_REGISTERED`, `STOCK_RECEIVED`, `STOCK_ADJUSTED`, `EXPENSE_CREATED`, `EXPENSE_APPROVED`, `EXPENSE_REJECTED`, `RENDITION_CLOSED`, `PERIOD_CLOSED` y `MASTER_DATA_UPDATED`.

## Vistas conectadas

Inicio, Pedidos y emisión, Cobranza, Gestión financiera, Productos e inventario, Centro de rendiciones y Operaciones recientes.

## Migración

Aplicar `supabase/migrations/017_erp_global_sync_idempotency.sql`. Agrega índices idempotentes y de consulta, publicación Realtime y eventos normalizados para pagos, gastos, rendiciones e inventario.

## Verificación ejecutada

- `npm run lint`: correcto.
- `npm run build`: correcto; compilación, TypeScript y generación estática finalizaron sin errores.
- Verificación estática de doble envío: venta, entrega/cobro, gasto e inventario generan una clave por intento y bloquean la acción mientras está pendiente.

## Prueba funcional posterior a la migración

En un entorno de prueba Supabase, ejecutar el caso S/100 → entrega → cobro S/80 → gasto S/10 aprobado → pago S/20. Confirmar que cada tarjeta cambia sin recargar y que dos solicitudes con la misma clave producen una sola fila. Esta prueba no debe ejecutarse sobre producción porque crea ventas, pagos, movimientos de inventario y gastos reales.
