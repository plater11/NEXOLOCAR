import { dataSourceMode, isSupabaseConfigured, supabaseEnvironment } from "./supabase/config";

export function dataSourceStatus() {
  const mode = dataSourceMode();
  return {
    mode,
    supabaseConfigured: isSupabaseConfigured(),
    environment: supabaseEnvironment(),
    label: mode === "sheets" ? "SHEETS" : `SUPABASE ${supabaseEnvironment().toUpperCase()}${mode === "dual" ? " · DUAL" : ""}`,
  };
}
