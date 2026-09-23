# Preventa — selección móvil y borradores

- Impacto revisado con CodeGraph: Sales, sidebarItems, StitchNavigation, saveDraft, save y StitchCart.
- Menú Preventa sin subsecciones; botones internos Preventa y Borradores del mismo tamaño.
- Ambas pestañas comparten cabecera y barra de herramientas; el título no cambia de posición. Espacio de scrollbar reservado para evitar desplazamiento horizontal. Prueba de regresión compara x/y/ancho/alto de las pestañas al alternar.
- Carrito con contador circular de materiales distintos y selector de cliente existente.
- Historial del navegador para cambios de sección, destinos de submenú y vistas Preventa/Borradores/carrito. Atrás cierra el carrito antes de volver a la sección previa; Adelante restaura el destino.
- No se bloquea la salida del navegador cuando ya no hay una sección anterior en su historial. No altera la sesión autenticada.
- Borradores guardados manualmente desde carrito, por usuario en este navegador. Compatibilidad con el borrador local anterior. No son pedidos emitidos ni se sincronizan entre dispositivos.
- Retomar conserva cliente, materiales, observaciones y referencia de edición; confirmar elimina el borrador retomado. Reemplazar otro carrito exige confirmación.
- Tarjeta accesible completa y zonas libres agregan producto. Los controles +/− no propagan otra adición. Se mantienen límites de stock.
- Sonido corto mediante Web Audio después de agregar, opcional y sin bloquear operaciones si el navegador impide audio.
- Carrito fijo en móvil y escritorio, espacio inferior reservado y safe area.
- Sin migraciones ni cambios a las operaciones de Supabase.
