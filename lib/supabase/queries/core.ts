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
  const events = data || [];
  const orderIds = events.filter(row => row.entidad === "PEDIDO").map(row => row.entidad_id).filter((id): id is string => Boolean(id));
  const [{ data: orders }] = await Promise.all([
    orderIds.length ? db.from("pedidos").select("id,codigo_pedido,cliente_id,estado_operativo,estado_entrega,estado_cobranza").in("id", orderIds) : Promise.resolve({ data: [] }),
  ]);
  const orderMap = new Map((orders || []).map(row => [row.id, row]));
  const orderClientIds = (orders || []).map(row => row.cliente_id).filter((id): id is string => Boolean(id));
  const { data: clients } = orderClientIds.length ? await db.from("clientes").select("id,nombre,direccion,telefono").in("id", orderClientIds) : { data: [] };
  const clientMap = new Map((clients || []).map(row => [row.id, row]));
  return events.map(event => {
    const order = orderMap.get(event.entidad_id || "");
    const client = clientMap.get(order?.cliente_id || "");
    return { ...event, comentario: event.descripcion, pedido: order?.codigo_pedido || "", cliente: client?.nombre || "", ubicacion: client?.direccion || "", telefono: client?.telefono || "", estado: order?.estado_cobranza || order?.estado_entrega || order?.estado_operativo || "" };
  });
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
  const [{ data: clients, error: clientError }, { data: details, error: detailError }, { data: products, error: productError }, { data: deliveries, error: deliveryError }] = await Promise.all([
    db.from("clientes").select("id,nombre,telefono,direccion"),
    orderIds.length ? db.from("pedido_detalle").select("pedido_id,producto_id,cantidad_presentacion,precio_aplicado,subtotal").in("pedido_id", orderIds) : Promise.resolve({ data: [], error: null }),
    db.from("productos").select("id,codigo,nombre"),
    orderIds.length ? db.from("entregas").select("pedido_id,fecha_entrega,estado").in("pedido_id", orderIds).order("fecha_entrega", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (clientError) throw clientError;
  if (detailError) throw detailError;
  if (productError) throw productError;
  if (deliveryError) throw deliveryError;
  const clientMap = new Map((clients || []).map(client => [client.id, client.nombre]));
  const productMap = new Map((products || []).map(product => [product.id, product]));
  const detailsMap = new Map<string, typeof details>();
  const deliveryMap = new Map<string, { fecha_entrega: string | null; estado: string }>();
  for (const detail of details || []) detailsMap.set(detail.pedido_id, [...(detailsMap.get(detail.pedido_id) || []), detail]);
  for (const delivery of deliveries || []) if (!deliveryMap.has(delivery.pedido_id)) deliveryMap.set(delivery.pedido_id, delivery);
  const text = String(filters.texto || "").trim().toLowerCase();
  return (orders || []).map(order => {
    const items = (detailsMap.get(order.id) || []).map(detail => {
      const product = productMap.get(detail.producto_id);
      return { codigo: product?.codigo || "", nombre: product?.nombre || "Producto", cantidad: Number(detail.cantidad_presentacion), precioUnitario: Number(detail.precio_aplicado), subtotal: Number(detail.subtotal) };
    });
    const client = (clients || []).find(row => row.id === order.cliente_id);
    const delivery = deliveryMap.get(order.id);
    return { ...order, cliente: clientMap.get(order.cliente_id) || "Cliente", telefono: client?.telefono || "", direccion: client?.direccion || "", fecha_entrega: delivery?.fecha_entrega || "", estado_entrega: delivery?.estado || order.estado_entrega, items };
  }).filter(order => !text || `${order.codigo_pedido} ${order.cliente} ${order.telefono} ${order.observaciones || ""}`.toLowerCase().includes(text));
}

export async function operationalSummary() {
  const db = getSupabaseAdminClient();
  const now = new Date();
  const limaParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-");
  const period = `${limaParts[0]}-${limaParts[1]}`;
  const limaDay = limaParts.join("-");
  const from = `${period}-01T00:00:00-05:00`;
  const nextDate = new Date(Number(limaParts[0]), Number(limaParts[1]), 1);
  const nextPeriod = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-01T00:00:00-05:00`;
  const [clientResult, productResult, stockResult, expenseResult, orderResult, paymentResult, renditionResult, periodResult, budgetResult, inventoryResult] = await Promise.all([
    db.from("clientes").select("id", { count: "exact", head: true }).eq("estado", "ACTIVO"),
    db.from("productos").select("id,costo_actual,stock_min").eq("activo", true),
    db.from("stock_actual").select("producto_id,stock_fisico"),
    db.from("gastos").select("id", { count: "exact", head: true }).eq("estado", "PENDIENTE_APROBACION"),
    db.from("pedidos").select("id,cliente_id,fecha,total,estado_operativo,estado_entrega,estado_cobranza").neq("estado_operativo", "ANULADO"),
    db.from("pagos").select("pedido_id,fecha,monto,estado").eq("estado", "APLICADO"),
    db.from("rendiciones").select("id,diferencia,estado").neq("estado", "VALIDADA"),
    db.from("periodos_operativos").select("periodo,estado,cerrado_at,cerrado_por,snapshot").order("periodo", { ascending: false }).limit(12),
    db.from("presupuestos").select("objetivo_ventas").eq("anio", Number(limaParts[0])).eq("mes", Number(limaParts[1])).maybeSingle(),
    db.from("movimientos_inventario").select("producto_id,cantidad,tipo_movimiento,created_at").eq("tipo_movimiento", "INGRESO_COMPRA").gte("created_at", from).lt("created_at", nextPeriod),
  ]);
  const { count: clients, error: clientError } = clientResult;
  const { data: products, error: productError } = productResult;
  const { data: stock, error: stockError } = stockResult;
  const { count: pendingExpenses, error: expenseError } = expenseResult;
  if (clientError) throw clientError;
  if (productError) throw productError;
  if (stockError) throw stockError;
  if (expenseError) throw expenseError;
  for (const result of [orderResult, paymentResult, renditionResult, periodResult, budgetResult, inventoryResult]) if (result.error) throw result.error;
  const stockMap = new Map((stock || []).map(row => [row.producto_id, Number(row.stock_fisico)]));
  const withStock = (products || []).filter(product => (stockMap.get(product.id) || 0) > 0).length;
  const { data: deliveries, error: deliveryError } = await db.from("entregas").select("pedido_id").in("estado", ["ENTREGA_COMPLETA", "ENTREGA_PARCIAL"]).gte("fecha_entrega", `${limaDay}T00:00:00-05:00`).lte("fecha_entrega", `${limaDay}T23:59:59-05:00`);
  if (deliveryError) throw deliveryError;
  const deliveredIds = [...new Set((deliveries || []).map(row => row.pedido_id))];
  const deliveredResult = deliveredIds.length ? await db.from("pedidos").select("id,total").in("id", deliveredIds) : { data: [], error: null };
  if (deliveredResult.error) throw deliveredResult.error;
  const orders = orderResult.data || [];
  const payments = paymentResult.data || [];
  const monthOrders = orders.filter(row => String(row.fecha) >= from && String(row.fecha) < nextPeriod);
  const monthPayments = payments.filter(row => String(row.fecha) >= from && String(row.fecha) < nextPeriod);
  const salesMonth = monthOrders.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const salesToday = monthOrders.filter(row => String(row.fecha).slice(0, 10) === limaDay).reduce((sum, row) => sum + Number(row.total || 0), 0);
  const collectedMonth = monthPayments.reduce((sum, row) => sum + Number(row.monto || 0), 0);
  const paidByOrder = new Map<string, number>();
  payments.forEach(row => paidByOrder.set(row.pedido_id, (paidByOrder.get(row.pedido_id) || 0) + Number(row.monto || 0)));
  const receivableRows = orders.filter(row => Math.max(0, Number(row.total || 0) - (paidByOrder.get(row.id) || 0)) > .01);
  const receivable = receivableRows.reduce((sum, row) => sum + Math.max(0, Number(row.total || 0) - (paidByOrder.get(row.id) || 0)), 0);
  const urgentReceivables = receivableRows.filter(row => row.estado_cobranza === "COBRANZA_URGENTE");
  const productCost = new Map((products || []).map(row => [row.id, Number(row.costo_actual || 0)]));
  const purchasesMonth = (inventoryResult.data || []).reduce((sum, row) => sum + Number(row.cantidad || 0) * (productCost.get(row.producto_id) || 0), 0);
  const approvedExpenses = await db.from("gastos").select("monto").eq("estado", "APROBADO").gte("fecha", `${period}-01`).lt("fecha", nextPeriod.slice(0, 10));
  if (approvedExpenses.error) throw approvedExpenses.error;
  const expensesMonth = (approvedExpenses.data || []).reduce((sum, row) => sum + Number(row.monto || 0), 0);
  const periods = periodResult.data || [];
  const currentPeriod = periods.find(row => String(row.periodo).startsWith(period));
  const previousClose = periods.find(row => row.estado === "CERRADO");
  let previousUser = "Administrador";
  if (previousClose?.cerrado_por) {
    const profile = await db.from("usuarios_perfil").select("nombre").eq("id", previousClose.cerrado_por).maybeSingle();
    if (!profile.error && profile.data?.nombre) previousUser = profile.data.nombre;
  }
  const cashDifference = (renditionResult.data || []).reduce((sum, row) => sum + Math.abs(Number(row.diferencia || 0)), 0);
  const stockLow = (products || []).filter(product => { const value = stockMap.get(product.id) || 0; return value > 0 && value <= Number(product.stock_min || 0); }).length;
  const urgentProducts = (products || []).filter(product => (stockMap.get(product.id) || 0) <= 0).length;
  return {
    totalProductos: products?.length || 0,
    totalMovimientos: 0,
    sinStock: (products || []).filter(product => (stockMap.get(product.id) || 0) <= 0).length,
    conStock: withStock,
    stockBajo: stockLow,
    cumpleanos: 0,
    totalClientes: clients || 0,
    rendicionesPendientes: pendingExpenses || 0,
    entregadosHoy: deliveredResult.data?.length || 0,
    importeEntregadoHoy: (deliveredResult.data || []).reduce((sum, order) => sum + Number(order.total || 0), 0),
    valorTotalInventario: (products || []).reduce((sum, product) => sum + (stockMap.get(product.id) || 0) * Number(product.costo_actual), 0),
    ventasMes: salesMonth,
    ventasHoy: salesToday,
    cobradoMes: collectedMonth,
    porCobrar: receivable,
    clientesPorCobrar: new Set(receivableRows.map(row => row.cliente_id)).size,
    ticketPromedio: monthOrders.length ? salesMonth / monthOrders.length : 0,
    ventasCantidadMes: monthOrders.length,
    metaMensual: Number(budgetResult.data?.objetivo_ventas || 0),
    comprasMes: purchasesMonth,
    gastosMes: expensesMonth,
    resultadoMes: salesMonth - purchasesMonth - expensesMonth,
    compraUrgenteProductos: urgentProducts,
    compraUrgentePedidos: orders.filter(row => row.estado_operativo === "POR_COMPRAR" && String(row.fecha).slice(0, 10) <= limaDay).length,
    cobranzaUrgentePedidos: urgentReceivables.length,
    cobranzaUrgenteMonto: urgentReceivables.reduce((sum, row) => sum + Math.max(0, Number(row.total || 0) - (paidByOrder.get(row.id) || 0)), 0),
    diferenciasCaja: (renditionResult.data || []).filter(row => Math.abs(Number(row.diferencia || 0)) > .01).length,
    diferenciaCajaMonto: cashDifference,
    periodo: {
      periodo: `${period}-01`,
      estado: currentPeriod?.estado || "ABIERTO",
      cierreAnterior: previousClose ? { periodo: previousClose.periodo, fecha: previousClose.cerrado_at, usuario: previousUser } : null,
    },
  };
}
