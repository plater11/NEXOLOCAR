# Fase 3 — Inventario, avance visual

## Impacto consultado con CodeGraph
- Crítico: Inventory en app/page.tsx mantiene downloadTemplate, upload y confirmBulkImport, sus argumentos y claves de idempotencia.
- Datos relacionados, sin cambios: productos, presentaciones, stock_actual, movimientos_inventario, lotes_stock y RPC procesar_carga_masiva_stock.
- Aislado: StitchBulkStock recibe datos y callbacks; no accede a Supabase.

## Implementado
- Sustituida la pantalla antigua de carga masiva por el flujo visual de tres pasos de Stitch.
- Plantilla, selector de archivo accesible, validación, tarjetas de vista previa, resumen y confirmación.
- Vista previa paginada de diez en diez y descarte sin enviar movimientos.
- Distribución de dos columnas en escritorio y una en celular, acciones sin desbordamiento.
- Sin almacenes, impuestos o categorías ficticias de los datos de ejemplo de Stitch.
- No se ha conectado lib/stock-import.ts ni cambiado la interpretación del Excel.

## Pendiente
- Conteo físico no se presenta como implementado: el enlace anterior sigue dirigiendo al editor. No sustituir saldos sin soporte transaccional.
- Verificación con datos reales y publicación se comprueban separadamente de las pruebas simuladas.
