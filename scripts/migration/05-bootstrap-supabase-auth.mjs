import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usuario = String(process.env.QASO_USER || "master").trim().toLowerCase();
const password = process.env.QASO_PASSWORD || process.env.SUPABASE_MASTER_PASSWORD;
if (!url || !key || !password) throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y QASO_PASSWORD.");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `${usuario}@usuarios.nexoventa.app`;
const { data: listed, error: listError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;
let authUser = listed.users.find(item => item.email === email);
if (authUser) {
  const { data, error } = await db.auth.admin.updateUserById(authUser.id, { password, email_confirm: true, user_metadata: { usuario, nombre: "Administrador" } });
  if (error) throw error;
  authUser = data.user;
} else {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { usuario, nombre: "Administrador" } });
  if (error || !data.user) throw error || new Error("No se pudo crear el usuario master.");
  authUser = data.user;
}
const { error: profileError } = await db.from("usuarios_perfil").upsert({ id: authUser.id, usuario, nombre: "Administrador", rol: "ADMINISTRADOR", perfil_legacy: "MASTER", activo: true, permisos: ["dashboard", "clientes", "ventas", "emisiones", "cobranza", "inventario", "centroGerencial", "reportes", "analisis", "configuracion"], legacy_id: usuario, updated_at: new Date().toISOString() });
if (profileError) throw profileError;
console.log(JSON.stringify({ ok: true, usuario, authUserId: authUser.id }, null, 2));
