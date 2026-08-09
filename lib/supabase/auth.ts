import { getSupabaseAdminClient, getSupabaseServerClient } from "./server";

export type UserPayload = { usuario?: string; originalUsuario?: string; nombre?: string; password?: string; perfil?: string; estado?: string; comentarios?: string; permisos?: string[] };
const defaults: Record<string, string[]> = {
  MASTER: ["dashboard", "clientes", "ventas", "emisiones", "cobranza", "inventario", "centroGerencial", "reportes", "analisis", "configuracion"],
  PREVENTA: ["dashboard", "clientes", "ventas", "emisiones", "cobranza"],
  COMPRADOR: ["dashboard", "emisiones", "inventario", "reportes", "analisis"],
  REPARTIDOR: ["dashboard", "emisiones", "cobranza"], FINANZAS: ["dashboard", "cobranza", "centroGerencial", "reportes", "analisis"],
};
const clean = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
const email = (value: string) => `${clean(value)}@usuarios.nexoventa.app`;
function legacy(value: unknown) { const p = String(value || "PREVENTA").toUpperCase(); return p === "ADMINISTRADOR" ? "MASTER" : p === "PREVENTISTA" ? "PREVENTA" : p === "ALMACENERO" ? "COMPRADOR" : p; }
function role(value: unknown) { const p = legacy(value); return p === "MASTER" ? "ADMINISTRADOR" : p === "PREVENTA" ? "PREVENTISTA" : p === "COMPRADOR" ? "ALMACENERO" : p; }
function result(profile: Record<string, unknown>, token: string) { const perfil = legacy(profile.perfil_legacy || profile.rol); const assigned = Array.isArray(profile.permisos) ? profile.permisos as string[] : []; return { ok: true, token, usuario: String(profile.usuario || ""), nombre: String(profile.nombre || profile.usuario || "Usuario"), perfil, permisos: assigned.length ? assigned : defaults[perfil] || ["dashboard"] }; }

export async function loginSupabase(user: unknown, password: unknown) {
  const usuario = clean(user); if (!usuario || !String(password || "")) throw new Error("Ingresa usuario y contraseña.");
  const { data, error } = await getSupabaseServerClient().auth.signInWithPassword({ email: email(usuario), password: String(password) });
  if (error || !data.session) throw new Error("Usuario o contraseña incorrectos.");
  const admin = getSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin.from("usuarios_perfil").select("*").eq("id", data.user.id).maybeSingle();
  if (profileError || !profile || profile.activo === false) throw new Error("Usuario inactivo o sin perfil autorizado.");
  await admin.from("usuarios_perfil").update({ ultimo_login: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", data.user.id);
  return result(profile as Record<string, unknown>, data.session.access_token);
}

export async function requireSupabaseSession(token: string) {
  if (!token) throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  const admin = getSupabaseAdminClient(); const { data: auth, error } = await admin.auth.getUser(token);
  if (error || !auth.user) throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  const { data: profile, error: profileError } = await admin.from("usuarios_perfil").select("*").eq("id", auth.user.id).maybeSingle();
  if (profileError || !profile || profile.activo === false) throw new Error("Usuario inactivo o sin permiso.");
  return { user: auth.user, profile: profile as Record<string, unknown>, session: result(profile as Record<string, unknown>, token) };
}
export async function logoutSupabase(token: string) { if (token) await getSupabaseAdminClient().auth.admin.signOut(token, "local"); return "Sesión cerrada correctamente."; }
async function master(token: string) { const current = await requireSupabaseSession(token); if (legacy(current.profile.perfil_legacy || current.profile.rol) !== "MASTER") throw new Error("Esta operación requiere perfil MASTER."); return current; }

export async function listSupabaseUsers(token: string) {
  await master(token); const { data, error } = await getSupabaseAdminClient().from("usuarios_perfil").select("*").order("nombre"); if (error) throw error;
  return (data || []).map(row => ({ usuario: row.usuario || "", nombre: row.nombre, perfil: legacy(row.perfil_legacy || row.rol), estado: row.activo ? "ACTIVO" : "INACTIVO", fechaCreacion: row.created_at, ultimoLogin: row.ultimo_login || "", comentarios: row.comentarios || "", permisos: row.permisos || [] }));
}

export async function createSupabaseUser(token: string, payload: UserPayload) {
  await master(token); const usuario = clean(payload.usuario), password = String(payload.password || ""); if (!usuario || password.length < 8) throw new Error("Indica un usuario y una contraseña de al menos 8 caracteres.");
  const perfil = legacy(payload.perfil), admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email: email(usuario), password, email_confirm: true, user_metadata: { usuario, nombre: payload.nombre || usuario } }); if (error || !data.user) throw error || new Error("No se pudo crear el usuario.");
  const { error: profileError } = await admin.from("usuarios_perfil").insert({ id: data.user.id, usuario, nombre: String(payload.nombre || usuario), rol: role(perfil), perfil_legacy: perfil, activo: String(payload.estado || "ACTIVO").toUpperCase() === "ACTIVO", permisos: payload.permisos?.length ? payload.permisos : defaults[perfil], comentarios: String(payload.comentarios || ""), legacy_id: usuario });
  if (profileError) { await admin.auth.admin.deleteUser(data.user.id); throw profileError; } return "Usuario creado correctamente en Supabase Auth.";
}

export async function updateSupabaseUser(token: string, payload: UserPayload) {
  const current = await master(token), original = clean(payload.originalUsuario || payload.usuario), usuario = clean(payload.usuario), admin = getSupabaseAdminClient();
  const { data: stored, error } = await admin.from("usuarios_perfil").select("*").eq("usuario", original).maybeSingle(); if (error || !stored) throw error || new Error("Usuario no encontrado.");
  const perfil = legacy(payload.perfil || stored.perfil_legacy || stored.rol), active = String(payload.estado || "ACTIVO").toUpperCase() === "ACTIVO"; if (stored.id === current.user.id && !active) throw new Error("No puedes desactivar tu propia cuenta.");
  const authUpdate: { email?: string; password?: string; user_metadata: Record<string, string> } = { user_metadata: { usuario, nombre: String(payload.nombre || usuario) } }; if (usuario !== original) authUpdate.email = email(usuario); if (payload.password) { if (payload.password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres."); authUpdate.password = payload.password; }
  const { error: authError } = await admin.auth.admin.updateUserById(stored.id, authUpdate); if (authError) throw authError;
  const { error: updateError } = await admin.from("usuarios_perfil").update({ usuario, nombre: String(payload.nombre || usuario), rol: role(perfil), perfil_legacy: perfil, activo: active, permisos: payload.permisos?.length ? payload.permisos : defaults[perfil], comentarios: String(payload.comentarios || ""), updated_at: new Date().toISOString() }).eq("id", stored.id); if (updateError) throw updateError; return "Usuario actualizado correctamente.";
}

export async function deleteSupabaseUser(token: string, value: unknown) {
  const current = await master(token), admin = getSupabaseAdminClient(); const { data, error } = await admin.from("usuarios_perfil").select("id").eq("usuario", clean(value)).maybeSingle(); if (error || !data) throw error || new Error("Usuario no encontrado."); if (data.id === current.user.id) throw new Error("No puedes eliminar tu propia cuenta."); const { error: deleteError } = await admin.auth.admin.deleteUser(data.id); if (deleteError) throw deleteError; return "Usuario eliminado correctamente.";
}
