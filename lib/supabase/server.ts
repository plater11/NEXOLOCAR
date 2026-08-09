import { createClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "./config";
import type { Database } from "./types";

export function getSupabaseServerClient(accessToken?: string) {
  const { url, anonKey } = publicSupabaseConfig();
  if (!url || !anonKey) throw new Error("Supabase no está configurado para este entorno.");
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

export function getSupabaseAdminClient() {
  const { url } = publicSupabaseConfig();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRole) throw new Error("Falta la configuración privada de Supabase.");
  return createClient<Database>(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
}
