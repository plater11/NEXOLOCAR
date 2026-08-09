import { getSupabaseAdminClient } from "../server";

export async function searchClients(query: string, limit = 25) {
  const db = getSupabaseAdminClient();
  const term = query.trim().replace(/[%_,]/g, " ");
  let request = db.from("clientes").select("id,codigo,nombre,telefono,direccion,correo,fecha_nacimiento,observaciones,estado").eq("estado", "ACTIVO").order("nombre").limit(limit);
  if (term) request = request.or(`codigo.ilike.%${term}%,nombre.ilike.%${term}%,telefono.ilike.%${term}%,direccion.ilike.%${term}%`);
  const { data, error } = await request;
  if (error) throw error;
  return data || [];
}

export async function searchProducts(query: string, limit = 50) {
  const db = getSupabaseAdminClient();
  const term = query.trim().replace(/[%_,]/g, " ");
  let request = db.from("productos").select("id,codigo,nombre,unidad_base,costo_actual,precio_venta,permite_fraccionamiento,activo").eq("activo", true).order("nombre").limit(limit);
  if (term) request = request.or(`codigo.ilike.%${term}%,nombre.ilike.%${term}%`);
  const { data, error } = await request;
  if (error) throw error;
  return data || [];
}

export async function recentEvents(limit = 15) {
  const db = getSupabaseAdminClient();
  const { data, error } = await db.from("eventos").select("id,tipo,entidad,entidad_id,descripcion,importe,usuario_id,created_at,metadata").order("created_at", { ascending: false }).limit(Math.min(50, limit));
  if (error) throw error;
  return data || [];
}

export async function productCatalog() {
  const db = getSupabaseAdminClient();
  const [{ data: products, error: productError }, { data: stock, error: stockError }, { data: presentations, error: presentationError }] = await Promise.all([
    db.from("productos").select("id,codigo,nombre,unidad_base,grupo,stock_min,costo_actual,precio_venta,imagen,promocion_activa,cantidad_promo,precio_promo,descripcion_promo,permite_fraccionamiento,controla_decimales").eq("activo", true).order("nombre"),
    db.from("stock_actual").select("producto_id,stock_fisico,stock_reservado,stock_en_ruta"),
    db.from("presentaciones").select("producto_id,nombre,factor,precio,permite_fraccionamiento,fracciones_permitidas").eq("activo", true).eq("es_venta", true),
  ]);
  if (productError) throw productError;
  if (stockError) throw stockError;
  if (presentationError) throw presentationError;
  const stockMap = new Map((stock || []).map(row => [row.producto_id, row]));
  const presentationMap = new Map((presentations || []).map(row => [row.producto_id, row]));
  return (products || []).map(product => ({ ...product, stock: stockMap.get(product.id), presentation: presentationMap.get(product.id) }));
}

export async function orderCatalog(filters: Record<string, unknown> = {}) {
  const db = getSupabaseAdminClient();
  let request = db.from("pedidos").select("id,codigo_pedido,cliente_id,fecha,total,observaciones,estado_operativo,estado_entrega,estado_cobranza,estado_boleta,subestado_operativo,motivo_incidencia,fecha_reprogramada,fecha_vencimiento_cobro").order("fecha", { ascending: false });
  const from = String(filters.fechaDesde || filters.desde || "").slice(0, 10);
  const to = String(filters.fechaHasta || filters.hasta || "").slice(0, 10);
  if (from) request = request.gte("fecha", `${from}T00:00:00-05:00`);
  if (to) request = request.lte("fecha", `${to}T23:59:59-05:00`);
  const { data: orders, error: orderError } = await request;
  if (orderError) throw orderError;
  const orderIds = (orders || []).map(order => order.id);
  const [{ data: clients, error: clientError }, { data: details, error: detailError }, { data: products, error: productError }] = await Promise.all([
    db.from("clientes").select("id,nombre,telefono,direccion"),
    orderIds.length ? db.from("pedido_detalle").select("pedido_id,producto_id,cantidad_presentacion,precio_aplicado,subtotal").in("pedido_id", orderIds) : Promise.resolve({ data: [], error: null }),
    db.from("productos").select("id,codigo,nombre"),
  ]);
  if (clientError) throw clientError;
  if (detailError) throw detailError;
  if (productError) throw productError;
  const clientMap = new Map((clients || []).map(client => [client.id, client.nombre]));
  const productMap = new Map((products || []).map(product => [product.id, product]));
  const detailsMap = new Map<string, typeof details>();
  for (const detail of details || []) detailsMap.set(detail.pedido_id, [...(detailsMap.get(detail.pedido_id) || []), detail]);
  const text = String(filters.texto || "").trim().toLowerCase();
  return (orders || []).map(order => {
    const items = (detailsMap.get(order.id) || []).map(detail => {
      const product = productMap.get(detail.producto_id);
      return { codigo: product?.codigo || "", nombre: product?.nombre || "Producto", cantidad: Number(detail.cantidad_presentacion), precioUnitario: Number(detail.precio_aplicado), subtotal: Number(detail.subtotal) };
    });
    const client = (clients || []).find(row => row.id === order.cliente_id);
    return { ...order, cliente: clientMap.get(order.cliente_id) || "Cliente", telefono: client?.telefono || "", direccion: client?.direccion || "", items };
  }).filter(order => !text || `${order.codigo_pedido} ${order.cliente} ${order.telefono} ${order.observaciones || ""}`.toLowerCase().includes(text));
}

export async function operationalSummary() {
  const db = getSupabaseAdminClient();
  const [{ count: clients, error: clientError }, { data: products, error: productError }, { data: stock, error: stockError }] = await Promise.all([
    db.from("clientes").select("id", { count: "exact", head: true }).eq("estado", "ACTIVO"),
    db.from("productos").select("id,costo_actual,stock_min").eq("activo", true),
    db.from("stock_actual").select("producto_id,stock_fisico"),
  ]);
  if (clientError) throw clientError;
  if (productError) throw productError;
  if (stockError) throw stockError;
  const stockMap = new Map((stock || []).map(row => [row.producto_id, Number(row.stock_fisico)]));
  return {
    totalProductos: products?.length || 0,
    totalMovimientos: 0,
    sinStock: (products || []).filter(product => (stockMap.get(product.id) || 0) <= 0).length,
    stockBajo: (products || []).filter(product => (stockMap.get(product.id) || 0) <= Number(product.stock_min)).length,
    cumpleanos: 0,
    totalClientes: clients || 0,
    valorTotalInventario: (products || []).reduce((sum, product) => sum + (stockMap.get(product.id) || 0) * Number(product.costo_actual), 0),
  };
}
