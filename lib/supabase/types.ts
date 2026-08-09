export type DataSourceMode = "sheets" | "dual" | "supabase";
export type SupabaseEnvironment = "test" | "production";

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      usuarios_perfil: Table<{ id: string; usuario: string | null; nombre: string; rol: string; perfil_legacy: string | null; activo: boolean; permisos: string[]; comentarios: string; ultimo_login: string | null; legacy_id: string | null; created_at: string; updated_at: string }>;
      clientes: Table<{ id: string; codigo: string; nombre: string; telefono: string | null; direccion: string | null; correo: string | null; fecha_nacimiento: string | null; observaciones: string | null; estado: string; legacy_id: string | null; legacy_row: number | null; legacy_source: string | null; created_at: string; updated_at: string }>;
      productos: Table<{ id: string; codigo: string; nombre: string; categoria_id: string | null; marca_id: string | null; unidad_base: string; costo_actual: number; precio_venta: number; permite_fraccionamiento: boolean; activo: boolean; grupo: string; stock_min: number; imagen: string | null; promocion_activa: boolean; cantidad_promo: number; precio_promo: number; descripcion_promo: string | null; controla_decimales: boolean; legacy_id: string | null; legacy_row: number | null; legacy_source: string | null; created_at: string; updated_at: string }>;
      presentaciones: Table<{ id: string; producto_id: string; nombre: string; factor: number; precio: number; permite_fraccionamiento: boolean; fracciones_permitidas: number[]; es_compra: boolean; es_venta: boolean; activo: boolean; legacy_id: string | null }>;
      almacenes: Table<{ id: string; codigo: string; nombre: string; direccion: string | null; activo: boolean; created_at: string }>;
      stock_actual: Table<{ producto_id: string; almacen_id: string; stock_fisico: number; stock_reservado: number; stock_en_ruta: number; stock_disponible: number; updated_at: string }>;
      movimientos_inventario: Table<{ id: string; producto_id: string; almacen_id: string; tipo_movimiento: string; cantidad: number; referencia_tipo: string | null; referencia_id: string | null; saldo_anterior: number; saldo_nuevo: number; usuario_id: string | null; idempotency_key: string; created_at: string; observacion: string | null; legacy_id: string | null; legacy_row: number | null }>;
      categorias: Table<{ id: string; nombre: string; activo: boolean; legacy_id: string | null; created_at: string }>;
      pedidos: Table<{ id: string; codigo_pedido: string; cliente_id: string; fecha: string; subtotal: number; descuento: number; total: number; estado_operativo: string; estado_entrega: string; estado_cobranza: string; estado_boleta: string; codigo_impresion: string | null; fecha_impresion: string | null; observaciones: string | null; usuario_creacion: string | null; legacy_id: string | null; legacy_row: number | null; legacy_source: string | null; idempotency_key: string | null; version: number; created_at: string; updated_at: string }>;
      pedido_detalle: Table<{ id: string; pedido_id: string; producto_id: string; presentacion_id: string | null; cantidad_presentacion: number; fraccion: number; factor_presentacion: number; cantidad_unidades_base: number; precio_presentacion: number; precio_aplicado: number; subtotal: number; legacy_id: string | null }>;
      pedido_historial_estado: Table<{ id: string; pedido_id: string; tipo_estado: string; estado_anterior: string | null; estado_nuevo: string; observacion: string | null; usuario_id: string | null; created_at: string }>;
      eventos: Table<{ id: string; tipo: string; entidad: string; entidad_id: string | null; descripcion: string; importe: number; usuario_id: string | null; created_at: string; metadata: Record<string, unknown> }>;
      reservas_stock: Table<{ id: string; pedido_id: string; producto_id: string; almacen_id: string; cantidad: number; estado: string; idempotency_key: string; created_at: string; updated_at: string }>;
      preparacion_pedido: Table<{ pedido_id: string; producto_id: string; cantidad_preparada: number; estado: string; cantidad_faltante: number; motivo: string; observacion: string; updated_by: string | null; updated_at: string }>;
      jornadas: Table<{ id: string; fecha: string; repartidor_id: string | null; vehiculo_id: string | null; ruta: string | null; estado: string; created_at: string; closed_at: string | null }>;
      jornada_pedidos: Table<{ jornada_id: string; pedido_id: string; orden_visita: number; estado: string }>;
      entregas: Table<{ id: string; pedido_id: string; jornada_id: string | null; estado: string; fecha_entrega: string | null; repartidor_id: string | null; observacion: string | null; idempotency_key: string; created_at: string }>;
      pagos: Table<{ id: string; pedido_id: string; cliente_id: string; fecha: string; monto: number; estado: string; usuario_id: string | null; idempotency_key: string; created_at: string; legacy_id: string | null }>;
      pago_detalle: Table<{ id: string; pago_id: string; medio: string; monto: number; referencia: string | null }>;
      gastos: Table<{ id: string; fecha: string; categoria: string; subcategoria: string | null; descripcion: string; monto: number; medio_pago: string | null; origen_dinero: string | null; jornada_id: string | null; vehiculo_id: string | null; repartidor_id: string | null; proveedor: string | null; comprobante_url: string | null; estado: string; usuario_id: string | null; idempotency_key: string | null; legacy_id: string | null; created_at: string; updated_at: string }>;
      rendiciones: Table<{ id: string; jornada_id: string; efectivo_esperado: number; efectivo_rendido: number; diferencia: number; observacion: string | null; estado: string; usuario_id: string | null; created_at: string }>;
      movimientos_financieros: Table<{ id: string; fecha: string; tipo: string; categoria: string; concepto: string | null; monto: number; cuenta_id: string | null; referencia_tipo: string | null; referencia_id: string | null; usuario_id: string | null; created_at: string }>;
      presupuestos: Table<{ id: string; anio: number; mes: number; objetivo_ventas: number; estado: string; created_at: string }>;
      presupuesto_detalle: Table<{ id: string; presupuesto_id: string; categoria: string; partida: string; monto: number }>;
      objetivos: Table<{ id: string; nombre: string; monto: number; fecha_objetivo: string | null; prioridad: string | null; estado: string; created_at: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      reservar_stock_pedido: { Args: { p_pedido_id: string; p_almacen_id: string }; Returns: Record<string, unknown> };
      registrar_entrega_pedido: { Args: { p_pedido_id: string; p_payload: Record<string, unknown> }; Returns: Record<string, unknown> };
      registrar_movimiento_inventario: { Args: { p_producto_id: string; p_almacen_id: string; p_tipo: string; p_cantidad: number; p_observacion: string; p_idempotency_key: string }; Returns: Record<string, unknown> };
      corregir_pedido: { Args: { p_pedido_id: string; p_cliente_id: string; p_items: Array<Record<string, unknown>>; p_observaciones: string }; Returns: Record<string, unknown> };
      crear_pedido: { Args: { p_codigo: string; p_cliente_id: string; p_items: Array<Record<string, unknown>>; p_descuento: number; p_observaciones: string; p_idempotency_key: string }; Returns: Record<string, unknown> };
      guardar_preparacion_pedido: { Args: { p_pedido_id: string; p_lineas: Array<Record<string, unknown>>; p_marcar_listo: boolean; p_almacen_id: string }; Returns: Record<string, unknown> };
      asignar_pedido_jornada: { Args: { p_pedido_id: string; p_jornada_id: string; p_orden?: number }; Returns: Record<string, unknown> };
      registrar_pago_pedido: { Args: { p_pedido_id: string; p_idempotency_key: string; p_detalle: Array<Record<string, unknown>> }; Returns: Record<string, unknown> };
      procesar_entrega_cobro: { Args: { p_pedido_id: string; p_entrega: Record<string, unknown>; p_pago: Record<string, unknown>; p_idempotency_key: string }; Returns: Record<string, unknown> };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
