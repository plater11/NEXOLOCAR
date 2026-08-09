import { createClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "./config";
import type { Database } from "./types";

let browserClient: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseBrowserClient() {
  const { url, anonKey } = publicSupabaseConfig();
  if (!url || !anonKey) throw new Error("Supabase no está configurado para este entorno.");
  browserClient ??= createClient<Database>(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return browserClient;
}
