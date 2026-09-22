"use client";
import { useEffect, useRef, useState } from "react";
import { StitchIcon } from "./stitch-ui";
type Child={label:string;value:string};
type Item={label:string;target:string;icon:string;children?:Child[]};
export function StitchNavigation({items,active,expanded,onExpand,onNavigate,onChild,open,onClose,user,onLogout}:{items:Item[];active:string;expanded:string;onExpand:(s:string)=>void;onNavigate:(s:string)=>void;onChild:(item:Item,child:Child)=>void;open:boolean;onClose:()=>void;user:{nombre:string;perfil:string};onLogout:()=>void}) {
 const [mobile,setMobile]=useState(false);const panel=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const media=window.matchMedia("(max-width: 900px)");const update=()=>setMobile(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
 useEffect(()=>{
  if(!mobile||!open)return;
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  const workspace=document.querySelector<HTMLElement>(".workspace");const priorInert=workspace?.inert;
  document.body.style.overflow="hidden";if(workspace)workspace.inert=true;
  panel.current?.querySelector<HTMLButtonElement>(".drawer-close")?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();close.current();}if(e.key==="Tab"){
   const controls=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')||[]).filter(el=>el.getClientRects().length>0);
   const first=controls[0],last=controls.at(-1);
   if(e.shiftKey&&(document.activeElement===first||!panel.current?.contains(document.activeElement))){e.preventDefault();last?.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }};
  document.addEventListener("keydown",key);return()=>{document.body.style.overflow=overflow;if(workspace)workspace.inert=Boolean(priorInert);document.removeEventListener("keydown",key);previous?.focus();};
 },[mobile,open]);
 const icon:Record<string,string>={Inicio:"box",Clientes:"phone",Preventa:"receipt",Pedidos:"truck",Rendiciones:"receipt",Inventario:"box","Gestión financiera":"receipt",Reportes:"receipt",Análisis:"arrow",Administración:"box"};
 return <aside id="nexa-navigation" ref={panel} className={`sidebar phase-one-sidebar ${open?"mobile-open":""}`} role={mobile&&open?"dialog":undefined} aria-modal={mobile&&open?true:undefined} aria-label="Navegación principal" aria-hidden={mobile&&!open?true:undefined} inert={mobile&&!open}>
  <div className="brand"><img className="brand-logo" src="/nexa-group-logo.png" alt="NEXA GROUP"/><div><strong>NEXA GROUP</strong><small>INVERSIONES DORICONTA S.A.C.</small></div><button className="drawer-close" onClick={onClose} aria-label="Cerrar menú">×</button></div>
  <nav className="grouped-sidebar stitch-sidebar-menu" aria-label="Módulos">{items.map((item,index)=>{const expandedItem=expanded===item.label;return <section className={`${expandedItem?"open":""} ${active===item.target?"current":""}`} key={item.label}><button className="sidebar-primary-item" onClick={()=>item.children?onExpand(expandedItem?"":item.label):onNavigate(item.target)} aria-current={!item.children&&active===item.target?"page":undefined} aria-expanded={item.children?expandedItem:undefined} aria-controls={item.children?`nexa-submenu-${index}`:undefined}><span aria-hidden="true"><StitchIcon name={icon[item.label]||"box"} size={18}/></span><b>{item.label}</b>{item.children&&<i aria-hidden="true">{expandedItem?"−":"+"}</i>}</button>{item.children&&<div id={`nexa-submenu-${index}`} className="menu-group-items" hidden={!expandedItem}>{item.children.map(child=><button key={child.label} onClick={()=>onChild(item,child)}><span aria-hidden="true">·</span><b>{child.label}</b></button>)}</div>}</section>;})}</nav>
  <div className="profile"><span>{user.nombre.slice(0,2).toUpperCase()}</span><div><b>{user.nombre}</b><small>{user.perfil}</small></div><button onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión">↪</button></div>
 </aside>;
}
