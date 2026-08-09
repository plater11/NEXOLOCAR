import { admin, input, clean, number, date, dedupe, report, upsertBatches } from "./lib.mjs";
import { createHash } from "node:crypto";

const db = admin();
const [source, sourceProducts] = await Promise.all([input("pedidos"), input("productos")]);
let [{ data: clients, error: clientsError }, { data: products, error: productsError }] = await Promise.all([
  db.from("clientes").select("id,codigo,nombre"),
  db.from("productos").select("id,codigo"),
]);
if (clientsError) throw clientsError;
if (productsError) throw productsError;

let clientMap = new Map((clients || []).flatMap(client => [
  [clean(client.codigo).toUpperCase(), client.id],
  [clean(client.nombre).toUpperCase(), client.id],
]));
let productMap = new Map((products || []).map(product => [clean(product.codigo).toUpperCase(), product.id]));
const sourceProductMap = new Map(sourceProducts.map(product => [clean(product.codigo).toUpperCase(), product]));
const uniqueSourceOrders = [...new Map(source
  .filter(order => clean(order.ventaId || order.codigo_pedido))
  .map(order => [clean(order.ventaId || order.codigo_pedido), order])).values()];

const missingClientNames = [...new Set(source
  .map(order => clean(order.cliente))
  .filter(name => name && !clientMap.has(name.toUpperCase())))];
const legacyClients = missingClientNames.map(name => ({
  codigo: `LEGACY-C-${createHash("sha1").update(name.toUpperCase()).digest("hex").slice(0, 12).toUpperCase()}`,
  nombre: name,
  estado: "INACTIVO",
  observaciones: "Registro histórico creado durante la migración; no estaba en la hoja maestra Clientes.",
  legacy_id: name,
  legacy_source: "SHEETS_HISTORICO",
}));
const legacyClientsResult = await upsertBatches(db, "clientes", legacyClients, "codigo");
if (legacyClientsResult.errors.length) throw new Error(legacyClientsResult.errors.map(error => error.message).join("; "));

const missingProductRows = new Map();
for (const order of source) for (const item of (Array.isArray(order.items) ? order.items : [])) {
  const code = clean(item.codigo).toUpperCase();
  if (code && !productMap.has(code) && !missingProductRows.has(code)) missingProductRows.set(code, item);
}
const legacyProducts = [...missingProductRows.entries()].map(([code, item]) => ({
  codigo: code,
  nombre: clean(item.nombre) || `Producto histórico ${code}`,
  unidad_base: "UND",
  costo_actual: 0,
  precio_venta: number(item.precioUnitario || item.precioVenta),
  permite_fraccionamiento: false,
  activo: false,
  legacy_id: code,
  legacy_source: "SHEETS_HISTORICO",
}));
const legacyProductsResult = await upsertBatches(db, "productos", legacyProducts, "codigo");
if (legacyProductsResult.errors.length) throw new Error(legacyProductsResult.errors.map(error => error.message).join("; "));

if (legacyClients.length || legacyProducts.length) {
  [{ data: clients, error: clientsError }, { data: products, error: productsError }] = await Promise.all([
    db.from("clientes").select("id,codigo,nombre"),
    db.from("productos").select("id,codigo"),
  ]);
  if (clientsError) throw clientsError;
  if (productsError) throw productsError;
  clientMap = new Map((clients || []).flatMap(client => [
    [clean(client.codigo).toUpperCase(), client.id],
    [clean(client.nombre).toUpperCase(), client.id],
  ]));
  productMap = new Map((products || []).map(product => [clean(product.codigo).toUpperCase(), product.id]));
}

const discarded = [];
const normalized = source.map((row, index) => {
  const code = clean(row.ventaId || row.codigo_pedido);
  const clientKey = clean(row.clienteCodigo || row.cliente).toUpperCase();
  const clientId = clientMap.get(clientKey);
  if (!code || !clientId) {
    discarded.push({ row: index + 2, code, client: clean(row.cliente), reason: !code ? "Código vacío" : "Cliente no encontrado" });
    return null;
  }
  return {
    codigo_pedido: code,
    cliente_id: clientId,
    fecha: date(row.fecha) || new Date().toISOString(),
    subtotal: number(row.subtotal || row.total),
    descuento: number(row.descuento),
    total: number(row.total),
    estado_operativo: clean(row.estadoOperativo || "POR_COMPRAR").replaceAll(" ", "_").toUpperCase(),
    estado_entrega: clean(row.estadoEntrega || "PENDIENTE").replaceAll(" ", "_").toUpperCase(),
    estado_cobranza: clean(row.estadoCobranza || "NO_APLICA").replaceAll(" ", "_").toUpperCase(),
    estado_boleta: row.codigoImpresion ? "EMITIDA" : "NO_EMITIDA",
    observaciones: clean(row.observaciones) || null,
    legacy_id: code,
    legacy_row: index + 2,
    legacy_source: "SHEETS",
    idempotency_key: `LEGACY:${code}`,
  };
}).filter(Boolean);

const unique = dedupe(normalized, row => row.codigo_pedido);
const ordersResult = await upsertBatches(db, "pedidos", unique.rows, "codigo_pedido");
if (ordersResult.errors.length) {
  await report("pedidos", { source: source.length, valid: unique.rows.length, discarded, duplicates: unique.duplicates, pedidos: ordersResult });
  process.exitCode = 1;
} else {
  const { data: importedOrders, error: orderReadError } = await db
    .from("pedidos")
    .select("id,codigo_pedido")
    .in("codigo_pedido", unique.rows.map(row => row.codigo_pedido));
  if (orderReadError) throw orderReadError;
  const orderMap = new Map((importedOrders || []).map(order => [order.codigo_pedido, order.id]));

  const details = [];
  const discardedDetails = [];
  for (const order of uniqueSourceOrders) {
    const orderCode = clean(order.ventaId || order.codigo_pedido);
    const orderId = orderMap.get(orderCode);
    if (!orderId) continue;
    for (const [itemIndex, item] of (Array.isArray(order.items) ? order.items : []).entries()) {
      const productCode = clean(item.codigo).toUpperCase();
      const productId = productMap.get(productCode);
      if (!productId) {
        discardedDetails.push({ orderCode, item: itemIndex + 1, productCode, reason: "Producto no encontrado" });
        continue;
      }
      const sourceProduct = sourceProductMap.get(productCode) || {};
      const quantity = number(item.cantidad);
      const factor = Math.max(number(item.factorPresentacion || sourceProduct.factorPresentacion), 1);
      const baseQuantity = number(item.cantidadUnidadesBase) || quantity * factor;
      const appliedPrice = number(item.precioUnitario || item.precioVenta || sourceProduct.precioPresentacion || sourceProduct.precioVenta);
      details.push({
        pedido_id: orderId,
        producto_id: productId,
        presentacion_id: null,
        cantidad_presentacion: quantity,
        fraccion: number(item.fraccion),
        factor_presentacion: factor,
        cantidad_unidades_base: baseQuantity,
        precio_presentacion: number(item.precioPresentacion || sourceProduct.precioPresentacion || appliedPrice),
        precio_aplicado: appliedPrice,
        subtotal: number(item.subtotal) || quantity * appliedPrice,
        legacy_id: `${orderCode}:${productCode}`,
      });
    }
  }

  const orderIds = [...new Set(details.map(detail => detail.pedido_id))];
  let deleteError = null;
  if (orderIds.length) ({ error: deleteError } = await db.from("pedido_detalle").delete().in("pedido_id", orderIds));
  const detailsResult = deleteError
    ? { inserted: 0, errors: [{ offset: 0, message: deleteError.message }] }
    : await upsertBatches(db, "pedido_detalle", details, "pedido_id,producto_id,presentacion_id");

  await report("pedidos", {
    source: source.length,
    uniqueSource: new Set(source.map(order => clean(order.ventaId || order.codigo_pedido)).filter(Boolean)).size,
    valid: unique.rows.length,
    legacyClientsCreated: legacyClients.length,
    legacyProductsCreated: legacyProducts.length,
    discarded,
    duplicates: unique.duplicates,
    pedidos: ordersResult,
    sourceDetails: uniqueSourceOrders.reduce((sum, order) => sum + (Array.isArray(order.items) ? order.items.length : 0), 0),
    validDetails: details.length,
    discardedDetails,
    detalles: detailsResult,
  });
  if (detailsResult.errors.length || discarded.length || discardedDetails.length) process.exitCode = 1;
}
