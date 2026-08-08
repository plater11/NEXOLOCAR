import { NextResponse } from "next/server";

const ALLOWED = new Set([
  "loginUsuario", "obtenerSesion", "cerrarSesion", "obtenerResumen", "obtenerCatalogoProductos",
  "obtenerClientes", "obtenerClientesPreventa", "registrarCliente", "limpiarClientesDuplicados", "actualizarCliente", "eliminarCliente",
  "registrarVenta", "obtenerStock", "obtenerListas", "registrarProducto", "actualizarProducto", "registrarMovimiento",
  "registrarMovimientosMasivos", "validarCargaMasivaInventario", "importarCargaMasivaInventario", "obtenerMovimientosIngreso", "obtenerHistorial",
  "obtenerEmisiones", "generarCodigoImpresion", "obtenerCobranzaPedidos", "guardarCobranzaPedido",
  "corregirPedido", "actualizarEstadoOperativoPedido", "obtenerHistorialEstadosPedido",
  "registrarGastoOperacion", "obtenerGastosOperacion", "obtenerGastosPendientes", "resolverGastoOperacion",
  "obtenerResumenJornada", "cerrarJornada", "obtenerRendicionDia", "validarRendicionDia",
  "registrarMovimientoFinanciero", "obtenerCentroGerencial", "guardarPlaneamientoMensual",
  "obtenerPlaneamientoMensual", "guardarContabilidadDiaria", "obtenerContabilidadDiaria", "obtenerCurvaS",
  "obtenerAnalisis", "obtenerAnalisisVentasTemporal", "obtenerUsuarios", "crearUsuarioSistema",
  "actualizarUsuario", "validarIntegridad", "inicializarHojas", "repararFechasMovimientosVenta"
]);

export async function GET() {
  return NextResponse.json({ ok: true, configured: Boolean(process.env.APPS_SCRIPT_URL) });
}

export async function POST(request: Request) {
  const endpoint = process.env.APPS_SCRIPT_URL;
  if (!endpoint) return NextResponse.json({ ok: false, code: "NOT_CONFIGURED", message: "Falta configurar APPS_SCRIPT_URL." }, { status: 503 });
  try {
    const body = await request.json() as { fn?: string; args?: unknown[]; token?: string };
    if (!body.fn || !ALLOWED.has(body.fn)) return NextResponse.json({ ok: false, message: "Operación no permitida." }, { status: 403 });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 60000);
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify({ fn: body.fn, args: body.args || [], token: body.token || "" }), signal: controller.signal, redirect: "follow" });
    clearTimeout(timer); const text = await response.text();
    try { return NextResponse.json(JSON.parse(text), { status: response.ok ? 200 : 502 }); } catch { return NextResponse.json({ ok: false, message: "Apps Script devolvió una respuesta no válida." }, { status: 502 }); }
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Google Sheets tardó más de 60 segundos. Intenta nuevamente."
      : error instanceof Error ? error.message : "No se pudo contactar Google Sheets.";
    return NextResponse.json({ ok: false, message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
