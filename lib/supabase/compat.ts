import { recentEvents, searchClients, searchProducts } from "./queries/core";
import { getSupabaseAdminClient } from "./server";

export const SUPABASE_COMPAT_READS = new Set(["obtenerClientes", "obtenerClientesPreventa", "obtenerCatalogoProductos", "obtenerActividadReciente"]);
export const SUPABASE_CLIENT_MUTATIONS = new Set(["registrarCliente", "actualizarCliente", "eliminarCliente"]);
export const SUPABASE_PRODUCT_MUTATIONS = new Set([
  "registrarProducto", "actualizarProducto", "eliminarProducto", "registrarMovimiento",
  "registrarMovimientosMasivos", "actualizarMovimientoIngreso", "eliminarMovimientoIngreso", "importarCargaMasivaInventario",
]);

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

export async function executeCompatRead(fn: string, args: unknown[]) {
  if (fn === "obtenerClientes" || fn === "obtenerClientesPreventa") {
    const rows = await searchClients(String(args[0] || ""), fn === "obtenerClientesPreventa" ? 500 : 100);
    return rows.map(row => ({ id: row.codigo, nombre: row.nombre, apellidos: "", correo: row.correo || "", contacto: row.telefono || "", fechaCumpleanos: row.fecha_nacimiento || "", direccion: row.direccion || "", comentarios: row.observaciones || "", estado: row.estado }));
  }
  if (fn === "obtenerCatalogoProductos") {
    const rows = await searchProducts(String(args[0] || ""), 1000);
    return rows.map(row => ({ codigo: row.codigo, nombre: row.nombre, unidad: row.unidad_base, precioCosto: Number(row.costo_actual), precioVenta: Number(row.precio_venta), permiteFraccionamiento: row.permite_fraccionamiento ? "SI" : "NO", stock: 0 }));
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
