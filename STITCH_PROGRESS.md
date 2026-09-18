# NEXA GROUP — renovación Stitch

## Estado real

Esta entrega es incremental. No representa la finalización de las 31 referencias.
Se preservan las operaciones y datos existentes del backend.

### Conectado en esta entrega

- Inicio: nueva distribución de indicadores, métricas compactas y accesos a operaciones.
- Clientes: directorio con estados, búsqueda, teléfono, WhatsApp y ficha existente.
- Preventa: catálogo compacto, categorías y carrito reconstruido con cantidades, subtotales, observaciones y acciones de registro/borrador.
- Pedidos: tarjetas con selección, detalle reconstruido, desglose de materiales, preparación, edición e impresión. Ventana de cobranza por encima del detalle.
- Inventario: existencias, nuevo producto, ingreso/ajuste manual y movimientos filtrables/exportables.
- Rendiciones: formulario dedicado y confirmación pendiente de aprobación.
- Finanzas: pantallas independientes de presupuesto, cuentas por cobrar, recepción/arqueo, análisis y reporte de caja.
- Administración: usuarios separados del editor de permisos y comprobación real de conexión.
- Menús desplegables sin límite que corte las últimas opciones.
- Reportes de materiales: filtros por familia/búsqueda, orden por valor/código, reposición, valorización por familia y exportación de los resultados filtrados. No simula rotación histórica ni integraciones SUNAT.

### Verificación realizada

- TypeScript y compilación Next.js.
- Pruebas locales con API simulada, sin transacciones de producción, a 390, 768 y 1440 píxeles.
- Navegación, ausencia de desbordamiento horizontal del documento, registro de gasto y cierre del formulario.
- Ingreso mayorista: cantidad 63, factor 10 y clave de idempotencia; no multiplicar dos veces.
- Capturas locales en `artifacts/stitch-qa/` (no versionadas).

### Pendiente de completar y comparar con Stitch

- Conteo físico absoluto y conciliación masiva: requieren proteger los ajustes frente a movimientos concurrentes; el enlace antiguo todavía apunta al editor de producto.
- Reconstrucción completa de la carga Excel y su variante de conteo físico.
- Comparar detalle/cambio de estado y carrito con todas las variantes de datos reales y verificar autorizaciones de vendedor.
- Matriz de permisos por rol: editor actual por usuario conservado, sin inventar permisos no respaldados por el backend.
- Reportes de pedidos y análisis independiente: adaptación restante.
- Fidelidad visual final de las 31 referencias, login y estados de error/vacío/carga.
- Verificar el despliegue de esta entrega y posteriormente publicar la renovación completa.

No se han implementado integraciones ficticias de SUNAT, impresoras, gavetas, almacenes o sedes que solo aparecen como ejemplos en las maquetas.
