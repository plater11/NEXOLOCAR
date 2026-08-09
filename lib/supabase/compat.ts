import { recentEvents, searchClients, searchProducts } from "./queries/core";
import { getSupabaseAdminClient } from "./server";

export const SUPABASE_COMPAT_READS = new Set(["obtenerClientes", "obtenerClientesPreventa", "obtenerCatalogoProductos", "obtenerActividadReciente"]);
export const SUPABASE_CLIENT_MUTATIONS = new Set(["registrarCliente", "actualizarCliente", "eliminarCliente"]);

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
