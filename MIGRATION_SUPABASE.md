# Migración segura de NexoVenta a Supabase

## Estado y arquitectura

La producción continúa en `DATA_SOURCE=sheets`. La rama de migración puede usar `dual` para comparar lecturas sin duplicar pedidos, pagos, stock ni gastos. El modo `supabase` rechaza cualquier operación que todavía no tenga adaptador validado; esto evita un corte parcial silencioso.

```text
UI existente → /api/qaso → sheets: Apps Script
                         → dual: Sheets + comparación Supabase (solo lectura)
                         → supabase: repositorios/RPC validados
```

## Mapa actual → modelo nuevo

| Sheets / Apps Script | Supabase |
|---|---|
| Clientes | `clientes` |
| Productos, Grupos, Unidades | `productos`, `categorias`, `presentaciones` |
| Ventas (JSON de productos) | `pedidos`, `pedido_detalle` |
| Operacion_Estados_Historial | `pedido_historial_estado` |
| Movimientos | `movimientos_inventario`, `stock_actual` |
| Operacion_Preparacion | `reservas_stock` |
| Operacion_Jornadas | `jornadas`, `jornada_pedidos` |
| Operacion_Cobranza | `entregas`, `entrega_detalle`, `pagos`, `pago_detalle` |
| Finanzas_Cuentas_Por_Cobrar | vista `v_saldos_pedido`, `compromisos_pago` |
| Operacion_Gastos | `gastos` |
| Finanzas_Rendicion_Diaria | `rendiciones` |
| Finanzas_Movimientos | `movimientos_financieros` |
| Finanzas_Planeamiento_Mensual | `presupuestos`, `presupuesto_detalle` |
| Finanzas_Objetivos | `objetivos`, `proyecciones`, `metas_periodo` |
| Operacion_Actividad | `eventos` |
| Auditoría implícita | `auditoria` |
| Usuarios | Supabase Auth + `usuarios_perfil` |

## Aplicación en TEST

1. Crear un proyecto Supabase de prueba; no usar todavía producción.
2. Ejecutar, en orden, los archivos de `supabase/migrations/` con Supabase CLI o el runner de migraciones.
3. Crear usuarios de prueba en Auth y asignar su rol en `usuarios_perfil`.
4. Configurar localmente las variables de `.env.example`; nunca guardar `service_role` en Vercel como variable pública.
5. Exportar desde Apps Script a JSON y colocar temporalmente los archivos en `scripts/migration/input/` (está ignorado por Git).
6. Ejecutar `npm run migrate:clientes`, `migrate:productos`, `migrate:pedidos`, `migrate:inventario`.
7. Ejecutar `npm run migrate:compare`. Un código de salida `2` significa diferencias y bloquea el corte.
8. Configurar `DATA_SOURCE=dual` únicamente en Preview/TEST. Revisar logs `[DATA_SOURCE_DIFF]`.
9. Ejecutar pruebas funcionales y de concurrencia antes de habilitar más adaptadores.

## Ambigüedades que bloquean la importación automática de fases 4–6

No se importan todavía entregas, pagos, gastos o presupuestos porque el origen actual no conserva de forma inequívoca todos estos vínculos:

- `Operacion_Cobranza` acumula medios de pago en una fila y no identifica cada pago individual ni su idempotency key.
- ventas antiguas ya descontaron stock al crear la venta; las nuevas lo descuentan al entregar. Debe definirse una fecha exacta de corte para no duplicar salidas.
- una jornada histórica no siempre contiene un ID estable por cada asignación pedido–repartidor–vehículo.
- importes financieros antiguos pueden haber sido volcados desde gastos aprobados; importarlos por ambas fuentes duplicaría el resultado.
- el JSON histórico de detalle debe confirmarse como unidades de presentación o unidades base por cada versión.

Antes de migrar esas fases se necesita: fecha/hora de corte, regla de precedencia por cada fuente duplicada y una exportación de pagos históricos individualizados. Hasta entonces Sheets permanece oficial.

## Variables de Vercel

| Variable | Preview/TEST | Production actual |
|---|---|---|
| `DATA_SOURCE` | `dual` después de importar y comparar | `sheets` |
| `SUPABASE_ENVIRONMENT` | `test` | `production` solo tras el corte |
| `NEXT_PUBLIC_SUPABASE_URL` | URL TEST | URL producción futura |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon TEST | anon producción futura |
| `SUPABASE_SERVICE_ROLE_KEY` | solo servidor/migración; preferir local/CI protegido | no requerida por navegador |
| `APPS_SCRIPT_URL` | mantener para dual/fallback | mantener durante migración |

## Rollback

1. Cambiar `DATA_SOURCE=sheets` en Vercel.
2. Redeploy del último commit validado.
3. No borrar Supabase: conservarlo para conciliación.
4. Exportar los IDs de operaciones Supabase realizadas después del corte.
5. Conciliar por `idempotency_key` y `legacy_id` antes de reactivar escrituras.

El rollback no debe copiar movimientos a Sheets automáticamente: cualquier conciliación financiera o de inventario requiere reporte y aprobación.

## Medición

Las funciones de UI existentes ya usan medición `[PERF]`. Durante dual se deben capturar tiempos de Sheets y Supabase en Preview con los mismos filtros y volumen. No se declaran mejoras hasta tener datos reales.

## Fases

- Fase 1: esquema y scripts de clientes/productos/presentaciones, implementada; requiere ejecución TEST.
- Fase 2: esquema de pedidos/detalle/historial y RPC de creación, implementada; importación limitada por vínculos de cliente.
- Fase 3: inventario/reservas/stock y RPC transaccional, implementada; requiere conciliación de fecha de corte.
- Fases 4–6: esquema creado; importación histórica bloqueada por ambigüedades documentadas.
- Fase 7: Auth/RLS, eventos y auditoría preparados; falta crear usuarios TEST y validar políticas por rol.
- Fase 8: no activada. Producción debe seguir en Sheets hasta comparación y autorización explícita.
