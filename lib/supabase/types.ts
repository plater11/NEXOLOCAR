export type DataSourceMode = "sheets" | "dual" | "supabase";
export type SupabaseEnvironment = "test" | "production";

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      clientes: Table<{ id: string; codigo: string; nombre: string; telefono: string | null; direccion: string | null; correo: string | null; fecha_nacimiento: string | null; observaciones: string | null; estado: string; legacy_id: string | null; legacy_row: number | null; legacy_source: string | null; created_at: string; updated_at: string }>;
      productos: Table<{ id: string; codigo: string; nombre: string; categoria_id: string | null; marca_id: string | null; unidad_base: string; costo_actual: number; precio_venta: number; permite_fraccionamiento: boolean; activo: boolean; grupo: string; stock_min: number; imagen: string | null; promocion_activa: boolean; cantidad_promo: number; precio_promo: number; descripcion_promo: string | null; controla_decimales: boolean; legacy_id: string | null; legacy_row: number | null; legacy_source: string | null; created_at: string; updated_at: string }>;
      presentaciones: Table<{ id: string; producto_id: string; nombre: string; factor: number; precio: number; permite_fraccionamiento: boolean; fracciones_permitidas: number[]; es_compra: boolean; es_venta: boolean; activo: boolean; legacy_id: string | null }>;
      almacenes: Table<{ id: string; codigo: string; nombre: string; direccion: string | null; activo: boolean; created_at: string }>;
      stock_actual: Table<{ producto_id: string; almacen_id: string; stock_fisico: number; stock_reservado: number; stock_en_ruta: number; stock_disponible: number; updated_at: string }>;
      pedidos: Table<{ id: string; codigo_pedido: string; cliente_id: string; fecha: string; subtotal: number; descuento: number; total: number; estado_operativo: string; estado_entrega: string; estado_cobranza: string; estado_boleta: string; observaciones: string | null; usuario_creacion: string | null; legacy_id: string | null; legacy_row: number | null; legacy_source: string | null; idempotency_key: string | null; version: number; created_at: string; updated_at: string }>;
      pedido_detalle: Table<{ id: string; pedido_id: string; producto_id: string; presentacion_id: string | null; cantidad_presentacion: number; fraccion: number; factor_presentacion: number; cantidad_unidades_base: number; precio_presentacion: number; precio_aplicado: number; subtotal: number; legacy_id: string | null }>;
      eventos: Table<{ id: string; tipo: string; entidad: string; entidad_id: string | null; descripcion: string; importe: number; usuario_id: string | null; created_at: string; metadata: Record<string, unknown> }>;
    };
    Views: Record<string, never>;
    Functions: {
      reservar_stock_pedido: { Args: { p_pedido_id: string; p_almacen_id: string }; Returns: Record<string, unknown> };
      registrar_entrega_pedido: { Args: { p_pedido_id: string; p_payload: Record<string, unknown> }; Returns: Record<string, unknown> };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
