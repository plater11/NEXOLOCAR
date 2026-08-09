import { getSupabaseServerClient } from "../server";

export async function reserveOrderStock(accessToken: string, orderId: string, warehouseId: string) {
  const db = getSupabaseServerClient(accessToken);
  const { data, error } = await db.rpc("reservar_stock_pedido", { p_pedido_id: orderId, p_almacen_id: warehouseId });
  if (error) throw error;
  return data;
}

export async function deliverOrder(accessToken: string, orderId: string, delivery: Record<string, unknown>) {
  const db = getSupabaseServerClient(accessToken);
  const { data, error } = await db.rpc("registrar_entrega_pedido", { p_pedido_id: orderId, p_payload: delivery });
  if (error) throw error;
  return data;
}
