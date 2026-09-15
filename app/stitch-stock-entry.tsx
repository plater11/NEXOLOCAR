"use client";
import { useState, type FormEvent } from "react";
import { StitchSearch } from "./stitch-ui";
type Product = {codigo:string;nombre:string;stock:number;unidad:string;factorPresentacion?:number;nombrePresentacion?:string};
export type StockEntry = {codigo:string;fecha:string;tipo:string;cantidad:number;observaciones:string};
export function StitchStockEntry({products,value,onChange,onSubmit,busy,onBulk}:{products:Product[];value:StockEntry;onChange:(v:StockEntry)=>void;onSubmit:(e:FormEvent)=>void;busy:boolean;onBulk:()=>void}) {
 const [query,setQuery]=useState("");
 const selected=products.find(p=>p.codigo===value.codigo);
 const factor=Math.max(1,Number(selected?.factorPresentacion || 1));
 const unit=selected?.nombrePresentacion || (factor>1?`Paquete x${factor}`:selected?.unidad || "presentación");
 const current=Number(selected?.stock || 0)/factor;
 const delta=value.tipo === "AJUSTE_NEGATIVO" ? -value.cantidad : value.cantidad;
 return <form className="sx-form sx-stock-entry" onSubmit={onSubmit}><fieldset disabled={busy} className="sx-expense-fields">
  <div className="sx-actions"><button type="button" className="sx-primary">Registro manual</button><button type="button" onClick={onBulk}>Carga masiva Excel</button></div>
  <section className="sx-panel sx-layout"><h3>1. Seleccionar material</h3><StitchSearch value={query} onChange={setQuery} placeholder="Buscar producto o SKU"/><div className="sx-entry-results">{products.filter(p=>`${p.codigo} ${p.nombre}`.toLowerCase().includes(query.toLowerCase())).slice(0,8).map(p=><button type="button" className={selected?.codigo===p.codigo?"selected":""} key={p.codigo} onClick={()=>onChange({...value,codigo:p.codigo})}><b>{p.nombre}</b><small>{p.codigo}</small></button>)}</div>{!selected && <p className="sx-help">Selecciona un producto antes de ingresar cantidades.</p>}</section>
  {selected && <><section className="sx-panel sx-layout"><h3>2. Cantidad y movimiento</h3><p><b>{selected.nombre}</b> · {unit}</p><nav className="sx-chips">{[["INGRESO","Entrada (+)"],["AJUSTE_POSITIVO","Ajuste positivo"],["AJUSTE_NEGATIVO","Ajuste negativo"]].map(([type,label])=><button type="button" key={type} className={value.tipo===type?"selected":""} onClick={()=>onChange({...value,tipo:type})}>{label}</button>)}</nav><label>Cantidad de presentaciones<input required type="number" inputMode="decimal" min="0.0001" step="0.0001" value={value.cantidad || ""} onChange={e=>onChange({...value,cantidad:Number(e.target.value)})}/></label><div className="sx-mini-metrics"><article><span>Stock actual</span><b>{Number(current.toFixed(4))}</b></article><article><span>Movimiento</span><b>{delta>0?"+":""}{delta}</b></article><article><span>Stock resultante</span><b>{Number((current+delta).toFixed(4))}</b></article></div><p className="sx-alert">{value.cantidad || 0} {unit} = {Number((value.cantidad*factor).toFixed(4))} unidades base. El stock visible se mantiene en presentaciones.</p></section><section className="sx-panel"><label>Motivo / referencia<textarea required={value.tipo!=="INGRESO"} value={value.observaciones} onChange={e=>onChange({...value,observaciones:e.target.value})} placeholder="Compra, devolución, merma o motivo del ajuste"/></label></section><button className="sx-primary" disabled={busy || !Number.isFinite(value.cantidad) || value.cantidad<=0 || current+delta<0}>{busy?"Guardando…":"Confirmar movimiento"}</button></>}
 </fieldset></form>;
}
