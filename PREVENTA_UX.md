# Preventa — selección móvil y borradores

- Impacto revisado con CodeGraph: Sales, sidebarItems, StitchNavigation, saveDraft, save y StitchCart.
- Menú Preventa abre el catálogo directamente; subopciones Preventa y Borradores.
- Borradores guardados manualmente desde carrito, por usuario en este navegador. Compatibilidad con el borrador local anterior. No son pedidos emitidos ni se sincronizan entre dispositivos.
- Retomar conserva cliente, materiales, observaciones y referencia de edición; confirmar elimina el borrador retomado. Reemplazar otro carrito exige confirmación.
- Tarjeta accesible completa y zonas libres agregan producto. Los controles +/− no propagan otra adición. Se mantienen límites de stock.
- Sonido corto mediante Web Audio después de agregar, opcional y sin bloquear operaciones si el navegador impide audio.
- Carrito fijo en móvil y escritorio, espacio inferior reservado y safe area.
- Sin migraciones ni cambios a las operaciones de Supabase.
