"use client";

import { useState, type ReactNode } from "react";

export function StitchIcon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/></>,
    phone: <path d="m7 3 3 5-3 3a16 16 0 0 0 6 6l3-3 5 3c0 4-3 5-6 4C9 19 5 15 3 9 2 6 3 3 7 3Z"/>,
    chat: <path d="M21 11a9 9 0 0 1-13 8l-5 2 2-5A9 9 0 1 1 21 11Z"/>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
    receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2Z"/><path d="M8 7h8M8 11h8M8 15h4"/></>,
    edit: <><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/></>,
    box: <><path d="m12 3 9 5v9l-9 5-9-5V8Zm0 9v10M3 8l9 4 9-4M8 5l9 5"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    truck: <><path d="M2 5h12v12H2ZM14 9h4l4 5v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.box}</svg>;
}
export function StitchHeader({ title, subtitle, icon = "box", children }: { title: string; subtitle?: string; icon?: string; children?: ReactNode }) {
  return <header className="sx-heading"><span className="sx-icon"><StitchIcon name={icon}/></span><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div className="sx-actions">{children}</div></header>;
}
export function StitchSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="sx-search"><StitchIcon name="search"/><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}/>{value && <button type="button" onClick={() => onChange("")} aria-label="Limpiar búsqueda">×</button>}</label>;
}
const currency = (n: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n || 0);
export function StitchMetric({ label, value, note, tone = "orange", onClick }: { label: string; value: string; note?: string; tone?: string; onClick?: () => void }) {
  const body = <><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</>;
  return onClick ? <button className={`sx-metric ${tone}`} onClick={onClick}>{body}</button> : <article className={`sx-metric ${tone}`}>{body}</article>;
}
type DirectoryClient = { id: string; nombre: string; apellidos: string; contacto: string; direccion: string; estado?: string };
export function StitchDirectory({ clients, query, setQuery, status, setStatus, onNew, onOpen, onChat }: { clients: DirectoryClient[]; query: string; setQuery: (s: string) => void; status: string; setStatus: (s: "ACTIVO" | "INACTIVO") => void; onNew: () => void; onOpen: (c: DirectoryClient) => void; onChat: (phone: string) => void }) {
  const active = (c: DirectoryClient) => String(c.estado || "ACTIVO").toUpperCase() !== "INACTIVO";
  const results = clients.filter(c => (status === "INACTIVO" ? !active(c) : active(c)) && `${c.id} ${c.nombre} ${c.apellidos} ${c.contacto} ${c.direccion}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="sx-directory"><StitchHeader title="Clientes" subtitle="Directorio y gestión mayorista"><button className="sx-primary" onClick={onNew}><StitchIcon name="plus"/>Nuevo</button></StitchHeader><StitchSearch value={query} onChange={setQuery} placeholder="Buscar cliente, teléfono o dirección"/><nav className="sx-segments">{(["ACTIVO", "INACTIVO"] as const).map(state => <button key={state} className={status === state ? "selected" : ""} onClick={() => setStatus(state)}>{state === "ACTIVO" ? "Activos" : "Inactivos"}<b>{clients.filter(c => state === "ACTIVO" ? active(c) : !active(c)).length}</b></button>)}</nav><div className="sx-client-grid">{results.map(c => <article className={`sx-client ${active(c) ? "" : "inactive"}`} key={c.id}><button className="sx-client-open" onClick={() => onOpen(c)}><span className="sx-avatar">{`${c.nombre[0] || ""}${c.apellidos[0] || ""}`}</span><span><b>{c.nombre} {c.apellidos}</b><small className={`sx-badge ${active(c) ? "green" : "red"}`}>{active(c) ? "Activo" : "Inactivo"}</small></span></button><p title={c.direccion}><StitchIcon name="pin" size={14}/>{c.direccion || "Dirección no registrada"}</p><footer>{c.contacto ? <><a href={`tel:${c.contacto}`}><StitchIcon name="phone" size={15}/>{c.contacto}</a><button onClick={() => onChat(c.contacto)} aria-label={`WhatsApp de ${c.nombre}`}><StitchIcon name="chat" size={17}/></button></> : <small>Teléfono no registrado</small>}</footer></article>)}</div>{!results.length && <p className="sx-empty">No se encontraron clientes.</p>}</div>;
}
type ListedOrder = { ventaId: string; total: number; cliente: string; itemsCount: number; telefono?: string; fecha: string; codigoImpresion?: string };
export function StitchOrderCards<T extends ListedOrder>({ orders, stateOf, onDetail, onEdit, onPrint, selected, onSelect }: { orders: T[]; stateOf: (o: T) => string; onDetail: (o: T) => void; onEdit: (o: T) => void; onPrint: (o: T) => void; selected: Set<string>; onSelect: (o: T, checked: boolean) => void }) {
  const labels: Record<string,string> = { POR_COMPRAR: "Por comprar", LISTO_PARA_ENTREGA: "Listo para entrega", EN_RUTA: "En ruta", ENTREGADO: "Entregado", OBSERVADO: "Observado" };
  return <div className="sx-order-grid">{orders.map(o => <article className={`sx-order state-${stateOf(o).toLowerCase()}`} key={o.ventaId}><header><input type="checkbox" aria-label={`Seleccionar ${o.ventaId}`} checked={selected.has(o.ventaId)} onChange={e => onSelect(o,e.target.checked)}/><button onClick={() => onDetail(o)}>{o.ventaId}</button><strong>{currency(o.total)}</strong></header><p><b>{o.cliente}</b><span>· {o.itemsCount || 0} ítems</span>{o.telefono && <span>· {o.telefono}</span>}</p><footer><div><time>{Number.isNaN(Date.parse(o.fecha)) ? o.fecha : new Date(o.fecha).toLocaleDateString("es-PE",{timeZone:"America/Lima"})}</time><span className="sx-badge">{labels[stateOf(o)] || stateOf(o)}</span></div><div className="sx-actions"><button aria-label={`Ver boleta ${o.ventaId}`} title="Ver boleta" onClick={() => onDetail(o)}><StitchIcon name="receipt" size={18}/></button><button title="Imprimir boleta" aria-label={`Imprimir ${o.ventaId}`} onClick={() => onPrint(o)}><StitchIcon name="download" size={18}/></button>{stateOf(o) !== "ENTREGADO" && <><button title="Editar pedido" aria-label={`Editar ${o.ventaId}`} onClick={() => onEdit(o)}><StitchIcon name="edit" size={18}/></button><button className="sx-primary" onClick={() => onDetail(o)}>Estado<StitchIcon name="arrow" size={15}/></button></>}</div></footer></article>)}</div>;
}
type StockProduct = { codigo: string; nombre: string; grupo: string; stock: number; stockMin: number; precioCosto: number; precioVenta: number; unidad: string; factorPresentacion?: number };
export function StitchStock<T extends StockProduct>({ products, onEdit, canEdit }: { products: T[]; onEdit: (p: T) => void; canEdit: boolean }) {
  const [group,setGroup] = useState("Todos");
  const groups = [...new Set(products.map(p => p.grupo || "General"))].sort();
  return <><nav className="sx-chips">{["Todos",...groups].map(g => <button key={g} className={g === group ? "selected" : ""} onClick={() => setGroup(g)}>{g}</button>)}</nav><div className="sx-stock-grid">{products.filter(p => group === "Todos" || (p.grupo || "General") === group).map(p => { const quantity = p.stock / Math.max(1,Number(p.factorPresentacion || 1)); const low = quantity <= p.stockMin; return <article className="sx-stock" key={p.codigo}><div className="sx-stock-copy"><small>{p.codigo}<span>{p.grupo}</span></small><h3>{p.nombre}</h3><p>C: {currency(p.precioCosto)} · V: {currency(p.precioVenta)}</p></div><div className="sx-stock-quantity"><strong>{Number(quantity.toFixed(4))}</strong><small>Mín: {p.stockMin} · {Number(p.factorPresentacion || 1)>1?`Paq. x${p.factorPresentacion}`:p.unidad}</small><span className={`sx-badge ${low ? "red" : "green"}`}>{low ? "Bajo stock" : "Disponible"}</span></div>{canEdit && <button title="Editar material" aria-label={`Editar ${p.nombre}`} onClick={() => onEdit(p)}><StitchIcon name="edit" size={18}/></button>}</article>;})}</div></>;
}
