export type ErpModule = "dashboard" | "orders" | "collections" | "finance" | "inventory" | "renditions" | "activity";

export type ErpEventType =
  | "ORDER_CREATED" | "ORDER_READY" | "ORDER_IN_ROUTE" | "ORDER_DELIVERED" | "ORDER_UPDATED"
  | "PAYMENT_REGISTERED" | "STOCK_RECEIVED" | "STOCK_ADJUSTED"
  | "EXPENSE_CREATED" | "EXPENSE_APPROVED" | "EXPENSE_REJECTED"
  | "RENDITION_CLOSED" | "PERIOD_CLOSED" | "MASTER_DATA_UPDATED";

export type ErpInvalidation = { type: ErpEventType; modules: ErpModule[]; occurredAt: string };

const MODULES: Record<ErpEventType, ErpModule[]> = {
  ORDER_CREATED: ["dashboard", "orders", "activity"],
  ORDER_READY: ["dashboard", "orders", "inventory", "activity"],
  ORDER_IN_ROUTE: ["dashboard", "orders", "inventory", "renditions", "activity"],
  ORDER_DELIVERED: ["dashboard", "orders", "collections", "finance", "inventory", "renditions", "activity"],
  ORDER_UPDATED: ["dashboard", "orders", "collections", "activity"],
  PAYMENT_REGISTERED: ["dashboard", "orders", "collections", "finance", "renditions", "activity"],
  STOCK_RECEIVED: ["dashboard", "orders", "inventory", "activity"],
  STOCK_ADJUSTED: ["dashboard", "orders", "inventory", "activity"],
  EXPENSE_CREATED: ["dashboard", "finance", "renditions", "activity"],
  EXPENSE_APPROVED: ["dashboard", "finance", "renditions", "activity"],
  EXPENSE_REJECTED: ["dashboard", "finance", "renditions", "activity"],
  RENDITION_CLOSED: ["dashboard", "finance", "renditions", "activity"],
  PERIOD_CLOSED: ["dashboard", "finance", "activity"],
  MASTER_DATA_UPDATED: ["dashboard", "inventory", "activity"],
};

const MUTATION_EVENTS: Record<string, ErpEventType> = {
  registrarVenta: "ORDER_CREATED",
  guardarPreparacionPedido: "ORDER_READY",
  asignarPedidoJornada: "ORDER_IN_ROUTE",
  actualizarPedidosMasivo: "ORDER_IN_ROUTE",
  guardarCobranzaPedido: "ORDER_DELIVERED",
  actualizarEstadoOperativoPedido: "ORDER_UPDATED",
  corregirPedido: "ORDER_UPDATED",
  registrarMovimiento: "STOCK_RECEIVED",
  registrarMovimientosMasivos: "STOCK_RECEIVED",
  importarCargaMasivaInventario: "STOCK_RECEIVED",
  revertirCargaMasivaStock: "STOCK_ADJUSTED",
  registrarGastoOperacion: "EXPENSE_CREATED",
  resolverGastoOperacion: "EXPENSE_APPROVED",
  cerrarJornada: "RENDITION_CLOSED",
  validarRendicionDia: "RENDITION_CLOSED",
  cerrarPeriodoOperativo: "PERIOD_CLOSED",
  registrarMovimientoFinanciero: "MASTER_DATA_UPDATED",
  guardarPlaneamientoMensual: "MASTER_DATA_UPDATED",
  guardarContabilidadDiaria: "MASTER_DATA_UPDATED",
};

export function eventForMutation(name: string, args: unknown[]): ErpEventType | null {
  if (name === "resolverGastoOperacion") {
    const state = String((args[0] as Record<string, unknown> | undefined)?.estado || "").toUpperCase();
    return state === "RECHAZADO" ? "EXPENSE_REJECTED" : "EXPENSE_APPROVED";
  }
  if (name === "guardarCobranzaPedido") {
    const payload = (args[0] || {}) as Record<string, unknown>;
    const paid = ["efectivo", "yape", "plin", "transferencia", "pos", "otros"].some(key => Number(payload[key] || 0) > 0);
    return paid ? "PAYMENT_REGISTERED" : "ORDER_DELIVERED";
  }
  return MUTATION_EVENTS[name] || null;
}

export function refreshRelatedModules(type: ErpEventType) {
  if (typeof window === "undefined") return;
  const detail: ErpInvalidation = { type, modules: MODULES[type], occurredAt: new Date().toISOString() };
  window.dispatchEvent(new CustomEvent<ErpInvalidation>("nexo:data-invalidated", { detail }));
}
