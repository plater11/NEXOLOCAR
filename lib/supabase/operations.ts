import { getSupabaseAdminClient, getSupabaseServerClient } from "./server";

type SaleItem = { codigo?: string; cantidad?: number; cantidadPresentacion?: number; cantidadUnidadesBase?: number; factorPresentacion?: number; fraccion?: number; precioVenta?: number; precioPresentacion?: number; precioAplicado?: number; subtotal?: number };
type SalePayload = { cliente?: string; clienteId?: string; items?: SaleItem[]; observaciones?: string; solicitudId?: string };
type PreparationPayload = { ventaId?: string; lineas?: Array<Record<string, unknown>>; marcarListo?: boolean };
type AssignmentPayload = { ventaId?: string; fecha?: string; ruta?: string; ordenVisita?: number };
type CollectionPayload = Record<string, unknown> & { ventaId?: string; solicitudId?: string };
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

async function orderByCode(code: unknown) {
  const { data, error } = await getSupabaseAdminClient().from("pedidos").select("*").eq("codigo_pedido", String(code || "")).maybeSingle();
  if (error || !data) throw error || new Error("Pedido no encontrado.");
  return data;
}

export async function createNativeSale(token: string, payload: SalePayload) {
  const admin = getSupabaseAdminClient();
  let clientQuery = admin.from("clientes").select("id,codigo,nombre").eq("estado", "ACTIVO").limit(1);
  clientQuery = payload.clienteId ? clientQuery.eq("codigo", payload.clienteId) : clientQuery.ilike("nombre", String(payload.cliente || ""));
  const { data: clients, error: clientError } = await clientQuery;
  if (clientError || !clients?.[0]) throw clientError || new Error("Selecciona un cliente válido.");
  const items = payload.items || [];
  const codes = [...new Set(items.map(item => String(item.codigo || "").trim().toUpperCase()).filter(Boolean))];
  const { data: products, error: productError } = await admin.from("productos").select("id,codigo").in("codigo", codes).eq("activo", true);
  if (productError) throw productError;
  const productIds = new Map((products || []).map(row => [row.codigo, row.id]));
  if (productIds.size !== codes.length) throw new Error("Uno o más productos ya no están disponibles.");
  const productUuidList = [...productIds.values()];
  const { data: presentations, error: presentationError } = await admin.from("presentaciones").select("id,producto_id,factor,precio").in("producto_id", productUuidList).eq("activo", true);
  if (presentationError) throw presentationError;
  const rpcItems = items.map(item => {
    const code = String(item.codigo || "").trim().toUpperCase(), productId = productIds.get(code) || "";
    const factor = Math.max(1, number(item.factorPresentacion));
    const presentation = (presentations || []).find(row => row.producto_id === productId && Math.abs(number(row.factor) - factor) < .0001);
    const quantity = number(item.cantidadPresentacion ?? item.cantidad);
    const price = number(item.precioPresentacion ?? item.precioVenta);
    return { producto_id: productId, presentacion_id: presentation?.id || "", cantidad_presentacion: quantity, fraccion: number(item.fraccion), factor_presentacion: factor, cantidad_unidades_base: number(item.cantidadUnidadesBase) || quantity * factor, precio_presentacion: price, precio_aplicado: price };
  });
  const requestId = String(payload.solicitudId || crypto.randomUUID());
  const now = new Date();
  const code = `V-${now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${requestId.slice(0, 4).toUpperCase()}`;
  const { data, error } = await getSupabaseServerClient(token).rpc("crear_pedido", { p_codigo: code, p_cliente_id: clients[0].id, p_items: rpcItems, p_descuento: 0, p_observaciones: String(payload.observaciones || ""), p_idempotency_key: requestId });
  if (error) throw error;
  const result = data as Record<string, unknown>;
  return { ok: true, mensaje: result.duplicate ? "Pedido ya sincronizado; no se duplicó." : "Pedido registrado correctamente.", ventaId: code, total: number(result.total), fecha: now.toLocaleString("es-PE"), clienteId: clients[0].codigo, pedidoId: result.pedido_id };
}

export async function getNativePreparation(code: unknown) {
  const order = await orderByCode(code), admin = getSupabaseAdminClient();
  const [{ data: details, error: detailError }, { data: warehouses, error: warehouseError }] = await Promise.all([
    admin.from("pedido_detalle").select("*").eq("pedido_id", order.id),
    admin.from("almacenes").select("id").eq("codigo", "PRINCIPAL").limit(1),
  ]);
  if (detailError || warehouseError) throw detailError || warehouseError;
  const productIds = (details || []).map(row => row.producto_id);
  const [{ data: products }, { data: stock }, { data: prepared }, { data: reserves }] = await Promise.all([
    admin.from("productos").select("id,codigo,nombre").in("id", productIds),
    admin.from("stock_actual").select("*").in("producto_id", productIds).eq("almacen_id", warehouses?.[0]?.id || ""),
    admin.from("preparacion_pedido").select("*").eq("pedido_id", order.id),
    admin.from("reservas_stock").select("*").eq("pedido_id", order.id),
  ]);
  const pmap = new Map((products || []).map(row => [row.id, row]));
  return { ventaId: order.codigo_pedido, cliente: "", total: number(order.total), lineas: (details || []).map(detail => {
    const product = pmap.get(detail.producto_id), currentStock = (stock || []).find(row => row.producto_id === detail.producto_id), prep = (prepared || []).find(row => row.producto_id === detail.producto_id), reserve = (reserves || []).find(row => row.producto_id === detail.producto_id && ["RESERVADA", "EN_RUTA"].includes(row.estado));
    return { ventaId: order.codigo_pedido, codigo: product?.codigo || "", producto: product?.nombre || "Producto", cantidadPedido: number(detail.cantidad_presentacion), presentacion: "", unidadesBase: number(detail.cantidad_unidades_base), cantidadPreparada: number(prep?.cantidad_preparada), estadoLinea: prep?.estado || "PENDIENTE", cantidadFaltante: number(prep?.cantidad_faltante), motivo: prep?.motivo || "", observacion: prep?.observacion || "", estadoStock: reserve?.estado || "SIN RESERVA", stockFisico: number(currentStock?.stock_fisico), stockReservado: number(currentStock?.stock_reservado), stockEnRuta: number(currentStock?.stock_en_ruta), stockDisponible: number(currentStock?.stock_disponible), productoId: detail.producto_id };
  }) };
}

export async function saveNativePreparation(token: string, payload: PreparationPayload) {
  const order = await orderByCode(payload.ventaId), admin = getSupabaseAdminClient();
  const { data: products, error: productError } = await admin.from("productos").select("id,codigo"); if (productError) throw productError;
  const ids = new Map((products || []).map(row => [row.codigo, row.id]));
  const { data: warehouses, error: warehouseError } = await admin.from("almacenes").select("id").eq("codigo", "PRINCIPAL").limit(1); if (warehouseError || !warehouses?.[0]) throw warehouseError || new Error("Almacén principal no configurado.");
  const lines = (payload.lineas || []).map(line => ({ producto_id: ids.get(String(line.codigo || "")) || line.productoId, cantidad_preparada: number(line.cantidadPreparada), estado: String(line.estadoLinea || "PENDIENTE"), cantidad_faltante: number(line.cantidadFaltante), motivo: String(line.motivo || ""), observacion: String(line.observacion || "") }));
  const { data, error } = await getSupabaseServerClient(token).rpc("guardar_preparacion_pedido", { p_pedido_id: order.id, p_lineas: lines, p_marcar_listo: Boolean(payload.marcarListo), p_almacen_id: warehouses[0].id });
  if (error) throw error; return { ok: true, mensaje: payload.marcarListo ? "Pedido listo y stock reservado." : "Preparación guardada.", resultado: data };
}

export async function assignNativeJourney(token: string, userId: string, payload: AssignmentPayload) {
  const order = await orderByCode(payload.ventaId), admin = getSupabaseAdminClient(), date = String(payload.fecha || new Date().toISOString().slice(0, 10));
  const { data: existingJourney, error } = await admin.from("jornadas").select("*").eq("fecha", date).eq("repartidor_id", userId).eq("estado", "ABIERTA").limit(1).maybeSingle();
  if (error) throw error;
  let journey = existingJourney;
  if (!journey) { const created = await admin.from("jornadas").insert({ fecha: date, repartidor_id: userId, ruta: String(payload.ruta || ""), estado: "ABIERTA" }).select("*").single(); if (created.error) throw created.error; journey = created.data; }
  const assigned = await getSupabaseServerClient(token).rpc("asignar_pedido_jornada", { p_pedido_id: order.id, p_jornada_id: journey.id, p_orden: number(payload.ordenVisita) });
  if (assigned.error) throw assigned.error; return { ok: true, mensaje: "Pedido asignado a jornada y movido a ruta.", jornadaId: journey.id };
}

function deliveryState(value: unknown) {
  const state = String(value || "").toUpperCase().replace(/Ó/g, "O").replace(/Í/g, "I").replace(/\s+/g, "_");
  const map: Record<string, string> = { ENTREGADO: "ENTREGA_COMPLETA", ENTREGA_COMPLETA: "ENTREGA_COMPLETA", ENTREGA_PARCIAL: "ENTREGA_PARCIAL", CLIENTE_AUSENTE: "CLIENTE_AUSENTE", REPROGRAMADO: "REPROGRAMADO", RECHAZADO: "RECHAZADO", DIRECCION_INCORRECTA: "DIRECCION_INCORRECTA" };
  return map[state] || "OTRO";
}

export async function processNativeCollection(token: string, payload: CollectionPayload) {
  const order = await orderByCode(payload.ventaId), admin = getSupabaseAdminClient();
  const { data: details, error: detailsError } = await admin.from("pedido_detalle").select("producto_id,cantidad_presentacion,cantidad_unidades_base").eq("pedido_id", order.id); if (detailsError) throw detailsError;
  const codes = (payload.itemsEntregados as Array<Record<string, unknown>> || []).map(item => String(item.codigo || ""));
  const { data: products } = await admin.from("productos").select("id,codigo").in("codigo", codes.length ? codes : ["__NONE__"]);
  const productIds = new Map((products || []).map(row => [row.codigo, row.id]));
  const delivered = payload.itemsEntregados as Array<Record<string, unknown>> | undefined;
  const items = (details || []).map(detail => { const requested = number(detail.cantidad_unidades_base), presentationQuantity = number(detail.cantidad_presentacion), source = delivered?.find(item => productIds.get(String(item.codigo || "")) === detail.producto_id), factor = presentationQuantity > 0 ? requested / presentationQuantity : 1; return { producto_id: detail.producto_id, cantidad_pedida: requested, cantidad_entregada: source ? number(source.cantidadEntregada) * factor : requested }; });
  const medios = [["EFECTIVO", payload.efectivo], ["YAPE", payload.yape], ["PLIN", payload.plin], ["TRANSFERENCIA", payload.transferencia], ["OTRO", number(payload.pos) + number(payload.otros)]].map(([medio, monto]) => ({ medio, monto: number(monto) })).filter(item => item.monto > 0);
  const requestId = String(payload.solicitudId || crypto.randomUUID());
  const { error } = await getSupabaseServerClient(token).rpc("procesar_entrega_cobro", { p_pedido_id: order.id, p_entrega: { estado: deliveryState(payload.estadoEntrega), fecha_entrega: payload.fechaEntrega || new Date().toISOString(), observacion: String(payload.observacion || ""), jornada_id: String(payload.jornadaId || ""), items }, p_pago: { medios }, p_idempotency_key: requestId });
  if (error) throw error; return "Entrega y cobranza registradas correctamente.";
}

const limaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

type EntityPayload = Record<string, unknown>;
const clientCode = () => `C-${Date.now()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

export async function saveNativeClient(payload: EntityPayload) {
  const db=getSupabaseAdminClient(), code=String(payload.id||payload.codigo||clientCode()).trim();
  const row={codigo:code,nombre:[payload.nombre,payload.apellidos].map(v=>String(v||"").trim()).filter(Boolean).join(" "),telefono:String(payload.contacto||payload.telefono||"").trim()||null,direccion:String(payload.direccion||"").trim()||null,correo:String(payload.correo||"").trim()||null,fecha_nacimiento:String(payload.fechaCumpleanos||payload.fecha_nacimiento||"").trim()||null,observaciones:String(payload.comentarios||payload.observaciones||"").trim()||null,estado:"ACTIVO",legacy_source:"SUPABASE",updated_at:new Date().toISOString()};
  if(!row.nombre||!row.telefono||!row.direccion) throw new Error("Nombre, teléfono y dirección son obligatorios.");
  const {error}=await db.from("clientes").upsert(row,{onConflict:"codigo"}); if(error) throw error;
  return payload.id?"Cliente actualizado correctamente.":"Cliente registrado correctamente.";
}
export async function deleteNativeClient(value:unknown){const {error}=await getSupabaseAdminClient().from("clientes").update({estado:"INACTIVO",updated_at:new Date().toISOString()}).eq("codigo",String(value||""));if(error)throw error;return "Cliente desactivado correctamente.";}

const truthy=(value:unknown)=>/^(SI|SÍ|TRUE|1)$/i.test(String(value||""));
export async function saveNativeProduct(payload:EntityPayload){
  const db=getSupabaseAdminClient(),code=String(payload.codigo||"").trim().toUpperCase(),original=String(payload.codigoOriginal||code).trim().toUpperCase(); if(!code||!String(payload.nombre||"").trim())throw new Error("Código y nombre son obligatorios.");
  const row={codigo:code,nombre:String(payload.nombre).trim(),unidad_base:String(payload.unidad||"Unidades"),grupo:String(payload.grupo||"General"),stock_min:number(payload.stockMin),costo_actual:number(payload.precioCosto),precio_venta:number(payload.precioVenta),imagen:String(payload.imagen||"")||null,promocion_activa:truthy(payload.promocionActiva),cantidad_promo:number(payload.cantidadPromo),precio_promo:number(payload.precioPromo),descripcion_promo:String(payload.descripcionPromo||"")||null,controla_decimales:truthy(payload.controlaDecimales),permite_fraccionamiento:truthy(payload.permiteFraccionamiento),activo:true,legacy_source:"SUPABASE",updated_at:new Date().toISOString()};
  const saved=original!==code?await db.from("productos").update(row).eq("codigo",original):await db.from("productos").upsert(row,{onConflict:"codigo"});if(saved.error)throw saved.error;
  const {data:product,error}=await db.from("productos").select("id").eq("codigo",code).single();if(error)throw error;
  const fractionValues=String(payload.fraccionesPermitidas||"").split(",").map(v=>{const[a,b]=v.trim().split("/").map(Number);return b?a/b:Number(v);}).filter(v=>v>0&&v<=1);
  const presentation={producto_id:product.id,nombre:String(payload.nombrePresentacion||payload.unidad||"Unidad"),factor:Math.max(1,number(payload.factorPresentacion)||1),precio:number(payload.precioPresentacion)||number(payload.precioVenta),permite_fraccionamiento:row.permite_fraccionamiento,fracciones_permitidas:fractionValues,es_venta:true,activo:true};
  const result=await db.from("presentaciones").upsert(presentation,{onConflict:"producto_id,nombre"});if(result.error)throw result.error;return payload.codigoOriginal?"Producto actualizado correctamente.":"Producto registrado correctamente.";
}
export async function deleteNativeProduct(value:unknown){const {error}=await getSupabaseAdminClient().from("productos").update({activo:false,updated_at:new Date().toISOString()}).eq("codigo",String(value||"").trim().toUpperCase());if(error)throw error;return "Producto desactivado correctamente.";}
export async function registerNativeInventoryMovement(token:string,payload:EntityPayload){const db=getSupabaseAdminClient(),code=String(payload.codigo||"").trim().toUpperCase();const[{data:product,error:pe},{data:warehouse,error:we}]=await Promise.all([db.from("productos").select("id").eq("codigo",code).single(),db.from("almacenes").select("id").eq("codigo","PRINCIPAL").single()]);if(pe||we)throw pe||we;const quantity=number(payload.cantidadCarga??payload.cantidad)*Math.max(1,number(payload.factor)||1);const{error}=await getSupabaseServerClient(token).rpc("registrar_movimiento_inventario",{p_producto_id:product.id,p_almacen_id:warehouse.id,p_tipo:String(payload.tipo||"INGRESO"),p_cantidad:quantity,p_observacion:String(payload.observaciones||payload.observacion||""),p_idempotency_key:String(payload.solicitudId||crypto.randomUUID())});if(error)throw error;return "Movimiento registrado correctamente.";}
export async function getNativeLists(){const db=getSupabaseAdminClient();const[{data:products,error},{data:categories}]=await Promise.all([db.from("productos").select("unidad_base,grupo").eq("activo",true),db.from("categorias").select("nombre").eq("activo",true)]);if(error)throw error;return{unidades:[...new Set((products||[]).map(r=>r.unidad_base).filter(Boolean))].sort(),grupos:[...new Set([...(products||[]).map(r=>r.grupo),...(categories||[]).map(r=>r.nombre)].filter(Boolean))].sort()};}
export async function getNativeInventoryHistory(){const db=getSupabaseAdminClient();const{data:movements,error}=await db.from("movimientos_inventario").select("*").order("created_at",{ascending:false}).limit(500);if(error)throw error;const ids=[...new Set((movements||[]).map(r=>r.producto_id))],{data:products}=await db.from("productos").select("id,codigo,nombre").in("id",ids.length?ids:[crypto.randomUUID()]);const map=new Map((products||[]).map(r=>[r.id,r]));return(movements||[]).map(r=>({fecha:r.created_at,codigo:map.get(r.producto_id)?.codigo||"",producto:map.get(r.producto_id)?.nombre||"Producto",tipo:r.tipo_movimiento,cantidad:number(r.cantidad),saldoAnterior:number(r.saldo_anterior),saldoNuevo:number(r.saldo_nuevo),observaciones:r.observacion||""}));}

export async function updateNativeOrderState(userId:string,payload:EntityPayload){const order=await orderByCode(payload.ventaId),state=String(payload.estado||"POR_COMPRAR").toUpperCase().replace(/ /g,"_");if(!["POR_COMPRAR","LISTO_PARA_ENTREGA","ENTREGADO","OBSERVADO","ANULADO"].includes(state))throw new Error("Estado operativo inválido.");const db=getSupabaseAdminClient(),previous=order.estado_operativo;const{error}=await db.from("pedidos").update({estado_operativo:state,updated_at:new Date().toISOString()}).eq("id",order.id);if(error)throw error;const history=await db.from("pedido_historial_estado").insert({pedido_id:order.id,tipo_estado:"OPERATIVO",estado_anterior:previous,estado_nuevo:state,observacion:String(payload.observacion||""),usuario_id:userId});if(history.error)throw history.error;return "Estado actualizado correctamente.";}
export async function getNativeOrderHistory(value:unknown){const order=await orderByCode(value),{data,error}=await getSupabaseAdminClient().from("pedido_historial_estado").select("*").eq("pedido_id",order.id).order("created_at",{ascending:false});if(error)throw error;return(data||[]).map(row=>({fecha:row.created_at,ventaId:order.codigo_pedido,anterior:row.estado_anterior||"",nuevo:row.estado_nuevo,usuario:row.usuario_id||"",observacion:row.observacion||""}));}
export async function issueNativePrintCode(value:unknown){const order=await orderByCode(value),db=getSupabaseAdminClient();let code=order.codigo_impresion as string|undefined;if(!code)code=`B${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;const now=new Date().toISOString(),{error}=await db.from("pedidos").update({codigo_impresion:code,fecha_impresion:now,estado_boleta:"EMITIDA",updated_at:now}).eq("id",order.id);if(error)throw error;return{ok:true,mensaje:"Código de impresión generado.",codigo:code,fecha:now,reimpresion:Boolean(order.codigo_impresion)};}
export async function correctNativeOrder(token:string,payload:EntityPayload){const order=await orderByCode(payload.ventaId),db=getSupabaseAdminClient(),clientName=String(payload.cliente||"").trim();const{data:clients,error:ce}=await db.from("clientes").select("id,nombre").ilike("nombre",clientName);if(ce)throw ce;const client=clients?.find(row=>row.nombre.toLowerCase()===clientName.toLowerCase())||clients?.[0];if(!client)throw new Error("Cliente no encontrado.");const source=Array.isArray(payload.items)?payload.items as EntityPayload[]:[],codes=source.map(row=>String(row.codigo||"").toUpperCase()),{data:products,error:pe}=await db.from("productos").select("id,codigo,precio_venta").in("codigo",codes);if(pe)throw pe;const map=new Map((products||[]).map(row=>[row.codigo,row])),items=source.map(row=>{const product=map.get(String(row.codigo||"").toUpperCase());if(!product)throw new Error(`Producto ${row.codigo} no encontrado.`);const quantity=number(row.cantidad),price=number(product.precio_venta);return{producto_id:product.id,presentacion_id:"",cantidad:quantity,factor:1,cantidad_base:quantity,precio:price,subtotal:quantity*price};});const{data,error}=await getSupabaseServerClient(token).rpc("corregir_pedido",{p_pedido_id:order.id,p_cliente_id:client.id,p_items:items,p_observaciones:String(payload.observaciones||"")});if(error)throw error;return{ok:true,mensaje:"Pedido actualizado correctamente.",total:number((data as Record<string,unknown>)?.total)};}

export async function getNativeCollections(filters: Record<string, unknown> = {}) {
  const admin = getSupabaseAdminClient();
  let query = admin.from("pedidos").select("*").order("fecha", { ascending: false });
  if (filters.fechaDesde) query = query.gte("fecha", `${filters.fechaDesde}T00:00:00-05:00`);
  if (filters.fechaHasta) query = query.lte("fecha", `${filters.fechaHasta}T23:59:59-05:00`);
  const { data: orders, error } = await query; if (error) throw error;
  const orderIds = (orders || []).map(row => row.id), clientIds = [...new Set((orders || []).map(row => row.cliente_id))];
  const [{ data: clients }, { data: details }, { data: products }, { data: payments }, { data: deliveries }] = await Promise.all([
    admin.from("clientes").select("id,nombre").in("id", clientIds.length ? clientIds : [crypto.randomUUID()]),
    admin.from("pedido_detalle").select("*").in("pedido_id", orderIds.length ? orderIds : [crypto.randomUUID()]),
    admin.from("productos").select("id,codigo,nombre"),
    admin.from("pagos").select("*").in("pedido_id", orderIds.length ? orderIds : [crypto.randomUUID()]).eq("estado", "APLICADO"),
    admin.from("entregas").select("*").in("pedido_id", orderIds.length ? orderIds : [crypto.randomUUID()]).order("created_at", { ascending: false }),
  ]);
  const paymentIds = (payments || []).map(row => row.id);
  const { data: paymentDetails, error: paymentError } = await admin.from("pago_detalle").select("*").in("pago_id", paymentIds.length ? paymentIds : [crypto.randomUUID()]); if (paymentError) throw paymentError;
  const clientMap = new Map((clients || []).map(row => [row.id, row.nombre])), productMap = new Map((products || []).map(row => [row.id, row]));
  return (orders || []).map(order => {
    const orderPayments = (payments || []).filter(row => row.pedido_id === order.id), paid = orderPayments.reduce((sum, row) => sum + number(row.monto), 0), ids = new Set(orderPayments.map(row => row.id));
    const channels = (paymentDetails || []).filter(row => ids.has(row.pago_id)).reduce<Record<string, number>>((result, row) => { result[row.medio] = (result[row.medio] || 0) + number(row.monto); return result; }, {});
    const latestDelivery = (deliveries || []).find(row => row.pedido_id === order.id);
    const items = (details || []).filter(row => row.pedido_id === order.id).map(row => { const product = productMap.get(row.producto_id); return { codigo: product?.codigo || "", nombre: product?.nombre || "Producto", cantidad: number(row.cantidad_presentacion), precioUnitario: number(row.precio_aplicado), subtotal: number(row.subtotal) }; });
    return { ventaId: order.codigo_pedido, fecha: order.fecha, cliente: clientMap.get(order.cliente_id) || "Cliente", total: number(order.total), itemsCount: items.reduce((sum, item) => sum + item.cantidad, 0), observaciones: order.observaciones || "", items, estadoEntrega: latestDelivery?.estado || order.estado_entrega, estadoOperativo: order.estado_operativo, fechaEntrega: latestDelivery?.fecha_entrega || "", estadoCobro: number(order.total) - paid <= .01 ? "COBRADO" : paid > 0 ? "PARCIAL" : "PENDIENTE", totalCobrado: paid, saldo: Math.max(0, number(order.total) - paid), efectivo: channels.EFECTIVO || 0, yape: channels.YAPE || 0, plin: channels.PLIN || 0, transferencia: channels.TRANSFERENCIA || 0, pos: 0, otros: channels.OTRO || 0, observacionCobro: latestDelivery?.observacion || "" };
  });
}

type ExpensePayload = Record<string, unknown>;
export async function registerNativeExpense(userId: string, payload: ExpensePayload) {
  const idempotency = String(payload.solicitudId || crypto.randomUUID());
  const row = { fecha: String(payload.fecha || limaToday()), categoria: String(payload.partida || payload.categoria || "OTROS"), subcategoria: String(payload.subcategoria || "") || null, descripcion: String(payload.descripcion || "Gasto operativo"), monto: number(payload.importe ?? payload.monto), medio_pago: String(payload.canal || payload.medioPago || "EFECTIVO").toUpperCase(), origen_dinero: String(payload.origenDinero || "FONDO DE RUTA"), proveedor: String(payload.proveedor || "") || null, comprobante_url: String(payload.comprobanteUrl || "") || null, estado: "PENDIENTE_APROBACION", usuario_id: userId, repartidor_id: userId, idempotency_key: idempotency };
  if (row.monto <= 0) throw new Error("El importe debe ser mayor que cero.");
  const admin = getSupabaseAdminClient(); const { error } = await admin.from("gastos").upsert(row, { onConflict: "idempotency_key", ignoreDuplicates: true }); if (error) throw error;
  await admin.from("eventos").insert({ tipo: "GASTO_RUTA", entidad: "GASTO", entidad_id: null, descripcion: `${row.categoria} · ${row.descripcion}`, importe: row.monto, usuario_id: userId, metadata: { idempotency } });
  return "Gasto registrado. Pendiente de aprobación financiera.";
}

export async function getNativeExpenses(date: unknown = limaToday(), pendingOnly = false) {
  let query = getSupabaseAdminClient().from("gastos").select("*").order("created_at", { ascending: false });
  if (date !== "*") query = query.eq("fecha", String(date || limaToday()));
  if (pendingOnly) query = query.in("estado", ["PENDIENTE_APROBACION", "OBSERVADO"]);
  const { data, error } = await query; if (error) throw error;
  return (data || []).map(row => ({ solicitudId: row.id, id: row.id, fecha: row.fecha, responsable: row.repartidor_id || row.usuario_id || "", usuario: row.usuario_id || "", ruta: "", unidad: "", partida: row.categoria, descripcion: row.descripcion, importe: number(row.monto), canal: row.medio_pago || "", comprobanteUrl: row.comprobante_url || "", observacion: "", estadoRendicion: row.estado, estadoAprobacion: row.estado.replace("PENDIENTE_APROBACION", "PENDIENTE"), observacionAdministracion: "", origenDinero: row.origen_dinero || "", proveedor: row.proveedor || "", jornadaId: row.jornada_id || "" }));
}

export async function resolveNativeExpense(userId: string, payload: ExpensePayload) {
  const stateMap: Record<string, string> = { APROBADO: "APROBADO", OBSERVADO: "OBSERVADO", RECHAZADO: "RECHAZADO" }, state = stateMap[String(payload.estado || "").toUpperCase()];
  if (!state) throw new Error("Estado de aprobación inválido.");
  const id = String(payload.id || payload.solicitudId || "");
  const admin = getSupabaseAdminClient(); const { data, error } = await admin.from("gastos").update({ estado: state, updated_at: new Date().toISOString() }).eq("id", id).select("*").maybeSingle(); if (error || !data) throw error || new Error("Gasto no encontrado.");
  await admin.from("eventos").insert({ tipo: `GASTO_${state}`, entidad: "GASTO", entidad_id: data.id, descripcion: String(payload.observacion || state), importe: number(data.monto), usuario_id: userId, metadata: {} });
  return `Gasto ${state.toLowerCase()} correctamente.`;
}

export async function getNativeJourneySummary(date: unknown = limaToday(), userId?: string) {
  const day = String(date || limaToday()), admin = getSupabaseAdminClient();
  let journeyQuery = admin.from("jornadas").select("*").eq("fecha", day).order("created_at", { ascending: false }).limit(1); if (userId) journeyQuery = journeyQuery.eq("repartidor_id", userId);
  const { data: journeys, error } = await journeyQuery; if (error) throw error; const journey = journeys?.[0];
  const { data: assignments } = journey ? await admin.from("jornada_pedidos").select("*").eq("jornada_id", journey.id) : { data: [] };
  const orderIds = (assignments || []).map(row => row.pedido_id);
  const [{ data: orders }, { data: payments }, { data: expenses }, { data: deliveries }] = await Promise.all([
    admin.from("pedidos").select("*").in("id", orderIds.length ? orderIds : [crypto.randomUUID()]),
    admin.from("pagos").select("*").gte("fecha", `${day}T00:00:00-05:00`).lte("fecha", `${day}T23:59:59-05:00`).eq("estado", "APLICADO"),
    admin.from("gastos").select("*").eq("fecha", day),
    admin.from("entregas").select("*").in("pedido_id", orderIds.length ? orderIds : [crypto.randomUUID()]),
  ]);
  const paymentIds = (payments || []).map(row => row.id), { data: channels } = await admin.from("pago_detalle").select("*").in("pago_id", paymentIds.length ? paymentIds : [crypto.randomUUID()]);
  const sums = (channels || []).reduce<Record<string, number>>((result, row) => { result[row.medio] = (result[row.medio] || 0) + number(row.monto); return result; }, {}), paid = (payments || []).reduce((sum, row) => sum + number(row.monto), 0);
  const deliveredIds = new Set((deliveries || []).filter(row => row.estado === "ENTREGA_COMPLETA").map(row => row.pedido_id)), deliveredOrders = (orders || []).filter(row => deliveredIds.has(row.id));
  const expenseTotal = (expenses || []).reduce((sum, row) => sum + number(row.monto), 0), expensePending = (expenses || []).filter(row => ["PENDIENTE_APROBACION", "OBSERVADO"].includes(row.estado)).reduce((sum, row) => sum + number(row.monto), 0), cashExpenses = (expenses || []).filter(row => row.medio_pago === "EFECTIVO").reduce((sum, row) => sum + number(row.monto), 0);
  return { fecha: day, jornada: journey ? { id: journey.id, estado: journey.estado, repartidor: journey.repartidor_id || "", vehiculo: journey.vehiculo_id || "", ruta: journey.ruta || "" } : { id: "", estado: "ABIERTA", repartidor: userId || "", vehiculo: "", ruta: "" }, pedidosAsignados: (orders || []).length, entregados: deliveredOrders.length, noEntregados: Math.max(0, (orders || []).length - deliveredOrders.length), ventasEntregadas: deliveredOrders.reduce((sum, row) => sum + number(row.total), 0), totalCobrado: paid, saldoPendiente: (orders || []).reduce((sum, row) => sum + number(row.total), 0) - paid, cobros: { efectivo: sums.EFECTIVO || 0, yape: sums.YAPE || 0, plin: sums.PLIN || 0, transferencia: sums.TRANSFERENCIA || 0, otros: sums.OTRO || 0, total: paid }, saldos: { dentroPlazo: 0, urgente: 0 }, noEntregadosDetalle: { clienteAusente: (deliveries || []).filter(row => row.estado === "CLIENTE_AUSENTE").length, reprogramados: (deliveries || []).filter(row => row.estado === "REPROGRAMADO").length, rechazados: (deliveries || []).filter(row => row.estado === "RECHAZADO").length, pendientes: Math.max(0, (orders || []).length - (deliveries || []).length) }, gastos: { total: expenseTotal, pendientes: expensePending, aprobados: expenseTotal - expensePending, porCategoria: (expenses || []).reduce<Record<string, number>>((result, row) => { result[row.categoria] = (result[row.categoria] || 0) + number(row.monto); return result; }, {}) }, efectivoEsperado: Math.max(0, (sums.EFECTIVO || 0) - cashExpenses) };
}

export async function closeNativeJourney(userId: string, payload: ExpensePayload) {
  const summary = await getNativeJourneySummary(payload.fecha, userId); if (!summary.jornada.id) throw new Error("No existe una jornada asignada para cerrar.");
  const delivered = number(payload.efectivoEntregado), difference = Math.round((delivered - summary.efectivoEsperado) * 100) / 100;
  if (summary.noEntregados > 0 && !String(payload.observacionNoEntregados || "").trim()) return { ok: false, mensaje: "Identifica los pedidos no entregados antes de cerrar." };
  if (Math.abs(difference) > .01 && !String(payload.observacion || "").trim()) return { ok: false, mensaje: "La diferencia de efectivo requiere una observación." };
  const admin = getSupabaseAdminClient(); const { error } = await admin.from("jornadas").update({ estado: "CERRADA", closed_at: new Date().toISOString() }).eq("id", summary.jornada.id); if (error) throw error;
  const { error: renditionError } = await admin.from("rendiciones").upsert({ jornada_id: summary.jornada.id, efectivo_esperado: summary.efectivoEsperado, efectivo_rendido: delivered, diferencia: difference, observacion: String(payload.observacion || payload.observacionNoEntregados || ""), estado: Math.abs(difference) <= .01 ? "VALIDADA" : "OBSERVADA", usuario_id: userId }, { onConflict: "jornada_id" }); if (renditionError) throw renditionError;
  return { ok: true, mensaje: "Jornada cerrada correctamente.", resumen: summary, diferencia: difference };
}

export async function getNativeRendition(date: unknown = limaToday(), userId?: string) {
  const summary = await getNativeJourneySummary(date, userId), admin = getSupabaseAdminClient();
  const { data } = summary.jornada.id ? await admin.from("rendiciones").select("*").eq("jornada_id", summary.jornada.id).maybeSingle() : { data: null };
  return { fecha: String(date || limaToday()), fuente: "SUPABASE", pedidosPendientes: summary.noEntregados, declarado: { efectivo: summary.cobros.efectivo, yape: summary.cobros.yape + summary.cobros.plin, otros: summary.cobros.transferencia + summary.cobros.otros, gastosEfectivo: summary.cobros.efectivo - summary.efectivoEsperado, gastosVirtuales: 0, efectivoEsperado: summary.efectivoEsperado, pendiente: summary.saldoPendiente }, validacion: data ? { efectivoRecibido: number(data.efectivo_rendido), yapeVerificado: summary.cobros.yape + summary.cobros.plin, otrosVerificado: summary.cobros.transferencia + summary.cobros.otros, diferencia: number(data.diferencia), estado: data.estado, observacion: data.observacion || "" } : null };
}

const periodParts=(value:unknown)=>{const match=/^(\d{4})-(\d{2})$/.exec(String(value||""));if(!match)throw new Error("Periodo inválido.");return{year:Number(match[1]),month:Number(match[2]),period:match[0]};};
export async function saveNativeFinancialMovement(userId:string,payload:EntityPayload){const amount=number(payload.monto);if(amount<=0)throw new Error("El monto debe ser mayor que cero.");const type=String(payload.tipo||"GASTO").toUpperCase(),{error}=await getSupabaseAdminClient().from("movimientos_financieros").insert({fecha:String(payload.fecha||limaToday()),tipo:type,categoria:String(payload.categoria||"OTROS"),concepto:String(payload.concepto||payload.descripcion||""),monto:amount,usuario_id:userId});if(error)throw error;return "Movimiento financiero registrado correctamente.";}
export async function getNativePlan(value:unknown){const{year,month,period}=periodParts(value),db=getSupabaseAdminClient();const{data:budget,error}=await db.from("presupuestos").select("*").eq("anio",year).eq("mes",month).maybeSingle();if(error)throw error;let rows:Array<Record<string,unknown>>=[];if(budget){const{data,error:detailError}=await db.from("presupuesto_detalle").select("*").eq("presupuesto_id",budget.id);if(detailError)throw detailError;rows=(data||[]).map(row=>({id:row.id,tipo:row.categoria,categoria:row.partida,concepto:row.partida,monto:number(row.monto),unidad:"DISTRIBUCIÓN"}));if(number(budget.objetivo_ventas)>0)rows.unshift({id:`goal-${budget.id}`,tipo:"OPERACIÓN INGRESO",categoria:"VENTAS",concepto:"Objetivo comercial",monto:number(budget.objetivo_ventas),unidad:"DISTRIBUCIÓN"});}const income=rows.filter(row=>String(row.tipo).includes("INGRESO")).reduce((s,r)=>s+number(r.monto),0),expense=rows.filter(row=>String(row.tipo).includes("GASTO")).reduce((s,r)=>s+number(r.monto),0);return{periodo:period,filas:rows,resumen:{ingresos:income,gastos:expense,inversion:0,financiamientoEntrada:0,financiamientoSalida:0,flujoOperativo:income-expense,flujoTotal:income-expense},objetivos:[]};}
export async function saveNativePlan(payload:EntityPayload){const{year,month}=periodParts(payload.periodo),db=getSupabaseAdminClient(),rows=Array.isArray(payload.filas)?payload.filas as EntityPayload[]:[],goal=rows.filter(row=>String(row.tipo||"").includes("INGRESO")).reduce((s,row)=>s+number(row.monto),0);const{data:budget,error}=await db.from("presupuestos").upsert({anio:year,mes:month,objetivo_ventas:goal,estado:"ACTIVO"},{onConflict:"anio,mes"}).select("id").single();if(error)throw error;const removed=await db.from("presupuesto_detalle").delete().eq("presupuesto_id",budget.id);if(removed.error)throw removed.error;const details=rows.filter(row=>!String(row.tipo||"").includes("INGRESO")&&String(row.concepto||"").trim()).map(row=>({presupuesto_id:budget.id,categoria:String(row.tipo||"OPERACIÓN GASTO"),partida:String(row.concepto||row.categoria||"OTROS"),monto:number(row.monto)}));if(details.length){const inserted=await db.from("presupuesto_detalle").insert(details);if(inserted.error)throw inserted.error;}return "Planeamiento mensual guardado correctamente.";}
export async function duplicateNativePlan(value:unknown){const{year,month,period}=periodParts(value),date=new Date(year,month-2,1),previous=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`,plan=await getNativePlan(previous);if(!plan.filas.length)throw new Error("No existe planeamiento del mes anterior.");return saveNativePlan({periodo:period,filas:plan.filas});}
export async function getNativeAccounting(value:unknown){const{year,month,period}=periodParts(value),days=new Date(year,month,0).getDate(),db=getSupabaseAdminClient(),from=`${period}-01`,to=`${period}-${String(days).padStart(2,"0")}`,{data,error}=await db.from("movimientos_financieros").select("*").gte("fecha",from).lte("fecha",to).order("fecha");if(error)throw error;const groups=new Map<string,{tipo:string;categoria:string;concepto:string;valores:Record<number,number>;medios:Record<number,string>;origen:string}>();for(const row of data||[]){const key=`${row.tipo}|${row.categoria}|${row.concepto||""}`,item=groups.get(key)||{tipo:row.tipo,categoria:row.categoria,concepto:row.concepto||"",valores:{},medios:{},origen:row.referencia_tipo||"MANUAL"},day=Number(String(row.fecha).slice(8,10));item.valores[day]=(item.valores[day]||0)+number(row.monto);item.medios[day]="EFECTIVO";groups.set(key,item);}const today=limaToday(),states=Object.fromEntries(Array.from({length:days},(_,i)=>{const date=`${period}-${String(i+1).padStart(2,"0")}`;return[i+1,date>today?"FUTURO":date===today?"ACTUAL":"ABIERTO"];}));return{periodo:period,dias:days,filas:[...groups.values()],estados:states,cierres:{},hoy:today,saldoCxc:0};}
export async function saveNativeAccounting(userId:string,payload:EntityPayload){const{period}=periodParts(payload.periodo),db=getSupabaseAdminClient(),rows=Array.isArray(payload.filas)?payload.filas as EntityPayload[]:[];const removed=await db.from("movimientos_financieros").delete().gte("fecha",`${period}-01`).lte("fecha",`${period}-31`).is("referencia_tipo",null);if(removed.error)throw removed.error;const inserts:Array<{fecha:string;tipo:string;categoria:string;concepto:string;monto:number;usuario_id:string}>=[];for(const row of rows){const values=(row.valores||{}) as Record<string,unknown>;for(const[day,raw]of Object.entries(values)){const amount=number(raw);if(amount)inserts.push({fecha:`${period}-${String(day).padStart(2,"0")}`,tipo:String(row.tipo||"OPERACIÓN GASTO"),categoria:String(row.categoria||"OTROS"),concepto:String(row.concepto||""),monto:amount,usuario_id:userId});}}if(inserts.length){const result=await db.from("movimientos_financieros").insert(inserts);if(result.error)throw result.error;}return`Control contable diario guardado correctamente. Registros escritos: ${inserts.length}.`;}
export async function getNativeAnalysis(typeValue:unknown){const type=String(typeValue||"").toUpperCase(),db=getSupabaseAdminClient();if(type==="PRODUCTOS"){const{data:details,error}=await db.from("pedido_detalle").select("producto_id,cantidad_unidades_base,subtotal");if(error)throw error;const ids=[...new Set((details||[]).map(row=>row.producto_id))],{data:products}=await db.from("productos").select("id,codigo,nombre").in("id",ids.length?ids:[crypto.randomUUID()]);const map=new Map((products||[]).map(row=>[row.id,row]));return[...new Map((details||[]).map(row=>[row.producto_id,{nombre:map.get(row.producto_id)?.nombre||"Producto",codigo:map.get(row.producto_id)?.codigo||"",ventas:0,total:0}])).values()].map(item=>{for(const row of details||[])if(map.get(row.producto_id)?.codigo===item.codigo){item.ventas+=number(row.cantidad_unidades_base);item.total+=number(row.subtotal);}return item;}).sort((a,b)=>b.total-a.total);}const{data:orders,error}=await db.from("pedidos").select("cliente_id,total");if(error)throw error;const ids=[...new Set((orders||[]).map(row=>row.cliente_id))],{data:clients}=await db.from("clientes").select("id,nombre").in("id",ids.length?ids:[crypto.randomUUID()]);const map=new Map((clients||[]).map(row=>[row.id,row.nombre])),result=new Map<string,{cliente:string;total:number;ventas:number}>();for(const row of orders||[]){const item=result.get(row.cliente_id)||{cliente:map.get(row.cliente_id)||"Cliente",total:0,ventas:0};item.total+=number(row.total);item.ventas++;result.set(row.cliente_id,item);}return[...result.values()].sort((a,b)=>b.total-a.total);}

export async function getNativeCurve(indicatorValue:unknown,viewValue:unknown,dateValue:unknown){const indicator=String(indicatorValue||"INGRESOS").toUpperCase(),view=String(viewValue||"MENSUAL").toUpperCase(),reference=String(dateValue||limaToday()).slice(0,10),year=Number(reference.slice(0,4)),month=Number(reference.slice(5,7)),db=getSupabaseAdminClient();let labels:string[]=[],from="",to="";if(view==="ANUAL"){labels=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];from=`${year}-01-01`;to=`${year}-12-31`;}else{const days=new Date(year,month,0).getDate();labels=Array.from({length:days},(_,i)=>String(i+1));from=`${year}-${String(month).padStart(2,"0")}-01`;to=`${year}-${String(month).padStart(2,"0")}-${days}`;}const[{data:orders,error},{data:movements},{data:payments}]=await Promise.all([db.from("pedidos").select("fecha,total").gte("fecha",`${from}T00:00:00-05:00`).lte("fecha",`${to}T23:59:59-05:00`),db.from("movimientos_financieros").select("fecha,tipo,monto").gte("fecha",from).lte("fecha",to),db.from("pagos").select("fecha,monto").gte("fecha",`${from}T00:00:00-05:00`).lte("fecha",`${to}T23:59:59-05:00`).eq("estado","APLICADO")]);if(error)throw error;const real=Array(labels.length).fill(0),slot=(date:string)=>view==="ANUAL"?Number(date.slice(5,7))-1:Number(date.slice(8,10))-1;for(const row of orders||[])if(indicator==="VENTAS")real[slot(row.fecha)]+=number(row.total);for(const row of payments||[])if(indicator==="INGRESOS")real[slot(row.fecha)]+=number(row.monto);for(const row of movements||[]){if(indicator==="INGRESOS"&&String(row.tipo).includes("INGRESO"))real[slot(row.fecha)]+=number(row.monto);if(indicator==="GASTOS"&&String(row.tipo).includes("GASTO"))real[slot(row.fecha)]+=number(row.monto);}const period=`${year}-${String(month).padStart(2,"0")}`,plan=await getNativePlan(period),plannedTotal=indicator==="GASTOS"?number(plan.resumen.gastos):number(plan.resumen.ingresos),planeado=Array(labels.length).fill(plannedTotal/labels.length);return{labels,planeado,real,resumen:{planeado:plannedTotal,real:real.reduce((s,v)=>s+v,0),ingresos:indicator==="INGRESOS"?real.reduce((s,v)=>s+v,0):0,gastos:indicator==="GASTOS"?real.reduce((s,v)=>s+v,0):0,cuentasPorCobrar:0},canales:{cuentasPorCobrar:0},desde:from,hasta:to};}
