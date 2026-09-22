# Fase 1 — estructura, navegación y layout

## Análisis de impacto previo
Fuente: consultas de solo lectura a `.codegraph/codegraph.db` y contraste con imports, JSX y referencias Stitch de menú lateral.

### Críticas: preservar
- `app/page.tsx`: composición de todos los módulos, sesión, permisos, callbacks de navegación, caché de subsecciones y refresco.
- Dependencias de la página: `lib/offline/queue.ts`, `lib/erp-sync.ts`, `lib/supabase/client.ts`.
- Rutas: `/` afectada visualmente. `/api/qaso` y `/api/data-source` sin modificaciones.
- No hay acceso directo a tablas desde el nuevo componente de navegación. Tablas y RPC quedan intactas.

### Relacionadas: probar regresiones
- Componentes Stitch importados por la página: directorio, carrito, pedidos, inventario, gastos, reportes y mantenimiento.
- `app/layout.tsx`, estilos globales/responsive y barra superior.
- Callback `openSidebarChild`: conserva las claves y destinos existentes.

### Aisladas dentro de esta fase
- Nuevo componente `app/stitch-navigation.tsx`: presentación, desplegables y manejo accesible del panel móvil.
- Nuevo `app/stitch-shell.css`: estilos limitados al shell y navegación.

## Cambios
- Extracción del menú de la página monolítica sin alterar permisos ni operaciones.
- Menú lateral fijo en escritorio y panel desplegable en celular/tablet hasta 900 px.
- Submenús inicialmente cerrados; se mantienen todos los destinos existentes.
- Submenús cerrados ocultos también para teclado y tecnologías de asistencia.
- Panel móvil con Escape, foco contenido, restauración del foco, bloqueo de desplazamiento y fondo inerte.
- Iconos SVG comunes, controles táctiles y soporte de movimiento reducido.

## Límites
- No reconstruye pantallas internas: corresponden a las fases 2–7.
- No añade destinos ficticios ni modifica el enlace pendiente de toma de inventario.
- No integra todavía los archivos de carga masiva que quedaron pendientes de la sesión anterior.
- No modifica backend, tablas, reglas, importes ni autorizaciones.

## Verificación
- TypeScript sin emisión: correcto.
- Pruebas ampliadas en `scripts/test-stitch-responsive.mjs`: panel, foco, Escape, fondo inerte, navegación y recorridos funcionales simulados.
- La publicación debe comprobarse separadamente del guardado local.
