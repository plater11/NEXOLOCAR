import { admin, input, clean, number, report } from "./lib.mjs";

const db = admin();
const [clients, products, orders, stock] = await Promise.all([
  input("clientes"), input("productos"), input("pedidos"), input("stock"),
]);
const uniqueOrders = [...new Map(orders
  .filter(order => clean(order.ventaId || order.codigo_pedido))
  .map(order => [clean(order.ventaId || order.codigo_pedido), order])).values()];

const [c, historicalClients, p, historicalProducts, o, details, s] = await Promise.all([
  db.from("clientes").select("id", { count: "exact", head: true }).eq("legacy_source", "SHEETS"),
  db.from("clientes").select("id", { count: "exact", head: true }).eq("legacy_source", "SHEETS_HISTORICO"),
  db.from("productos").select("id", { count: "exact", head: true }).eq("legacy_source", "SHEETS"),
  db.from("productos").select("id", { count: "exact", head: true }).eq("legacy_source", "SHEETS_HISTORICO"),
  db.from("pedidos").select("codigo_pedido,total"),
  db.from("pedido_detalle").select("id", { count: "exact", head: true }),
  db.from("stock_actual").select("producto_id,stock_fisico"),
]);

const sourceDetails = uniqueOrders.reduce((sum, order) => sum + (Array.isArray(order.items) ? order.items.length : 0), 0);
const result = {
  generatedAt: new Date().toISOString(),
  clientes: { sheets: clients.length, supabase: c.count, historical: historicalClients.count, difference: (c.count || 0) - clients.length },
  productos: { sheets: products.length, supabase: p.count, historical: historicalProducts.count, difference: (p.count || 0) - products.length },
  pedidos: { sheetsRows: orders.length, sheetsUnique: uniqueOrders.length, supabase: o.data?.length || 0, difference: (o.data?.length || 0) - uniqueOrders.length },
  detalles: { sheets: sourceDetails, supabase: details.count, difference: (details.count || 0) - sourceDetails },
  ventas: {
    sheets: uniqueOrders.reduce((sum, order) => sum + number(order.total), 0),
    supabase: (o.data || []).reduce((sum, order) => sum + number(order.total), 0),
  },
  stock: {
    sheets: stock.reduce((sum, row) => sum + number(row.stock || row.cantidad), 0),
    supabase: (s.data || []).reduce((sum, row) => sum + number(row.stock_fisico), 0),
  },
  errors: [c.error, historicalClients.error, p.error, historicalProducts.error, o.error, details.error, s.error].filter(Boolean).map(error => error.message),
};
result.ventas.difference = Math.round((result.ventas.supabase - result.ventas.sheets) * 100) / 100;
result.stock.difference = Math.round((result.stock.supabase - result.stock.sheets) * 10000) / 10000;

await report("comparison", result);
console.log(JSON.stringify(result, null, 2));
if (result.errors.length || result.clientes.difference || result.productos.difference || result.pedidos.difference || result.detalles.difference || result.ventas.difference || result.stock.difference) process.exitCode = 2;
