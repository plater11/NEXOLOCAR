# Punto de continuación — 22 de septiembre de 2026

## Avance más reciente
- Fase 1: navegación extraída, panel móvil accesible y submenús. Compilación y recorridos a 390/768/1440 px.
- Fase 2: Inicio separa resumen de pedidos e historial; indicadores compactos y períodos accesibles. Conserva cálculos.
- Fase 3: carga Excel conectada a StitchBulkStock con las funciones existentes. Tres pasos, revisión y descarte. Sin modificar backend ni integrar lib/stock-import.ts.
- Suite ampliada con carga CSV, vista previa de 63 paquetes y descarte sin llamada de importación.
- Conteo físico y el resto de pendientes de abajo NO se consideran terminados.

## Pedido del usuario
Continuar la reconstrucción completa con las referencias Stitch, mantener backend/datos y guardar un punto de reanudación. No afirmar que las 31 pantallas están terminadas.

## Trabajo de esta sesión
- Carrito independiente `app/stitch-cart.tsx`: cantidades, fracciones autorizadas, subtotales, observaciones, borrador/registro. Bloqueo durante guardado y navegación de teclado del diálogo.
- Detalle de pedido integrado en `app/page.tsx`: resumen, desglose, preparación y acciones existentes por estado.
- Capa de cobranza corregida para aparecer encima del detalle.
- Nuevo `app/stitch-material-report.tsx`: filtros reales por familia/búsqueda, mayor valor, reposición/código, distribución por familia y Excel filtrado. Mantiene la conversión de cantidades base a presentaciones.
- Pruebas ampliadas en `scripts/test-stitch-responsive.mjs`, con backend simulado y peticiones externas bloqueadas.

## Cómo comprobar
Node local: `C:/Users/micro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.
Compilar con ese ejecutable y `node_modules/next/dist/bin/next build --webpack`.
Iniciar con `node_modules/next/dist/bin/next start --port 3100`.
Ejecutar `scripts/test-stitch-responsive.mjs` configurando `PLAYWRIGHT_MODULE` al módulo `playwright` del runtime y `TEST_CHROME` a `C:/Program Files/Google/Chrome/Application/chrome.exe`.
Capturas locales ignoradas por Git: `artifacts/stitch-qa/`.

## Siguiente trabajo
1. Conteo físico: no sustituir stock sin control transaccional de movimientos concurrentes. El enlace antiguo todavía lleva a edición de producto.
2. Carga Excel: separar ingreso adicional de conciliación de conteo; no multiplicar factores dos veces.
3. Roles/permisos: verificar matriz respaldada por backend y cambios de estado con perfil vendedor.
4. Adaptar Reportes de pedidos y Análisis independiente.
5. Comparación visual final con las 31 referencias, incluyendo variantes vacías/error/carga y pantallas largas en móvil.
6. Verificar publicación real; un commit local o compilación no prueban despliegue.

## Preservar cambios ajenos
`tsconfig.tsbuildinfo` y `supabase/migrations/026_allow_preventista_order_flow.sql` ya estaban modificados/no versionados. No incluirlos ni borrarlos sin inspección específica.
El commit anterior de renovación local es `c1473cc`; su publicación anterior falló por límite del sistema de aprobación. No asumir que está en producción.
