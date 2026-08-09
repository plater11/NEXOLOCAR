import { NextResponse } from "next/server";
import { dataSourceStatus } from "../../../lib/data-source";
import { getSupabaseAdminClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const status = dataSourceStatus();
  const checkDatabase = new URL(request.url).searchParams.get("check") === "1";
  if (!checkDatabase) return NextResponse.json({ ok: true, ...status }, { headers: { "Cache-Control": "no-store" } });
  try {
    const db = getSupabaseAdminClient();
    const [clientes, productos, pedidos] = await Promise.all([
      db.from("clientes").select("id", { count: "exact", head: true }),
      db.from("productos").select("id", { count: "exact", head: true }),
      db.from("pedidos").select("id", { count: "exact", head: true }),
    ]);
    const errors = [clientes.error, productos.error, pedidos.error].filter(Boolean).map(error => error?.message);
    return NextResponse.json({
      ok: errors.length === 0,
      ...status,
      database: { connected: errors.length === 0, counts: { clientes: clientes.count, productos: productos.count, pedidos: pedidos.count }, errors },
    }, { status: errors.length ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      ...status,
      database: { connected: false, counts: null, errors: [error instanceof Error ? error.message : "No se pudo consultar Supabase."] },
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
