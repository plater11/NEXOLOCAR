import { NextResponse } from "next/server";
import { dataSourceMode, isSupabaseConfigured } from "../../../lib/supabase/config";
import { compareResult, executeCompatRead, SUPABASE_COMPAT_READS } from "../../../lib/supabase/compat";

const ALLOWED = new Set([
  "loginUsuario", "obtenerSesion", "cerrarSesion", "obtenerResumen", "obtenerCatalogoProductos",
  "obtenerClientes", "obtenerClientesPreventa", "registrarCliente", "limpiarClientesDuplicados", "actualizarCliente", "eliminarCliente",
  "registrarVenta", "obtenerStock", "obtenerListas", "registrarProducto", "actualizarProducto", "registrarMovimiento",
  "registrarMovimientosMasivos", "validarCargaMasivaInventario", "importarCargaMasivaInventario", "obtenerMovimientosIngreso", "obtenerHistorial",
  "obtenerEmisiones", "generarCodigoImpresion", "obtenerCobranzaPedidos", "guardarCobranzaPedido",
  "corregirPedido", "actualizarEstadoOperativoPedido", "obtenerHistorialEstadosPedido",
  "obtenerPreparacionPedido", "guardarPreparacionPedido", "asignarPedidoJornada", "obtenerActividadReciente",
  "registrarGastoOperacion", "obtenerGastosOperacion", "obtenerGastosPendientes", "resolverGastoOperacion",
  "obtenerResumenJornada", "cerrarJornada", "obtenerRendicionDia", "validarRendicionDia",
  "registrarMovimientoFinanciero", "obtenerCentroGerencial", "guardarPlaneamientoMensual", "duplicarPlaneamientoMensualAnterior",
  "obtenerPlaneamientoMensual", "guardarContabilidadDiaria", "obtenerContabilidadDiaria", "obtenerCurvaS",
  "obtenerAnalisis", "obtenerAnalisisVentasTemporal", "obtenerUsuarios", "crearUsuarioSistema",
  "actualizarUsuario", "validarIntegridad", "inicializarHojas", "repararFechasMovimientosVenta"
]);

export async function GET() {
  return NextResponse.json({ ok: true, configured: Boolean(process.env.APPS_SCRIPT_URL), dataSource: dataSourceMode(), supabaseConfigured: isSupabaseConfigured() });
}

export async function POST(request: Request) {
  const endpoint = process.env.APPS_SCRIPT_URL;
  try {
    const body = await request.json() as { fn?: string; args?: unknown[]; token?: string };
    if (!body.fn || !ALLOWED.has(body.fn)) return NextResponse.json({ ok: false, message: "Operación no permitida." }, { status: 403 });
    const mode = dataSourceMode();
    if (mode === "supabase") {
      if (!isSupabaseConfigured()) return NextResponse.json({ ok: false, code: "SUPABASE_NOT_CONFIGURED", message: "Supabase no está configurado." }, { status: 503 });
      if (!SUPABASE_COMPAT_READS.has(body.fn)) return NextResponse.json({ ok: false, code: "SUPABASE_OPERATION_PENDING", message: `La operación ${body.fn} todavía no ha sido validada para el corte.` }, { status: 501 });
      return NextResponse.json({ ok: true, resultado: await executeCompatRead(body.fn, body.args || []) });
    }
    if (!endpoint) return NextResponse.json({ ok: false, code: "NOT_CONFIGURED", message: "Falta configurar APPS_SCRIPT_URL." }, { status: 503 });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 60000);
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify({ fn: body.fn, args: body.args || [], token: body.token || "" }), signal: controller.signal, redirect: "follow" });
    clearTimeout(timer); const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { ok?: boolean; resultado?: unknown };
      if (mode === "dual" && isSupabaseConfigured() && SUPABASE_COMPAT_READS.has(body.fn) && parsed.ok) {
        try { const supabase = await executeCompatRead(body.fn, body.args || []); const comparison = compareResult(body.fn, parsed.resultado, supabase); if (!comparison.matches) console.warn("[DATA_SOURCE_DIFF]", comparison); }
        catch (comparisonError) { console.warn("[DATA_SOURCE_COMPARE_ERROR]", body.fn, comparisonError instanceof Error ? comparisonError.message : comparisonError); }
      }
      return NextResponse.json(parsed, { status: response.ok ? 200 : 502 });
    } catch { return NextResponse.json({ ok: false, message: "Apps Script devolvió una respuesta no válida." }, { status: 502 }); }
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Google Sheets tardó más de 60 segundos. Intenta nuevamente."
      : error instanceof Error ? error.message : "No se pudo contactar Google Sheets.";
    return NextResponse.json({ ok: false, message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
