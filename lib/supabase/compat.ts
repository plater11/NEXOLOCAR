import { operationalSummary, orderCatalog, productCatalog, recentEvents, searchClients } from "./queries/core";
import { getSupabaseAdminClient } from "./server";

export const SUPABASE_COMPAT_READS = new Set(["obtenerClientes", "obtenerClientesPreventa", "obtenerCatalogoProductos", "obtenerStock", "obtenerEmisiones", "obtenerResumen", "obtenerActividadReciente"]);
export const SUPABASE_CLIENT_MUTATIONS = new Set(["registrarCliente", "actualizarCliente", "eliminarCliente"]);
export const SUPABASE_PRODUCT_MUTATIONS = new Set([
  "registrarProducto", "actualizarProducto", "eliminarProducto", "registrarMovimiento",
  "registrarMovimientosMasivos", "actualizarMovimientoIngreso", "eliminarMovimientoIngreso", "importarCargaMasivaInventario",
]);
export const SUPABASE_ORDER_MUTATIONS = new Set(["registrarVenta"]);

type LegacyClient = {
  id?: string;
  nombre?: string;
  apellidos?: string;
  correo?: string;
  contacto?: string;
  fechaCumpleanos?: string;
  direccion?: string;
  comentarios?: string;
};

type LegacyProduct = {
  codigo?: string;
  codigoOriginal?: string;
  nombre?: string;
  unidad?: string;
  grupo?: string;
  stockMin?: number;
  precioCosto?: number;
  precioVenta?: number;
  imagen?: string;
  promocionActiva?: string;
  cantidadPromo?: number;
  precioPromo?: number;
  descripcionPromo?: string;
  nombrePresentacion?: string;
  factorPresentacion?: number;
  precioPresentacion?: number;
  permiteFraccionamiento?: string;
  fraccionesPermitidas?: string | number[];
  controlaDecimales?: string;
  stock?: number;
};

type LegacySaleItem = {
  codigo?: string;
  cantidad?: number;
  cantidadPresentacion?: number;
  cantidadUnidadesBase?: number;
  factorPresentacion?: number;
  fraccion?: number;
  precioVenta?: number;
  precioPresentacion?: number;
  subtotal?: number;
};

type LegacySale = { cliente?: string; observaciones?: string; solicitudId?: string; items?: LegacySaleItem[] };
type LegacySaleResult = { ok?: boolean; ventaId?: string; total?: number; fecha?: string; clienteId?: string };

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isoDate(value: unknown) {
  const raw = String(value ?? "").trim();
  const dayFirst = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dayFirst) return `${dayFirst[3]}-${dayFirst[2].padStart(2, "0")}-${dayFirst[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function isoDateTime(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return new Date().toISOString();
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}T${(match[4] || "00").padStart(2, "0")}:${match[5] || "00"}:00-05:00`;
}

function sameClient(left: LegacyClient, right: LegacyClient) {
  return normalized(left.nombre) === normalized(right.nombre)
    && normalized(left.apellidos) === normalized(right.apellidos)
    && normalized(left.contacto) === normalized(right.contacto)
    && normalized(left.direccion) === normalized(right.direccion);
}

function yes(value: unknown) {
  return /^(SI|SÍ|TRUE|1)$/i.test(String(value ?? "").trim());
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fractions(value: unknown) {
  const items = Array.isArray(value) ? value : String(value ?? "").split(",");
  return items.map(item => {
    const raw = String(item).trim();
    const parts = raw.split("/").map(Number);
    return parts.length === 2 && parts[1] ? parts[0] / parts[1] : numeric(raw);
  }).filter(item => item > 0 && item <= 1);
}

export async function mirrorClientMutation(fn: string, args: unknown[], sheetClients: LegacyClient[] = []) {
  const db = getSupabaseAdminClient();
  if (fn === "eliminarCliente") {
    const code = String(args[0] || "").trim();
    if (!code) throw new Error("No se recibió el código del cliente eliminado.");
    const { error } = await db.from("clientes").update({ estado: "INACTIVO", updated_at: new Date().toISOString() }).eq("codigo", code);
    if (error) throw error;
    return { operation: fn, code };
  }

  const payload = (args[0] || {}) as LegacyClient;
  const source = fn === "registrarCliente" ? sheetClients.find(client => sameClient(client, payload)) : payload;
  const code = String(source?.id || payload.id || "").trim();
  if (!code) throw new Error("No se pudo resolver el ID creado en Sheets.");
  const fullName = [source?.nombre ?? payload.nombre, source?.apellidos ?? payload.apellidos].filter(Boolean).join(" ").trim();
  const row = {
    codigo: code,
    nombre: fullName || "SIN NOMBRE",
    telefono: String(source?.contacto ?? payload.contacto ?? "").trim() || null,
    direccion: String(source?.direccion ?? payload.direccion ?? "").trim() || null,
    correo: String(source?.correo ?? payload.correo ?? "").trim() || null,
    fecha_nacimiento: isoDate(source?.fechaCumpleanos ?? payload.fechaCumpleanos),
    observaciones: String(source?.comentarios ?? payload.comentarios ?? "").trim() || null,
    estado: "ACTIVO",
    legacy_id: code,
    legacy_source: "SHEETS",
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("clientes").upsert(row, { onConflict: "codigo" });
  if (error) throw error;
  return { operation: fn, code };
}

export async function mirrorProductMutation(fn: string, args: unknown[], sheetProducts: LegacyProduct[]) {
  const db = getSupabaseAdminClient();
  const payload = (args[0] || {}) as LegacyProduct;
  if (fn === "actualizarProducto") {
    const original = String(payload.codigoOriginal || "").trim().toUpperCase();
    const next = String(payload.codigo || "").trim().toUpperCase();
    if (original && next && original !== next) {
      const { error } = await db.from("productos").update({ codigo: next, legacy_id: next, updated_at: new Date().toISOString() }).eq("codigo", original);
      if (error) throw error;
    }
  }
  if (fn === "eliminarProducto") {
    const code = String(args[0] || "").trim().toUpperCase();
    const { error } = await db.from("productos").update({ activo: false, updated_at: new Date().toISOString() }).eq("codigo", code);
    if (error) throw error;
  }

  const productRows = sheetProducts.map(product => ({
    codigo: String(product.codigo || "").trim().toUpperCase(),
    nombre: String(product.nombre || "SIN NOMBRE").trim(),
    unidad_base: String(product.unidad || "Unidades").trim(),
    grupo: String(product.grupo || "General").trim(),
    stock_min: numeric(product.stockMin),
    costo_actual: numeric(product.precioCosto),
    precio_venta: numeric(product.precioVenta),
    imagen: String(product.imagen || "") || null,
    promocion_activa: yes(product.promocionActiva),
    cantidad_promo: numeric(product.cantidadPromo),
    precio_promo: numeric(product.precioPromo),
    descripcion_promo: String(product.descripcionPromo || "") || null,
    permite_fraccionamiento: yes(product.permiteFraccionamiento),
    controla_decimales: yes(product.controlaDecimales),
    activo: true,
    legacy_id: String(product.codigo || "").trim().toUpperCase(),
    legacy_source: "SHEETS",
    updated_at: new Date().toISOString(),
  })).filter(product => product.codigo);
  const { error: productError } = await db.from("productos").upsert(productRows, { onConflict: "codigo" });
  if (productError) throw productError;

  const codes = productRows.map(product => product.codigo);
  const [{ data: storedProducts, error: readError }, { data: warehouses, error: warehouseError }] = await Promise.all([
    db.from("productos").select("id,codigo").in("codigo", codes),
    db.from("almacenes").select("id,codigo").eq("codigo", "PRINCIPAL").limit(1),
  ]);
  if (readError) throw readError;
  if (warehouseError) throw warehouseError;
  const warehouseId = warehouses?.[0]?.id;
  if (!warehouseId) throw new Error("No existe el almacén PRINCIPAL en Supabase.");
  const ids = new Map((storedProducts || []).map(product => [product.codigo, product.id]));

  const presentationRows = sheetProducts.map(product => {
    const code = String(product.codigo || "").trim().toUpperCase();
    return {
      producto_id: ids.get(code) || "",
      nombre: String(product.nombrePresentacion || product.unidad || "Unidad").trim(),
      factor: Math.max(numeric(product.factorPresentacion), 1),
      precio: numeric(product.precioPresentacion || product.precioVenta),
      permite_fraccionamiento: yes(product.permiteFraccionamiento),
      fracciones_permitidas: fractions(product.fraccionesPermitidas),
      es_compra: false,
      es_venta: true,
      activo: true,
      legacy_id: code,
    };
  }).filter(row => row.producto_id);
  const stockRows = sheetProducts.map(product => {
    const code = String(product.codigo || "").trim().toUpperCase();
    return {
      producto_id: ids.get(code) || "",
      almacen_id: warehouseId,
      stock_fisico: numeric(product.stock),
      stock_reservado: 0,
      stock_en_ruta: 0,
      updated_at: new Date().toISOString(),
    };
  }).filter(row => row.producto_id);
  const [{ error: presentationError }, { error: stockError }] = await Promise.all([
    db.from("presentaciones").upsert(presentationRows, { onConflict: "producto_id,nombre" }),
    db.from("stock_actual").upsert(stockRows, { onConflict: "producto_id,almacen_id" }),
  ]);
  if (presentationError) throw presentationError;
  if (stockError) throw stockError;
  return { operation: fn, products: productRows.length, presentations: presentationRows.length, stock: stockRows.length };
}

export async function mirrorSaleMutation(args: unknown[], result: LegacySaleResult, sheetClients: LegacyClient[]) {
  if (!result.ok || !result.ventaId) throw new Error("Apps Script no confirmó la venta para sincronizarla.");
  const db = getSupabaseAdminClient();
  const sale = (args[0] || {}) as LegacySale;
  const clientCode = String(result.clienteId || "").trim();
  const sheetClient = sheetClients.find(client => String(client.id || "") === clientCode);
  if (sheetClient) await mirrorClientMutation("actualizarCliente", [sheetClient]);

  let clientRequest = db.from("clientes").select("id,codigo,nombre").limit(1);
  clientRequest = clientCode
    ? clientRequest.eq("codigo", clientCode)
    : clientRequest.ilike("nombre", String(sale.cliente || "").trim());
  const { data: clients, error: clientError } = await clientRequest;
  if (clientError) throw clientError;
  const clientId = clients?.[0]?.id;
  if (!clientId) throw new Error("El cliente de la venta no existe en Supabase.");

  const items = Array.isArray(sale.items) ? sale.items : [];
  const codes = [...new Set(items.map(item => String(item.codigo || "").trim().toUpperCase()).filter(Boolean))];
  const { data: products, error: productError } = await db.from("productos").select("id,codigo").in("codigo", codes);
  if (productError) throw productError;
  const productIds = new Map((products || []).map(product => [product.codigo, product.id]));
  if (productIds.size !== codes.length) throw new Error("Uno o más productos de la venta no existen en Supabase.");

  const total = numeric(result.total);
  const orderRow = {
    codigo_pedido: result.ventaId,
    cliente_id: clientId,
    fecha: isoDateTime(result.fecha),
    subtotal: total,
    descuento: 0,
    total,
    estado_operativo: "POR_COMPRAR",
    estado_entrega: "PENDIENTE",
    estado_cobranza: "NO_APLICA",
    estado_boleta: "NO_EMITIDA",
    observaciones: String(sale.observaciones || "") || null,
    legacy_id: result.ventaId,
    idempotency_key: String(sale.solicitudId || `SHEETS:${result.ventaId}`),
    updated_at: new Date().toISOString(),
  };
  const { data: order, error: orderError } = await db.from("pedidos").upsert(orderRow, { onConflict: "codigo_pedido" }).select("id").single();
  if (orderError) throw orderError;

  const details = items.map(item => {
    const code = String(item.codigo || "").trim().toUpperCase();
    const quantity = numeric(item.cantidadPresentacion ?? item.cantidad);
    const factor = Math.max(numeric(item.factorPresentacion), 1);
    const price = numeric(item.precioPresentacion ?? item.precioVenta);
    return {
      pedido_id: order.id,
      producto_id: productIds.get(code) || "",
      presentacion_id: null,
      cantidad_presentacion: quantity,
      fraccion: numeric(item.fraccion),
      factor_presentacion: factor,
      cantidad_unidades_base: numeric(item.cantidadUnidadesBase) || quantity * factor,
      precio_presentacion: price,
      precio_aplicado: price,
      subtotal: numeric(item.subtotal) || quantity * price,
      legacy_id: `${result.ventaId}:${code}`,
    };
  });
  const { error: deleteError } = await db.from("pedido_detalle").delete().eq("pedido_id", order.id);
  if (deleteError) throw deleteError;
  const { error: detailsError } = await db.from("pedido_detalle").insert(details);
  if (detailsError) throw detailsError;
  await db.from("eventos").insert({ tipo: "NUEVO_PEDIDO", entidad: "PEDIDO", entidad_id: order.id, descripcion: "Pedido sincronizado desde Preventa", importe: total, metadata: { ventaId: result.ventaId } });
  return { operation: "registrarVenta", orderId: order.id, code: result.ventaId, details: details.length };
}

export async function executeCompatRead(fn: string, args: unknown[]) {
  if (fn === "obtenerClientes" || fn === "obtenerClientesPreventa") {
    const rows = await searchClients(String(args[0] || ""), fn === "obtenerClientesPreventa" ? 500 : 100);
    return rows.map(row => ({ id: row.codigo, nombre: row.nombre, apellidos: "", correo: row.correo || "", contacto: row.telefono || "", fechaCumpleanos: row.fecha_nacimiento || "", direccion: row.direccion || "", comentarios: row.observaciones || "", estado: row.estado }));
  }
  if (fn === "obtenerCatalogoProductos") {
    const rows = await productCatalog();
    return rows.map(row => ({ codigo: row.codigo, nombre: row.nombre, unidad: row.unidad_base, grupo: row.grupo, stockMin: Number(row.stock_min), precioCosto: Number(row.costo_actual), precioVenta: Number(row.precio_venta), imagen: row.imagen || "", promocionActiva: row.promocion_activa ? "SI" : "NO", cantidadPromo: Number(row.cantidad_promo), precioPromo: Number(row.precio_promo), descripcionPromo: row.descripcion_promo || "", nombrePresentacion: row.presentation?.nombre || row.unidad_base, factorPresentacion: Number(row.presentation?.factor || 1), precioPresentacion: Number(row.presentation?.precio || row.precio_venta), permiteFraccionamiento: row.permite_fraccionamiento ? "SI" : "NO", fraccionesPermitidas: (row.presentation?.fracciones_permitidas || []).join(","), controlaDecimales: row.controla_decimales ? "SI" : "NO", stock: Number(row.stock?.stock_fisico || 0) }));
  }
  if (fn === "obtenerStock") return executeCompatRead("obtenerCatalogoProductos", args);
  if (fn === "obtenerResumen") return operationalSummary();
  if (fn === "obtenerEmisiones") {
    const rows = await orderCatalog((args[0] || {}) as Record<string, unknown>);
    return rows.map(row => ({ ventaId: row.codigo_pedido, fecha: row.fecha, cliente: row.cliente, total: Number(row.total), itemsCount: row.items.reduce((sum, item) => sum + Number(item.cantidad), 0), lineas: row.items.length, observaciones: row.observaciones || "", estadoOperativo: row.estado_operativo, estadoEntrega: row.estado_entrega, estadoCobro: row.estado_cobranza, codigoImpresion: row.estado_boleta === "EMITIDA" ? "EMITIDA" : "", items: row.items }));
  }
  if (fn === "obtenerActividadReciente") {
    const rows = await recentEvents(Number(args[0]) || 15);
    return rows.map(row => ({ id: row.id, fecha: row.created_at, fechaOrden: new Date(row.created_at).getTime(), tipo: row.tipo, ventaId: row.entidad === "PEDIDO" ? row.entidad_id || "" : "", cliente: "", descripcion: row.descripcion, monto: Number(row.importe), usuario: row.usuario_id || "" }));
  }
  throw new Error(`La operación ${fn} todavía no está habilitada en Supabase.`);
}

export function compareResult(fn: string, sheets: unknown, supabase: unknown) {
  const sheetsCount = Array.isArray(sheets) ? sheets.length : null;
  const supabaseCount = Array.isArray(supabase) ? supabase.length : null;
  return { fn, sheetsCount, supabaseCount, matches: sheetsCount === supabaseCount };
}
