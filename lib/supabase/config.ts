import type { DataSourceMode, SupabaseEnvironment } from "./types";

export function dataSourceMode(): DataSourceMode {
  const value = String(process.env.DATA_SOURCE || "sheets").toLowerCase();
  return value === "dual" || value === "supabase" ? value : "sheets";
}

export function supabaseEnvironment(): SupabaseEnvironment {
  return process.env.SUPABASE_ENVIRONMENT === "production" ? "production" : "test";
}

export function publicSupabaseConfig() {
  return { url: process.env.NEXT_PUBLIC_SUPABASE_URL || "", anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" };
}

export function isSupabaseConfigured() {
  const { url, anonKey } = publicSupabaseConfig();
  return Boolean(url && anonKey);
}
