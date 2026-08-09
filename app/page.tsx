"use client";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./birthday.css";
import "./sales-enhancements.css";
import "./sales-fixes.css";
import "./sale-lock.css";
import "./collections.css";
type Session = {
    token: string;
    usuario: string;
    nombre: string;
    perfil: string;
    permisos: string[];
};
type Product = {
    codigo: string;
    nombre: string;
    unidad: string;
    grupo: string;
    stock: number;
    stockMin: number;
    precioCosto: number;
    precioVenta: number;
    nombrePresentacion?: string;
    factorPresentacion?: number;
    precioPresentacion?: number;
    permiteFraccionamiento?: string;
    fraccionesPermitidas?: string;
    controlaDecimales?: string;
};
type Client = {
    id: string;
    nombre: string;
    apellidos: string;
    correo: string;
    contacto: string;
    fechaCumpleanos: string;
    direccion: string;
    comentarios?: string;
    estado?: string;
};
type SaleItem = {
    codigo: string;
    nombre: string;
    cantidad: number;
    precioVenta: number;
    unidad?: string;
    factor: number;
    unidadesSueltas: number;
    detalleUnidad: string;
    stock: number;
    nombrePresentacion?: string;
    fraccion?: number;
    cantidadEntera?: number;
    permiteFraccionamiento?: boolean;
    fraccionesPermitidas?: Array<{ label: string; value: number }>;
    fraccionActiva?: boolean;
};
type Order = {
    ventaId: string;
    fecha: string;
    cliente: string;
    total: number;
    itemsCount: number;
    observaciones: string;
    items: Array<{
        codigo: string;
        nombre: string;
        cantidad: number;
        precioUnitario: number;
        subtotal: number;
    }>;
    estadoEntrega?: string;
    estadoOperativo?: string;
    fechaEntrega?: string;
    estadoCobro?: string;
    totalCobrado?: number;
    saldo?: number;
    efectivo?: number;
    yape?: number;
    plin?: number;
    transferencia?: number;
    pos?: number;
    otros?: number;
    fechaPromesa?: string;
    medioPrometido?: string;
    observacionCobro?: string;
    codigoImpresion?: string;
    fechaImpresion?: string;
};
type Summary = {
    totalProductos: number;
    totalMovimientos: number;
    sinStock: number;
    stockBajo: number;
    cumpleanos: number;
    totalClientes: number;
    valorTotalInventario: number;
};
type ApiRecord = { [key: string]: never };
type UserRecord = { usuario: string; originalUsuario?: string; nombre: string; password?: string; perfil: string; estado: string; comentarios: string; permisos: string[]; nuevo?: boolean };
type FinanceRow = { id?: string; tipo: string; categoria: string; concepto?: string; monto?: number; unidad?: string; activo?: boolean; valores?: Record<string, number>; medios?: Record<string, string> };
type PlanData = { filas: FinanceRow[]; resumen?: { ingresos?: number; gastos?: number } };
type AccountingData = { filas: FinanceRow[]; cuentasPorCobrar?: number };
type CurveData = { labels?: string[]; planeado?: number[]; real?: number[]; resumen?: { planeado?: number; real?: number; ingresos?: number; gastos?: number; cuentasPorCobrar?: number }; canales?: { cuentasPorCobrar?: number } };
type RenditionData = { fecha: string; fuente?: string; pedidosPendientes?: number; declarado: { efectivo?: number; yape?: number; otros?: number; gastosEfectivo?: number; gastosVirtuales?: number; efectivoEsperado?: number; pendiente?: number }; validacion: null | { efectivoRecibido?: number; yapeVerificado?: number; otrosVerificado?: number; observacion?: string } };
type JourneySummary = { fecha: string; jornada?: { id?: string; estado?: string; repartidor?: string; vehiculo?: string; ruta?: string }; pedidosAsignados: number; entregados: number; noEntregados: number; ventasEntregadas: number; totalCobrado: number; saldoPendiente: number; cobros: { total: number; efectivo: number; yape: number; plin: number; transferencia: number; otros: number }; saldos: { dentroPlazo: number; urgente: number }; noEntregadosDetalle?: { pendientes: number; clienteAusente: number; reprogramados: number; rechazados: number; observados?: number }; gastos: { total: number; pendientes: number; aprobados: number; porCategoria: Record<string, number> }; efectivoEsperado: number };
type ExpenseApproval = { solicitudId: string; fecha: string; partida: string; descripcion: string; importe: number; canal: string; usuario: string; estadoAprobacion?: string; observacion?: string; origenDinero?: string; proveedor?: string };
type ActivityRecord = { id: string; fecha: string; fechaOrden: number; tipo: string; ventaId: string; cliente: string; descripcion: string; monto: number; usuario: string };
type PreparationLine = { ventaId: string; codigo: string; producto: string; cantidadPedido: number; presentacion?: string; unidadesBase: number; cantidadPreparada: number; estadoLinea: "PENDIENTE" | "PREPARADO" | "FALTANTE" | "OBSERVADO"; cantidadFaltante: number; motivo: string; observacion: string; estadoStock: string; stockFisico: number; stockReservado: number; stockEnRuta: number; stockDisponible: number };
type AnalysisSeries = { codigo: string; nombre: string; slot: number; meses: number[]; total: number };
type AnalysisGroup = { nombre: string; cantidad: number };
type AnalysisDashboard = { meses: string[]; opciones: Array<{ codigo: string; nombre: string }>; seleccion: string[]; series: AnalysisSeries[]; distribucion: AnalysisGroup[]; totalProductos: number; totalVentas: number };
const budgetTemplate: Array<{ categoria: string; concepto: string }> = [
    ["PERSONAL", "Sueldos"], ["PERSONAL", "Comisiones"], ["PERSONAL", "Beneficios"], ["PERSONAL", "Personal eventual"],
    ["VEHÍCULOS", "Cuota camión"], ["VEHÍCULOS", "Cuota moto"], ["VEHÍCULOS", "SOAT"], ["VEHÍCULOS", "Seguro"], ["VEHÍCULOS", "Mantenimiento"], ["VEHÍCULOS", "Reparaciones"], ["VEHÍCULOS", "Repuestos"],
    ["COMBUSTIBLE", "Camión"], ["COMBUSTIBLE", "Moto"], ["OPERACIÓN", "Alquiler"], ["OPERACIÓN", "Luz"], ["OPERACIÓN", "Agua"], ["OPERACIÓN", "Internet"], ["OPERACIÓN", "Telefonía"], ["OPERACIÓN", "Almacén"], ["OPERACIÓN", "Embalaje"],
    ["DISTRIBUCIÓN", "Peajes"], ["DISTRIBUCIÓN", "Estacionamiento"], ["DISTRIBUCIÓN", "Viáticos"], ["DISTRIBUCIÓN", "Alimentación"], ["DISTRIBUCIÓN", "Hospedaje"],
    ["FINANCIEROS", "Cuota banco"], ["FINANCIEROS", "Intereses"], ["FINANCIEROS", "Comisiones bancarias"], ["ADMINISTRACIÓN", "Contabilidad"], ["ADMINISTRACIÓN", "Impuestos"], ["ADMINISTRACIÓN", "Software"], ["ADMINISTRACIÓN", "Licencias"],
    ["OTROS", "Gastos imprevistos"], ["OTROS", "Recreacionales / bienestar"], ["OTROS", "Otros"]
].map(([categoria, concepto]) => ({ categoria, concepto }));
const menu = ["Inicio", "Clientes", "Preventa", "Pedidos y emisión", "Cobranza y rendición", "Productos e inventario", "Gestión financiera", "Reportes", "Análisis", "Configuración"];
const icons: Record<string, string> = { Inicio: "⌂", Clientes: "♙", Preventa: "▣", "Pedidos y emisión": "▤", "Cobranza y rendición": "◉", "Productos e inventario": "□", "Gestión financiera": "↗", Reportes: "▥", Análisis: "⌁", Configuración: "⚙" };
const modulePermissions = [
    { label: "Inicio", key: "dashboard" },
    { label: "Clientes", key: "clientes" },
    { label: "Preventa", key: "ventas" },
    { label: "Pedidos", key: "emisiones" },
    { label: "Cobranza", key: "cobranza" },
    { label: "Inventario", key: "inventario" },
    { label: "Finanzas", key: "centroGerencial" },
    { label: "Reportes", key: "reportes" },
    { label: "Análisis", key: "analisis" },
    { label: "Configuración", key: "configuracion" }
];
function defaultPermissions(profile: string) {
    const p = String(profile || "").toUpperCase();
    if (p === "MASTER")
        return modulePermissions.map(x => x.key);
    if (p === "PREVENTA")
        return ["dashboard", "clientes", "ventas", "emisiones", "cobranza"];
    if (p === "COMPRADOR")
        return ["dashboard", "emisiones", "inventario", "reportes", "analisis"];
    return ["dashboard"];
}
function canViewModule(session: Session, name: string) {
    const p = session.permisos?.length ? session.permisos : defaultPermissions(session.perfil);
    if (name === "Clientes")
        return p.includes("clientes");
    if (name === "Preventa")
        return p.includes("ventas");
    if (name === "Pedidos y emisión")
        return p.includes("emisiones");
    if (name === "Cobranza y rendición")
        return p.includes("cobranza");
    if (name === "Productos e inventario")
        return p.includes("inventario");
    if (name === "Reportes")
        return p.includes("reportes");
    if (name === "Análisis")
        return p.includes("analisis");
    if (name === "Gestión financiera")
        return p.includes("centroGerencial");
    if (name === "Configuración")
        return p.includes("configuracion");
    return name === "Inicio" && p.includes("dashboard");
}
const today = () => { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const get = (type: string) => parts.find(p => p.type === type)?.value || ""; return `${get("year")}-${get("month")}-${get("day")}`; };
const birthdayDays = (value: string) => {
    const match = String(value || "").match(/^(?:(\d{1,2})\/(\d{1,2})\/\d{4}|\d{4}-(\d{1,2})-(\d{1,2}))/);
    if (!match)
        return 999;
    const day = Number(match[1] || match[4]), monthValue = Number(match[2] || match[3]);
    const [year, monthNow, dayNow] = today().split("-").map(Number);
    const start = Date.UTC(year, monthNow - 1, dayNow), currentYear = Date.UTC(year, monthValue - 1, day);
    const target = currentYear < start ? Date.UTC(year + 1, monthValue - 1, day) : currentYear;
    return Math.round((target - start) / 86400000);
};
const addDays = (value: string, amount: number) => { const [y, m, d] = value.split("-").map(Number); const date = new Date(Date.UTC(y, m - 1, d + amount)); return date.toISOString().slice(0, 10); };
const daysSince = (value: string) => {
    const match = String(value || "").match(/^(?:(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{4})-(\d{1,2})-(\d{1,2}))/);
    if (!match)
        return 0;
    const y = Number(match[3] || match[4]), m = Number(match[2] || match[5]), d = Number(match[1] || match[6]);
    const [ty, tm, td] = today().split("-").map(Number);
    return Math.max(0, Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000));
};
const month = () => today().slice(0, 7);
const money = (n: unknown) => `S/ ${Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const normalizeOperationalState = (value: unknown) => {
    const state = String(value || "POR_COMPRAR").trim().toUpperCase().replace(/\s+/g, "_");
    if (state === "COMPRADO" || state === "LISTO_PARA_ENTREGA") return "LISTO_PARA_ENTREGA";
    if (state === "ENTREGADO") return "ENTREGADO";
    if (state === "OBSERVADO") return "OBSERVADO";
    return "POR_COMPRAR";
};
const dedupeOrders = (rows: Order[] = []) => [...new Map(rows.filter(row => row?.ventaId).map(row => [String(row.ventaId), { ...row, estadoOperativo: normalizeOperationalState(row.estadoOperativo || row.estadoEntrega) }])).values()];
const cacheGet = <T,>(key: string, fallback: T): T => {
    try {
        return JSON.parse(localStorage.getItem(key) || "") as T;
    }
    catch {
        return fallback;
    }
};
const cacheSet = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
const collectionRendition = (rows: Order[]) => {
    const sum = (key: keyof Order) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
    const efectivo = sum("efectivo");
    const yape = sum("yape") + sum("plin");
    const otros = sum("transferencia") + sum("pos") + sum("otros");
    return {
        fecha: today(),
        fuente: "CACHE_COBRANZA",
        pedidosPendientes: rows.filter(row => Number(row.totalCobrado || 0) > 0).length,
        declarado: { efectivo, yape, otros, gastosEfectivo: 0, gastosVirtuales: 0, efectivoEsperado: efectivo },
        validacion: null,
    };
};
const READ_ONLY = new Set(["obtenerSesion", "obtenerResumen", "obtenerCatalogoProductos", "obtenerClientes", "obtenerClientesPreventa", "obtenerStock", "obtenerEmisiones", "obtenerCobranzaPedidos", "obtenerGastosOperacion", "obtenerRendicionDia", "obtenerMovimientosIngreso", "obtenerHistorial", "obtenerCentroGerencial", "obtenerPlaneamientoMensual", "obtenerContabilidadDiaria", "obtenerCurvaS", "obtenerAnalisis", "obtenerAnalisisVentasTemporal", "obtenerUsuarios", "obtenerListas", "obtenerPreparacionPedido", "obtenerActividadReciente"]);
async function measured<T>(label: string, action: () => Promise<T>): Promise<T> { const started = performance.now(); try { return await action(); } finally { if (process.env.NODE_ENV !== "production") console.info(`[PERF] ${label}: ${Math.round(performance.now() - started)}ms`); } }
async function api<T>(fn: string, args: unknown[] = [], token = ""): Promise<T> {
    const response = await fetch("/api/qaso", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fn, args, token }) });
    const envelope = await response.json();
    if (!response.ok || envelope.ok === false)
        throw new Error(envelope.message || envelope.error || "No se pudo consultar Google Sheets.");
    return envelope.resultado as T;
}
function Login({ onLogin }: {
    onLogin: (s: Session) => void;
}) {
    const [usuario, setUsuario] = useState("master");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            const r = await api<Session & {
                ok: boolean;
                mensaje?: string;
            }>("loginUsuario", [usuario, password]);
            if (!r.ok)
                throw new Error(r.mensaje || "Credenciales incorrectas");
            cacheSet("nexoventa_session", r);
            onLogin(r);
        }
        catch (x) {
            setError(x instanceof Error ? x.message : "No se pudo iniciar sesión");
        }
        finally {
            setBusy(false);
        }
    }
    return <main className="login-page"><form className="login-card" onSubmit={submit}><div className="brand login-brand"><span className="brand-mark">N</span><div><strong>NexoVenta</strong><small>Operación conectada a Google Sheets</small></div></div><span className="eyebrow">ACCESO SEGURO</span><h1>Bienvenido</h1><p>Ingresa con el usuario configurado en la hoja <b>Usuarios</b>.</p><label>Usuario<input value={usuario} onChange={e => setUsuario(e.target.value)} autoComplete="username" required/></label><label>Contraseña<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required/></label>{error && <div className="form-error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "Conectando…" : "Ingresar"}</button><small>Usuario inicial: master · contraseña inicial definida en Apps Script</small></form></main>;
}
export default function Home() {
    const [session, setSession] = useState<Session | null>(null);
    const [checking, setChecking] = useState(true);
    const [active, setActive] = useState("Inicio");
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [online, setOnline] = useState(true);
    const [toast, setToast] = useState("");
    const [pending, setPending] = useState(0);
    const [products, setProducts] = useState<Product[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [collectionRows, setCollectionRows] = useState<Order[]>([]);
    const [activities, setActivities] = useState<ActivityRecord[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(false);
    const [collectionsLoading, setCollectionsLoading] = useState(false);
    const [dataSourceLabel, setDataSourceLabel] = useState("SHEETS");
    useEffect(() => { void fetch("/api/data-source", { cache: "no-store" }).then(response => response.json()).then((status: { label?: string }) => setDataSourceLabel(status.label || "SHEETS")).catch(() => setDataSourceLabel("SHEETS")); }, []);
    const notify = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(""), 3200); }, []);
    const call = useCallback(async <T,>(fn: string, args: unknown[] = []) => {
        const visible = !READ_ONLY.has(fn);
        if (visible)
            setPending(n => n + 1);
        try {
            const result = await api<T>(fn, args, session?.token || "");
            if (visible) window.dispatchEvent(new CustomEvent("nexo:activity"));
            return result;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo consultar Google Sheets.";
            if (/sesi[oó]n expirada|vuelva a iniciar|ingrese usuario/i.test(message)) {
                localStorage.removeItem("nexoventa_session");
                setSession(null);
                throw new Error("Tu sesión venció. Ingresa nuevamente para continuar.");
            }
            throw error;
        }
        finally {
            if (visible)
                setPending(n => Math.max(0, n - 1));
        }
    }, [session]);
    const refreshClients = useCallback(async () => {
        if (!session || !navigator.onLine)
            return;
        const c = await call<Client[]>("obtenerClientes", [""]);
        setClients(c || []);
        cacheSet("nexo_clients", c || []);
    }, [call, session]);
    const refreshActivity = useCallback(async () => {
        if (!session || !navigator.onLine) return;
        try { const next = await call<ActivityRecord[]>("obtenerActividadReciente", [15]); setActivities(next || []); cacheSet("nexo_activities", next || []); }
        catch { setActivities(cacheGet<ActivityRecord[]>("nexo_activities", [])); }
    }, [call, session]);
    useEffect(() => { const update = () => window.setTimeout(() => void refreshActivity(), 250); window.addEventListener("nexo:activity", update); return () => window.removeEventListener("nexo:activity", update); }, [refreshActivity]);
    const refreshProducts = useCallback(async () => {
        if (!session || !navigator.onLine)
            return;
        const p = await call<Product[]>("obtenerCatalogoProductos");
        setProducts(p || []);
        cacheSet("nexo_products", p || []);
    }, [call, session]);
    const refreshCollections = useCallback(async () => {
        if (!session || !navigator.onLine)
            return;
        setCollectionsLoading(true);
        try {
            const rows = await call<Order[]>("obtenerCobranzaPedidos", [{ desde: `${today().slice(0, 4)}-01-01`, hasta: today() }]);
            setCollectionRows(rows || []);
            cacheSet("nexo_collections", rows || []);
        }
        catch (e) {
            notify(e instanceof Error ? e.message : "No se pudo cargar cobranza");
        }
        finally {
            setCollectionsLoading(false);
        }
    }, [call, notify, session]);
    const refresh = useCallback(async () => {
        if (!session || !navigator.onLine)
            return;
        setLoading(true);
        try {
            if (active === "Clientes") {
                await refreshClients();
                notify("Clientes actualizados directamente desde Sheets");
                return;
            }
            if (active === "Productos e inventario") {
                await refreshProducts();
                return;
            }
            if (active === "Cobranza y rendición") {
                await refreshCollections();
                return;
            }
            if (active === "Pedidos y emisión") {
                const o = await call<Order[]>("obtenerCobranzaPedidos", [{ desde: "2020-01-01", hasta: today() }]);
                const unique = dedupeOrders(o || []);
                setOrders(unique);
                cacheSet("nexo_orders", unique);
                return;
            }
            const [p, c, o, s] = await Promise.all([call<Product[]>("obtenerCatalogoProductos"), call<Client[]>("obtenerClientes", [""]), call<Order[]>("obtenerEmisiones", [{}]), call<Summary>("obtenerResumen")]);
            setProducts(p || []);
            setClients(c || []);
            setOrders(dedupeOrders(o || []));
            setSummary(s);
            cacheSet("nexo_products", p);
            cacheSet("nexo_clients", c);
            cacheSet("nexo_orders", o);
            cacheSet("nexo_summary", s);
        }
        catch (e) {
            notify(e instanceof Error ? e.message : "No se pudo actualizar");
        }
        finally {
            setLoading(false);
        }
    }, [active, call, notify, refreshClients, refreshCollections, refreshProducts, session]);
    const syncQueue = useCallback(async () => {
        if (!session || !navigator.onLine)
            return;
        const queue = cacheGet<Array<{
            id: string;
            payload: unknown;
        }>>("nexo_sale_queue", []);
        if (!queue.length)
            return;
        const pending = [];
        for (const item of queue) {
            try {
                const r = await call<{
                    ok: boolean;
                    mensaje: string;
                }>("registrarVenta", [item.payload]);
                if (!r.ok)
                    throw new Error(r.mensaje);
            }
            catch {
                pending.push(item);
            }
        }
        cacheSet("nexo_sale_queue", pending);
        if (pending.length !== queue.length)
            notify(`${queue.length - pending.length} preventa(s) sincronizadas`);
    }, [call, notify, session]);
    useEffect(() => {
        const saved = cacheGet<Session | null>("nexoventa_session", null);
        if (!saved?.token) {
            queueMicrotask(() => setChecking(false));
            return;
        }
        api<Session & {
            ok: boolean;
        }>("obtenerSesion", [saved.token]).then(r => {
            if (!r.ok)
                throw new Error();
            setSession(r);
        }).catch(() => localStorage.removeItem("nexoventa_session")).finally(() => setChecking(false));
    }, []);
    useEffect(() => {
        const state = () => setOnline(navigator.onLine);
        queueMicrotask(state);
        window.addEventListener("online", state);
        window.addEventListener("offline", state);
        if ("serviceWorker" in navigator)
            navigator.serviceWorker.register("/sw.js").catch(() => undefined);
        return () => { window.removeEventListener("online", state); window.removeEventListener("offline", state); };
    }, []);
    useEffect(() => {
        const isZeroNumber = (target: EventTarget | null): target is HTMLInputElement => target instanceof HTMLInputElement && target.type === "number" && Number(target.value) === 0;
        const selectZero = (event: Event) => {
            if (isZeroNumber(event.target))
                event.target.select();
        };
        const keepZeroSelected = (event: PointerEvent) => {
            if (!isZeroNumber(event.target))
                return;
            event.preventDefault();
            event.target.select();
        };
        document.addEventListener("focusin", selectZero);
        document.addEventListener("pointerup", keepZeroSelected, true);
        return () => { document.removeEventListener("focusin", selectZero); document.removeEventListener("pointerup", keepZeroSelected, true); };
    }, []);
    useEffect(() => {
        if (!session)
            return;
        queueMicrotask(() => {
            setProducts(cacheGet("nexo_products", [])); setClients(cacheGet("nexo_clients", [])); setOrders(dedupeOrders(cacheGet("nexo_orders", [])));
            setCollectionRows(cacheGet("nexo_collections", [])); setActivities(cacheGet("nexo_activities", [])); setSummary(cacheGet("nexo_summary", null));
        });
    }, [session]);
    useEffect(() => {
        if (session && active === "Inicio")
            queueMicrotask(() => { void refreshCollections(); void refreshActivity(); });
    }, [active, refreshActivity, refreshCollections, session]);
    useEffect(() => {
        if (session)
            queueMicrotask(() => void refresh().then(syncQueue));
    }, [active, session, refresh, syncQueue]);
    useEffect(() => {
        if (online && session)
            queueMicrotask(() => void syncQueue().then(refresh));
    }, [online, refresh, session, syncQueue]);
    useEffect(() => {
        if (!session || canViewModule(session, active))
            return;
        const first = menu.find(label => canViewModule(session, label));
        if (first)
            queueMicrotask(() => setActive(first));
    }, [active, session]);
    async function logout() {
        try {
            if (session)
                await call("cerrarSesion", [session.token]);
        }
        catch { }
        localStorage.removeItem("nexoventa_session");
        setSession(null);
    }
    if (checking)
        return <main className="login-page"><div className="login-card"><h2>Conectando con Google Sheets…</h2></div></main>;
    if (!session)
        return <Login onLogin={s => { setSession(s); setChecking(false); }}/>;
    const allowed = (name: string) => canViewModule(session, name);
    const navigate = (label: string) => { setActive(label); setMobileMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
    const primaryMobile = (session.perfil === "PREVENTA" ? ["Inicio", "Clientes", "Preventa", "Pedidos y emisión"] : ["Inicio", "Clientes", "Preventa", "Pedidos y emisión"]).filter(allowed);
    const secondaryMobile = menu.filter(label => allowed(label) && !primaryMobile.includes(label));
    return <main className={`app-shell role-${session.perfil.toLowerCase()} ${pending ? "is-processing" : ""}`}><aside className="sidebar"><div className="brand"><span className="brand-mark">N</span><div><strong>NexoVenta</strong><small>{dataSourceLabel}</small></div></div><nav>{menu.filter(allowed).map(label => <button key={label} className={active === label ? "active" : ""} onClick={() => navigate(label)}><span>{icons[label]}</span>{label}</button>)}</nav><div className="profile"><span>{session.nombre.slice(0, 2).toUpperCase()}</span><div><b>{session.nombre}</b><small>{session.perfil}</small></div><button onClick={logout} title="Cerrar sesión">↪</button></div></aside><section className="workspace"><header className="topbar"><div><small>{new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}</small><h1>{active}</h1></div><div className="top-actions"><span className={`sync-pill ${online ? "" : "offline"}`}>● {online ? (pending ? "Procesando solicitud…" : loading ? "Actualizando…" : `En línea · ${dataSourceLabel}`) : "Sin señal · modo local"}</span><button onClick={refresh} disabled={pending > 0}>↻ Actualizar</button></div></header><div className="content">{active === "Inicio" && <Dashboard summary={summary} orders={orders} clients={clients} receivables={collectionRows} activities={activities} onNavigate={navigate} session={session}/>}{active === "Clientes" && <Clients clients={clients} call={call} refresh={refresh} notify={notify} online={online}/>}{active === "Preventa" && <Sales products={products} clients={clients} call={call} refreshProducts={refreshProducts} notify={notify} online={online}/>}{active === "Pedidos y emisión" && <Orders orders={orders} call={call} refresh={refresh} notify={notify} onOrderUpdated={updated => setOrders(rows => dedupeOrders(rows.map(row => row.ventaId === updated.ventaId ? updated : row)))}/>}{active === "Cobranza y rendición" && <Collections rows={collectionRows} clients={clients} loading={collectionsLoading} load={refreshCollections} call={call} notify={notify}/>}{active === "Productos e inventario" && <Inventory products={products} call={call} refresh={refresh} notify={notify} master={session.perfil === "MASTER"}/>}{active === "Gestión financiera" && <Finance call={call} notify={notify}/>}{active === "Reportes" && <Reports call={call} notify={notify}/>}{active === "Análisis" && <Analytics call={call} notify={notify}/>}{active === "Configuración" && <Settings call={call} notify={notify} session={session}/>}</div></section><nav className="mobile-nav" aria-label="Navegación principal">{primaryMobile.map(label => <button key={label} className={`${active === label ? "active" : ""} ${label === "Preventa" ? "sale" : ""}`} onClick={() => navigate(label)} aria-label={label}><span>{icons[label]}</span><small>{label === "Pedidos y emisión" ? "Pedidos" : label}</small></button>)}<button className={secondaryMobile.includes(active) || mobileMenuOpen ? "active" : ""} onClick={() => setMobileMenuOpen(v => !v)} aria-label="Abrir más opciones" aria-expanded={mobileMenuOpen}><span>☰</span><small>Más</small></button></nav>{mobileMenuOpen && <div className="mobile-more-backdrop" onClick={() => setMobileMenuOpen(false)}><section className="mobile-more" onClick={e => e.stopPropagation()}><div className="mobile-more-head"><div><strong>Menú de NexoVenta</strong><small>{session.nombre} · {session.perfil}</small></div><button onClick={() => setMobileMenuOpen(false)} aria-label="Cerrar menú">×</button></div><div className="mobile-more-grid">{secondaryMobile.map(label => <button key={label} className={active === label ? "active" : ""} onClick={() => navigate(label)}><span>{icons[label]}</span><b>{label}</b></button>)}</div><button className="mobile-logout" onClick={logout}>↪ Cerrar sesión</button></section></div>}{pending > 0 && <div className="processing-banner"><i></i><span><b>Procesando solicitud</b><small>No cierres la ventana ni vuelvas a presionar el botón.</small></span></div>}{toast && <div className="toast">{toast}</div>}</main>;
}
function Heading({ eyebrow, title, text, children }: {
    eyebrow: string;
    title: string;
    text: string;
    children?: React.ReactNode;
}) { return <section className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{text}</p></div>{children}</section>; }
function Dashboard({ summary, orders, clients, receivables, activities, onNavigate, session }: {
    summary: Summary | null;
    orders: Order[];
    clients: Client[];
    receivables: Order[];
    activities: ActivityRecord[];
    onNavigate: (s: string) => void;
    session: Session;
}) {
    const isPreventa = String(session.perfil).toUpperCase() === "PREVENTA";
    const orderDate = (value: string) => {
        const match = String(value || "").match(/^(?:(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{4})-(\d{1,2})-(\d{1,2}))/);
        if (!match) return "";
        return match[4] ? `${match[4]}-${String(match[5]).padStart(2, "0")}-${String(match[6]).padStart(2, "0")}` : `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
    };
    const todayOrders = orders.filter(o => orderDate(o.fecha) === today());
    const monthOrders = orders.filter(o => orderDate(o.fecha).startsWith(month()));
    const salesToday = todayOrders.reduce((a, o) => a + Number(o.total || 0), 0);
    const salesMonth = monthOrders.reduce((a, o) => a + Number(o.total || 0), 0);
    const ticketAverage = monthOrders.length ? salesMonth / monthOrders.length : 0;
    const [monthlyGoal, setMonthlyGoal] = useState(() => cacheGet<number>("nexo_monthly_goal", 20000));
    const goalProgress = monthlyGoal > 0 ? Math.min(100, (salesMonth / monthlyGoal) * 100) : 0;
    const [birthdayOpen, setBirthdayOpen] = useState(false);
    const birthdays = clients.filter(c => String(c.estado || "ACTIVO").toUpperCase() !== "INACTIVO" && Boolean(c.fechaCumpleanos) && birthdayDays(c.fechaCumpleanos) >= 0 && birthdayDays(c.fechaCumpleanos) <= 20).sort((a, b) => birthdayDays(a.fechaCumpleanos) - birthdayDays(b.fechaCumpleanos));
    const birthdayCount = birthdays.length;
    const todayCount = birthdays.filter(c => birthdayDays(c.fechaCumpleanos) === 0).length;
    const debts = receivables.filter(o => String(o.estadoEntrega).toUpperCase() === "ENTREGADO" && Number(o.saldo || 0) > .01).sort((a, b) => daysSince(b.fechaEntrega || b.fecha) - daysSince(a.fechaEntrega || a.fecha));
    const urgent = debts.filter(o => daysSince(o.fechaEntrega || o.fecha) >= 4);
    const pendingDebt = debts.filter(o => daysSince(o.fechaEntrega || o.fecha) <= 3);
    const pendingDebtTotal = pendingDebt.reduce((sum, o) => sum + Number(o.saldo || 0), 0);
    const urgentDebtTotal = urgent.reduce((sum, o) => sum + Number(o.saldo || 0), 0);
    const dueToday = pendingDebt.filter(o => daysSince(o.fechaEntrega || o.fecha) === 3).reduce((sum, o) => sum + Number(o.saldo || 0), 0);
    const dueTomorrow = pendingDebt.filter(o => daysSince(o.fechaEntrega || o.fecha) === 2).reduce((sum, o) => sum + Number(o.saldo || 0), 0);
    const debtTotal = debts.reduce((sum, o) => sum + Number(o.saldo || 0), 0);
    const latestByClient = new Map<string, string>();
    orders.forEach(o => { const key = String(o.cliente || "").trim().toLowerCase(); const date = orderDate(o.fecha); if (key && date && (!latestByClient.get(key) || date > String(latestByClient.get(key)))) latestByClient.set(key, date); });
    const inactiveClients = clients.filter(c => { const key = `${c.nombre} ${c.apellidos}`.trim().toLowerCase(); const last = latestByClient.get(key); return !last || daysSince(last) >= 30; });
    const editGoal = () => {
        const value = window.prompt("Meta mensual de ventas (S/)", String(monthlyGoal));
        if (value === null) return;
        const parsed = Number(value.replace(",", "."));
        if (!Number.isFinite(parsed) || parsed <= 0) return;
        setMonthlyGoal(parsed); cacheSet("nexo_monthly_goal", parsed);
    };
    return <div className={isPreventa ? "preventa-home" : "manager-home"}>
        <Heading eyebrow={isPreventa ? "MI RUTA COMERCIAL" : "RESUMEN EJECUTIVO"} title={isPreventa ? `Hola, ${session.nombre.split(" ")[0]}` : "Tu operación, en una sola vista."} text={isPreventa ? "Registra pedidos rápido y revisa tu avance del día." : "Indicadores clave para tomar decisiones sin recorrer todo el sistema."}><button className="primary" onClick={() => onNavigate("Preventa")}>＋ Nuevo pedido</button></Heading>
        {isPreventa && <section className="preventa-hero-card"><div><small>VENTAS DE HOY</small><strong>{money(salesToday)}</strong><span>{todayOrders.length} pedido(s) registrados</span></div><button onClick={() => onNavigate("Preventa")}>Crear pedido</button></section>}
        <section className="executive-metrics">
            <article><span>Ventas del día</span><strong>{money(salesToday)}</strong><small>{todayOrders.length} operaciones hoy</small></article>
            <article className="goal-card"><span>Meta mensual</span><strong>{money(salesMonth)}</strong><div className="goal-progress"><i style={{ width: `${goalProgress}%` }}></i></div><small>{goalProgress.toFixed(0)}% de {money(monthlyGoal)} {!isPreventa && <button onClick={editGoal}>Editar</button>}</small></article>
            <article><span>Cobros pendientes</span><strong>{money(debtTotal)}</strong><small>{debts.length} cliente(s) por cobrar</small></article>
            <article><span>Ticket promedio</span><strong>{money(ticketAverage)}</strong><small>{monthOrders.length} ventas este mes</small></article>
            <article className="inactive-card"><span>Clientes inactivos</span><strong>{inactiveClients.length}</strong><small>Sin compra en 30 días</small></article>
        </section>
        <div className="home-alerts"><button className={`birthday-alert ${birthdayCount ? "" : "birthday-empty"}`} onClick={() => setBirthdayOpen(true)}><span className="birthday-cake">🎂</span><div><small>{todayCount ? "¡CUMPLEAÑOS DE HOY!" : "CUMPLEAÑOS PRÓXIMOS"}</small><strong>{birthdayCount}</strong><p>{birthdays.length ? birthdays.slice(0, 3).map(c => `${c.nombre} ${c.apellidos}`.trim()).join(", ") : "0 cumpleaños próximos"}</p></div></button>{pendingDebt.length > 0 && <button className="receivable-alert pending" onClick={() => { cacheSet("nexo_route_tab", "PENDIENTES DE COBRO"); onNavigate("Cobranza y rendición"); }}><span>◷</span><div><small>COBRANZA PENDIENTE</small><strong>{money(pendingDebtTotal)}</strong><p>{pendingDebt.length} pedido(s) · Hoy {money(dueToday)} · Mañana {money(dueTomorrow)}</p></div></button>}{urgent.length > 0 && <button className="receivable-alert urgent" onClick={() => { cacheSet("nexo_route_tab", "COBRANZA URGENTE"); onNavigate("Cobranza y rendición"); }}><span>⚠</span><div><small>COBRANZA URGENTE</small><strong>{money(urgentDebtTotal)}</strong><p>{urgent.length} pedido(s) vencido(s) · Mayor atraso {Math.max(...urgent.map(o => daysSince(o.fechaEntrega || o.fecha) - 3))} día(s)</p></div></button>}</div>
        {!isPreventa && <section className="manager-secondary-metrics"><article><p>Clientes registrados</p><strong>{summary?.totalClientes || clients.length}</strong><small>{inactiveClients.length} requieren seguimiento</small></article><article><p>Productos</p><strong>{summary?.totalProductos || 0}</strong><small>{summary?.stockBajo || 0} con stock bajo</small></article><article><p>Valor de inventario</p><strong>{money(summary?.valorTotalInventario)}</strong><small>{summary?.sinStock || 0} sin stock</small></article></section>}
        <section className="panel recent-activity"><div className="panel-title"><div><h3>Operaciones recientes</h3><p>Actividad transversal del ERP en tiempo real</p></div></div><div>{activities.slice(0, 15).map(item => <article key={item.id}><time>{new Date(item.fecha).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</time><span><b>{item.tipo}</b><small>{item.cliente || item.ventaId || item.descripcion}</small></span>{item.monto > 0 && <strong>{money(item.monto)}</strong>}</article>)}{!activities.length && <p className="empty-activity">Aún no existen operaciones registradas en el historial transversal.</p>}</div></section>
        {birthdayOpen && <div className="modal-bg" onMouseDown={event => { if (event.target === event.currentTarget) setBirthdayOpen(false); }}><section className="birthday-list-modal" role="dialog" aria-modal="true" aria-label="Cumpleaños próximos" onMouseDown={event => event.stopPropagation()}><header><div><small>PRÓXIMOS 20 DÍAS</small><h2>Cumpleaños próximos</h2></div><button onClick={() => setBirthdayOpen(false)}>×</button></header><div>{birthdays.map(client => <article key={client.id}><span><b>{client.nombre} {client.apellidos}</b><small>{client.contacto || "Sin teléfono"}</small></span><strong>{birthdayDays(client.fechaCumpleanos) === 0 ? "Hoy" : `En ${birthdayDays(client.fechaCumpleanos)} día(s)`}</strong></article>)}{!birthdays.length && <p>0 cumpleaños próximos.</p>}</div></section></div>}
    </div>;
}
function Clients({ clients, call, refresh, notify, online }: {
    clients: Client[];
    call: <T>(f: string, a?: unknown[]) => Promise<T>;
    refresh: () => Promise<void>;
    notify: (s: string) => void;
    online: boolean;
}) {
    const blank = { id: "", nombre: "", apellidos: "", correo: "", contacto: "", fechaCumpleanos: "", direccion: "", comentarios: "" };
    const [form, setForm] = useState(blank);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [saving, setSaving] = useState(false);
    const visible = clients.filter(c => JSON.stringify(c).toLowerCase().includes(query.toLowerCase()));
    async function save(e: FormEvent) {
        e.preventDefault();
        if (saving)
            return;
        if (!online)
            return notify("Para registrar clientes se requiere señal; las preventas sí funcionan offline.");
        const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");
        if (!form.id && clients.some(c => norm(c.nombre) === norm(form.nombre) && norm(c.apellidos) === norm(form.apellidos) && norm(c.contacto) === norm(form.contacto) && norm(c.direccion) === norm(form.direccion)))
            return notify("Este cliente ya existe. No se enviará otro registro.");
        setSaving(true);
        notify("Guardando cliente y sincronizando datos…");
        try {
            const fn = form.id ? "actualizarCliente" : "registrarCliente";
            const r = await call<string>(fn, [{ ...form }]);
            notify(r);
            setOpen(false);
            setForm(blank);
            await refresh();
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se guardó");
        }
        finally {
            setSaving(false);
        }
    }
    const [detailClient, setDetailClient] = useState<Client | null>(null);
    const shortAddress = (value: string) => value.length > 34 ? `${value.slice(0, 34)}…` : value;
    const openWhatsApp = (value: string) => {
        const digits = value.replace(/\D/g, "");
        if (digits)
            window.open(`https://wa.me/${digits.length === 9 ? `51${digits}` : digits}`, "_blank", "noopener,noreferrer");
    };
    const edit = (client: Client) => {
        setDetailClient(null);
        setForm({ ...blank, ...client });
        setOpen(true);
    };
    return <div className="clients-page"><Heading eyebrow="CARTERA COMERCIAL" title="Clientes" text="Consulta rápida y ficha comercial completa."><button className="primary" onClick={() => { setForm(blank); setOpen(true); }}>＋ Nuevo cliente</button></Heading><section className="section-tools compact-tools"><label className="search">⌕<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre, teléfono o dirección…"/></label><span className="compact-count">{visible.length} clientes</span></section><section className="client-grid">{visible.map(c => <button className={`client-card ${birthdayDays(c.fechaCumpleanos) <= 7 ? "birthday-client" : ""}`} key={c.id} onClick={() => setDetailClient(c)}><span className="client-avatar">{`${c.nombre} ${c.apellidos}`.trim().slice(0, 2).toUpperCase()}</span><span className="client-card-copy"><b>{c.nombre} {c.apellidos}</b><small>☎ {c.contacto || "Sin teléfono"}</small><small>⌖ {shortAddress(c.direccion || "Sin dirección")}</small></span><span className="client-status">Activo</span></button>)}</section>{detailClient && <div className="modal-bg client-profile-bg" onClick={() => setDetailClient(null)}><section className="client-profile" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setDetailClient(null)}>×</button><header><span className="client-avatar large">{`${detailClient.nombre} ${detailClient.apellidos}`.trim().slice(0, 2).toUpperCase()}</span><div><small>FICHA DEL CLIENTE</small><h2>{detailClient.nombre} {detailClient.apellidos}</h2><span className="client-status">Activo</span></div></header><div className="client-facts"><article><small>Código</small><b>{detailClient.id}</b></article><article><small>Teléfono</small><b>{detailClient.contacto || "No registrado"}</b></article><article className="wide"><small>Dirección completa</small><b>{detailClient.direccion || "No registrada"}</b></article><article><small>Correo</small><b>{detailClient.correo || "No registrado"}</b></article><article><small>Cumpleaños</small><b>{detailClient.fechaCumpleanos || "No registrado"}</b></article><article className="wide"><small>Observaciones</small><b>{detailClient.comentarios || "Sin observaciones"}</b></article></div><div className="client-quick-actions"><a href={`tel:${detailClient.contacto}`}>☎<span>Llamar</span></a><button onClick={() => openWhatsApp(detailClient.contacto)}>◉<span>WhatsApp</span></button><button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detailClient.direccion)}`, "_blank", "noopener,noreferrer")}>⌖<span>Mapa</span></button><button onClick={() => edit(detailClient)}>✎<span>Editar</span></button></div></section></div>}{open && <div className="modal-bg"><form className="modal client-modal" onSubmit={save}><button type="button" className="close" onClick={() => setOpen(false)}>×</button><h2>{form.id ? "Editar cliente" : "Nuevo cliente"}</h2><div className="form-row"><label>Nombres<input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}/></label><label>Apellidos<input value={form.apellidos} onChange={e => setForm({ ...form, apellidos: e.target.value })}/></label></div><div className="form-row"><label>Teléfono<input required value={form.contacto} onChange={e => setForm({ ...form, contacto: e.target.value })}/></label><label>Cumpleaños<input type="date" required value={form.fechaCumpleanos.split("/").reverse().join("-")} onChange={e => setForm({ ...form, fechaCumpleanos: e.target.value })}/></label></div><label>Correo<input type="email" value={form.correo} onChange={e => setForm({ ...form, correo: e.target.value })}/></label><label>Dirección<input required value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })}/></label><label>Comentarios<textarea value={form.comentarios} onChange={e => setForm({ ...form, comentarios: e.target.value })}/></label><button className="primary">Guardar en Sheets</button></form></div>}</div>;
    return <div><Heading eyebrow="CARTERA COMERCIAL" title="Clientes" text="Registros reales de la hoja Clientes."><button className="primary" onClick={() => { setForm(blank); setOpen(true); }}>＋ Nuevo cliente</button></Heading><section className="section-tools"><label className="search">⌕<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar cliente…"/></label></section><section className="panel data-panel"><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Contacto</th><th>Cumpleaños</th><th>Dirección</th><th></th></tr></thead><tbody>{visible.map(c => <tr key={c.id} className={birthdayDays(c.fechaCumpleanos) <= 7 ? "birthday-client" : ""}><td><b>{c.nombre} {c.apellidos}</b><br /><small>{c.correo || c.id}</small><br /><small>Tel. {c.contacto || "Sin teléfono"} · {c.direccion || "Sin dirección"}</small></td><td>{c.contacto}</td><td>{c.fechaCumpleanos}</td><td>{c.direccion}</td><td><button onClick={() => { setForm({ ...blank, ...c }); setOpen(true); }}>Editar</button></td></tr>)}</tbody></table></div></section>{open && <div className="modal-bg"><form className="modal client-modal" onSubmit={save}><button type="button" className="close" onClick={() => setOpen(false)}>×</button><h2>{form.id ? "Editar cliente" : "Nuevo cliente"}</h2><div className="form-row"><label>Nombres<input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}/></label><label>Apellidos<input value={form.apellidos} onChange={e => setForm({ ...form, apellidos: e.target.value })}/></label></div><div className="form-row"><label>Teléfono<input required value={form.contacto} onChange={e => setForm({ ...form, contacto: e.target.value })}/></label><label>Cumpleaños<input type="date" required value={form.fechaCumpleanos.split("/").reverse().join("-")} onChange={e => setForm({ ...form, fechaCumpleanos: e.target.value })}/></label></div><label>Correo<input type="email" value={form.correo} onChange={e => setForm({ ...form, correo: e.target.value })}/></label><label>Dirección<input required value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })}/></label><label>Comentarios<textarea value={form.comentarios} onChange={e => setForm({ ...form, comentarios: e.target.value })}/></label><button className="primary">Guardar en Sheets</button></form></div>}</div>;
}
function Sales({ products, clients, call, refreshProducts, notify, online }: {
    products: Product[];
    clients: Client[];
    call: <T>(f: string, a?: unknown[]) => Promise<T>;
    refreshProducts: () => Promise<void>;
    notify: (s: string) => void;
    online: boolean;
}) {
    const savingSaleRef = useRef(false);
    const [client, setClient] = useState(""), [clientQuery, setClientQuery] = useState(""), [clientOpen, setClientOpen] = useState(false);
    const [query, setQuery] = useState(""), [cart, setCart] = useState<SaleItem[]>([]), [obs, setObs] = useState("");
    const [filtersOpen, setFiltersOpen] = useState(false), [groupFilter, setGroupFilter] = useState("TODOS"), [stockFilter, setStockFilter] = useState("TODOS");
    const [sortFilter, setSortFilter] = useState("NOMBRE");
    const [renderLimit, setRenderLimit] = useState(60);
    const [cartPulse, setCartPulse] = useState(false);
    const [rawSuccess, setSuccess] = useState<{
        ventaId: string;
        total: number;
        cliente: string;
        fecha: string;
        offline: boolean;
    } | null>(null), [savingSale, setSavingSale] = useState(false);
    const success = rawSuccess!;
    const cleanProducts = useMemo(() => products.filter(p => Boolean(p.nombre?.trim())), [products]);
    const groups = useMemo(() => [...new Set(cleanProducts.map(p => p.grupo || "General"))].sort(), [cleanProducts]);
    const visible = useMemo(() => cleanProducts.filter(p => `${p.codigo} ${p.nombre} ${p.grupo}`.toLowerCase().includes(query.toLowerCase()) && (groupFilter === "TODOS" || p.grupo === groupFilter) && (stockFilter === "TODOS" || stockFilter === "CON_STOCK" && p.stock > 0 || stockFilter === "SIN_STOCK" && p.stock <= 0 || stockFilter === "STOCK_BAJO" && p.stock > 0 && p.stock <= p.stockMin)).sort((a, b) => sortFilter === "PRECIO" ? a.precioVenta - b.precioVenta : sortFilter === "STOCK" ? b.stock - a.stock : a.nombre.localeCompare(b.nombre)), [cleanProducts, groupFilter, query, sortFilter, stockFilter]);
    const renderedProducts = visible.slice(0, renderLimit);
    const clientMatches = clients.filter(c => `${c.id} ${c.nombre} ${c.apellidos} ${c.contacto} ${c.direccion}`.toLowerCase().includes(clientQuery.toLowerCase())).slice(0, 8);
    const selectedClient = clients.find(c => `${c.nombre} ${c.apellidos}`.trim() === client)!;
    function presentation(p: Product) { const match = /(?:^|\s)[xX]\s*(\d+)(?:\s|$)/.exec(p.nombre); const factor = Math.max(1, Number(p.factorPresentacion || match?.[1] || 1)); const detalleUnidad = p.unidad || (/GAL[ÓO]N|LITRO|BEBIDA|SHAMPOO/i.test(p.nombre) ? "botella" : "unidad"); const nombrePresentacion = p.nombrePresentacion || (factor > 1 ? "Caja" : detalleUnidad); const precioPresentacion = Number(p.precioPresentacion || p.precioVenta); const permiteFraccionamiento = String(p.permiteFraccionamiento || "NO").toUpperCase() === "SI"; const configured = String(p.fraccionesPermitidas || "1/4,1/2,3/4").split(",").map(value => value.trim()); const fractions = [{ label: "¼", key: "1/4", value: .25 }, { label: "½", key: "1/2", value: .5 }, { label: "¾", key: "3/4", value: .75 }].filter(option => permiteFraccionamiento && configured.includes(option.key) && (String(p.controlaDecimales || "NO").toUpperCase() === "SI" || Number.isInteger(factor * option.value))); return { factor, detalleUnidad, nombrePresentacion, precioPresentacion, fractions }; }
    function add(p: Product) {
        if (p.stock <= 0)
            return notify("Producto sin stock");
        const info = presentation(p);
        if (p.stock < info.factor)
            return notify(`Stock insuficiente. Disponible: ${p.stock} ${info.detalleUnidad}.`);
        setCart(x => x.some(i => i.codigo === p.codigo) ? x.map(i => i.codigo === p.codigo ? (() => { const cantidadEntera = (i.cantidadEntera ?? Math.floor(i.cantidad)) + 1, fraccion = i.fraccion || 0, cantidad = cantidadEntera + fraccion, unidadesSueltas = cantidad * i.factor; if (unidadesSueltas > p.stock) { notify(`Stock insuficiente. Disponible: ${p.stock} ${info.detalleUnidad}.`); return i; } return { ...i, cantidadEntera, cantidad, unidadesSueltas }; })() : i) : [...x, { codigo: p.codigo, nombre: p.nombre, cantidad: 1, cantidadEntera: 1, precioVenta: info.precioPresentacion, unidad: p.unidad, factor: info.factor, unidadesSueltas: info.factor, detalleUnidad: info.detalleUnidad, stock: p.stock, nombrePresentacion: info.nombrePresentacion, fraccion: 0, fraccionActiva: false, permiteFraccionamiento: info.fractions.length > 0, fraccionesPermitidas: info.fractions.map(option => ({ label: option.label, value: option.value })) }]);
        navigator.vibrate?.(18);
        setCartPulse(true);
        window.setTimeout(() => setCartPulse(false), 240);
    }
    function changeUnits(item: SaleItem, delta: number) {
        setCart(rows => rows.flatMap(row => {
            if (row.codigo !== item.codigo)
                return [row];
            const cantidadEntera = Math.max(0, (row.cantidadEntera ?? Math.floor(row.cantidad)) + delta);
            const cantidad = cantidadEntera + (row.fraccion || 0);
            const unidadesSueltas = cantidad * row.factor;
            if (cantidad <= 0)
                return [];
            if (unidadesSueltas > row.stock) {
                notify("No hay más stock disponible");
                return [row];
            }
            return [{ ...row, unidadesSueltas, cantidad, cantidadEntera }];
        }));
    }
    function toggleFraction(item: SaleItem, active: boolean) {
        const options = item.fraccionesPermitidas || [];
        const fraction = active ? (options.find(option => option.value === .5)?.value ?? options[0]?.value ?? 0) : 0;
        setFraction(item, fraction, active);
    }
    function setFraction(item: SaleItem, fraction: number, active = true) {
        if (fraction && !(item.fraccionesPermitidas || []).some(option => option.value === fraction)) return notify("Esta fracción no está permitida.");
        const cantidadEntera = item.cantidadEntera ?? Math.floor(item.cantidad), cantidad = cantidadEntera + fraction, unidadesSueltas = cantidad * item.factor;
        if (!Number.isInteger(unidadesSueltas)) return notify("La fracción no equivale a unidades base completas.");
        if (unidadesSueltas > item.stock) return notify(`Stock insuficiente. Disponible: ${item.stock} ${item.detalleUnidad}.`);
        setCart(rows => rows.map(row => row.codigo === item.codigo ? { ...row, cantidadEntera, fraccion: fraction, fraccionActiva: active, cantidad, unidadesSueltas } : row));
        navigator.vibrate?.(12);
    }
    function removeItem(item: SaleItem) { setCart(rows => rows.filter(row => row.codigo !== item.codigo)); notify(`${item.nombre} eliminado del pedido`); }
    function setUnits(item: SaleItem, units: number) {
        const cantidadEntera = Math.max(0, Math.floor(Number(units) || 0)), safeQuantity = cantidadEntera + (item.fraccion || 0), safeUnits = safeQuantity * item.factor;
        if (!Number.isInteger(safeUnits)) return notify("La fracción elegida no equivale a unidades base completas.");
        if (safeUnits > item.stock) return notify(`Stock insuficiente. Disponible: ${item.stock} ${item.detalleUnidad}.`);
        setCart(rows => safeQuantity === 0 ? rows.filter(row => row.codigo !== item.codigo) : rows.map(row => row.codigo === item.codigo ? { ...row, unidadesSueltas: safeUnits, cantidad: safeQuantity, cantidadEntera } : row));
    }
    function saveDraft() {
        cacheSet("nexo_sale_draft", { cliente: client, items: cart, observaciones: obs, updatedAt: new Date().toISOString() });
        notify("Borrador guardado en este dispositivo");
        setCartOpen(false);
    }
    function clearCompletedSale() {
        setCart([]);
        setClient("");
        setClientQuery("");
        setClientOpen(false);
        setObs("");
        setCartOpen(false);
        resetFilters();
        localStorage.removeItem("nexo_sale_draft");
    }
    function chooseClient(c: Client) { const name = `${c.nombre} ${c.apellidos}`.trim(); setClient(name); setClientQuery(name); setClientOpen(false); }
    function resetFilters() { setQuery(""); setGroupFilter("TODOS"); setStockFilter("TODOS"); setSortFilter("NOMBRE"); setRenderLimit(60); setFiltersOpen(false); }
    async function save() {
        if (savingSaleRef.current || savingSale)
            return;
        if (!client || !cart.length)
            return notify("Selecciona cliente y productos");
        const total = cart.reduce((a, i) => a + i.cantidad * i.precioVenta, 0);
        const completedClient = client;
        const completedAt = new Date();
        const payload = { cliente: client, items: cart.map(i => ({ codigo: i.codigo, productoId: i.codigo, presentacionId: `${i.codigo}-${i.factor}`, cantidad: i.unidadesSueltas, cantidadEntera: i.cantidadEntera ?? Math.floor(i.cantidad), cantidadPresentacion: i.cantidad, cantidadPresentacionTotal: i.cantidad, factorPresentacion: i.factor, cantidadUnidadesBase: i.unidadesSueltas, fraccion: i.fraccion || 0, nombrePresentacion: i.nombrePresentacion || i.unidad || "Unidad", precioPresentacion: i.precioVenta, precioFraccionado: i.precioVenta * (i.fraccion || 0), precioAplicado: i.cantidad * i.precioVenta, subtotal: i.cantidad * i.precioVenta })), observaciones: obs, solicitudId: crypto.randomUUID() };
        savingSaleRef.current = true;
        setSavingSale(true);
        if (!online) {
            const q = cacheGet<Array<{
                id: string;
                payload: unknown;
            }>>("nexo_sale_queue", []);
            q.push({ id: payload.solicitudId, payload });
            cacheSet("nexo_sale_queue", q);
            setSuccess({ ventaId: `PENDIENTE-${payload.solicitudId.slice(0, 8).toUpperCase()}`, total, cliente: completedClient, fecha: completedAt.toLocaleString("es-PE"), offline: true });
            clearCompletedSale();
            savingSaleRef.current = false;
            setSavingSale(false);
            return;
        }
        try {
            const r = await measured("crearPedido", () => call<{
                ok: boolean;
                mensaje: string;
                ventaId?: string;
            }>("registrarVenta", [payload]));
            if (!r.ok)
                throw new Error(r.mensaje);
            setSuccess({ ventaId: r.ventaId || "Registrada", total, cliente: completedClient, fecha: completedAt.toLocaleString("es-PE"), offline: false });
            clearCompletedSale();
            void refreshProducts();
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se registró");
        }
        finally {
            savingSaleRef.current = false;
            setSavingSale(false);
        }
    }
    const [cartOpen, setCartOpen] = useState(false);
    const cartUnits = Number(cart.reduce((total, item) => total + item.cantidad, 0).toFixed(2));
    const cartTotal = cart.reduce((total, item) => total + item.cantidad * item.precioVenta, 0);
    const activeFilters = Number(groupFilter !== "TODOS") + Number(stockFilter !== "TODOS") + Number(sortFilter !== "NOMBRE");
    function startNewSale() {
        setSuccess(null);
        window.setTimeout(() => document.querySelector<HTMLInputElement>(".pos-client input")?.focus(), 80);
    }
    function viewCompletedOrder() {
        setSuccess(null);
        document.querySelector<HTMLButtonElement>('[aria-label="Pedidos y emisión"]')?.click();
    }
    return <div className="pos-page pos-v2"><Heading eyebrow="VENTA MÓVIL" title="Preventa" text="POS de campo conectado con Google Sheets."/><section className="pos-workspace"><header className="pos-sticky-head"><div className="pos-client"><span>CLIENTE</span>{selectedClient ? <div className="selected-client"><span className="client-avatar">{selectedClient.nombre.slice(0, 2).toUpperCase()}</span><span><b>{client}</b><small>{selectedClient.contacto} · {selectedClient.direccion || "Sin dirección"}</small></span><button onClick={() => { setClient(""); setClientQuery(""); setClientOpen(true); }}>Cambiar</button></div> : <label className="pos-input">⌕<input value={clientQuery} onFocus={() => setClientOpen(true)} onChange={e => { setClientQuery(e.target.value); setClient(""); setClientOpen(true); }} placeholder="Nombre, teléfono, código o dirección"/></label>}{clientOpen && !selectedClient && <div className="client-results pos-client-results">{clientMatches.map(c => <button key={c.id} onClick={() => chooseClient(c)}><span className="client-avatar">{c.nombre.slice(0, 2).toUpperCase()}</span><span><b>{c.nombre} {c.apellidos}</b><small>{c.contacto || "Sin teléfono"} · {c.direccion || "Sin dirección"}</small><em>{c.id}</em></span><i>Activo</i></button>)}{!clientMatches.length && <p>Sin clientes encontrados</p>}</div>}</div><div className="pos-search-row"><label className="pos-input">⌕<input value={query} onChange={e => { setQuery(e.target.value); setRenderLimit(60); }} placeholder="Buscar producto, código o categoría"/>{query && <button onClick={() => { setQuery(""); setRenderLimit(60); }} aria-label="Limpiar búsqueda">×</button>}</label><button className={activeFilters ? "active" : ""} onClick={() => setFiltersOpen(true)}>☷ Filtros{activeFilters ? ` (${activeFilters})` : ""}</button></div></header><div className="pos-results-head"><b>PRODUCTOS</b><span>{visible.length} resultados</span></div><div className="pos-products-scroll" onScroll={e => { const target = e.currentTarget; if (target.scrollTop + target.clientHeight >= target.scrollHeight - 220) setRenderLimit(limit => Math.min(visible.length, limit + 40)); }}><div className="pos-product-grid pos-v2-grid">{renderedProducts.map(p => { const info = presentation(p); const item = cart.find(row => row.codigo === p.codigo); return <article className={`pos-product ${p.stock <= 0 ? "out" : ""}`} key={p.codigo}><button className="pos-product-main" onClick={() => add(p)} disabled={p.stock <= 0}><span className="product-thumb">{p.nombre.slice(0, 1)}</span><span className="pos-product-copy"><small>{p.grupo || "General"}</small><b>{p.nombre}</b><em>{p.codigo} · {p.stock > 0 ? `Stock ${p.stock} ${info.detalleUnidad}` : "SIN STOCK"}</em><strong>{money(info.precioPresentacion)}</strong></span></button><small className="presentation">{info.factor > 1 ? `${info.nombrePresentacion} x${info.factor}` : p.unidad}</small><div className="product-stepper"><button onClick={() => item && changeUnits(item, -1)} disabled={!item}>−</button><b>{Number((item?.cantidad || 0).toFixed(2))}</b><button onClick={() => add(p)} disabled={p.stock <= 0}>＋</button></div></article>; })}</div>{renderLimit < visible.length && <button className="load-products" onClick={() => setRenderLimit(limit => Math.min(visible.length, limit + 60))}>Cargar más productos</button>}{!visible.length && <div className="pos-empty"><b>Sin resultados</b><span>Prueba otra búsqueda o limpia los filtros.</span></div>}</div></section><button className={`floating-cart ${cartPulse ? "pulse" : ""} ${cart.length ? "has-items" : ""}`} onClick={() => setCartOpen(true)}><span>🛒 <b>{cartUnits}</b></span><span><small>{cart.length ? `${cart.length} producto(s)` : "Carrito vacío"}</small><strong>{money(cartTotal)}</strong></span><em>Ver carrito</em></button>{filtersOpen && <div className="modal-bg pos-sheet-bg" onClick={() => setFiltersOpen(false)}><section className="pos-filter-sheet" onClick={e => e.stopPropagation()}><header><div><small>PREVENTA</small><h2>Filtros de productos</h2></div><button onClick={() => setFiltersOpen(false)}>×</button></header><div className="filter-sheet-body"><label>Categoría<select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}><option value="TODOS">Todas las categorías</option>{groups.map(g => <option key={g}>{g}</option>)}</select></label><label>Disponibilidad<select value={stockFilter} onChange={e => setStockFilter(e.target.value)}><option value="TODOS">Todo el catálogo</option><option value="CON_STOCK">Solo con stock</option><option value="STOCK_BAJO">Stock bajo</option><option value="SIN_STOCK">Sin stock</option></select></label><label>Ordenar por<select value={sortFilter} onChange={e => setSortFilter(e.target.value)}><option value="NOMBRE">Nombre</option><option value="PRECIO">Precio</option><option value="STOCK">Stock</option></select></label></div><footer><button onClick={resetFilters}>Limpiar</button><button className="primary" onClick={() => { setRenderLimit(60); setFiltersOpen(false); }}>Aplicar filtros</button></footer></section></div>}{cartOpen && <div className="modal-bg pos-sheet-bg" onClick={() => setCartOpen(false)}><section className="pos-cart-sheet-v2" onClick={e => e.stopPropagation()}><header><div><small>PEDIDO</small><h2>{client || "Selecciona un cliente"}</h2></div><button onClick={() => setCartOpen(false)}>×</button></header><div className="cart-sheet-body">{!cart.length ? <div className="pos-empty"><b>Carrito vacío</b><span>Agrega productos para preparar el pedido.</span></div> : <div className="cart-v2-list">{cart.map(i => <article className="fraction-cart-item" key={i.codigo}><span className="product-thumb">{i.nombre.slice(0, 1)}</span><div className="cart-item-copy"><b>{i.nombre}</b><small>Presentación: {i.nombrePresentacion || i.unidad} x{i.factor}</small><small>Precio completo: {money(i.precioVenta)}</small><div className="cart-qty"><button onClick={() => changeUnits(i, -1)}>−</button><input aria-label={`Cantidad entera de ${i.nombre}`} type="number" min="0" max={Math.floor(i.stock / i.factor)} value={i.cantidadEntera ?? Math.floor(i.cantidad)} onChange={e => setUnits(i, Number(e.target.value))}/><button onClick={() => changeUnits(i, 1)}>＋</button></div>{i.permiteFraccionamiento && <div className="cart-fraction-control"><label><input type="checkbox" checked={Boolean(i.fraccionActiva)} onChange={e => toggleFraction(i, e.target.checked)}/> Vender fracción</label>{i.fraccionActiva && <div className="cart-fraction-chips">{(i.fraccionesPermitidas || []).map(option => <button type="button" className={i.fraccion === option.value ? "active" : ""} key={option.label} onClick={() => setFraction(i, option.value)}>{option.label}</button>)}<button type="button" className={!i.fraccion ? "active" : ""} onClick={() => setFraction(i, 0)}>Completo</button></div>}</div>}<small>Cantidad total: <b>{i.cantidad} {i.nombrePresentacion || i.unidad}</b></small><small>Equivale a: <b>{i.unidadesSueltas} {i.detalleUnidad}</b></small><strong>Subtotal: {money(i.cantidad * i.precioVenta)}</strong></div><button className="cart-delete" onClick={() => removeItem(i)}>⌫</button></article>)}</div>}<label className="cart-observations">Observaciones<textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Indicaciones para el pedido"/></label><div className="cart-summary"><span>Subtotal <b>{money(cartTotal)}</b></span><span>Descuento <b>{money(0)}</b></span><strong>Total <b>{money(cartTotal)}</b></strong></div></div><footer><button onClick={saveDraft} disabled={!cart.length}>Guardar borrador</button><button onClick={() => { setCart([]); setObs(""); setCartOpen(false); }}>Cancelar</button><button className="primary" onClick={save} disabled={savingSale || !client || !cart.length}>{savingSale ? "Finalizando…" : "Finalizar venta"}</button></footer></section></div>}{success && <div className="sale-success sale-confirmation" role="dialog" aria-modal="true" aria-label="Pedido registrado"><div className="success-rays"></div><section><span className="success-check">✓</span><small>{success.offline ? "GUARDADO EN ESTE DISPOSITIVO" : "OPERACIÓN REGISTRADA"}</small><h2>{success.offline ? "Pedido pendiente de sincronización" : "Pedido registrado"}</h2><strong>{money(success.total)}</strong><h3>{success.cliente}</h3><p>Pedido: <b>{success.ventaId}</b></p><time>{success.fecha}</time><em>{success.offline ? "Se enviará automáticamente a Google Sheets cuando regrese la conexión." : "Registrado correctamente en Google Sheets."}</em><div className="success-actions"><button onClick={viewCompletedOrder} disabled={success.offline}>Ver pedido</button><button className="primary" onClick={startNewSale}>Nueva preventa</button></div></section></div>}</div>;
    return <div className="pos-page"><Heading eyebrow="VENTA MÓVIL" title="Nueva preventa" text="Selecciona cliente, busca productos y finaliza desde el carrito."/><div className={`sales-layout pos-layout ${savingSale ? "sale-locked" : ""}`} aria-busy={savingSale}><section className="product-browser pos-browser"><div className="client-finder"><span>1 · CLIENTE</span><label>⌕<input value={clientQuery} onFocus={() => setClientOpen(true)} onBlur={() => window.setTimeout(() => setClientOpen(false), 160)} onChange={e => { setClientQuery(e.target.value); setClient(""); setClientOpen(true); }} placeholder="Nombre, teléfono o dirección…"/></label>{clientOpen && <div className="client-results">{clientMatches.map(c => <button key={c.id} onClick={() => chooseClient(c)}><b>{c.nombre} {c.apellidos}</b><small>{c.contacto} · {c.direccion}</small></button>)}{!clientMatches.length && <p>No se encontraron clientes</p>}</div>}{selectedClient && <div className="selected-client"><span className="client-avatar">{selectedClient.nombre.slice(0, 2).toUpperCase()}</span><span><b>✓ {client}</b><small>{selectedClient.contacto} · {selectedClient.direccion}</small></span><button onClick={() => { setClient(""); setClientQuery(""); }}>Cambiar</button></div>}</div><div className="product-tools"><label className="search">⌕<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Producto, código o categoría…"/></label><button className={filtersOpen || groupFilter !== "TODOS" || stockFilter !== "TODOS" ? "active" : ""} onClick={() => setFiltersOpen(x => !x)}>☷ Filtros</button></div>{filtersOpen && <div className="filter-panel"><label>Categoría<select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}><option value="TODOS">Todas</option>{groups.map(g => <option key={g}>{g}</option>)}</select></label><label>Stock<select value={stockFilter} onChange={e => setStockFilter(e.target.value)}><option value="CON_STOCK">Con stock</option><option value="STOCK_BAJO">Stock bajo</option><option value="SIN_STOCK">Sin stock</option><option value="TODOS">Todos</option></select></label><button onClick={resetFilters}>Limpiar</button></div>}<small className="result-count">2 · PRODUCTOS · {visible.length} resultados</small><div className="product-grid pos-product-grid">{visible.map(p => { const info = presentation(p); const item = cart.find(row => row.codigo === p.codigo); return <article className={`pos-product ${p.stock <= 0 ? "out" : ""}`} key={p.codigo}><button className="pos-product-main" onClick={() => add(p)} disabled={p.stock <= 0}><span className="product-thumb">{p.nombre.slice(0, 1)}</span><span className="pos-product-copy"><small>{p.grupo || "General"}</small><b>{p.nombre}</b><em>{p.codigo} · Stock {p.stock}</em><strong>{money(p.precioVenta)}</strong></span></button><div className="product-stepper"><button onClick={() => item && changeUnits(item, -1)} disabled={!item}>−</button><b>{item ? item.unidadesSueltas : 0}</b><button onClick={() => add(p)} disabled={p.stock <= 0}>＋</button></div>{info.factor > 1 && <small className="unit-note">1 paquete = {info.factor} {info.detalleUnidad}s</small>}</article>; })}</div></section><aside className={`cart-v2 pos-cart ${cartOpen ? "open" : ""}`}><button className="pos-cart-bar" onClick={() => setCartOpen(value => !value)}><span>🛒 <b>{cartUnits}</b></span><span><small>Pedido</small><strong>{money(cartTotal)}</strong></span><em>{cartOpen ? "Cerrar" : "Ver carrito"}</em></button><div className="pos-cart-sheet"><div className="cart-title"><div><h3>Resumen del pedido</h3><p>{client || "Selecciona un cliente"}</p></div><span>{cart.length}</span></div><div className="cart-items">{cart.map(i => <article key={i.codigo}><div><b>{i.nombre}</b><small>{i.codigo}</small></div><button onClick={() => changeUnits(i, -1)}>−</button><strong>{i.unidadesSueltas}</strong><button onClick={() => changeUnits(i, 1)}>＋</button><em>{money(i.cantidad * i.precioVenta)}</em><button className="remove-cart-item" onClick={() => removeItem(i)}>×</button></article>)}</div><textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Observaciones del pedido"/><div className="cart-totals"><span>Subtotal <b>{money(cartTotal)}</b></span><span>Descuento <b>{money(0)}</b></span></div><div className="cart-total"><span>Total</span><strong>{money(cartTotal)}</strong></div><button className="primary finish-sale" onClick={save} disabled={savingSale || !client || !cart.length}>{savingSale ? "Registrando…" : online ? "Finalizar pedido" : "Guardar sin señal"}</button></div></aside></div>{success && <div className="sale-success"><div className="success-rays"></div><section><span>✓</span><h2>¡Pedido registrado!</h2><strong>{money(success.total)}</strong><p>{success.ventaId}</p><small>Guardado correctamente en Google Sheets</small><div className="success-actions"><button onClick={() => setSuccess(null)}>Crear otro</button><button className="primary" onClick={() => setSuccess(null)}>Continuar</button></div></section></div>}</div>;
    return <div><Heading eyebrow="VENTA MÓVIL" title="Nueva preventa" text="Productos y stock consultados desde Sheets; funciona con cola offline."/><div className={`sales-layout ${savingSale ? "sale-locked" : ""}`} aria-busy={savingSale}><section className="product-browser"><div className="client-finder"><span>CLIENTE DE LA PREVENTA</span><label>⌕<input value={clientQuery} onFocus={() => setClientOpen(true)} onBlur={() => window.setTimeout(() => setClientOpen(false), 160)} onChange={e => { setClientQuery(e.target.value); setClient(""); setClientOpen(true); }} placeholder="Buscar por nombre, teléfono o dirección…"/></label>{clientOpen && <div className="client-results">{clientMatches.map(c => <button key={c.id} onClick={() => chooseClient(c)}><b>{c.nombre} {c.apellidos}</b><small>{c.contacto} · {c.direccion}</small></button>)}{!clientMatches.length && <p>No se encontraron clientes</p>}</div>}{selectedClient && <div className="selected-client"><b>✓ {client}</b><span>Tel. {selectedClient.contacto} · {selectedClient.direccion}</span></div>}</div><div className="product-tools"><label className="search">⌕<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar producto…"/></label><button className={filtersOpen || groupFilter !== "TODOS" || stockFilter !== "TODOS" ? "active" : ""} onClick={() => setFiltersOpen(x => !x)}>☷ Filtros</button></div>{filtersOpen && <div className="filter-panel"><label>Grupo<select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}><option value="TODOS">Todos los grupos</option>{groups.map(g => <option key={g}>{g}</option>)}</select></label><label>Stock<select value={stockFilter} onChange={e => setStockFilter(e.target.value)}><option value="CON_STOCK">Solo con stock</option><option value="STOCK_BAJO">Stock bajo</option><option value="SIN_STOCK">Sin stock</option><option value="TODOS">Todos</option></select></label><button onClick={resetFilters}>Restablecer filtros</button></div>}<small className="result-count">{visible.length} producto(s) encontrados</small><div className="product-grid">{visible.map(p => { const info = presentation(p); return <button key={p.codigo} onClick={() => add(p)}><span>{p.grupo}</span><b>{p.nombre}</b><small>{p.codigo} · Stock {p.stock} {p.unidad}</small>{info.factor > 1 && <small>Venta suelta: 1 de {info.factor} {info.detalleUnidad}s</small>}<strong>{money(p.precioVenta)}</strong></button>; })}</div></section><aside className="cart-v2"><div className="cart-title"><div><h3>Pedido actual</h3><p>{client || "Sin cliente"}</p></div><span>{cart.length}</span></div><div className="cart-items">{cart.map(i => <article key={i.codigo}><div><b>{i.nombre}</b><small>{i.codigo}</small>{i.factor > 1 && <small>{i.unidadesSueltas} {i.detalleUnidad}{i.unidadesSueltas === 1 ? "" : "s"} = {Number(i.cantidad.toFixed(4))} paquete(s)</small>}</div><button aria-label={`Quitar una ${i.detalleUnidad}`} onClick={() => changeUnits(i, -1)}>−1</button><strong>{i.factor > 1 ? i.unidadesSueltas : i.cantidad}</strong><button aria-label={`Agregar una ${i.detalleUnidad}`} onClick={() => changeUnits(i, 1)}>＋1</button><em>{money(i.cantidad * i.precioVenta)}</em><button className="remove-cart-item" title="Eliminar material" aria-label={`Eliminar ${i.nombre} del pedido`} onClick={() => removeItem(i)}>×</button></article>)}</div><textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Observaciones"/><div className="cart-total"><span>Total</span><strong>{money(cart.reduce((a, i) => a + i.cantidad * i.precioVenta, 0))}</strong></div><button className="primary finish-sale" onClick={save} disabled={savingSale}>{savingSale ? "Registrando preventa…" : online ? "Guardar en Sheets" : "Guardar sin señal"}</button></aside></div>{success && <div className="sale-success" onClick={() => setSuccess(null)}><div className="success-rays"></div><section><span>✓</span><h2>¡Preventa registrada!</h2><strong>{money(success.total)}</strong><p>{success.ventaId}</p><small>Guardada correctamente en Google Sheets</small></section></div>}</div>;
}
function SimpleOrders({ rows, onDetail, showEmission = false }: {
    rows: Order[];
    onDetail?: (o: Order) => void;
    showEmission?: boolean;
}) { const [stateFilter, setStateFilter] = useState("TODOS"); const [emissionFilter, setEmissionFilter] = useState("TODAS"); const [clientFilter, setClientFilter] = useState("TODOS"); const clients = [...new Set(rows.map(o => o.cliente).filter(Boolean))].sort(); const states = [...new Set(rows.map(o => String(o.estadoEntrega || "POR COMPRAR").toUpperCase()))].sort(); const filtered = showEmission ? rows.filter(o => (stateFilter === "TODOS" || String(o.estadoEntrega || "POR COMPRAR").toUpperCase() === stateFilter) && (emissionFilter === "TODAS" || (emissionFilter === "EMITIDA" ? Boolean(o.codigoImpresion) : !o.codigoImpresion)) && (clientFilter === "TODOS" || o.cliente === clientFilter)) : rows; return <>{showEmission && <section className="quick-filters"><label>Estado<select value={stateFilter} onChange={e => setStateFilter(e.target.value)}><option value="TODOS">Todos</option>{states.map(s => <option key={s}>{s}</option>)}</select></label><label>Boleta<select value={emissionFilter} onChange={e => setEmissionFilter(e.target.value)}><option value="TODAS">Todas</option><option value="EMITIDA">Emitida</option><option value="NO EMITIDA">No emitida</option></select></label><label>Cliente<select value={clientFilter} onChange={e => setClientFilter(e.target.value)}><option value="TODOS">Todos los clientes</option>{clients.map(c => <option key={c}>{c}</option>)}</select></label><button onClick={() => { setStateFilter("TODOS"); setEmissionFilter("TODAS"); setClientFilter("TODOS"); }}>Limpiar filtros</button></section>}<div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Items</th><th>Total</th><th>Estado</th>{showEmission && <th>Boleta</th>}<th></th></tr></thead><tbody>{filtered.map(o => <tr key={o.ventaId}><td><b>{o.ventaId}</b></td><td>{o.cliente}</td><td>{o.fecha}</td><td>{o.itemsCount}</td><td><b>{money(o.total)}</b></td><td><span className={`table-status status-${String(o.estadoEntrega || "POR COMPRAR").toLowerCase().replace(/\s+/g, "-")}`}>{normalizeOperationalState(o.estadoEntrega).replace(/_/g, " ")}</span></td>{showEmission && <td>{o.codigoImpresion ? <span className="emission-tag emitted" title={`Emitida ${o.fechaImpresion || ""}`}>✓ EMITIDA<small>{o.codigoImpresion}</small></span> : <span className="emission-tag">NO EMITIDA</span>}</td>}<td>{onDetail && <button onClick={() => onDetail(o)}>Ver detalle</button>}</td></tr>)}</tbody></table></div></>; }
function Orders({ orders, call, refresh, notify, onOrderUpdated }: {
    orders: Order[];
    call: <T>(f: string, a?: unknown[]) => Promise<T>;
    refresh: () => Promise<void>;
    notify: (s: string) => void;
    onOrderUpdated: (order: Order) => void;
}) {
    const [detail, setDetail] = useState<Order | null>(null);
    const dialogRef = useRef<HTMLElement>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const [query, setQuery] = useState("");
    const [printing, setPrinting] = useState(false);
    const [printStage, setPrintStage] = useState("");
    const [orderTab, setOrderTab] = useState("POR_COMPRAR");
    const [emissionFilter, setEmissionFilter] = useState<"TODAS" | "EMITIDA" | "NO_EMITIDA">("TODAS");
    const [clientFilter, setClientFilter] = useState("TODOS");
    const [editing, setEditing] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [preparation, setPreparation] = useState<PreparationLine[]>([]);
    const [savingPreparation, setSavingPreparation] = useState(false);
    const [assignmentOpen, setAssignmentOpen] = useState(false);
    const [assignment, setAssignment] = useState({ fecha: today(), repartidor: "", vehiculo: "", ruta: "", ordenVisita: 1 });
    const [editClient, setEditClient] = useState("");
    const [editObs, setEditObs] = useState("");
    const [editItems, setEditItems] = useState<Array<{ codigo: string; nombre: string; cantidad: number; precioUnitario: number }>>([]);
    const states = ["POR_COMPRAR", "LISTO_PARA_ENTREGA", "ENTREGADO", "OBSERVADO"];
    const uniqueOrders = useMemo(() => dedupeOrders(orders), [orders]);
    const stateOf = (o: Order) => normalizeOperationalState(o.estadoOperativo || o.estadoEntrega);
    const counts = Object.fromEntries(states.map(state => [state, uniqueOrders.filter(o => stateOf(o) === state).length]));
    const emittedCount = uniqueOrders.filter(o => Boolean(o.codigoImpresion)).length;
    const orderClients = [...new Set(uniqueOrders.map(o => o.cliente).filter(Boolean))].sort();
    const visible = uniqueOrders.filter(o => stateOf(o) === orderTab && (emissionFilter === "TODAS" || (emissionFilter === "EMITIDA" ? Boolean(o.codigoImpresion) : !o.codigoImpresion)) && (clientFilter === "TODOS" || o.cliente === clientFilter) && JSON.stringify(o).toLowerCase().includes(query.toLowerCase()));
    function openDetail(order: Order) {
        returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setDetail({ ...order, estadoEntrega: order.estadoOperativo || order.estadoEntrega });
        setPreparation([]);
        void call<{ lineas: PreparationLine[] }>("obtenerPreparacionPedido", [order.ventaId]).then(result => setPreparation(result.lineas || [])).catch(() => setPreparation([]));
    }
    function updatePreparation(index: number, patch: Partial<PreparationLine>) { setPreparation(lines => lines.map((line, current) => current === index ? { ...line, ...patch } : line)); }
    async function savePreparation(markReady = false) {
        if (!detail || savingPreparation) return;
        setSavingPreparation(true);
        try {
            const result = await call<{ ok: boolean; mensaje: string }>("guardarPreparacionPedido", [{ ventaId: detail.ventaId, lineas: preparation, marcarListo: markReady }]);
            notify(result.mensaje);
            if (result.ok && markReady) { onOrderUpdated({ ...detail, estadoOperativo: "LISTO_PARA_ENTREGA" }); setDetail(null); }
        }
        catch (error) { notify(error instanceof Error ? error.message : "No se guardó la preparación"); }
        finally { setSavingPreparation(false); }
    }
    async function assignJourney(e: FormEvent) {
        e.preventDefault(); if (!detail) return;
        try {
            const result = await call<{ ok: boolean; mensaje: string }>("asignarPedidoJornada", [{ ventaId: detail.ventaId, ...assignment }]);
            notify(result.mensaje);
            if (result.ok) { setAssignmentOpen(false); onOrderUpdated({ ...detail, estadoOperativo: "LISTO_PARA_ENTREGA", estadoEntrega: "EN_RUTA" }); setDetail(null); }
        }
        catch (error) { notify(error instanceof Error ? error.message : "No se asignó la jornada"); }
    }
    function closeDetail() {
        if (editing && !window.confirm("Hay cambios sin guardar. ¿Deseas salir?"))
            return;
        setEditing(false);
        setDetail(null);
    }
    useEffect(() => {
        if (!detail)
            return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.setTimeout(() => dialogRef.current?.focus(), 0);
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape")
                return;
            if (editing && !window.confirm("Hay cambios sin guardar. ¿Deseas salir?"))
                return;
            setEditing(false);
            setDetail(null);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", onKeyDown);
            window.setTimeout(() => returnFocusRef.current?.focus(), 0);
        };
    }, [detail, editing]);
    async function status(o: Order, value: string) {
        try {
            const normalized = normalizeOperationalState(value);
            const backendState = normalized.replace(/_/g, " ");
            const observation = normalized === "OBSERVADO" ? window.prompt("Describe la incidencia u observación del pedido") : "";
            if (normalized === "OBSERVADO" && !observation?.trim()) return;
            let message = "";
            try {
                message = await call<string>("actualizarEstadoOperativoPedido", [{ ventaId: o.ventaId, cliente: o.cliente, totalPedido: o.total, estado: backendState, observacion: observation || "" }]);
            }
            catch (first) {
                const reason = first instanceof Error ? first.message : "";
                if (!/operaci[oó]n no permitida/i.test(reason))
                    throw first;
                if (Number(o.totalCobrado || 0) > .01)
                    throw new Error("Actualiza Apps Script antes de cambiar el estado de un pedido que ya tiene cobros.");
                message = await call<string>("guardarCobranzaPedido", [{ ventaId: o.ventaId, cliente: o.cliente, totalPedido: 0, estadoEntrega: backendState, estadoPago: "PENDIENTE", efectivo: 0, yape: 0, plin: 0, transferencia: 0, pos: 0, otros: 0, observacion: "ESTADO OPERATIVO" }]);
            }
            onOrderUpdated({ ...o, estadoOperativo: normalized });
            notify(message || `Estado actualizado: ${backendState}`);
            setDetail(null);
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se actualizó");
        }
    }
    async function printOrder(o: Order) {
        if (printing)
            return;
        setPrinting(true);
        setPrintStage("Emitiendo…");
        try {
            const r = await measured("emitirBoleta", () => call<{
                ok: boolean;
                mensaje?: string;
                codigo?: string;
            }>("generarCodigoImpresion", [o.ventaId]));
            if (!r.ok)
                throw new Error(r.mensaje || "No se pudo emitir la boleta");
            notify(`${o.codigoImpresion ? "Boleta reimpresa" : "Boleta emitida"}: ${r.codigo || ""}`);
            setDetail({ ...o, codigoImpresion: r.codigo || o.codigoImpresion });
            setPrintStage("Preparando impresión…");
            window.setTimeout(() => window.print(), 120);
            void refresh();
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se pudo imprimir");
        }
        finally {
            setPrinting(false);
            setPrintStage("");
        }
    }
    function startEdit(o: Order) { setEditClient(o.cliente); setEditObs(o.observaciones || ""); setEditItems(o.items.map(i => ({ codigo: i.codigo, nombre: i.nombre, cantidad: Number(i.cantidad), precioUnitario: Number(i.precioUnitario) }))); setEditing(true); }
    async function saveEdit() { if (!detail || savingEdit) return; if (!editClient.trim() || !editItems.length || editItems.some(i => !(i.cantidad > 0))) return notify("Revisa el cliente y las cantidades del pedido."); setSavingEdit(true); try { const result = await call<{ ok: boolean; mensaje: string; total?: number }>("corregirPedido", [{ ventaId: detail.ventaId, cliente: editClient.trim(), observaciones: editObs, items: editItems.map(i => ({ codigo: i.codigo, cantidad: i.cantidad })) }]); if (!result.ok) throw new Error(result.mensaje); notify(result.mensaje); setEditing(false); setDetail(null); await refresh(); } catch (x) { notify(x instanceof Error ? x.message : "No se pudo editar el pedido"); } finally { setSavingEdit(false); } }
    return <div className="orders-page"><Heading eyebrow="OPERACIÓN Y DESPACHO" title="Pedidos y emisión" text="Controla la compra, preparación y emisión de cada pedido."/><nav className="order-state-tabs">{states.map(state => <button key={state} className={orderTab === state ? "active" : ""} onClick={() => setOrderTab(state)}><span>{state.replace(/_/g, " ")}</span><b>{counts[state]}</b></button>)}</nav><nav className="order-secondary-filters"><button className={emissionFilter === "EMITIDA" ? "active" : ""} onClick={() => setEmissionFilter(value => value === "EMITIDA" ? "TODAS" : "EMITIDA")}>Boletas emitidas <b>{emittedCount}</b></button><button className={emissionFilter === "NO_EMITIDA" ? "active" : ""} onClick={() => setEmissionFilter(value => value === "NO_EMITIDA" ? "TODAS" : "NO_EMITIDA")}>Boletas no emitidas <b>{uniqueOrders.length - emittedCount}</b></button><label>Cliente<select value={clientFilter} onChange={e => setClientFilter(e.target.value)}><option value="TODOS">Todos los clientes</option>{orderClients.map(client => <option key={client}>{client}</option>)}</select></label><button onClick={() => { setEmissionFilter("TODAS"); setClientFilter("TODOS"); setQuery(""); }}>Limpiar filtros</button></nav><section className="section-tools"><label className="search">⌕<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar pedido…"/></label></section><section className="panel data-panel"><SimpleOrders rows={visible} onDetail={openDetail}/></section>{detail && <div className="modal-bg order-dialog-bg" onMouseDown={e => { if (e.target === e.currentTarget) closeDetail(); }}><section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Detalle del pedido ${detail.ventaId}`} className="order-detail order-dialog" onMouseDown={e => e.stopPropagation()}><button className="close" onClick={closeDetail} aria-label="Cerrar detalle">×</button><h2>{detail.ventaId}</h2>{editing ? <div className="order-editor"><label>Cliente<input value={editClient} onChange={e => setEditClient(e.target.value)}/></label><label>Observaciones<textarea value={editObs} onChange={e => setEditObs(e.target.value)}/></label><h3>Materiales y cantidades</h3>{editItems.map((i, index) => <div className="order-edit-item" key={i.codigo}><span><b>{i.nombre}</b><small>{i.codigo} · {money(i.precioUnitario)}</small></span><input aria-label={`Cantidad de ${i.nombre}`} type="number" min="0.01" step="0.01" value={i.cantidad} onChange={e => setEditItems(rows => rows.map((row, n) => n === index ? { ...row, cantidad: Number(e.target.value) } : row))}/><button onClick={() => setEditItems(rows => rows.filter((_, n) => n !== index))}>×</button></div>)}<div className="detail-total"><span>Nuevo total</span><strong>{money(editItems.reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0))}</strong></div><div className="order-actions"><button onClick={() => setEditing(false)}>Cancelar</button><button className="primary" disabled={savingEdit} onClick={saveEdit}>{savingEdit ? "Guardando…" : "Guardar cambios"}</button></div></div> : <><p>{detail.cliente} · {detail.fecha}</p><label>Estado operativo<select value={normalizeOperationalState(detail.estadoEntrega)} onChange={e => status(detail, e.target.value)}>{states.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select></label><div className={`emission-summary ${detail.codigoImpresion ? "emitted" : ""}`}><b>{detail.codigoImpresion ? "✓ Boleta emitida" : "Boleta no emitida"}</b>{detail.codigoImpresion && <small>{detail.codigoImpresion} · {detail.fechaImpresion}</small>}</div><div className="order-progress"><span className="done">Pedido creado ✓</span><span className={normalizeOperationalState(detail.estadoEntrega) !== "POR_COMPRAR" ? "done" : ""}>Preparación {normalizeOperationalState(detail.estadoEntrega) !== "POR_COMPRAR" ? "✓" : "○"}</span><span className={["LISTO_PARA_ENTREGA","ENTREGADO"].includes(normalizeOperationalState(detail.estadoEntrega)) ? "done" : ""}>Listo para entrega</span><span className={String(detail.estadoEntrega) === "EN_RUTA" || normalizeOperationalState(detail.estadoEntrega) === "ENTREGADO" ? "done" : ""}>En ruta</span><span className={normalizeOperationalState(detail.estadoEntrega) === "ENTREGADO" ? "done" : ""}>Entregado</span><span className={Number(detail.saldo || detail.total) <= .01 ? "done" : ""}>Cobrado</span></div>{normalizeOperationalState(detail.estadoEntrega) === "POR_COMPRAR" && <section className="preparation-control"><h3>Materiales a preparar</h3>{preparation.map((line,index) => <article key={line.codigo}><span><b>{line.producto}</b><small>{line.cantidadPedido} {line.presentacion} · Físico {line.stockFisico} · Reservado {line.stockReservado} · En ruta {line.stockEnRuta || 0} · Disponible {line.stockDisponible}</small></span><label>Preparado<input type="number" min="0" step=".01" value={line.cantidadPreparada || ""} onChange={e => updatePreparation(index,{cantidadPreparada:Number(e.target.value)})}/></label><select value={line.estadoLinea} onChange={e => updatePreparation(index,{estadoLinea:e.target.value as PreparationLine["estadoLinea"]})}><option>PENDIENTE</option><option>PREPARADO</option><option>FALTANTE</option><option>OBSERVADO</option></select>{line.estadoLinea === "FALTANTE" && <><input type="number" min="0" step=".01" value={line.cantidadFaltante || ""} onChange={e => updatePreparation(index,{cantidadFaltante:Number(e.target.value)})} placeholder="Cantidad faltante"/><input value={line.motivo} onChange={e => updatePreparation(index,{motivo:e.target.value})} placeholder="Motivo del faltante"/></>}</article>)}<div className="preparation-actions"><button onClick={() => savePreparation(false)} disabled={savingPreparation}>Guardar preparación</button><button className="primary" onClick={() => savePreparation(true)} disabled={savingPreparation || !preparation.length || preparation.some(line => line.estadoLinea !== "PREPARADO")}>Marcar listo para entrega</button></div></section>}{normalizeOperationalState(detail.estadoEntrega) === "LISTO_PARA_ENTREGA" && <button className="assign-journey-button" onClick={() => setAssignmentOpen(true)}>Asignar a jornada</button>}<h3>Materiales asociados</h3><div className="detail-items">{detail.items.map(i => <div className="detail-row" key={i.codigo}><span><b>{i.nombre}</b><small>{i.codigo}</small></span><span>{i.cantidad}</span><span>{money(i.precioUnitario)}</span><span><b>{money(i.subtotal)}</b></span></div>)}</div><div className="detail-total"><span>Total</span><strong>{money(detail.total)}</strong></div><div className="order-actions"><button onClick={() => startEdit(detail)}>✎ Editar pedido</button><button disabled={printing} onClick={() => printOrder(detail)}>{printing ? printStage : detail.codigoImpresion ? "Reimprimir boleta" : "Emitir e imprimir boleta"}</button></div></>}</section></div>}{assignmentOpen && detail && <div className="modal-bg route-modal-bg"><form className="modal assignment-modal" onSubmit={assignJourney}><button type="button" className="close" onClick={() => setAssignmentOpen(false)}>×</button><span className="eyebrow">ASIGNAR A JORNADA</span><h2>{detail.ventaId}</h2><label>Fecha<input type="date" required value={assignment.fecha} onChange={e => setAssignment({...assignment,fecha:e.target.value})}/></label><label>Repartidor<input required value={assignment.repartidor} onChange={e => setAssignment({...assignment,repartidor:e.target.value})}/></label><label>Vehículo<input required value={assignment.vehiculo} onChange={e => setAssignment({...assignment,vehiculo:e.target.value})}/></label><label>Ruta<input required value={assignment.ruta} onChange={e => setAssignment({...assignment,ruta:e.target.value})}/></label><label>Orden de visita<input type="number" min="1" value={assignment.ordenVisita} onChange={e => setAssignment({...assignment,ordenVisita:Number(e.target.value)})}/></label><button className="primary">Asignar y enviar a ruta</button></form></div>}</div>;
}
function Collections({ rows, clients, loading, load, call, notify }: {
    rows: Order[];
    clients: Client[];
    loading: boolean;
    load: () => Promise<void>;
    call: <T>(f: string, a?: unknown[]) => Promise<T>;
    notify: (s: string) => void;
}) {
    const [routeTab, setRouteTab] = useState(() => cacheGet<string>("nexo_route_tab", "EN RUTA"));
    const [expenseOpen, setExpenseOpen] = useState(false);
    const [savingExpense, setSavingExpense] = useState(false);
    const [journey, setJourney] = useState<JourneySummary | null>(null);
    const [journeyExpenses, setJourneyExpenses] = useState<ExpenseApproval[]>([]);
    const [journeyDetail, setJourneyDetail] = useState<"ASIGNADOS" | "ENTREGADOS" | "NO ENTREGADOS" | "VENTAS" | "COBRADO" | "POR COBRAR" | "URGENTE" | "GASTOS" | "GASTOS PENDIENTES" | null>(null);
    const [closeJourneyOpen, setCloseJourneyOpen] = useState(false);
    const [closingJourney, setClosingJourney] = useState(false);
    const [cashDelivered, setCashDelivered] = useState(0);
    const [journeyObservation, setJourneyObservation] = useState("");
    const [expense, setExpense] = useState({ solicitudId: crypto.randomUUID(), fecha: today(), partida: "COMBUSTIBLE", descripcion: "", importe: 0, canal: "EFECTIVO", ruta: "JORNADA ACTUAL", unidad: "", observacion: "", origenDinero: "FONDO DE RUTA" });
    const [rawSelected, setSelected] = useState<Order | null>(null);
    const selected = rawSelected!;
    const [saving, setSaving] = useState(false);
    const [paymentFilter, setPaymentFilter] = useState("TODOS");
    const [deliveryFilter, setDeliveryFilter] = useState("TODAS");
    const [clientFilter, setClientFilter] = useState("TODOS");
    const collectionClients = [...new Set(rows.map(o => o.cliente).filter(Boolean))].sort();
    const [form, setForm] = useState({ solicitudId: crypto.randomUUID(), resultado: "ENTREGA COMPLETA", entregado: false, fechaEntrega: today(), modoPago: "CREDITO", cobrado: false, efectivo: 0, yape: 0, plin: 0, transferencia: 0, fechaPromesa: "", observacion: "", ajuste: "" });
    const [deliveredQuantities, setDeliveredQuantities] = useState<Record<string, number>>({});
    const loadJourney = useCallback(async () => {
        try {
            const [summary, expenses] = await measured("cargarJornada", () => Promise.all([call<JourneySummary>("obtenerResumenJornada", [today()]), call<ExpenseApproval[]>("obtenerGastosOperacion", [today()])]));
            setJourney(summary);
            setJourneyExpenses(expenses);
            setCashDelivered(current => current || Number(summary.efectivoEsperado || 0));
        }
        catch (error) {
            notify(error instanceof Error ? error.message : "No se cargó el resumen de jornada");
        }
    }, [call, notify]);
    useEffect(() => { queueMicrotask(() => void loadJourney()); }, [loadJourney]);
    useEffect(() => {
        if (!journeyDetail && !closeJourneyOpen) return;
        const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setJourneyDetail(null); setCloseJourneyOpen(false); } };
        document.addEventListener("keydown", close);
        return () => document.removeEventListener("keydown", close);
    }, [closeJourneyOpen, journeyDetail]);
    function status(o: Order) { const paid = Number(o.totalCobrado || 0), total = Number(o.total || 0); return paid >= total - .01 ? "CANCELADO" : paid > .01 ? "COBRADO PARCIAL" : "PENDIENTE"; }
    const filteredRows = rows.filter(o => (paymentFilter === "TODOS" || status(o) === paymentFilter) && (deliveryFilter === "TODAS" || (deliveryFilter === "ENTREGADO" ? String(o.estadoEntrega).toUpperCase() === "ENTREGADO" : String(o.estadoEntrega).toUpperCase() !== "ENTREGADO")) && (clientFilter === "TODOS" || o.cliente === clientFilter));
    const deliveredDebts = rows.filter(o => String(o.estadoEntrega).toUpperCase() === "ENTREGADO" && Number(o.saldo || 0) > .01);
    const promisedDebts = deliveredDebts.filter(o => Boolean(o.fechaPromesa));
    const overduePromises = promisedDebts.filter(o => String(o.fechaPromesa).slice(0, 10) < today());
    const fourDayDebts = deliveredDebts.filter(o => daysSince(o.fechaEntrega || o.fecha) >= 4);
    const sumAmount = (source: Order[], field: keyof Order) => source.reduce((total, row) => total + Number(row[field] || 0), 0);
    const cashCollected = rows.reduce((total, row) => total + Number(row.efectivo || 0), 0);
    const yapeCollected = rows.reduce((total, row) => total + Number(row.yape || 0) + Number(row.plin || 0), 0);
    function open(o: Order) { const hasPayment = Number(o.totalCobrado || 0) > 0; setSelected(o); setDeliveredQuantities(Object.fromEntries(o.items.map(item => [item.codigo, Number(item.cantidad) || 0]))); setForm({ solicitudId: crypto.randomUUID(), resultado: "ENTREGA COMPLETA", entregado: true, fechaEntrega: o.fechaEntrega || today(), modoPago: hasPayment ? "MIXTO" : "CREDITO", cobrado: hasPayment, efectivo: Number(o.efectivo || 0), yape: Number(o.yape || 0), plin: Number(o.plin || 0), transferencia: Number(o.transferencia || 0), fechaPromesa: o.fechaPromesa || "", observacion: o.observacionCobro || "", ajuste: "" }); }
    function setPaymentMode(mode: string) {
        if (!selected)
            return;
        const currentPaid = Number(selected.totalCobrado || 0), remaining = Math.max(0, selected.total - currentPaid);
        if (mode === "EFECTIVO") setForm({ ...form, modoPago: mode, cobrado: true, efectivo: Number(selected.efectivo || 0) + remaining, yape: Number(selected.yape || 0), plin: Number(selected.plin || 0), transferencia: Number(selected.transferencia || 0), fechaPromesa: "", ajuste: "" });
        else if (mode === "YAPE") setForm({ ...form, modoPago: mode, cobrado: true, efectivo: Number(selected.efectivo || 0), yape: Number(selected.yape || 0) + remaining, plin: Number(selected.plin || 0), transferencia: Number(selected.transferencia || 0), fechaPromesa: "", ajuste: "" });
        else if (mode === "CREDITO") setForm({ ...form, modoPago: mode, cobrado: false, efectivo: Number(selected.efectivo || 0), yape: Number(selected.yape || 0), plin: Number(selected.plin || 0), transferencia: Number(selected.transferencia || 0), fechaPromesa: addDays(form.fechaEntrega || today(), 3), ajuste: "" });
        else setForm({ ...form, modoPago: "MIXTO", cobrado: true, ajuste: "" });
    }
    function setPaymentField(field: "efectivo" | "yape" | "plin" | "transferencia", rawValue: number) {
        if (!selected)
            return;
        const fields = ["efectivo", "yape", "plin", "transferencia"] as const;
        const otherTotal = fields.filter(key => key !== field).reduce((sum, key) => sum + Number(form[key] || 0), 0) + Number(selected.pos || 0) + Number(selected.otros || 0);
        const maximum = Math.max(0, selected.total - otherTotal), requested = Math.max(0, Number(rawValue) || 0), adjusted = Math.min(requested, maximum);
        setForm({ ...form, modoPago: "MIXTO", cobrado: true, [field]: adjusted, ajuste: requested > maximum ? "El importe fue ajustado al saldo pendiente." : "" });
    }
    async function save(e: FormEvent) {
        e.preventDefault();
        if (!selected || saving)
            return;
        const efectivo = form.cobrado ? Number(form.efectivo || 0) : 0, yape = form.cobrado ? Number(form.yape || 0) : 0, plin = form.cobrado ? Number(form.plin || 0) : 0, transferencia = form.cobrado ? Number(form.transferencia || 0) : 0, paid = efectivo + yape + plin + transferencia + Number(selected.pos || 0) + Number(selected.otros || 0), balance = Math.max(0, selected.total - paid);
        if (paid > selected.total + .01)
            return notify("El cobro supera el total de la venta.");
        if (form.entregado && !form.fechaEntrega)
            return notify("Indica la fecha de entrega.");
        if (form.resultado === "ENTREGA PARCIAL" && !selected.items.some(item => Number(deliveredQuantities[item.codigo] || 0) > 0 && Number(deliveredQuantities[item.codigo] || 0) < Number(item.cantidad)))
            return notify("En una entrega parcial indica al menos una cantidad menor a la pedida.");
        if (form.fechaPromesa && (form.fechaPromesa < today() || form.fechaPromesa > addDays(form.fechaEntrega || today(), 3)))
            return notify("El compromiso no puede superar tres días desde la entrega.");
        setSaving(true);
        try {
            const message = await call<string>("guardarCobranzaPedido", [{ ...selected, solicitudId: form.solicitudId, ventaId: selected.ventaId, cliente: selected.cliente, totalPedido: selected.total, estadoEntrega: form.resultado === "ENTREGA COMPLETA" ? "ENTREGADO" : form.resultado, fechaEntrega: form.fechaEntrega, estadoPago: balance <= .01 ? "TOTAL" : paid > 0 ? "PARCIAL" : "PENDIENTE", efectivo, yape, plin, transferencia, pos: selected.pos || 0, otros: selected.otros || 0, fechaPromesa: balance > .01 && (form.entregado || form.resultado === "ENTREGA PARCIAL") ? (form.fechaPromesa || addDays(form.fechaEntrega, 3)) : "", medioPrometido: balance > .01 ? "POR CONFIRMAR" : "", observacion: form.observacion, itemsEntregados: selected.items.map(item => ({ codigo: item.codigo, cantidadPedida: item.cantidad, cantidadEntregada: form.resultado === "ENTREGA PARCIAL" ? Math.min(Number(item.cantidad), Math.max(0, Number(deliveredQuantities[item.codigo] || 0))) : item.cantidad })) }]);
            if (!/correctamente|ya registrada/i.test(message))
                return notify(message);
            notify(message);
            setSelected(null);
            await load();
            void loadJourney();
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se guardó");
        }
        finally {
            setSaving(false);
        }
    }
    const routeRows = rows.filter(o => String(o.estadoEntrega || "").trim().toUpperCase().replace(/\s+/g, "_") === "EN_RUTA");
    const deliveredRows = rows.filter(o => String(o.estadoEntrega || "").toUpperCase() === "ENTREGADO");
    const pendingRows = deliveredRows.filter(o => Number(o.saldo || 0) > .01 && daysSince(o.fechaEntrega || o.fecha) <= 3);
    const overdueRows = deliveredRows.filter(o => Number(o.saldo || 0) > .01 && daysSince(o.fechaEntrega || o.fecha) > 3);
    const dailyRows = rows.filter(o => daysSince(o.fechaEntrega || o.fecha) === 0);
    const dailyDelivered = dailyRows.filter(o => String(o.estadoEntrega || "").toUpperCase() === "ENTREGADO");
    const dailyNotDelivered = dailyRows.filter(o => String(o.estadoEntrega || "").toUpperCase() !== "ENTREGADO");
    const dailyReceivables = deliveredRows.filter(o => Number(o.saldo || 0) > .01 && daysSince(o.fechaEntrega || o.fecha) <= 3);
    const dailyUrgent = deliveredRows.filter(o => Number(o.saldo || 0) > .01 && daysSince(o.fechaEntrega || o.fecha) > 3);
    const cashExpenses = journeyExpenses.filter(item => String(item.canal || "").toUpperCase() === "EFECTIVO").reduce((sum, item) => sum + Number(item.importe || 0), 0);
    const cashDifference = cashDelivered - Number(journey?.efectivoEsperado || 0);
    const journeyDetailRows = journeyDetail === "ENTREGADOS" || journeyDetail === "VENTAS" || journeyDetail === "COBRADO" ? dailyDelivered : journeyDetail === "NO ENTREGADOS" ? dailyNotDelivered : journeyDetail === "POR COBRAR" ? dailyReceivables : journeyDetail === "URGENTE" ? dailyUrgent : dailyRows;
    const journeyDetailTitle = journeyDetail === "POR COBRAR" ? "Deudores de la jornada" : journeyDetail === "URGENTE" ? "Cobranza urgente" : journeyDetail === "GASTOS PENDIENTES" ? "Gastos pendientes de aprobación" : journeyDetail === "GASTOS" ? "Gastos de ruta" : journeyDetail || "Detalle de jornada";
    const tabRows = routeTab === "EN RUTA" ? routeRows : routeTab === "ENTREGADOS" ? deliveredRows : routeTab === "PENDIENTES DE COBRO" ? pendingRows : routeTab === "COBRANZA URGENTE" || routeTab === "VENCIDOS" ? overdueRows : [];
    const findClient = (name: string) => clients.find(c => `${c.nombre} ${c.apellidos}`.trim().toLowerCase() === name.trim().toLowerCase());
    async function saveExpense(e: FormEvent) {
        e.preventDefault();
        if (savingExpense || !(expense.importe > 0) || !expense.partida)
            return notify("Indica categoría e importe válido.");
        setSavingExpense(true);
        try {
            const message = await call<string>("registrarGastoOperacion", [{ ...expense, descripcion: `${expense.descripcion} · ${expense.origenDinero}`.trim() }]);
            notify(message);
            if (/correctamente/i.test(message)) {
                setExpenseOpen(false);
                setExpense({ solicitudId: crypto.randomUUID(), fecha: today(), partida: "COMBUSTIBLE", descripcion: "", importe: 0, canal: "EFECTIVO", ruta: "JORNADA ACTUAL", unidad: "", observacion: "", origenDinero: "FONDO DE RUTA" });
                void loadJourney();
            }
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se registró el gasto");
        }
        finally {
            setSavingExpense(false);
        }
    }
    async function closeJourney() {
        if (closingJourney || journey?.jornada?.estado === "CERRADA") return;
        setClosingJourney(true);
        try {
            const result = await measured("cerrarJornada", () => call<{ ok: boolean; mensaje: string }>("cerrarJornada", [{ fecha: today(), efectivoEntregado: cashDelivered, observacion: journeyObservation, observacionNoEntregados: journeyObservation }]));
            notify(result.mensaje);
            if (result.ok) { setCloseJourneyOpen(false); await loadJourney(); }
        }
        catch (error) { notify(error instanceof Error ? error.message : "No se pudo cerrar la jornada"); }
        finally { setClosingJourney(false); }
    }
    return <div className="route-module"><Heading eyebrow="DISTRIBUCIÓN" title="Entregas, liquidación y gastos de ruta" text="Gestiona la jornada del repartidor desde una sola vista."><div><button onClick={load}>{loading ? "Actualizando…" : "↻ Actualizar"}</button><button className="primary" onClick={() => setExpenseOpen(true)}>＋ Registrar gasto</button></div></Heading><nav className="route-tabs">{["EN RUTA", "ENTREGADOS", "PENDIENTES DE COBRO", "COBRANZA URGENTE", "JORNADA Y RENDICIÓN"].map(tab => <button className={routeTab === tab ? "active" : ""} key={tab} onClick={() => { setRouteTab(tab); cacheSet("nexo_route_tab", tab); }}>{tab}<b>{tab === "EN RUTA" ? routeRows.length : tab === "ENTREGADOS" ? deliveredRows.length : tab === "PENDIENTES DE COBRO" ? pendingRows.length : tab === "COBRANZA URGENTE" ? overdueRows.length : ""}</b></button>)}</nav>{routeTab !== "JORNADA Y RENDICIÓN" ? <section className="route-card-grid">{tabRows.map((order, index) => { const clientData = findClient(order.cliente); const overdue = routeTab === "COBRANZA URGENTE" || routeTab === "VENCIDOS"; return <article className={`route-order-card ${overdue ? "overdue" : ""}`} key={order.ventaId}><header><span>VISITA {index + 1}</span><b>{order.estadoEntrega || "EN RUTA"}</b></header><h3>{order.cliente}</h3><small>Pedido #{order.ventaId.slice(-6)}</small><div className="route-money"><strong>{money(order.total)}</strong><span>Saldo {money(order.saldo)}</span></div><p>⌖ {clientData?.direccion || "Dirección no registrada"}</p><p>☎ {clientData?.contacto || "Sin teléfono"}</p>{Number(order.saldo || 0) > .01 && String(order.estadoEntrega).toUpperCase() === "ENTREGADO" && <div className="route-deadline"><b>{overdue ? `${daysSince(order.fechaEntrega || order.fecha) - 3} día(s) vencido` : `${Math.max(0, 3 - daysSince(order.fechaEntrega || order.fecha))} día(s) restante(s)`}</b><small>Límite: {addDays(String(order.fechaEntrega || today()).slice(0, 10), 3)}</small></div>}<footer>{clientData?.contacto && <a href={`tel:${clientData.contacto}`}>Llamar</a>}{clientData?.direccion && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clientData.direccion)}`} target="_blank" rel="noreferrer">Ubicación</a>}<button className="primary" onClick={() => open(order)}>{routeTab === "EN RUTA" ? "Iniciar entrega" : Number(order.saldo || 0) > .01 ? "Registrar pago" : "Ver gestión"}</button></footer></article>; })}{!tabRows.length && <div className="route-empty"><span>✓</span><b>Sin operaciones en esta sección</b><small>La jornada está al día.</small></div>}</section> : <section className="journey-day"><header className="journey-day-header"><div><small>JORNADA DEL DÍA</small><h2>{new Date(`${journey?.fecha || today()}T12:00:00`).toLocaleDateString("es-PE")}</h2><p>Repartidor: <b>{journey?.jornada?.repartidor || "Sin asignar"}</b> · Vehículo: <b>{journey?.jornada?.vehiculo || "Sin asignar"}</b></p></div><span className={journey?.jornada?.estado === "CERRADA" ? "closed" : "open"}>{journey?.jornada?.estado || "ABIERTA"}</span><div><button onClick={() => setExpenseOpen(true)}>＋ Registrar gasto</button><button className="primary" disabled={journey?.jornada?.estado === "CERRADA"} onClick={() => setCloseJourneyOpen(true)}>Cerrar jornada</button></div></header><div className="journey-summary-grid"><button onClick={() => setJourneyDetail("ASIGNADOS")}><small>Pedidos asignados</small><strong>{journey?.pedidosAsignados || 0}</strong></button><button onClick={() => setJourneyDetail("ENTREGADOS")}><small>Entregados</small><strong>{journey?.entregados || 0}</strong></button><button onClick={() => setJourneyDetail("NO ENTREGADOS")}><small>No entregados</small><strong>{journey?.noEntregados || 0}</strong></button><button className="wide sales" onClick={() => setJourneyDetail("VENTAS")}><small>Ventas entregadas</small><strong>{money(journey?.ventasEntregadas)}</strong></button><button className="wide collected" onClick={() => setJourneyDetail("COBRADO")}><small>Cobrado hoy</small><strong>{money(journey?.totalCobrado)}</strong></button><button className="wide debt" onClick={() => setJourneyDetail("POR COBRAR")}><small>Por cobrar</small><strong>{money(journey?.saldos.dentroPlazo)}</strong><em>{dailyReceivables.length} pedido(s) dentro de plazo</em></button><button className="wide urgent" onClick={() => setJourneyDetail("URGENTE")}><small>Cobranza urgente</small><strong>{money(journey?.saldos.urgente)}</strong><em>{dailyUrgent.length} pedido(s) vencido(s)</em></button><button className="wide expenses" onClick={() => setJourneyDetail("GASTOS")}><small>Gastos de ruta</small><strong>{money(journey?.gastos.total)}</strong><em>{journeyExpenses.length} registro(s)</em></button><button className="wide pending" onClick={() => setJourneyDetail("GASTOS PENDIENTES")}><small>Gastos pendientes de aprobación</small><strong>{money(journey?.gastos.pendientes)}</strong><em>{journeyExpenses.filter(item => item.estadoAprobacion === "PENDIENTE" || item.estadoAprobacion === "OBSERVADO").length} registro(s)</em></button></div><div className="journey-bottom-grid"><section className="journey-readonly"><small>COBROS DEL DÍA</small><span>Efectivo <b>{money(journey?.cobros.efectivo)}</b></span><span>Yape / Plin <b>{money(Number(journey?.cobros.yape || 0) + Number(journey?.cobros.plin || 0))}</b></span><span>Transferencia <b>{money(journey?.cobros.transferencia)}</b></span><span>Otros <b>{money(journey?.cobros.otros)}</b></span><strong>Total <b>{money(journey?.cobros.total)}</b></strong></section><section className="journey-liquidation"><small>LIQUIDACIÓN DEL DÍA</small><span>Efectivo cobrado <b>{money(journey?.cobros.efectivo)}</b></span><span>Gastos pagados con efectivo <b>{money(cashExpenses)}</b></span><span>Efectivo esperado <b>{money(journey?.efectivoEsperado)}</b></span><label>Efectivo entregado<input type="number" min="0" step=".01" value={cashDelivered || ""} onChange={e => setCashDelivered(Number(e.target.value))}/></label><strong className={Math.abs(cashDifference) > .01 ? "difference" : ""}>Diferencia <b>{money(cashDifference)}</b></strong>{Math.abs(cashDifference) > .01 && <label>Observación<textarea value={journeyObservation} onChange={e => setJourneyObservation(e.target.value)} placeholder="Explica la diferencia de efectivo"/></label>}</section></div></section>}{journeyDetail && <div className="modal-bg route-modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) setJourneyDetail(null); }}><section className="journey-detail-modal" role="dialog" aria-modal="true" aria-label={journeyDetailTitle} onMouseDown={e => e.stopPropagation()}><header><div><small>RESUMEN DEL DÍA</small><h2>{journeyDetailTitle}</h2></div><button onClick={() => setJourneyDetail(null)}>×</button></header><div className="journey-detail-body">{journeyDetail === "NO ENTREGADOS" && <div className="journey-reason-grid"><span>Pendientes <b>{journey?.noEntregadosDetalle?.pendientes || 0}</b></span><span>Cliente ausente <b>{journey?.noEntregadosDetalle?.clienteAusente || 0}</b></span><span>Reprogramados <b>{journey?.noEntregadosDetalle?.reprogramados || 0}</b></span><span>Rechazados <b>{journey?.noEntregadosDetalle?.rechazados || 0}</b></span><span>Observados <b>{journey?.noEntregadosDetalle?.observados || 0}</b></span></div>}{journeyDetail === "COBRADO" && <div className="journey-reason-grid"><span>Efectivo <b>{money(journey?.cobros.efectivo)}</b></span><span>Yape / Plin <b>{money(Number(journey?.cobros.yape || 0) + Number(journey?.cobros.plin || 0))}</b></span><span>Transferencia <b>{money(journey?.cobros.transferencia)}</b></span><span>Otros <b>{money(journey?.cobros.otros)}</b></span></div>}{journeyDetail === "GASTOS" || journeyDetail === "GASTOS PENDIENTES" ? <div className="journey-expense-list">{journeyExpenses.filter(item => journeyDetail === "GASTOS" || item.estadoAprobacion === "PENDIENTE" || item.estadoAprobacion === "OBSERVADO").map(item => <article key={item.solicitudId}><span><b>{item.partida}</b><small>{item.fecha} · {item.canal} · {item.estadoAprobacion || "PENDIENTE"}</small><p>{item.descripcion}</p></span><strong>{money(item.importe)}</strong></article>)}{!journeyExpenses.length && <p>Sin gastos registrados.</p>}<button className="primary" onClick={() => { setJourneyDetail(null); setExpenseOpen(true); }}>＋ Registrar gasto</button></div> : <div className="journey-order-list">{journeyDetailRows.map(order => { const clientData = findClient(order.cliente); const due = addDays(String(order.fechaEntrega || today()).slice(0,10), 3); const remaining = Math.max(0, 3 - daysSince(order.fechaEntrega || order.fecha)); return <article key={order.ventaId}><span><b>{order.cliente}</b><small>Pedido #{order.ventaId.slice(-8)} · {order.fechaEntrega || order.fecha}</small>{clientData?.contacto && <em>{clientData.contacto}</em>}</span><span>Total <b>{money(order.total)}</b></span><span>Cobrado <b>{money(order.totalCobrado)}</b></span><span>Saldo <strong>{money(order.saldo)}</strong></span>{Number(order.saldo || 0) > .01 && <span>Vence <b>{due}</b><small>{daysSince(order.fechaEntrega || order.fecha) > 3 ? `${daysSince(order.fechaEntrega || order.fecha) - 3} día(s) vencido` : `Faltan ${remaining} día(s)`}</small></span>}<footer>{clientData?.contacto && <a href={`tel:${clientData.contacto}`}>Llamar</a>}{clientData?.contacto && <a href={`https://wa.me/51${clientData.contacto.replace(/\D/g,"")}`} target="_blank" rel="noreferrer">WhatsApp</a>}{Number(order.saldo || 0) > .01 && <button className="primary" onClick={() => { setJourneyDetail(null); open(order); }}>Registrar pago</button>}</footer></article>})}{!journeyDetailRows.length && <p className="route-empty">Sin operaciones para mostrar.</p>}</div>}</div></section></div>}{closeJourneyOpen && <div className="modal-bg route-modal-bg" onMouseDown={e => { if (e.target === e.currentTarget && !closingJourney) setCloseJourneyOpen(false); }}><section className="journey-close-modal" role="dialog" aria-modal="true" aria-label="Resumen para cerrar jornada" onMouseDown={e => e.stopPropagation()}><header><div><small>RESUMEN DEL DÍA</small><h2>Cerrar jornada</h2></div><button onClick={() => setCloseJourneyOpen(false)}>×</button></header><div><span>Pedidos asignados <b>{journey?.pedidosAsignados || 0}</b></span><span>Entregados <b>{journey?.entregados || 0}</b></span><span>No entregados <b>{journey?.noEntregados || 0}</b></span><span>Ventas entregadas <b>{money(journey?.ventasEntregadas)}</b></span><span>Cobrado <b>{money(journey?.totalCobrado)}</b></span><span>Por cobrar <b>{money(journey?.saldos.dentroPlazo)}</b></span><span>Cobranza urgente <b>{money(journey?.saldos.urgente)}</b></span><span>Gastos registrados <b>{money(journey?.gastos.total)}</b></span><span>Efectivo esperado <b>{money(journey?.efectivoEsperado)}</b></span><span>Efectivo entregado <b>{money(cashDelivered)}</b></span><strong>Diferencia <b>{money(cashDifference)}</b></strong>{(Math.abs(cashDifference) > .01 || Number(journey?.noEntregados || 0) > 0) && <label>Observación requerida<textarea value={journeyObservation} onChange={e => setJourneyObservation(e.target.value)} placeholder="Explica diferencias y pedidos no entregados"/></label>}</div><footer><button onClick={() => setCloseJourneyOpen(false)}>Cancelar</button><button className="primary" disabled={closingJourney || ((Math.abs(cashDifference) > .01 || Number(journey?.noEntregados || 0) > 0) && !journeyObservation.trim())} onClick={closeJourney}>{closingJourney ? "Cerrando…" : "Cerrar jornada"}</button></footer></section></div>}{selected && <div className="modal-bg route-modal-bg" onClick={e => { if (e.target === e.currentTarget && !saving) setSelected(null); }}><form className="route-delivery-modal" onSubmit={save} onClick={e => e.stopPropagation()}><header><div><small>GESTIÓN DE ENTREGA</small><h2>{selected.cliente}</h2><span>#{selected.ventaId.slice(-8)} · {money(selected.total)}</span></div><button type="button" onClick={() => setSelected(null)}>×</button></header><div className="route-form-body"><fieldset><legend>1 · Estado de entrega</legend><select value={form.resultado} onChange={e => { const result = e.target.value; setForm({ ...form, resultado: result, entregado: result === "ENTREGA COMPLETA" || result === "ENTREGA PARCIAL" }); }}><option>ENTREGA COMPLETA</option><option>ENTREGA PARCIAL</option><option>CLIENTE AUSENTE</option><option>REPROGRAMADO</option><option>RECHAZADO</option><option>DIRECCIÓN INCORRECTA</option><option>NO TENÍA DINERO</option><option>OTRO</option></select><label>Fecha<input type="date" value={form.fechaEntrega} onChange={e => setForm({ ...form, fechaEntrega: e.target.value })}/></label></fieldset>{form.entregado && <><fieldset><legend>2 · Productos entregados</legend><div className="delivery-products">{selected.items.map(item => <div key={item.codigo}><span><b>{item.nombre}</b><small>{item.codigo}</small></span><span>Pedido <b>{item.cantidad}</b></span><label>Entregado<input type="number" min="0" max={item.cantidad} step=".01" value={deliveredQuantities[item.codigo] ?? item.cantidad} disabled={form.resultado !== "ENTREGA PARCIAL"} onChange={e => setDeliveredQuantities(values => ({ ...values, [item.codigo]: Math.min(Number(item.cantidad), Math.max(0, Number(e.target.value) || 0)) }))}/></label></div>)}</div></fieldset><fieldset className="route-payment-section"><legend>3 · Cobro</legend><div className="payment-total-head"><span>Total del pedido</span><strong>{money(selected.total)}</strong></div><p className="payment-question">¿Cómo se pagó?</p><div className="payment-mode-grid"><button type="button" className={form.modoPago === "EFECTIVO" ? "active" : ""} onClick={() => setPaymentMode("EFECTIVO")}>✓ Efectivo completo</button><button type="button" className={form.modoPago === "YAPE" ? "active" : ""} onClick={() => setPaymentMode("YAPE")}>Yape completo</button><button type="button" className={form.modoPago === "MIXTO" ? "active" : ""} onClick={() => setPaymentMode("MIXTO")}>Pago mixto</button><button type="button" className={form.modoPago === "CREDITO" ? "active credit" : ""} onClick={() => setPaymentMode("CREDITO")}>Crédito / sin pago</button></div>{form.modoPago !== "CREDITO" && <div className="route-payment-grid"><label>Efectivo<input inputMode="decimal" type="number" min="0" step=".01" value={form.efectivo} onChange={e => setPaymentField("efectivo", Number(e.target.value))}/></label><label>Yape<input inputMode="decimal" type="number" min="0" step=".01" value={form.yape} onChange={e => setPaymentField("yape", Number(e.target.value))}/></label><label>Plin<input inputMode="decimal" type="number" min="0" step=".01" value={form.plin} onChange={e => setPaymentField("plin", Number(e.target.value))}/></label><label>Transferencia<input inputMode="decimal" type="number" min="0" step=".01" value={form.transferencia} onChange={e => setPaymentField("transferencia", Number(e.target.value))}/></label></div>}{form.ajuste && <small className="payment-adjustment">{form.ajuste}</small>}<div className="route-balance"><span>Total cobrado <b>{money(form.efectivo + form.yape + form.plin + form.transferencia)}</b></span><span>Saldo <strong>{money(Math.max(0, selected.total - form.efectivo - form.yape - form.plin - form.transferencia))}</strong></span></div>{selected.total - form.efectivo - form.yape - form.plin - form.transferencia > .01 && <div className="credit-deadline"><b>{form.modoPago === "CREDITO" ? "Crédito activado" : "Saldo pendiente"}</b><span>Entrega: {form.fechaEntrega}</span><span>Fecha límite: {addDays(form.fechaEntrega, 3)}</span><small>Pasará a cobranza urgente después de esta fecha.</small></div>}</fieldset></>}<fieldset><legend>4 · Observación e incidencia</legend><textarea required={form.resultado !== "ENTREGA COMPLETA"} value={form.observacion} onChange={e => setForm({ ...form, observacion: e.target.value })} placeholder="Detalle de entrega, motivo o referencia"/></fieldset></div><footer><button type="button" onClick={() => setSelected(null)}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Guardando…" : "Finalizar entrega"}</button></footer></form></div>}{expenseOpen && <div className="modal-bg route-modal-bg" onClick={e => { if (e.target === e.currentTarget && !savingExpense) setExpenseOpen(false); }}><form className="route-expense-modal" onSubmit={saveExpense} onClick={e => e.stopPropagation()}><header><div><small>JORNADA ACTUAL</small><h2>Registrar gasto de ruta</h2></div><button type="button" onClick={() => setExpenseOpen(false)}>×</button></header><div className="route-form-body"><label>Fecha<input type="date" value={expense.fecha} onChange={e => setExpense({ ...expense, fecha: e.target.value })}/></label><label>Categoría<select value={expense.partida} onChange={e => setExpense({ ...expense, partida: e.target.value })}>{["COMBUSTIBLE", "PEAJES", "ESTACIONAMIENTO", "ALIMENTACIÓN", "HOSPEDAJE", "VIÁTICOS", "MANTENIMIENTO PREVENTIVO", "REPARACIÓN", "REPUESTOS", "LUBRICANTES", "LAVADO", "OTROS GASTOS DE RUTA"].map(value => <option key={value}>{value}</option>)}</select></label><label>Descripción<input required value={expense.descripcion} onChange={e => setExpense({ ...expense, descripcion: e.target.value })}/></label><div className="route-payment-grid"><label>Importe<input inputMode="decimal" type="number" min=".01" step=".01" required value={expense.importe || ""} onChange={e => setExpense({ ...expense, importe: Number(e.target.value) })}/></label><label>Medio<select value={expense.canal} onChange={e => setExpense({ ...expense, canal: e.target.value })}><option>EFECTIVO</option><option>YAPE</option><option>PLIN</option><option>TRANSFERENCIA</option><option>TARJETA</option></select></label></div><label>Origen del dinero<select value={expense.origenDinero} onChange={e => setExpense({ ...expense, origenDinero: e.target.value })}><option>FONDO DE RUTA</option><option>CAJA DE LA EMPRESA</option><option>DINERO DEL REPARTIDOR</option><option>TARJETA DE LA EMPRESA</option><option>OTRO</option></select></label><label>Ruta<input value={expense.ruta} onChange={e => setExpense({ ...expense, ruta: e.target.value })}/></label><label>Vehículo<input value={expense.unidad} onChange={e => setExpense({ ...expense, unidad: e.target.value })}/></label><label>Observación<textarea value={expense.observacion} onChange={e => setExpense({ ...expense, observacion: e.target.value })}/></label></div><footer><button type="button" onClick={() => setExpenseOpen(false)}>Cancelar</button><button className="primary" disabled={savingExpense}>{savingExpense ? "Guardando…" : "Registrar gasto"}</button></footer></form></div>}</div>;
    return <div><Heading eyebrow="OPERACIÓN" title="Cobranza y rendición" text="Entrega, cobros por múltiples medios, saldos y compromisos."><button onClick={load}>{loading ? "Actualizando…" : "↻ Actualizar"}</button></Heading><section className="quick-filters"><label>Estado de cobro<select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}><option value="TODOS">Todos</option><option>PENDIENTE</option><option>COBRADO PARCIAL</option><option>CANCELADO</option></select></label><label>Entrega<select value={deliveryFilter} onChange={e => setDeliveryFilter(e.target.value)}><option value="TODAS">Todas</option><option value="ENTREGADO">Entregado</option><option value="PENDIENTE">Pendiente</option></select></label><label>Cliente<select value={clientFilter} onChange={e => setClientFilter(e.target.value)}><option value="TODOS">Todos los clientes</option>{collectionClients.map(c => <option key={c}>{c}</option>)}</select></label><button onClick={() => { setPaymentFilter("TODOS"); setDeliveryFilter("TODAS"); setClientFilter("TODOS"); }}>Limpiar filtros</button></section>
    <section className="collection-summary">
    <article><span>Por cobrar total</span><strong>{money(sumAmount(rows, "saldo"))}</strong><small>{rows.filter(o => Number(o.saldo || 0) > .01).length} pedido(s) con saldo</small></article>
    <article className="cash"><span>Cobrado en efectivo</span><strong>{money(cashCollected)}</strong><small>Importe registrado en cobranza</small></article>
    <article className="digital"><span>Cobrado en Yape / Plin</span><strong>{money(yapeCollected)}</strong><small>Pagos digitales registrados</small></article>
    <article className="commitment"><span>Compromisos por pagar</span><strong>{money(sumAmount(promisedDebts, "saldo"))}</strong><small>{promisedDebts.length} pedido(s) entregado(s)</small></article>
    <article className={overduePromises.length ? "warning" : ""}><span>Compromisos vencidos</span><strong>{money(sumAmount(overduePromises, "saldo"))}</strong><small>{overduePromises.length} compromiso(s) fuera de fecha</small></article>
    <article className={fourDayDebts.length ? "danger" : ""}><span>Deuda de 4 días o más</span><strong>{money(sumAmount(fourDayDebts, "saldo"))}</strong><small>{fourDayDebts.length} pedido(s) entregado(s)</small></article>
    </section>
    <section className="panel data-panel"><div className="table-wrap"><table>
    <thead><tr><th>Pedido / boleta</th><th>Cliente</th><th>Entrega</th><th>Total</th><th>Cobrado</th><th>Saldo</th><th>Estado de cobro</th><th>Compromiso</th><th></th></tr></thead>
    <tbody>{filteredRows.map(o => {
            const age = daysSince(o.fechaEntrega || o.fecha), debt = String(o.estadoEntrega).toUpperCase() === "ENTREGADO" && Number(o.saldo || 0) > .01;
            return <tr key={o.ventaId} className={debt && age >= 4 ? "overdue-row" : ""}>
            <td><b>{o.ventaId}</b><br /><small>{o.codigoImpresion ? `Boleta: ${o.codigoImpresion}` : "Boleta no emitida"}</small></td><td><b>{o.cliente}</b></td>
            <td><span className={`delivery-tag ${String(o.estadoEntrega).toUpperCase() === "ENTREGADO" ? "delivered" : ""}`}>{String(o.estadoEntrega).toUpperCase() === "ENTREGADO" ? "ENTREGADO" : "PENDIENTE"}</span>{debt && <small>{age} día(s) desde entrega</small>}</td><td>{money(o.total)}</td><td>{money(o.totalCobrado)}</td><td><b>{money(o.saldo)}</b></td><td><span className={`payment-tag ${status(o).toLowerCase().replace(" ", "-")}`}>{status(o)}</span></td><td>{o.fechaPromesa || "—"}</td><td><button onClick={() => open(o)}>Gestionar</button></td></tr>;
        })}</tbody></table></div></section>{selected && <div className="modal-bg"><form className="collection-modal" onSubmit={save}><button type="button" className="close" onClick={() => setSelected(null)}>×</button><span className="eyebrow">COBRANZA DEL PEDIDO</span><h2>{selected.ventaId}</h2><p>{selected.cliente} · Total {money(selected.total)}</p><div className="delivery-box"><label><input type="checkbox" checked={form.entregado} onChange={e => setForm({ ...form, entregado: e.target.checked })}/> Productos entregados</label>{form.entregado && <label>Fecha de entrega<input type="date" value={form.fechaEntrega} onChange={e => setForm({ ...form, fechaEntrega: e.target.value })}/></label>}</div><label>¿Se recibió un cobro?<select value={form.cobrado ? "SI" : "NO"} onChange={e => setForm({ ...form, cobrado: e.target.value === "SI" })}><option value="NO">No, queda pendiente</option><option value="SI">Sí, registrar medios de pago</option></select></label>{form.cobrado && <><p className="payment-help">Distribuye el monto recibido. Puedes combinar efectivo, Yape y transferencia CCI.</p><div className="payment-grid"><label>Efectivo<input type="number" min="0" step=".01" value={form.efectivo} onChange={e => setForm({ ...form, efectivo: Number(e.target.value) })}/></label><label>Yape<input type="number" min="0" step=".01" value={form.yape} onChange={e => setForm({ ...form, yape: Number(e.target.value) })}/></label><label>Transferencia CCI<input type="number" min="0" step=".01" value={form.transferencia} onChange={e => setForm({ ...form, transferencia: Number(e.target.value) })}/></label></div></>}<div className="payment-balance"><span>Cobrado</span><b>{money((form.cobrado ? form.efectivo + form.yape + form.transferencia : 0) + Number(selected.plin || 0) + Number(selected.pos || 0) + Number(selected.otros || 0))}</b><span>Saldo</span><strong>{money(Math.max(0, selected.total - ((form.cobrado ? form.efectivo + form.yape + form.transferencia : 0) + Number(selected.plin || 0) + Number(selected.pos || 0) + Number(selected.otros || 0))))}</strong></div>{form.entregado && selected.total - ((form.cobrado ? form.efectivo + form.yape + form.transferencia : 0) + Number(selected.plin || 0) + Number(selected.pos || 0) + Number(selected.otros || 0)) > .01 && <label>Compromiso de pago (máximo 2 días)<input type="date" min={today()} max={addDays(today(), 2)} required value={form.fechaPromesa} onChange={e => setForm({ ...form, fechaPromesa: e.target.value })}/></label>}<label>Observación<textarea value={form.observacion} onChange={e => setForm({ ...form, observacion: e.target.value })}/></label><button className="primary" disabled={saving}>{saving ? "Guardando…" : "Confirmar gestión"}</button></form></div>}</div>;
}
function Inventory({ products, call, refresh, notify, master }: {
    products: Product[];
    call: <T>(f: string, a?: unknown[]) => Promise<T>;
    refresh: () => Promise<void>;
    notify: (s: string) => void;
    master: boolean;
}) {
    const tabs = ["Inventario", "Registrar material", "Ingresar stock", "Carga masiva", "Editar", "Historial"] as const;
    const [tab, setTab] = useState<(typeof tabs)[number]>("Inventario"), [query, setQuery] = useState(""), [history, setHistory] = useState<ApiRecord[]>([]), [selected, setSelected] = useState<Product | null>(null);
    const [productForm, setProductForm] = useState({ codigo: "", nombre: "", unidad: "Unidades", grupo: "General", stockMin: 0, precioCosto: 0, precioVenta: 0 });
    const [lists, setLists] = useState({ unidades: ["Unidades"], grupos: ["General"] });
    const [income, setIncome] = useState({ codigo: "", fecha: today(), tipo: "INGRESO", cantidad: 1, observaciones: "" });
    const activeProducts = useMemo(() => products.filter(p => Boolean(p.nombre?.trim())), [products]);
    const nextCode = useMemo(() => {
        const codes = activeProducts.map(p => /^(.*?)(\d+)$/.exec(p.codigo.trim())).filter(Boolean) as RegExpExecArray[];
        if (!codes.length)
            return "PT00001";
        const sample = codes.reduce((best, item) => Number(item[2]) > Number(best[2]) ? item : best, codes[0]);
        return `${sample[1]}${String(Number(sample[2]) + 1).padStart(sample[2].length, "0")}`;
    }, [activeProducts]);
    const visible = activeProducts.filter(p => JSON.stringify(p).toLowerCase().includes(query.toLowerCase()));
    const loadHistory = useCallback(async () => {
        try {
            setHistory(await call<ApiRecord[]>("obtenerHistorial", [{}]));
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se pudo cargar el historial");
        }
    }, [call, notify]);
    useEffect(() => {
        if (tab === "Historial")
            queueMicrotask(() => void loadHistory());
    }, [loadHistory, tab]);
    useEffect(() => {
        if (tab === "Registrar material" && !productForm.codigo.trim())
            queueMicrotask(() => setProductForm(f => ({ ...f, codigo: nextCode })));
    }, [nextCode, productForm.codigo, tab]);
    useEffect(() => {
        call<{
            unidades: string[];
            grupos: string[];
        }>("obtenerListas").then(r => setLists({ unidades: r.unidades?.length ? r.unidades : ["Unidades"], grupos: r.grupos?.length ? r.grupos : ["General"] })).catch(() => undefined);
    }, [call]);
    async function create(e: FormEvent) {
        e.preventDefault();
        const codigo = productForm.codigo.trim().toUpperCase();
        const payload = { ...productForm, codigo, nombre: productForm.nombre.trim() };
        const existing = products.find(p => p.codigo.trim().toUpperCase() === codigo);
        if (existing?.nombre?.trim()) {
            notify(`El código ${codigo} ya pertenece a “${existing.nombre}”. Usa Editar o ingresa otro código.`);
            return;
        }
        try {
            const message = existing
                ? await call<string>("actualizarProducto", [{ ...existing, ...payload, codigoOriginal: existing.codigo }])
                : await call<string>("registrarProducto", [payload]);
            if (!/correctamente|actualizado/i.test(message)) {
                notify(message);
                return;
            }
            notify(existing ? `Material ${codigo} completado en la fila existente de Sheets.` : message);
            setProductForm({ codigo: "", nombre: "", unidad: "Unidades", grupo: "General", stockMin: 0, precioCosto: 0, precioVenta: 0 });
            await refresh();
            setTab("Inventario");
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se registró el material");
        }
    }
    async function saveIncome(e: FormEvent) {
        e.preventDefault();
        const code = income.codigo.trim().toUpperCase();
        if (!activeProducts.some(p => p.codigo.toUpperCase() === code))
            return notify("Selecciona un material válido del buscador.");
        try {
            const message = await call<string>("registrarMovimiento", [{ ...income, codigo: code }]);
            if (!/correctamente|registrado/i.test(message))
                return notify(message);
            notify(message);
            await refresh();
            setIncome({ codigo: "", fecha: today(), tipo: "INGRESO", cantidad: 1, observaciones: "" });
            setTab("Inventario");
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se registró el ingreso");
        }
    }
    async function saveEdit(e: FormEvent) {
        e.preventDefault();
        if (!selected)
            return;
        try {
            notify(await call<string>("actualizarProducto", [{ ...selected, codigoOriginal: selected.codigo }]));
            await refresh();
            setSelected(null);
            setTab("Inventario");
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se actualizó");
        }
    }
    function downloadTemplate() { const content = "codigo;tipo;cantidad;factor;costo;fecha;observacion\nMAT-001;INGRESO;10;1;15.50;" + today() + ";Ingreso inicial"; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); a.download = "plantilla-carga-materiales.csv"; a.click(); }
    async function upload(file?: File) {
        if (!file)
            return;
        const text = await file.text(), lines = text.split(/\r?\n/).filter(Boolean), sep = lines[0]?.includes(";") ? ";" : ",";
        const headers = lines.shift()?.split(sep).map(x => x.trim().toLowerCase()) || [];
        const rows = lines.map((line, i) => { const v = line.split(sep); const get = (name: string) => v[headers.indexOf(name)] || ""; return { filaExcel: i + 2, codigo: get("codigo") || get("código"), tipo: get("tipo") || "INGRESO", cantidadCarga: Number(get("cantidad")), factor: Number(get("factor") || 1), costoCompra: Number(get("costo") || 0), fecha: get("fecha") || today(), observacion: get("observacion") || "Carga masiva NexoVenta" }; });
        try {
            const check = await call<ApiRecord>("validarCargaMasivaInventario", [rows]);
            if (!check.ok)
                return notify(check.mensaje);
            if (!confirm(check.mensaje + "\n¿Importar ahora?"))
                return;
            const result = await call<ApiRecord>("importarCargaMasivaInventario", [rows]);
            notify(result.mensaje);
            await refresh();
            setTab("Inventario");
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se importó");
        }
    }
    const table = <section className="panel data-panel"><div className="table-wrap"><table><thead><tr><th>SKU</th><th>Material</th><th>Grupo</th><th>Stock</th><th>Mínimo</th><th>Costo</th><th>Venta</th><th></th></tr></thead><tbody>{visible.map(p => <tr key={p.codigo}><td><b>{p.codigo}</b></td><td>{p.nombre}<br /><small>{p.unidad}</small></td><td>{p.grupo}</td><td><b>{p.stock}</b></td><td>{p.stockMin}</td><td>{money(p.precioCosto)}</td><td>{money(p.precioVenta)}</td><td>{master && <button onClick={() => { setSelected({ ...p }); setTab("Editar"); }}>Editar</button>}</td></tr>)}</tbody></table></div></section>;
    return <div><Heading eyebrow="MATERIALES Y ALMACÉN" title="Materiales" text="Creación, ingresos, carga masiva, edición, inventario e historial conectados a Sheets."/><div className="materials-tabs">{tabs.map(x => <button key={x} className={tab === x ? "active" : ""} onClick={() => setTab(x)}>{x}</button>)}</div>
    {tab === "Inventario" && <><section className="section-tools"><label className="search">⌕<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar material, SKU o grupo…"/></label><button onClick={refresh}>↻ Actualizar</button></section>{table}</>}
    {tab === "Registrar material" && <form className="panel material-form" onSubmit={create}><h3>Registrar nuevo material</h3><div className="form-row"><label>Código<input required value={productForm.codigo} onChange={e => setProductForm({ ...productForm, codigo: e.target.value })}/></label><label>Nombre<input required value={productForm.nombre} onChange={e => setProductForm({ ...productForm, nombre: e.target.value })}/></label></div><div className="form-row"><label>Unidad<select required value={productForm.unidad} onChange={e => setProductForm({ ...productForm, unidad: e.target.value })}>{lists.unidades.map(x => <option key={x}>{x}</option>)}</select></label><label>Grupo<select required value={productForm.grupo} onChange={e => setProductForm({ ...productForm, grupo: e.target.value })}>{lists.grupos.map(x => <option key={x}>{x}</option>)}</select></label></div><div className="form-row"><label>Stock mínimo<input type="number" value={productForm.stockMin} onChange={e => setProductForm({ ...productForm, stockMin: Number(e.target.value) })}/></label><label>Precio costo<input type="number" step=".01" value={productForm.precioCosto} onChange={e => setProductForm({ ...productForm, precioCosto: Number(e.target.value) })}/></label></div><label>Precio venta<input type="number" step=".01" value={productForm.precioVenta} onChange={e => setProductForm({ ...productForm, precioVenta: Number(e.target.value) })}/></label><button className="primary">Guardar material</button></form>}
    {tab === "Ingresar stock" && <form className="panel material-form" onSubmit={saveIncome}><h3>Ingreso de materiales</h3><label>Buscar material<input required list="stock-materials" value={income.codigo} onChange={e => setIncome({ ...income, codigo: e.target.value })} placeholder="Escribe código o nombre…" autoComplete="off"/><datalist id="stock-materials">{activeProducts.map(p => <option key={p.codigo} value={p.codigo}>{p.nombre} · stock {p.stock}</option>)}</datalist><small>Escribe parte del código o nombre y selecciona una coincidencia.</small></label><div className="form-row"><label>Fecha<input type="date" required value={income.fecha} onChange={e => setIncome({ ...income, fecha: e.target.value })}/></label><label>Tipo<select value={income.tipo} onChange={e => setIncome({ ...income, tipo: e.target.value })}><option>INGRESO</option><option>AJUSTE_POSITIVO</option><option>AJUSTE_NEGATIVO</option></select></label></div><label>Cantidad<input type="number" min=".01" step=".01" required value={income.cantidad} onChange={e => setIncome({ ...income, cantidad: Number(e.target.value) })}/></label><label>Observaciones<textarea value={income.observaciones} onChange={e => setIncome({ ...income, observaciones: e.target.value })}/></label><button className="primary">Registrar ingreso</button></form>}
    {tab === "Carga masiva" && <section className="panel bulk-zone"><h3>Carga masiva</h3><p>No necesitas un Excel nuevo. Descarga la plantilla, complétala y guárdala como CSV.</p><div><button onClick={downloadTemplate}>Descargar plantilla</button><label className="upload-button">Seleccionar CSV<input type="file" accept=".csv,.txt" onChange={e => upload(e.target.files?.[0])}/></label></div></section>}
    {tab === "Editar" && <>{!selected ? <><section className="section-tools"><label className="search">⌕<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Busca y selecciona un material…"/></label></section>{table}</> : <form className="panel material-form" onSubmit={saveEdit}><h3>Editar {selected.codigo}</h3><label>Nombre<input value={selected.nombre} onChange={e => setSelected({ ...selected, nombre: e.target.value })}/></label><div className="form-row"><label>Unidad<input value={selected.unidad} onChange={e => setSelected({ ...selected, unidad: e.target.value })}/></label><label>Grupo<input value={selected.grupo} onChange={e => setSelected({ ...selected, grupo: e.target.value })}/></label></div><div className="form-row"><label>Stock mínimo<input type="number" value={selected.stockMin} onChange={e => setSelected({ ...selected, stockMin: Number(e.target.value) })}/></label><label>Precio costo<input type="number" step=".01" value={selected.precioCosto} onChange={e => setSelected({ ...selected, precioCosto: Number(e.target.value) })}/></label></div><label>Precio venta<input type="number" step=".01" value={selected.precioVenta} onChange={e => setSelected({ ...selected, precioVenta: Number(e.target.value) })}/></label><div><button type="button" onClick={() => setSelected(null)}>Cancelar</button><button className="primary">Guardar cambios</button></div></form>}</>}
    {tab === "Historial" && <section className="panel data-panel"><div className="panel-title"><div><h3>Historial de movimientos</h3><p>Ingresos, salidas, ajustes y ventas</p></div><button onClick={loadHistory}>↻ Actualizar</button></div><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Código</th><th>Material</th><th>Tipo</th><th>Cantidad</th><th>Cliente / observación</th></tr></thead><tbody>{history.map((h, i) => <tr key={i}><td>{h.fecha}</td><td>{h.codigo}</td><td>{h.producto}</td><td><span className="table-status">{h.tipo}</span></td><td>{h.cantidad}</td><td>{h.cliente || h.observaciones}</td></tr>)}</tbody></table></div></section>}
  </div>;
}
function Finance({ call, notify }: {
    call: <T>(f: string, a?: unknown[]) => Promise<T>;
    notify: (s: string) => void;
}) {
    const [period, setPeriod] = useState(month());
    const [view, setView] = useState("MENSUAL");
    const [indicator, setIndicator] = useState("INGRESOS");
    const [periodScope, setPeriodScope] = useState<"PRIMERO" | "SEGUNDO" | "MES">("MES");
    const [plan, setPlan] = useState<PlanData | null>(null);
    const [accounting, setAccounting] = useState<AccountingData | null>(null);
    const [curve, setCurve] = useState<CurveData | null>(null);
    const [rendition, setRendition] = useState<RenditionData | null>(null);
    const [approvals, setApprovals] = useState<ExpenseApproval[]>([]);
    const [financeOrders, setFinanceOrders] = useState<Order[]>([]);
    const [resolvingExpense, setResolvingExpense] = useState("");
    const [goalOpen, setGoalOpen] = useState(false);
    const [receptionOpen, setReceptionOpen] = useState(false);
    const [goalForm, setGoalForm] = useState({ objetivo: 0, presupuesto: 0 });
    const [budgetRows, setBudgetRows] = useState<FinanceRow[]>([]);
    const [reception, setReception] = useState({ efectivo: 0, yape: 0, otros: 0, observacion: "" });
    const load = useCallback(async () => {
        const cacheKey = `nexo_finance_${period}_${indicator}_${view}`;
        const cached = cacheGet<{ plan?: PlanData; accounting?: AccountingData; curve?: CurveData; rendition?: RenditionData } | null>(cacheKey, cacheGet("nexo_finance_latest", null));
        if (cached) {
            setPlan(cached.plan || null);
            setAccounting(cached.accounting || null);
            setCurve(cached.curve || null);
            if (cached.rendition)
                setRendition(cached.rendition);
        }
        const cachedCollections = cacheGet<Order[]>("nexo_collections", []);
        if (cachedCollections.length)
            setRendition(collectionRendition(cachedCollections));
        try {
            const [pResult, aResult, cResult] = await Promise.allSettled([
                call<PlanData>("obtenerPlaneamientoMensual", [period]),
                call<AccountingData>("obtenerContabilidadDiaria", [period]),
                call<CurveData>("obtenerCurvaS", [indicator, view, `${period}-01`, true]),
            ]);
            const p = pResult.status === "fulfilled" ? pResult.value : cached?.plan;
            const a = aResult.status === "fulfilled" ? aResult.value : cached?.accounting;
            const c = cResult.status === "fulfilled" ? cResult.value : cached?.curve;
            setPlan(p || null);
            setAccounting(a || null);
            setCurve(c || null);
            const snapshot = { plan: p, accounting: a, curve: c, rendition: cacheGet<RenditionData | null>("nexo_finance_rendition", null) };
            cacheSet(cacheKey, snapshot);
            cacheSet("nexo_finance_latest", snapshot);
            try {
                const pending = await call<ExpenseApproval[]>("obtenerGastosPendientes");
                setApprovals(pending);
                cacheSet("nexo_expense_approvals", pending);
            }
            catch { setApprovals(cacheGet<ExpenseApproval[]>("nexo_expense_approvals", [])); }
            try {
                setFinanceOrders(dedupeOrders(await call<Order[]>("obtenerCobranzaPedidos", [{ desde: `${period}-01`, hasta: `${period}-${String(new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).getDate()).padStart(2, "0")}` }])));
            }
            catch { setFinanceOrders([]); }
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se cargó finanzas");
        }
        try {
            const r = await call<RenditionData>("obtenerRendicionDia", [today()]);
            const declarado = r?.declarado || {};
            const total = Number(declarado.efectivo || 0) + Number(declarado.yape || 0) + Number(declarado.otros || 0);
            if (total > 0 || r?.validacion) {
                setRendition(r);
                cacheSet("nexo_finance_rendition", r);
            }
            else
                throw new Error("Resumen de rendición vacío");
        }
        catch {
            try {
                const [cobranzaResult, gastosResult] = await Promise.allSettled([
                    call<ApiRecord[]>("obtenerCobranzaPedidos", [{ desde: `${today().slice(0, 4)}-01-01`, hasta: today(), texto: "" }]),
                    call<ApiRecord[]>("obtenerGastosOperacion", [today()]),
                ]);
                const raw = cobranzaResult.status === "fulfilled" ? cobranzaResult.value : [];
                const cobranza = raw;
                const pendientes = cobranza.filter((row: ApiRecord) => {
                    const cobrado = ["efectivo", "yape", "plin", "transferencia", "pos", "otros"]
                        .reduce((total, key) => total + Number(row?.[key] || 0), 0);
                    return cobrado > 0;
                });
                const sum = (key: string) => pendientes.reduce((total: number, row: ApiRecord) => total + Number(row?.[key] || 0), 0);
                const efectivo = sum("efectivo");
                const yape = sum("yape") + sum("plin");
                const otros = sum("transferencia") + sum("pos") + sum("otros");
                const rawGastos = gastosResult.status === "fulfilled" ? gastosResult.value : [];
                const gastos = rawGastos;
                const gastosEfectivo = gastos.reduce((total: number, row: ApiRecord) => String(row?.canal || row?.medio || "").toUpperCase() === "EFECTIVO" ? total + Number(row?.monto || 0) : total, 0);
                const gastosVirtuales = gastos.reduce((total: number, row: ApiRecord) => String(row?.canal || row?.medio || "").toUpperCase() !== "EFECTIVO" ? total + Number(row?.monto || 0) : total, 0);
                const nextRendition = {
                    fecha: today(),
                    fuente: "COBRANZA_PENDIENTE",
                    pedidosPendientes: pendientes.length,
                    declarado: {
                        efectivo,
                        yape,
                        otros,
                        gastosEfectivo,
                        gastosVirtuales,
                        efectivoEsperado: Math.max(0, efectivo - gastosEfectivo),
                        pendiente: pendientes.reduce((total: number, row: ApiRecord) => total + Number(row?.saldo || 0), 0),
                    },
                    validacion: null,
                };
                setRendition(nextRendition);
                cacheSet("nexo_finance_rendition", nextRendition);
            }
            catch {
                const previous = cacheGet<RenditionData | null>("nexo_finance_rendition", null);
                if (previous)
                    setRendition(previous);
            }
        }
    }, [call, indicator, notify, period, view]);
    async function resolveExpense(item: ExpenseApproval, state: "APROBADO" | "OBSERVADO" | "RECHAZADO") {
        if (resolvingExpense) return;
        const observation = state === "APROBADO" ? "" : window.prompt(`Motivo para marcar el gasto como ${state.toLowerCase()}:`) || "";
        if (state !== "APROBADO" && !observation.trim()) return;
        setResolvingExpense(item.solicitudId);
        try {
            const message = await call<string>("resolverGastoOperacion", [{ solicitudId: item.solicitudId, estado: state, observacion: observation }]);
            notify(message);
            setApprovals(rows => rows.filter(row => row.solicitudId !== item.solicitudId));
            void load();
        }
        catch (error) { notify(error instanceof Error ? error.message : "No se resolvió el gasto"); }
        finally { setResolvingExpense(""); }
    }
    useEffect(() => { queueMicrotask(() => void load()); }, [load]);
    function openGoals() {
        const planRows = plan?.filas || [];
        const objetivo = planRows.filter((row: FinanceRow) => String(row.tipo || "").includes("INGRESO") || String(row.categoria || "").toUpperCase() === "VENTAS").reduce((sum: number, row: FinanceRow) => sum + Number(row.monto || 0), 0);
        const savedExpenses = planRows.filter((row: FinanceRow) => String(row.tipo || "").includes("GASTO") && String(row.categoria || "").toUpperCase() !== "PRESUPUESTO");
        const rows = savedExpenses.length ? savedExpenses.map(row => ({ ...row, activo: row.activo !== false })) : budgetTemplate.map((row, index) => ({ ...row, id: `template-${index}`, tipo: "OPERACIÓN GASTO", monto: 0, unidad: "DISTRIBUCIÓN", activo: true }));
        const presupuesto = rows.filter(row => row.activo !== false).reduce((sum, row) => sum + Number(row.monto || 0), 0);
        setGoalForm({ objetivo, presupuesto });
        setBudgetRows(rows);
        setGoalOpen(true);
    }
    async function saveGoals(e: FormEvent) {
        e.preventDefault();
        const rows = [{ tipo: "OPERACIÓN INGRESO", categoria: "VENTAS", concepto: "Objetivo comercial", monto: Number(goalForm.objetivo), unidad: "DISTRIBUCIÓN" }, ...budgetRows.filter(row => row.activo !== false && String(row.concepto || "").trim()).map(row => ({ tipo: "OPERACIÓN GASTO", categoria: row.categoria || "OTROS", concepto: row.concepto || "", monto: Number(row.monto || 0), unidad: row.unidad || "DISTRIBUCIÓN" }))];
        try {
            notify(await call<string>("guardarPlaneamientoMensual", [{ periodo: period, filas: rows }]));
            setGoalOpen(false);
            await load();
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se guardó el control comercial");
        }
    }
    async function copyPreviousBudget() {
        try {
            notify(await call<string>("duplicarPlaneamientoMensualAnterior", [period]));
            await load();
            setGoalOpen(false);
        }
        catch (error) { notify(error instanceof Error ? error.message : "No se pudo copiar el presupuesto anterior"); }
    }
    function openReception() {
        const declared = rendition?.declarado || {};
        const validation = rendition?.validacion || {};
        setReception({ efectivo: Number(validation.efectivoRecibido ?? declared.efectivoEsperado ?? 0), yape: Number(validation.yapeVerificado ?? declared.yape ?? 0), otros: Number(validation.otrosVerificado ?? declared.otros ?? 0), observacion: validation.observacion || "" });
        setReceptionOpen(true);
    }
    async function confirmReception(e: FormEvent) {
        e.preventDefault();
        try {
            const message = await call<string>("validarRendicionDia", [{ fecha: today(), efectivoRecibido: reception.efectivo, yapeVerificado: reception.yape, otrosVerificado: reception.otros, observacion: reception.observacion }]);
            notify(message);
            setReceptionOpen(false);
            await load();
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se registró la recepción");
        }
    }
    async function actual() {
        const concept = prompt("Concepto contable");
        if (!concept)
            return;
        const amount = Number(prompt("Monto real", "0"));
        const flow = prompt("Tipo: INGRESO o GASTO", "INGRESO")?.toUpperCase();
        const day = Number(today().slice(8, 10));
        const rows = [...(accounting?.filas || []), { tipo: flow === "INGRESO" ? "OPERACIÓN INGRESO" : "OPERACIÓN GASTO", categoria: flow === "INGRESO" ? "VENTAS" : "OTROS", concepto: concept, valores: { [day]: amount }, medios: { [day]: "EFECTIVO" } }];
        try {
            notify(await call<string>("guardarContabilidadDiaria", [{ periodo: period, filas: rows }]));
            load();
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se guardó");
        }
    }
    const rs = plan?.resumen || {};
    const cs = curve?.resumen || {};
    const rows = accounting?.filas || [];
    const dayIncluded = (day: number) => periodScope === "MES" || (periodScope === "PRIMERO" ? day <= 15 : day >= 16);
    const sumByType = (type: string) => rows.filter((row: FinanceRow) => row.tipo === type).reduce((sum: number, row: FinanceRow) => sum + Object.entries(row.valores || {}).filter(([day]) => dayIncluded(Number(day))).reduce((subtotal: number, [, value]) => subtotal + Number(value || 0), 0), 0);
    const realExpenses = sumByType("OPERACIÓN GASTO");
    const cumulativeSales = curve?.real || [];
    const fullRevenue = Number(cumulativeSales.at(-1) ?? cs.real ?? 0);
    const firstRevenue = Number(cumulativeSales[Math.min(14, cumulativeSales.length - 1)] || 0);
    const actualRevenue = periodScope === "PRIMERO" ? firstRevenue : periodScope === "SEGUNDO" ? Math.max(0, fullRevenue - firstRevenue) : fullRevenue;
    const monthlyTarget = (plan?.filas || []).filter((row: FinanceRow) => String(row.tipo || "").includes("INGRESO") || String(row.categoria || "").toUpperCase() === "VENTAS").reduce((sum: number, row: FinanceRow) => sum + Number(row.monto || 0), 0) || Number(cs.planeado || rs.ingresos || 0);
    const expenseBudget = (plan?.filas || []).filter((row: FinanceRow) => String(row.tipo || "").includes("GASTO")).reduce((sum: number, row: FinanceRow) => sum + Number(row.monto || 0), 0) || Number(rs.gastos || 0);
    const selectedDate = new Date(`${period}-01T12:00:00`);
    const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
    const targetRevenue = periodScope === "PRIMERO" ? monthlyTarget * 15 / daysInMonth : periodScope === "SEGUNDO" ? monthlyTarget * (daysInMonth - 15) / daysInMonth : monthlyTarget;
    const result = actualRevenue - realExpenses;
    const periodOrders = financeOrders.filter(order => { const day = Number(String(order.fecha).match(/^(\d{1,2})\//)?.[1] || String(order.fecha).slice(8, 10)); return dayIncluded(day); });
    const collected = periodOrders.reduce((sum, order) => sum + Number(order.totalCobrado || 0), 0);
    const receivable = periodOrders.reduce((sum, order) => sum + Number(order.saldo || 0), 0);
    const budgetComparison = (plan?.filas || []).filter(row => String(row.tipo || "").includes("GASTO") && String(row.categoria || "").toUpperCase() !== "PRESUPUESTO").map(row => {
        const real = rows.filter(actualRow => String(actualRow.categoria || "").toUpperCase() === String(row.categoria || "").toUpperCase() || String(actualRow.concepto || "").toUpperCase() === String(row.concepto || "").toUpperCase()).reduce((sum, actualRow) => sum + Object.entries(actualRow.valores || {}).filter(([day]) => dayIncluded(Number(day))).reduce((subtotal, [, value]) => subtotal + Number(value || 0), 0), 0);
        return { ...row, real, difference: Number(row.monto || 0) - real, progress: Number(row.monto || 0) ? real / Number(row.monto || 0) * 100 : 0 };
    });
    const current = new Date();
    const isCurrentPeriod = current.getFullYear() === selectedDate.getFullYear() && current.getMonth() === selectedDate.getMonth();
    const elapsedDays = isCurrentPeriod ? Math.max(1, current.getDate()) : daysInMonth;
    const projection = view === "MENSUAL" ? actualRevenue / elapsedDays * daysInMonth : actualRevenue;
    const remaining = Math.max(0, targetRevenue - actualRevenue);
    const dailyNeed = remaining / Math.max(1, daysInMonth - elapsedDays);
    const progress = targetRevenue ? actualRevenue / targetRevenue * 100 : 0;
    const expenseProgress = expenseBudget ? realExpenses / expenseBudget * 100 : 0;
    const labels = curve?.labels || [], plannedValues = curve?.planeado || [], actualValues = curve?.real || [];
    const chartMax = Math.max(1, ...plannedValues, ...actualValues);
    const chartPoints = (values: number[]) => values.map((value, index) => `${labels.length <= 1 ? 300 : 20 + index * (560 / (labels.length - 1))},${195 - Number(value || 0) / chartMax * 155}`).join(" ");
    const status = !targetRevenue ? { tone: "warning", title: "Falta definir una meta comercial", text: "Registra el presupuesto de ventas para medir avance y proyección." } : progress >= 100 ? { tone: "good", title: "Meta comercial alcanzada", text: `Superaste la meta en ${money(actualRevenue - targetRevenue)}.` } : projection >= targetRevenue ? { tone: "good", title: "Ritmo suficiente para cumplir", text: `La proyección al cierre es ${money(projection)}.` } : { tone: "danger", title: "Riesgo de no alcanzar la meta", text: `Necesitas vender aproximadamente ${money(dailyNeed)} por día restante.` };
    return <div className="finance-intelligence"><Heading eyebrow="INTELIGENCIA DE NEGOCIO" title="Centro de decisiones comerciales" text="Control puntual de presupuesto, objetivo, cobranza, gastos y resultado."><div><button onClick={openGoals}>Presupuesto y objetivos</button><button onClick={() => document.querySelector(".expense-approvals")?.scrollIntoView({ behavior: "smooth" })}>Rendiciones y aprobaciones</button><button className="primary" onClick={actual}>＋ Registrar gasto</button></div></Heading>{approvals.length > 0 && <section className="expense-approvals"><header><div><small>CONTROL ADMINISTRATIVO</small><h3>Gastos de ruta por aprobar</h3></div><b>{approvals.length} pendiente(s) · {money(approvals.reduce((sum, item) => sum + Number(item.importe || 0), 0))}</b></header><div>{approvals.map(item => <article key={item.solicitudId}><span><b>{item.partida}</b><small>{item.fecha} · {item.usuario} · {item.canal}</small><p>{item.descripcion}</p></span><strong>{money(item.importe)}</strong><footer><button disabled={Boolean(resolvingExpense)} onClick={() => resolveExpense(item, "OBSERVADO")}>Observar</button><button disabled={Boolean(resolvingExpense)} onClick={() => resolveExpense(item, "RECHAZADO")}>Rechazar</button><button className="primary" disabled={Boolean(resolvingExpense)} onClick={() => resolveExpense(item, "APROBADO")}>{resolvingExpense === item.solicitudId ? "Procesando…" : "Aprobar"}</button></footer></article>)}</div></section>}<section className="finance-controlbar"><label>Periodo<input type="month" value={period} onChange={e => setPeriod(e.target.value)}/></label><label>Vista<select value={view} onChange={e => setView(e.target.value)}><option value="SEMANAL">Semana · días</option><option value="MENSUAL">Mes · días</option><option value="ANUAL">Año · meses</option></select></label><label>Indicador<select value={indicator} onChange={e => setIndicator(e.target.value)}><option value="INGRESOS">Ventas e ingresos</option><option value="GASTOS">Gastos</option><option value="UTILIDAD">Resultado comercial</option><option value="FLUJO">Flujo de caja</option></select></label></section><nav className="finance-period-chips"><button className={periodScope === "PRIMERO" ? "active" : ""} onClick={() => setPeriodScope("PRIMERO")}>1.er periodo · 1 al 15</button><button className={periodScope === "SEGUNDO" ? "active" : ""} onClick={() => setPeriodScope("SEGUNDO")}>2.º periodo · 16 al {daysInMonth}</button><button className={periodScope === "MES" ? "active" : ""} onClick={() => setPeriodScope("MES")}>Mes completo</button></nav><section className="commercial-scorecards finance-kpi-grid"><article><small>Venta real</small><strong>{money(actualRevenue)}</strong><span>{periodScope === "PRIMERO" ? "Primer periodo" : periodScope === "SEGUNDO" ? "Segundo periodo" : "Mes completo"}</span></article><article><small>Objetivo comercial</small><strong>{money(targetRevenue)}</strong><div className="score-progress"><i style={{ width: `${Math.min(100, progress)}%` }}></i></div><span>{progress.toFixed(1)}% de avance</span></article><article><small>Gastos presupuestados</small><strong>{money(expenseBudget)}</strong><span>Presupuesto mensual por partidas</span></article><article><small>Gastos reales aprobados</small><strong>{money(realExpenses)}</strong><span>{expenseBudget ? `${expenseProgress.toFixed(1)}% del presupuesto` : "Sin presupuesto"}</span></article><article><small>Cobrado</small><strong>{money(collected)}</strong><span>Indicador de liquidez</span></article><article><small>Por cobrar</small><strong>{money(receivable)}</strong><span>Saldo de ventas</span></article><article className={result >= 0 ? "positive" : "negative"}><small>Resultado operativo</small><strong>{money(result)}</strong><span>Ventas reales − gastos reales</span></article></section><section className={`business-alert ${status.tone}`}><span>{status.tone === "good" ? "✓" : status.tone === "danger" ? "!" : "i"}</span><div><strong>{status.title}</strong><p>{status.text}</p></div><aside><small>Proyección al cierre</small><b>{money(projection)}</b></aside></section><section className="daily-reception"><div><small>RECEPCIÓN FÍSICA DE HOY</small><h3>Cuadre de cobranza</h3><p>Importes esperados según el reporte de Cobranza y rendición.</p></div><article><span>Efectivo esperado</span><b>{money(rendition?.declarado?.efectivoEsperado)}</b><small>Cobrado {money(rendition?.declarado?.efectivo)} − gastos {money(rendition?.declarado?.gastosEfectivo)}</small></article><article><span>Yape / Plin verificado</span><b>{money(rendition?.declarado?.yape)}</b><small>Según cobros registrados hoy</small></article><article><span>Transferencias y otros</span><b>{money(rendition?.declarado?.otros)}</b><small>CCI, POS y otros medios</small></article><button onClick={openReception}>{rendition?.validacion ? "Revisar recepción" : "Confirmar recepción"}</button></section><section className="finance-bi-grid"><article className="panel commercial-trend"><div className="panel-title"><div><h3>Objetivo versus resultado real</h3><p>Azul: objetivo acumulado · Coral: avance real</p></div><span>{indicator.toLowerCase()}</span></div><div className="finance-line-chart"><div className="finance-gridlines">{[0, 1, 2, 3].map(value => <i key={value}></i>)}</div><svg viewBox="0 0 600 220" preserveAspectRatio="none"><polyline points={chartPoints(plannedValues)} fill="none" stroke="#2d7dd2" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/><polyline points={chartPoints(actualValues)} fill="none" stroke="#ff6b55" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg><div className="finance-axis">{labels.map((label: string, index: number) => <span key={`${label}-${index}`}>{label}</span>)}</div></div><div className="finance-chart-legend"><span><i className="planned"></i>Objetivo {money(targetRevenue)}</span><span><i className="actual"></i>Real {money(actualRevenue)}</span></div></article><aside className="commercial-actions"><article className="panel"><h3>Decisiones sugeridas</h3><div><b>{money(remaining)}</b><span>Falta para alcanzar el objetivo</span></div><div><b>{money(dailyNeed)}</b><span>Venta diaria necesaria</span></div><div><b>{money(accounting?.cuentasPorCobrar || cs.cuentasPorCobrar || 0)}</b><span>Pendiente por cobrar</span></div></article><article className="panel"><h3>Lectura rápida</h3><p>{realExpenses > expenseBudget && expenseBudget ? "Los gastos superaron el presupuesto. Revisa las partidas con mayor desviación." : "Los gastos están controlados frente al presupuesto registrado."}</p><p>{projection < targetRevenue && targetRevenue ? "Prioriza clientes frecuentes y productos de mayor rotación para recuperar el ritmo." : "El ritmo comercial es favorable; protege el margen y acelera la cobranza."}</p></article></aside></section><section className="panel budget-breakdown"><div className="panel-title"><div><h3>Presupuesto y objetivo comercial</h3><p>Un único control mensual, sin gestionar múltiples hojas.</p></div><button onClick={openGoals}>✎ Editar control</button></div><div className="control-summary-row"><article><span>Objetivo de ventas</span><b>{money(targetRevenue)}</b></article><article><span>Presupuesto de gastos</span><b>{money(expenseBudget)}</b></article><article><span>Cuentas por cobrar</span><b>{money(accounting?.cuentasPorCobrar || 0)}</b></article></div></section><section className="panel budget-vs-real"><div className="panel-title"><div><h3>Presupuesto vs. real por partida</h3><p>Solo gastos reales aprobados impactan esta comparación.</p></div></div><div className="table-wrap"><table><thead><tr><th>Partida</th><th>Presupuesto</th><th>Real</th><th>Diferencia</th><th>Avance</th></tr></thead><tbody>{budgetComparison.map((row,index) => <tr className={row.progress > 100 ? "over-budget" : row.progress >= 80 ? "near-budget" : "within-budget"} key={row.id || `${row.categoria}-${row.concepto}-${index}`}><td><b>{row.concepto}</b><small>{row.categoria}</small></td><td>{money(row.monto)}</td><td>{money(row.real)}</td><td>{money(row.difference)}</td><td><b>{row.progress.toFixed(0)}%</b></td></tr>)}</tbody></table></div></section>{goalOpen && <div className="modal-bg"><form className="finance-budget-modal" onSubmit={saveGoals}><header><div><span className="eyebrow">PRESUPUESTO MENSUAL</span><h2>Presupuesto y objetivos · {period}</h2><p>Primer periodo: 1–15 · Segundo periodo: 16–{daysInMonth}</p></div><button type="button" onClick={() => setGoalOpen(false)}>×</button></header><div className="finance-budget-body"><section className="income-target-block"><h3>Ingresos objetivo</h3><label>Objetivo oficial de ventas del mes<input type="number" min="0" step=".01" value={goalForm.objetivo || ""} onChange={e => setGoalForm({ ...goalForm, objetivo: Number(e.target.value) })} placeholder="Ej. 20000"/></label><div><span>1.er periodo teórico <b>{money(goalForm.objetivo * 15 / daysInMonth)}</b></span><span>2.º periodo teórico <b>{money(goalForm.objetivo * (daysInMonth - 15) / daysInMonth)}</b></span></div></section><section className="budget-lines-block"><div className="panel-title"><div><h3>Gastos presupuestados</h3><p>Activa, edita o agrega las partidas necesarias.</p></div><button type="button" onClick={copyPreviousBudget}>Copiar mes anterior</button></div><div className="budget-lines">{budgetRows.map((row,index) => <article className={row.activo === false ? "disabled" : ""} key={row.id || `${row.categoria}-${row.concepto}-${index}`}><input aria-label="Activar partida" type="checkbox" checked={row.activo !== false} onChange={e => setBudgetRows(items => items.map((item,n) => n === index ? {...item,activo:e.target.checked}:item))}/><input value={row.categoria} onChange={e => setBudgetRows(items => items.map((item,n) => n === index ? {...item,categoria:e.target.value}:item))} placeholder="Categoría"/><input value={row.concepto || ""} onChange={e => setBudgetRows(items => items.map((item,n) => n === index ? {...item,concepto:e.target.value}:item))} placeholder="Partida"/><input aria-label="Presupuesto mensual" type="number" min="0" step=".01" value={row.monto || ""} onChange={e => setBudgetRows(items => items.map((item,n) => n === index ? {...item,monto:Number(e.target.value)}:item))}/><button type="button" onClick={() => setBudgetRows(items => items.filter((_,n) => n !== index))}>×</button></article>)}</div><button type="button" className="add-budget-line" onClick={() => setBudgetRows(items => [...items,{id:crypto.randomUUID(),tipo:"OPERACIÓN GASTO",categoria:"OTROS",concepto:"",monto:0,unidad:"DISTRIBUCIÓN",activo:true}])}>＋ Agregar partida</button><strong className="budget-total">Total gastos presupuestados <b>{money(budgetRows.filter(row => row.activo !== false).reduce((sum,row) => sum + Number(row.monto || 0),0))}</b></strong></section></div><footer><button type="button" onClick={() => setGoalOpen(false)}>Cancelar</button><button className="primary">Guardar presupuesto mensual</button></footer></form></div>}{receptionOpen && <div className="modal-bg"><form className="modal finance-editor" onSubmit={confirmReception}><button type="button" className="close" onClick={() => setReceptionOpen(false)}>×</button><span className="eyebrow">RECEPCIÓN DE COBRANZA</span><h2>Confirmar importes recibidos</h2><p>Compara lo físico contra el reporte generado por Cobranza.</p><div className="reception-expected"><span>Esperado en efectivo <b>{money(rendition?.declarado?.efectivoEsperado)}</b></span><span>Esperado en Yape <b>{money(rendition?.declarado?.yape)}</b></span><span>Otros medios <b>{money(rendition?.declarado?.otros)}</b></span></div><label>Efectivo recibido físicamente<input type="number" min="0" step=".01" value={reception.efectivo || ""} onChange={e => setReception({ ...reception, efectivo: Number(e.target.value) })}/></label><label>Yape / Plin verificado<input type="number" min="0" step=".01" value={reception.yape || ""} onChange={e => setReception({ ...reception, yape: Number(e.target.value) })}/></label><label>Transferencias y otros verificados<input type="number" min="0" step=".01" value={reception.otros || ""} onChange={e => setReception({ ...reception, otros: Number(e.target.value) })}/></label><label>Observación<textarea value={reception.observacion} onChange={e => setReception({ ...reception, observacion: e.target.value })}/></label><button className="primary">Validar recepción y registrar movimiento</button></form></div>}</div>;
}
function Reports({ call, notify }: {
    call: <T>(f: string, a?: unknown[]) => Promise<T>;
    notify: (s: string) => void;
}) {
    const [from, setFrom] = useState(`${month()}-01`);
    const [to, setTo] = useState(today());
    const [query, setQuery] = useState("");
    const [rows, setRows] = useState<Order[]>([]);
    const load = useCallback(async () => {
        try {
            setRows(await call<Order[]>("obtenerEmisiones", [{ fechaDesde: from, fechaHasta: to, texto: query }]));
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se cargó");
        }
    }, [call, from, notify, query, to]);
    useEffect(() => { queueMicrotask(() => void load()); }, [load]);
    function csv() { const lines = [["Pedido", "Fecha", "Cliente", "Total"], ...rows.map(x => [x.ventaId, x.fecha, x.cliente, x.total])].map(x => x.join(";")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines], { type: "text/csv" })); a.download = `reporte-${from}-${to}.csv`; a.click(); }
    return <div><Heading eyebrow="INFORMACIÓN HISTÓRICA" title="Reportes" text="Cruza ventas por fechas, cliente, pedido o producto."><button className="primary" onClick={csv}>Exportar CSV</button></Heading><section className="section-tools"><input type="date" value={from} onChange={e => setFrom(e.target.value)}/><input type="date" value={to} onChange={e => setTo(e.target.value)}/><label className="search"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cliente, producto o pedido…"/></label><button onClick={load}>Filtrar</button></section><section className="panel data-panel"><SimpleOrders rows={rows}/></section></div>;
}
function ProductCurvePicker({ index, color, value, options, onChange }: {
    index: number;
    color: string;
    value: string;
    options: Array<{ codigo: string; nombre: string }>;
    onChange: (code: string) => void;
}) {
    const selectedProduct = options.find(product => product.codigo === value);
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    useEffect(() => {
        queueMicrotask(() => setQuery(selectedProduct ? `${selectedProduct.codigo} · ${selectedProduct.nombre}` : ""));
    }, [selectedProduct]);
    const normalized = query.toLowerCase().trim();
    const matches = options.filter(product => !normalized || `${product.codigo} ${product.nombre}`.toLowerCase().includes(normalized)).slice(0, 12);
    return <label className="curve-search-picker"><i style={{ background: color }}></i><input value={query} placeholder={`Buscar producto ${index + 1}…`} onFocus={() => { setQuery(""); setOpen(true); }} onChange={event => { setQuery(event.target.value); setOpen(true); }} onBlur={() => window.setTimeout(() => setOpen(false), 160)} autoComplete="off"/>{value && <button type="button" aria-label={`Quitar producto ${index + 1}`} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(""); setQuery(""); }}>×</button>}{open && <div className="curve-search-results">{matches.map(product => <button type="button" key={product.codigo} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(product.codigo); setQuery(`${product.codigo} · ${product.nombre}`); setOpen(false); }}><b>{product.codigo}</b><span>{product.nombre}</span></button>)}{!matches.length && <small>No se encontraron productos</small>}</div>}</label>;
}
function Analytics({ call, notify }: {
    call: <T>(f: string, a?: unknown[]) => Promise<T>;
    notify: (s: string) => void;
}) {
    const [products, setProducts] = useState<ApiRecord[]>([]);
    const [clients, setClients] = useState<ApiRecord[]>([]);
    const [dashboard, setDashboard] = useState<AnalysisDashboard | null>(null);
    const [catalog, setCatalog] = useState<Product[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [year, setYear] = useState(new Date().getFullYear());
    const [selected, setSelected] = useState<string[]>([]);
    const colors = ["#ff6b55", "#2d7dd2", "#23ad78", "#f0a23b", "#8357d9", "#e04f8a", "#5f6b7a", "#16a3a3", "#b5bbc5"];
    const monthNames = useMemo(() => ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"], []);
    const buildLocalDashboard = useCallback((catalog: Product[], orders: Order[], requested: string[]) => {
        const groups = ["General", "Limpieza", "Ferretería", "Útiles", "Bisutería", "Piñatería", "Cuchillos", "Plásticos", "Otros"];
        const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const counts: Record<string, number> = Object.fromEntries(groups.map(group => [group, 0]));
        const options = (catalog || []).filter(product => product.codigo && product.nombre).map(product => {
            const group = groups.find(value => normalize(value) === normalize(product.grupo || "")) || "Otros";
            counts[group] += 1;
            return { codigo: product.codigo, nombre: product.nombre, grupo: group };
        }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        const monthly: Record<string, number[]> = {};
        const names: Record<string, string> = {};
        options.forEach(product => {
            monthly[product.codigo] = Array(12).fill(0);
            names[product.codigo] = product.nombre;
        });
        (orders || []).forEach(order => {
            const match = String(order.fecha || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (!match || Number(match[3]) !== year)
                return;
            const month = Number(match[2]) - 1;
            (order.items || []).forEach(item => {
                if (!monthly[item.codigo])
                    monthly[item.codigo] = Array(12).fill(0);
                names[item.codigo] = item.nombre || names[item.codigo] || item.codigo;
                monthly[item.codigo][month] += Number(item.subtotal || (Number(item.cantidad) * Number(item.precioUnitario)) || 0);
            });
        });
        const ranked = Object.keys(monthly).sort((a, b) => monthly[b].reduce((sum, value) => sum + value, 0) - monthly[a].reduce((sum, value) => sum + value, 0));
        const selection = (requested.some(Boolean) ? requested : ranked.slice(0, 3)).slice(0, 3);
        const series = selection.map((code, slot) => code && monthly[code] ? ({
            codigo: code,
            nombre: names[code] || code,
            slot,
            meses: monthly[code].map(value => Math.round(value * 100) / 100),
            total: Math.round(monthly[code].reduce((sum, value) => sum + value, 0) * 100) / 100
        }) : null).filter((item): item is AnalysisSeries => item !== null);
        return {
            meses: monthNames,
            opciones: options,
            seleccion: selection,
            series,
            distribucion: groups.map(nombre => ({ nombre, cantidad: counts[nombre] })).filter(group => group.cantidad > 0),
            totalProductos: options.length,
            totalVentas: Math.round((orders || []).reduce((sum, order) => sum + Number(order.total || 0), 0) * 100) / 100
        };
    }, [monthNames, year]);
    const load = useCallback(async () => {
        try {
            const [p, c, currentCatalog, currentOrders] = await Promise.all([
                call<ApiRecord[]>("obtenerAnalisis", ["PRODUCTOS", {}]),
                call<ApiRecord[]>("obtenerAnalisis", ["CLIENTES", {}]),
                call<Product[]>("obtenerCatalogoProductos"),
                call<Order[]>("obtenerEmisiones", [{ fechaDesde: `${year}-01-01`, fechaHasta: `${year}-12-31`, texto: "" }])
            ]);
            setProducts(p || []);
            setClients(c || []);
            setCatalog(currentCatalog || []);
            setOrders(currentOrders || []);
            const d = buildLocalDashboard(currentCatalog || [], currentOrders || [], []);
            setDashboard(d);
            setSelected(d.seleccion || []);
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se cargó análisis");
        }
    }, [buildLocalDashboard, call, notify, year]);
    useEffect(() => { queueMicrotask(() => void load()); }, [load]);
    useEffect(() => {
        if (catalog.length)
            queueMicrotask(() => setDashboard(buildLocalDashboard(catalog, orders, selected)));
    }, [buildLocalDashboard, catalog, orders, selected]);
    const card = (title: string, rows: ApiRecord[]) => <article className="panel"><h3>{title}</h3>{rows.slice(0, 10).map((x, i) => <div className="ranking" key={i}><b>{i + 1}</b><span>{x.nombre || x.cliente || x.producto || x.codigo || "Registro"}</span><strong>{money(x.total || x.ventas || x.importe)}</strong></div>)}{!rows.length && <p>No hay ventas suficientes para este análisis.</p>}</article>;
    const distribution = (dashboard?.distribucion || []) as unknown as ApiRecord[];
    const totalGroups = distribution.reduce((sum: number, x: ApiRecord) => sum + Number(x.cantidad || 0), 0);
    const gradient = distribution.map((x: ApiRecord, i: number) => { const start = distribution.slice(0, i).reduce((sum: number, item: ApiRecord) => sum + (totalGroups ? Number(item.cantidad || 0) / totalGroups * 360 : 0), 0); const end = start + (totalGroups ? Number(x.cantidad || 0) / totalGroups * 360 : 0); return colors[i] + " " + start + "deg " + end + "deg"; }).join(",");
    const series = (dashboard?.series || []) as unknown as ApiRecord[];
    const maxValue = Math.max(1, ...series.flatMap((s: ApiRecord) => s.meses || []));
    const coordinates = (values: number[]) => values.map((value, index) => ({ x: 25 + index * 50, y: 195 - Number(value || 0) / maxValue * 160, value: Number(value || 0) }));
    const curvePath = (values: number[]) => {
        const dots = coordinates(values);
        if (!dots.length)
            return "";
        return dots.slice(1).reduce((path, point, index) => {
            const previous = dots[index];
            const distance = (point.x - previous.x) / 2;
            return `${path} C ${previous.x + distance},${previous.y} ${point.x - distance},${point.y} ${point.x},${point.y}`;
        }, `M ${dots[0].x},${dots[0].y}`);
    };
    const leader = distribution.slice().sort((a: ApiRecord, b: ApiRecord) => Number(b.cantidad) - Number(a.cantidad))[0];
    function changeProduct(index: number, code: string) {
        const next = [...selected.slice(0, 3)];
        while (next.length < 3)
            next.push("");
        if (code)
            next.forEach((value, position) => { if (position !== index && value === code)
                next[position] = ""; });
        next[index] = code;
        setSelected(next);
    }
    return <div><Heading eyebrow="INTELIGENCIA COMERCIAL" title="Análisis de ventas" text="Compara productos por mes y revisa la composición de tu inventario."><div className="analysis-heading-actions"><select value={year} onChange={e => setYear(Number(e.target.value))}>{[0, 1, 2, 3].map(n => <option key={n} value={new Date().getFullYear() - n}>{new Date().getFullYear() - n}</option>)}</select><button onClick={load}>↻ Actualizar</button></div></Heading><section className="analysis-metrics"><article><small>Ventas del año</small><strong>{money(dashboard?.totalVentas)}</strong></article><article><small>Productos registrados</small><strong>{dashboard?.totalProductos || 0}</strong></article><article><small>Grupo principal</small><strong>{leader?.nombre || "—"}</strong><span>{leader?.cantidad || 0} productos</span></article><article><small>Curvas comparadas</small><strong>{series.length} / 3</strong></article></section><section className="analysis-main-grid"><article className="panel trend-panel"><div className="chart-title"><div><h3>Ventas por mes</h3><p>Importe mensual por producto · {year}</p></div></div><div className="product-curve-selectors">{[0, 1, 2].map(i => <ProductCurvePicker key={i} index={i} color={colors[i]} value={selected[i] || ""} options={dashboard?.opciones || []} onChange={code => changeProduct(i, code)}/>)}</div><div className="line-chart"><div className="chart-gridlines">{[0, 1, 2, 3].map(x => <i key={x}></i>)}</div><svg viewBox="0 0 600 220" preserveAspectRatio="none" aria-label="Ventas mensuales comparadas">{series.map((s: ApiRecord, i: number) => <g key={s.codigo}><path d={curvePath(s.meses)} fill="none" stroke={colors[s.slot ?? i]} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>{coordinates(s.meses).filter(point => point.value > 0).map((point, pointIndex) => <circle key={pointIndex} cx={point.x} cy={point.y} r="5" fill="#fff" stroke={colors[s.slot ?? i]} strokeWidth="3"/>)}</g>)}</svg><div className="month-axis">{(dashboard?.meses?.length ? dashboard.meses : monthNames).map((m: string) => <span key={m}>{m}</span>)}</div></div><div className="curve-legend">{series.map((s: ApiRecord, i: number) => <div key={s.codigo}><i style={{ background: colors[s.slot ?? i] }}></i><span>{s.nombre}</span><b>{money(s.total)}</b></div>)}</div></article><article className="panel donut-panel"><div className="chart-title"><div><h3>Productos por grupo</h3><p>Distribución del catálogo actual</p></div></div><div className="donut-wrap"><div className="donut-chart" style={{ background: "conic-gradient(" + (gradient || "#eef0f4 0deg 360deg") + ")" }}><span><b>{totalGroups}</b><small>productos</small></span></div><div className="donut-legend">{distribution.map((g: ApiRecord, i: number) => <div key={g.nombre}><i style={{ background: colors[i] }}></i><span>{g.nombre}</span><b>{g.cantidad}</b><small>{totalGroups ? (Number(g.cantidad) / totalGroups * 100).toFixed(1) : "0.0"}%</small></div>)}</div></div></article></section><section className="analytics-grid ranking-grid">{card("Top 10 · productos más vendidos", products)}{card("Top 10 · clientes que más compran", clients)}</section></div>;
}
function Settings({ call, notify, session }: {
    call: <T>(f: string, a?: unknown[]) => Promise<T>;
    notify: (s: string) => void;
    session: Session;
}) {
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [savingUser, setSavingUser] = useState("");
    const [dirty, setDirty] = useState<string[]>([]);
    const [query, setQuery] = useState("");
    const [profileFilter, setProfileFilter] = useState("TODOS");
    const [editing, setEditing] = useState<UserRecord | null>(null);
    const load = useCallback(() => {
        if (session.perfil === "MASTER")
            call<UserRecord[]>("obtenerUsuarios").then(rows => { setUsers((rows || []).map(u => ({ ...u, permisos: Array.isArray(u.permisos) && u.permisos.length ? u.permisos : defaultPermissions(u.perfil) }))); setDirty([]); }).catch(() => undefined);
    }, [call, session.perfil]);
    useEffect(() => { load(); }, [load]);
    async function action(fn: string) {
        if (!confirm("¿Confirmas esta operación administrativa?"))
            return;
        try {
            notify(await call<string>(fn));
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se ejecutó");
        }
    }
    function markDirty(usuario: string) { setDirty(current => current.includes(usuario) ? current : [...current, usuario]); }
    function createUser() { setEditing({ usuario: "", nombre: "", password: "", perfil: "PREVENTA", estado: "ACTIVO", comentarios: "", permisos: defaultPermissions("PREVENTA"), nuevo: true }); }
    function toggle(u: UserRecord) { const next = { ...u, estado: u.estado === "ACTIVO" ? "BLOQUEADO" : "ACTIVO" }; setUsers(current => current.map(row => row.usuario === u.usuario ? next : row)); markDirty(u.usuario); }
    function setPermission(u: UserRecord, permission: string, enabled: boolean) {
        const permisos = enabled ? Array.from(new Set([...(u.permisos || []), permission])) : (u.permisos || []).filter((x: string) => x !== permission);
        const next = { ...u, permisos };
        setUsers(current => current.map(row => row.usuario === u.usuario ? next : row));
        markDirty(u.usuario);
    }
    function applyTemplate(u: UserRecord, profile: string) { const next = { ...u, perfil: profile, permisos: defaultPermissions(profile) }; setUsers(current => current.map(row => row.usuario === u.usuario ? next : row)); markDirty(u.usuario); }
    async function saveUser(u: UserRecord) {
        if (u.perfil === "MASTER" && (!u.permisos.includes("configuracion") || u.estado !== "ACTIVO") && u.usuario === session.usuario) {
            notify("Por seguridad no puedes bloquearte ni quitarte Configuración.");
            return;
        }
        setSavingUser(u.usuario);
        try {
            const message = await call<string>("actualizarUsuario", [{ ...u, originalUsuario: u.usuario }]);
            notify(message);
            setDirty(current => current.filter(x => x !== u.usuario));
        }
        catch (x) {
            notify(x instanceof Error ? x.message : "No se guardaron los cambios");
        }
        finally {
            setSavingUser("");
        }
    }
    async function saveEditor(e: FormEvent) { e.preventDefault(); if (!editing)
        return; setSavingUser(editing.usuario || "nuevo"); try {
        const fn = editing.nuevo ? "crearUsuarioSistema" : "actualizarUsuario";
        const payload = { ...editing, originalUsuario: editing.originalUsuario || editing.usuario };
        notify(await call<string>(fn, [payload]));
        setEditing(null);
        await load();
    }
    catch (x) {
        notify(x instanceof Error ? x.message : "No se guardó el usuario");
    }
    finally {
        setSavingUser("");
    } }
    async function deleteEditor() { if (!editing || editing.nuevo || !confirm("¿Eliminar definitivamente este usuario?"))
        return; try {
        notify(await call<string>("eliminarUsuarioSistema", [editing.usuario]));
        setEditing(null);
        await load();
    }
    catch (x) {
        notify(x instanceof Error ? x.message : "No se eliminó");
    } }
    const iconFor = (label: string) => icons[label === "Pedidos" ? "Pedidos y emisión" : label === "Cobranza" ? "Cobranza y rendición" : label === "Inventario" ? "Productos e inventario" : label === "Finanzas" ? "Gestión financiera" : label];
    const filteredUsers = users.filter(u => (profileFilter === "TODOS" || u.perfil === profileFilter) && (String(u.nombre).toLowerCase().includes(query.toLowerCase()) || String(u.usuario).toLowerCase().includes(query.toLowerCase())));
    return <div><Heading eyebrow="ADMINISTRACIÓN" title="Configuración" text="Controla usuarios, acceso por módulos, conexión y mantenimiento."><button className="primary" onClick={createUser}>＋ Crear usuario</button></Heading><section className="panel access-control"><div className="access-title"><div><h3>Usuarios y permisos de visibilidad</h3><p>Ordena el acceso, prepara cambios y guárdalos una sola vez por usuario.</p></div><span>{filteredUsers.length} usuario(s)</span></div><div className="user-filterbar"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar usuario o nombre…"/><select value={profileFilter} onChange={e => setProfileFilter(e.target.value)}><option value="TODOS">Todos los perfiles</option><option value="MASTER">Administradores</option><option value="PREVENTA">Preventistas</option><option value="COMPRADOR">Compradores</option></select></div><div className="user-access-list">{filteredUsers.map(u => <article className={"user-access-card " + (dirty.includes(u.usuario) ? "has-changes" : "")} key={u.usuario}><div className="user-access-head"><button className="user-identity edit-user" onClick={() => setEditing({ ...u, originalUsuario: u.usuario, password: "", nuevo: false })}><span>{String(u.nombre || u.usuario).slice(0, 2).toUpperCase()}</span><div><strong>{u.nombre}</strong><small>@{u.usuario} · {u.perfil} · Editar</small></div></button><div className="user-card-actions"><label className="master-switch"><input type="checkbox" checked={u.estado === "ACTIVO"} onChange={() => toggle(u)} disabled={savingUser === u.usuario}/><i></i><b>{u.estado === "ACTIVO" ? "Activo" : "Bloqueado"}</b></label>{dirty.includes(u.usuario) && <button className="save-permissions" onClick={() => saveUser(u)} disabled={savingUser === u.usuario}>{savingUser === u.usuario ? "Guardando…" : "Guardar cambios"}</button>}</div></div><div className="profile-templates"><small>Plantilla rápida:</small>{["PREVENTA", "COMPRADOR", "MASTER"].map(profile => <button key={profile} className={u.perfil === profile ? "active" : ""} onClick={() => applyTemplate(u, profile)}>{profile === "PREVENTA" ? "Preventista" : profile === "COMPRADOR" ? "Comprador" : "Administrador"}</button>)}<button onClick={() => { setUsers(current => current.map(row => row.usuario === u.usuario ? { ...row, permisos: modulePermissions.map(x => x.key) } : row)); markDirty(u.usuario); }}>Activar todo</button></div><div className={"permission-grid " + (u.estado !== "ACTIVO" ? "disabled" : "")}>{modulePermissions.map(module => { const enabled = (u.permisos || []).includes(module.key); return <label className="permission-switch" key={module.key}><span><i>{iconFor(module.label)}</i>{module.label}</span><input type="checkbox" checked={enabled} onChange={e => setPermission(u, module.key, e.target.checked)} disabled={u.estado !== "ACTIVO" || savingUser === u.usuario}/><b aria-hidden="true"></b></label>; })}</div>{dirty.includes(u.usuario) && savingUser !== u.usuario && <small className="draft-note">● Cambios sin guardar</small>}</article>)}</div></section><details className="panel maintenance-fold"><summary>Conexión y mantenimiento avanzado</summary><div className="config-grid config-secondary"><section className="connector"><h3>Google Sheets</h3><p><b>Conectado.</b> Los permisos y la auditoría se almacenan en Sheets.</p><span className="queue-chip">● API activa</span></section><section className="maintenance"><h3>Acciones delicadas</h3><button onClick={() => action("validarIntegridad")}>Verificar integridad</button><button onClick={() => action("repararFechasMovimientosVenta")}>Reparar fechas de ventas</button><button onClick={() => action("inicializarHojas")}>Inicializar hojas faltantes</button></section></div></details>{editing && <div className="modal-bg"><form className="modal user-editor" onSubmit={saveEditor}><button type="button" className="close" onClick={() => setEditing(null)}>×</button><span className="eyebrow">{editing.nuevo ? "NUEVO USUARIO" : "EDITAR USUARIO"}</span><h2>{editing.nuevo ? "Crear acceso" : editing.nombre}</h2><div className="form-row"><label>Usuario<input value={editing.usuario} onChange={e => setEditing({ ...editing, usuario: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") })} required/></label><label>Nombre completo<input value={editing.nombre} onChange={e => setEditing({ ...editing, nombre: e.target.value })} required/></label></div><div className="form-row"><label>Perfil<select value={editing.perfil} onChange={e => setEditing({ ...editing, perfil: e.target.value, permisos: defaultPermissions(e.target.value) })}><option value="PREVENTA">Preventista</option><option value="COMPRADOR">Comprador</option><option value="MASTER">Administrador</option></select></label><label>{editing.nuevo ? "Contraseña inicial" : "Nueva contraseña (opcional)"}<input type="password" value={editing.password || ""} onChange={e => setEditing({ ...editing, password: e.target.value })} required={editing.nuevo}/></label></div><label>Comentarios<textarea value={editing.comentarios || ""} onChange={e => setEditing({ ...editing, comentarios: e.target.value })}/></label><button className="primary" disabled={Boolean(savingUser)}>{savingUser ? "Guardando…" : editing.nuevo ? "Crear usuario" : "Guardar usuario"}</button>{!editing.nuevo && <button type="button" className="danger-link" onClick={deleteEditor}>Eliminar usuario</button>}</form></div>}</div>;
}
