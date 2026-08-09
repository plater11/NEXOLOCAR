import { createClient } from "@supabase/supabase-js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function input(name) {
  const file = path.resolve("scripts/migration/input", `${name}.json`);
  return JSON.parse(await readFile(file, "utf8"));
}

export function clean(value) { return String(value ?? "").trim(); }
export function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
export function date(value) { const raw = clean(value); if (!raw) return null; const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}` : raw.slice(0,10); }
export function dedupe(rows, key) { const map = new Map(), duplicates=[]; for (const row of rows) { const id=clean(key(row)).toUpperCase(); if (!id) continue; if (map.has(id)) duplicates.push(id); else map.set(id,row); } return { rows:[...map.values()], duplicates }; }
export async function report(name, result) { const dir=path.resolve("scripts/migration/output"); await mkdir(dir,{recursive:true}); await writeFile(path.join(dir,`${name}-${new Date().toISOString().replace(/[:.]/g,"-")}.json`),JSON.stringify(result,null,2)); }
export async function upsertBatches(db, table, rows, onConflict, size=250) { const errors=[]; let inserted=0; for(let i=0;i<rows.length;i+=size){const batch=rows.slice(i,i+size);const {error}=await db.from(table).upsert(batch,{onConflict});if(error)errors.push({offset:i,message:error.message});else inserted+=batch.length;}return {inserted,errors}; }
