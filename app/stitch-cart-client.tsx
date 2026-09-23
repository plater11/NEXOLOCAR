"use client";
import { useState } from "react";
type Client = { id: string; nombre: string; apellidos: string; contacto?: string; direccion?: string };
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
export function StitchCartClient({ clients, client, busy, onChange }: { clients: Client[]; client: string; busy: boolean; onChange: (id: string) => void }) {
    const [query, setQuery] = useState(client);
    const [open, setOpen] = useState(false);
    const matches = clients.filter(c => normalize(`${c.nombre} ${c.apellidos} ${c.contacto || ""} ${c.direccion || ""} ${c.id}`).includes(normalize(query)));
    return <section className="sx-cart-client">
        <label htmlFor="cart-client-search">Cliente del pedido</label>
        <input id="cart-client-search" type="search" autoComplete="off" disabled={busy} value={query} placeholder="Buscar nombre, teléfono o dirección" onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true); onChange(""); }}/>
        {open && <div className="sx-cart-client-results" aria-label="Resultados de clientes">
            {matches.map(c => <button type="button" key={c.id} disabled={busy} onClick={() => { onChange(c.id); setQuery(`${c.nombre} ${c.apellidos}`.trim()); setOpen(false); }}><b>{c.nombre} {c.apellidos}</b><small>{c.contacto || "Sin teléfono"} · {c.direccion || "Sin dirección"} · {c.id}</small></button>)}
            {!matches.length && <p role="status">No se encontraron clientes.</p>}
        </div>}
        {!open && client && <small>✓ Cliente seleccionado</small>}
    </section>;
}
