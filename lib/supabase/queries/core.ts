import { getSupabaseServerClient } from "../server";

export async function searchClients(query: string, limit = 25) {
  const db = getSupabaseServerClient();
  const term = query.trim().replace(/[%_,]/g, " ");
  let request = db.from("clientes").select("id,codigo,nombre,telefono,direccion,correo,fecha_nacimiento,observaciones,estado").eq("estado", "ACTIVO").order("nombre").limit(limit);
  if (term) request = request.or(`codigo.ilike.%${term}%,nombre.ilike.%${term}%,telefono.ilike.%${term}%,direccion.ilike.%${term}%`);
  const { data, error } = await request;
  if (error) throw error;
  return data || [];
}

export async function searchProducts(query: string, limit = 50) {
  const db = getSupabaseServerClient();
  const term = query.trim().replace(/[%_,]/g, " ");
  let request = db.from("productos").select("id,codigo,nombre,unidad_base,costo_actual,precio_venta,permite_fraccionamiento,activo").eq("activo", true).order("nombre").limit(limit);
  if (term) request = request.or(`codigo.ilike.%${term}%,nombre.ilike.%${term}%`);
  const { data, error } = await request;
  if (error) throw error;
  return data || [];
}

export async function recentEvents(limit = 15) {
  const db = getSupabaseServerClient();
  const { data, error } = await db.from("eventos").select("id,tipo,entidad,entidad_id,descripcion,importe,usuario_id,created_at,metadata").order("created_at", { ascending: false }).limit(Math.min(50, limit));
  if (error) throw error;
  return data || [];
}
