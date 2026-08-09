import { recentEvents, searchClients, searchProducts } from "./queries/core";

export const SUPABASE_COMPAT_READS = new Set(["obtenerClientes", "obtenerClientesPreventa", "obtenerCatalogoProductos", "obtenerActividadReciente"]);

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
