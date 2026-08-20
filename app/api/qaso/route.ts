import { NextResponse } from "next/server";
import { dataSourceMode, isSupabaseConfigured } from "../../../lib/supabase/config";
import { compareResult, executeCompatRead, mirrorClientMutation, mirrorProductMutation, mirrorSaleMutation, SUPABASE_CLIENT_MUTATIONS, SUPABASE_COMPAT_READS, SUPABASE_ORDER_MUTATIONS, SUPABASE_PRODUCT_MUTATIONS } from "../../../lib/supabase/compat";
import { createSupabaseUser, deleteSupabaseUser, listSupabaseUsers, loginSupabase, logoutSupabase, requireSupabaseSession, updateSupabaseUser, type UserPayload } from "../../../lib/supabase/auth";
import { assignNativeJourney, bulkNativeOrders, closeNativeJourney, closeNativeOperationalPeriod, correctNativeOrder, createNativeSale, deleteNativeClient, deleteNativeProduct, duplicateNativePlan, getNativeAccounting, getNativeAnalysis, getNativeBulkStockTemplate, getNativeCollections, getNativeCurve, getNativeExpenses, getNativeFinanceSnapshot, getNativeInventoryHistory, getNativeJourneySummary, getNativeLists, getNativeOrderHistory, getNativePlan, getNativePreparation, getNativePurchaseConsolidation, getNativeRendition, getNativeStockBatches, importNativeBulkStock, issueNativePrintCode, processNativeCollection, registerNativeExpense, registerNativeInventoryMovement, resolveNativeExpense, revertNativeStockBatch, saveNativeAccounting, saveNativeClient, saveNativeFinancialMovement, saveNativePlan, saveNativePreparation, saveNativeProduct, updateNativeOrderState, validateNativeBulkStock } from "../../../lib/supabase/operations";

const ALLOWED = new Set([
  "loginUsuario", "obtenerSesion", "cerrarSesion", "obtenerResumen", "cerrarPeriodoOperativo", "obtenerCatalogoProductos",
  "obtenerClientes", "obtenerClientesPreventa", "registrarCliente", "limpiarClientesDuplicados", "actualizarCliente", "eliminarCliente",
  "registrarVenta", "obtenerStock", "obtenerListas", "registrarProducto", "actualizarProducto", "eliminarProducto", "registrarMovimiento",
  "registrarMovimientosMasivos", "validarCargaMasivaInventario", "importarCargaMasivaInventario", "obtenerPlantillaCargaMasiva", "obtenerLotesStock", "revertirCargaMasivaStock", "obtenerMovimientosIngreso", "obtenerHistorial",
  "obtenerEmisiones", "generarCodigoImpresion", "obtenerCobranzaPedidos", "guardarCobranzaPedido",
  "corregirPedido", "actualizarEstadoOperativoPedido", "obtenerHistorialEstadosPedido",
  "obtenerPreparacionPedido", "guardarPreparacionPedido", "asignarPedidoJornada", "obtenerConsolidadoCompra", "actualizarPedidosMasivo", "obtenerActividadReciente",
  "registrarGastoOperacion", "obtenerGastosOperacion", "obtenerGastosPendientes", "resolverGastoOperacion",
  "obtenerResumenJornada", "cerrarJornada", "obtenerRendicionDia", "validarRendicionDia",
  "registrarMovimientoFinanciero", "obtenerCentroGerencial", "obtenerResumenFinanciero", "guardarPlaneamientoMensual", "duplicarPlaneamientoMensualAnterior",
  "obtenerPlaneamientoMensual", "guardarContabilidadDiaria", "obtenerContabilidadDiaria", "obtenerCurvaS",
  "obtenerAnalisis", "obtenerAnalisisVentasTemporal", "obtenerUsuarios", "crearUsuarioSistema",
  "actualizarUsuario", "eliminarUsuarioSistema", "validarIntegridad", "inicializarHojas", "repararFechasMovimientosVenta"
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
    if (mode === "supabase" && isSupabaseConfigured()) {
      try {
        if (body.fn === "loginUsuario") return NextResponse.json({ ok: true, resultado: await loginSupabase(body.args?.[0], body.args?.[1]) });
        if (body.fn === "obtenerSesion") return NextResponse.json({ ok: true, resultado: (await requireSupabaseSession(String(body.args?.[0] || body.token || ""))).session });
        if (body.fn === "cerrarSesion") return NextResponse.json({ ok: true, resultado: await logoutSupabase(String(body.args?.[0] || body.token || "")) });
        const current = await requireSupabaseSession(String(body.token || ""));
        const profile = String(current.profile.perfil_legacy || current.profile.rol || "").toUpperCase();
        if (body.fn === "cerrarPeriodoOperativo") {
          if (!["MASTER", "ADMINISTRADOR"].includes(profile)) throw new Error("Esta operación requiere perfil administrador.");
          return NextResponse.json({ ok: true, resultado: await closeNativeOperationalPeriod(current.user.id) });
        }
        if (body.fn === "obtenerUsuarios") return NextResponse.json({ ok: true, resultado: await listSupabaseUsers(String(body.token || "")) });
        if (body.fn === "crearUsuarioSistema") return NextResponse.json({ ok: true, resultado: await createSupabaseUser(String(body.token || ""), (body.args?.[0] || {}) as UserPayload) });
        if (body.fn === "actualizarUsuario") return NextResponse.json({ ok: true, resultado: await updateSupabaseUser(String(body.token || ""), (body.args?.[0] || {}) as UserPayload) });
        if (body.fn === "eliminarUsuarioSistema") return NextResponse.json({ ok: true, resultado: await deleteSupabaseUser(String(body.token || ""), body.args?.[0]) });
        if (["registrarCliente","actualizarCliente"].includes(body.fn)) return NextResponse.json({ok:true,resultado:await saveNativeClient((body.args?.[0]||{}) as Record<string,unknown>)});
        if (body.fn === "eliminarCliente") return NextResponse.json({ok:true,resultado:await deleteNativeClient(body.args?.[0])});
        if (["registrarProducto","actualizarProducto"].includes(body.fn)) return NextResponse.json({ok:true,resultado:await saveNativeProduct((body.args?.[0]||{}) as Record<string,unknown>)});
        if (body.fn === "eliminarProducto") return NextResponse.json({ok:true,resultado:await deleteNativeProduct(body.args?.[0])});
        if (body.fn === "registrarMovimiento") return NextResponse.json({ok:true,resultado:await registerNativeInventoryMovement(String(body.token||""),(body.args?.[0]||{}) as Record<string,unknown>)});
        if (body.fn === "registrarMovimientosMasivos") { const rows=Array.isArray(body.args?.[0])?body.args[0]:[]; for(const row of rows) await registerNativeInventoryMovement(String(body.token||""),row as Record<string,unknown>); return NextResponse.json({ok:true,resultado:`${rows.length} movimiento(s) registrados correctamente.`}); }
        if (body.fn === "obtenerPlantillaCargaMasiva") return NextResponse.json({ok:true,resultado:await getNativeBulkStockTemplate()});
        if (body.fn === "validarCargaMasivaInventario") return NextResponse.json({ok:true,resultado:await validateNativeBulkStock(Array.isArray(body.args?.[0]) ? body.args[0] : [])});
        if (body.fn === "importarCargaMasivaInventario") return NextResponse.json({ok:true,resultado:await importNativeBulkStock(current.user.id,Array.isArray(body.args?.[0]) ? body.args[0] : [],String(body.args?.[1] || crypto.randomUUID()))});
        if (body.fn === "obtenerLotesStock") return NextResponse.json({ok:true,resultado:await getNativeStockBatches()});
        if (body.fn === "revertirCargaMasivaStock") {
          if (!["MASTER","ADMINISTRADOR"].includes(profile)) throw new Error("Esta operación requiere perfil administrador.");
          return NextResponse.json({ok:true,resultado:await revertNativeStockBatch(current.user.id,body.args?.[0],body.args?.[1])});
        }
        if (body.fn === "obtenerListas") return NextResponse.json({ok:true,resultado:await getNativeLists()});
        if (["obtenerHistorial","obtenerMovimientosIngreso"].includes(body.fn)) return NextResponse.json({ok:true,resultado:await getNativeInventoryHistory()});
        if(body.fn==="actualizarEstadoOperativoPedido")return NextResponse.json({ok:true,resultado:await updateNativeOrderState(current.user.id,(body.args?.[0]||{}) as Record<string,unknown>)});
        if(body.fn==="obtenerHistorialEstadosPedido")return NextResponse.json({ok:true,resultado:await getNativeOrderHistory(body.args?.[0])});
        if(body.fn==="generarCodigoImpresion")return NextResponse.json({ok:true,resultado:await issueNativePrintCode(body.args?.[0])});
        if(body.fn==="corregirPedido")return NextResponse.json({ok:true,resultado:await correctNativeOrder(String(body.token||""),(body.args?.[0]||{}) as Record<string,unknown>)});
        if(body.fn==="registrarMovimientoFinanciero")return NextResponse.json({ok:true,resultado:await saveNativeFinancialMovement(current.user.id,(body.args?.[0]||{}) as Record<string,unknown>)});
        if(body.fn==="obtenerResumenFinanciero")return NextResponse.json({ok:true,resultado:await getNativeFinanceSnapshot(body.args?.[0])});
        if(body.fn==="obtenerPlaneamientoMensual")return NextResponse.json({ok:true,resultado:await getNativePlan(body.args?.[0])});
        if(body.fn==="guardarPlaneamientoMensual")return NextResponse.json({ok:true,resultado:await saveNativePlan((body.args?.[0]||{}) as Record<string,unknown>)});
        if(body.fn==="duplicarPlaneamientoMensualAnterior")return NextResponse.json({ok:true,resultado:await duplicateNativePlan(body.args?.[0])});
        if(body.fn==="obtenerContabilidadDiaria")return NextResponse.json({ok:true,resultado:await getNativeAccounting(body.args?.[0])});
        if(body.fn==="guardarContabilidadDiaria")return NextResponse.json({ok:true,resultado:await saveNativeAccounting(current.user.id,(body.args?.[0]||{}) as Record<string,unknown>)});
        if(body.fn==="obtenerAnalisis")return NextResponse.json({ok:true,resultado:await getNativeAnalysis(body.args?.[0])});
        if(body.fn==="obtenerCurvaS")return NextResponse.json({ok:true,resultado:await getNativeCurve(body.args?.[0],body.args?.[1],body.args?.[2])});
        if (body.fn === "registrarVenta") return NextResponse.json({ ok: true, resultado: await createNativeSale(String(body.token || ""), (body.args?.[0] || {}) as Parameters<typeof createNativeSale>[1]) });
        if (body.fn === "obtenerPreparacionPedido") return NextResponse.json({ ok: true, resultado: await getNativePreparation(body.args?.[0]) });
        if (body.fn === "guardarPreparacionPedido") return NextResponse.json({ ok: true, resultado: await saveNativePreparation(String(body.token || ""), (body.args?.[0] || {}) as Parameters<typeof saveNativePreparation>[1]) });
        if (body.fn === "obtenerConsolidadoCompra") return NextResponse.json({ ok: true, resultado: await getNativePurchaseConsolidation(String(body.token || ""), (body.args?.[0] || {}) as Parameters<typeof getNativePurchaseConsolidation>[1]) });
        if (body.fn === "actualizarPedidosMasivo") return NextResponse.json({ ok: true, resultado: await bulkNativeOrders(String(body.token || ""), (body.args?.[0] || {}) as Parameters<typeof bulkNativeOrders>[1]) });
        if (body.fn === "asignarPedidoJornada") return NextResponse.json({ ok: true, resultado: await assignNativeJourney(String(body.token || ""), current.user.id, (body.args?.[0] || {}) as Parameters<typeof assignNativeJourney>[2]) });
        if (body.fn === "guardarCobranzaPedido") return NextResponse.json({ ok: true, resultado: await processNativeCollection(String(body.token || ""), (body.args?.[0] || {}) as Parameters<typeof processNativeCollection>[1]) });
        if (body.fn === "obtenerCobranzaPedidos") return NextResponse.json({ ok: true, resultado: await getNativeCollections((body.args?.[0] || {}) as Record<string, unknown>) });
        if (body.fn === "registrarGastoOperacion") return NextResponse.json({ ok: true, resultado: await registerNativeExpense(current.user.id, (body.args?.[0] || {}) as Parameters<typeof registerNativeExpense>[1]) });
        if (body.fn === "obtenerGastosOperacion") return NextResponse.json({ ok: true, resultado: await getNativeExpenses(body.args?.[0]) });
        if (body.fn === "obtenerGastosPendientes") {
          if (!["MASTER", "ADMINISTRADOR", "FINANZAS"].includes(profile)) throw new Error("Esta operación requiere perfil administrador o finanzas.");
          return NextResponse.json({ ok: true, resultado: await getNativeExpenses("*", true) });
        }
        if (body.fn === "resolverGastoOperacion") {
          if (!["MASTER", "ADMINISTRADOR", "FINANZAS"].includes(profile)) throw new Error("Esta operación requiere perfil administrador o finanzas.");
          return NextResponse.json({ ok: true, resultado: await resolveNativeExpense(current.user.id, (body.args?.[0] || {}) as Parameters<typeof resolveNativeExpense>[1]) });
        }
        if (body.fn === "obtenerResumenJornada") return NextResponse.json({ ok: true, resultado: await getNativeJourneySummary(body.args?.[0], current.user.id) });
        if (body.fn === "cerrarJornada") return NextResponse.json({ ok: true, resultado: await closeNativeJourney(current.user.id, (body.args?.[0] || {}) as Parameters<typeof closeNativeJourney>[1]) });
        if (body.fn === "obtenerRendicionDia") return NextResponse.json({ ok: true, resultado: await getNativeRendition(body.args?.[0], profile === "MASTER" || profile === "ADMINISTRADOR" ? undefined : current.user.id) });
        if(SUPABASE_COMPAT_READS.has(body.fn))return NextResponse.json({ok:true,resultado:await executeCompatRead(body.fn,body.args||[])});
        return NextResponse.json({ok:false,code:"SUPABASE_OPERATION_NOT_IMPLEMENTED",message:`La operación ${body.fn} no forma parte del flujo Supabase habilitado.`},{status:501});
      } catch (authError) {
        if (!(authError instanceof Error) && authError && typeof authError === "object") {
          const failure = authError as Record<string, unknown>;
          const message = [failure.message, failure.details, failure.hint, failure.code]
            .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
          return NextResponse.json({ ok: false, message: message || "No se pudo completar la operación." }, { status: 400 });
        }
        const message = authError instanceof Error ? authError.message : "No se pudo validar la sesiÃ³n.";
        return NextResponse.json({ ok: false, message }, { status: /sesi[oó]n|contrase|usuario/i.test(message) ? 401 : 403 });
      }
    }
    if (mode === "supabase" && SUPABASE_COMPAT_READS.has(body.fn)) {
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
      if (mode !== "sheets" && isSupabaseConfigured() && parsed.ok && SUPABASE_CLIENT_MUTATIONS.has(body.fn)) {
        try {
          let sheetClients: Array<Record<string, string>> = [];
          if (body.fn === "registrarCliente") {
            const mirrorResponse = await fetch(endpoint, {
              method: "POST",
              headers: { "content-type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ fn: "obtenerClientes", args: [""], token: body.token || "" }),
              redirect: "follow",
            });
            const mirrorEnvelope = await mirrorResponse.json() as { ok?: boolean; resultado?: Array<Record<string, string>> };
            if (!mirrorEnvelope.ok || !Array.isArray(mirrorEnvelope.resultado)) throw new Error("No se pudo recuperar el cliente creado.");
            sheetClients = mirrorEnvelope.resultado;
          }
          await mirrorClientMutation(body.fn, body.args || [], sheetClients);
        } catch (mirrorError) {
          console.error("[SUPABASE_WRITE_MIRROR_ERROR]", body.fn, mirrorError instanceof Error ? mirrorError.message : mirrorError);
        }
      }
      if (mode !== "sheets" && isSupabaseConfigured() && parsed.ok && SUPABASE_PRODUCT_MUTATIONS.has(body.fn)) {
        try {
          const mirrorResponse = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ fn: "obtenerCatalogoProductos", args: [], token: body.token || "" }),
            redirect: "follow",
          });
          const mirrorEnvelope = await mirrorResponse.json() as { ok?: boolean; resultado?: Array<Record<string, unknown>> };
          if (!mirrorEnvelope.ok || !Array.isArray(mirrorEnvelope.resultado)) throw new Error("No se pudo recuperar el catálogo actualizado.");
          await mirrorProductMutation(body.fn, body.args || [], mirrorEnvelope.resultado);
        } catch (mirrorError) {
          console.error("[SUPABASE_PRODUCT_MIRROR_ERROR]", body.fn, mirrorError instanceof Error ? mirrorError.message : mirrorError);
        }
      }
      if (mode !== "sheets" && isSupabaseConfigured() && parsed.ok && SUPABASE_ORDER_MUTATIONS.has(body.fn)) {
        try {
          const saleResult = parsed.resultado as { ok?: boolean; ventaId?: string; total?: number; fecha?: string; clienteId?: string };
          if (saleResult?.ok) {
            const clientsResponse = await fetch(endpoint, {
              method: "POST",
              headers: { "content-type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ fn: "obtenerClientes", args: [""], token: body.token || "" }),
              redirect: "follow",
            });
            const clientsEnvelope = await clientsResponse.json() as { ok?: boolean; resultado?: Array<Record<string, string>> };
            if (!clientsEnvelope.ok || !Array.isArray(clientsEnvelope.resultado)) throw new Error("No se pudo resolver el cliente de la venta.");
            await mirrorSaleMutation(body.args || [], saleResult, clientsEnvelope.resultado);
          }
        } catch (mirrorError) {
          console.error("[SUPABASE_ORDER_MIRROR_ERROR]", body.fn, mirrorError instanceof Error ? mirrorError.message : mirrorError);
        }
      }
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
