import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const endpoint = String(process.env.APPS_SCRIPT_URL || "").trim();
const usuario = String(process.env.QASO_USER || "").trim();
const password = String(process.env.QASO_PASSWORD || "");

if (!endpoint || !usuario || !password) {
  throw new Error("Faltan APPS_SCRIPT_URL, QASO_USER o QASO_PASSWORD en la sesión actual.");
}

async function call(fn, args = [], token = "") {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ fn, args, token }),
    redirect: "follow",
  });
  const raw = await response.text();
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new Error(`${fn}: Apps Script devolvió contenido no JSON.`);
  }
  if (!response.ok || !envelope?.ok) {
    throw new Error(`${fn}: ${envelope?.message || envelope?.mensaje || "consulta rechazada"}`);
  }
  return envelope.resultado;
}

const session = await call("loginUsuario", [usuario, password]);
if (!session?.ok || !session.token) throw new Error(session?.mensaje || "No se pudo iniciar sesión.");
if (String(session.perfil || "").toUpperCase() !== "MASTER") {
  throw new Error("La exportación requiere un usuario con perfil MASTER.");
}

const token = session.token;
const [clientes, productos, pedidos, stock] = await Promise.all([
  call("obtenerClientes", [""], token),
  call("obtenerCatalogoProductos", [], token),
  call("obtenerEmisiones", [{ fechaDesde: "2000-01-01", fechaHasta: "2999-12-31", texto: "" }], token),
  call("obtenerStock", [], token),
]);

const outputDir = path.resolve("scripts/migration/input");
await mkdir(outputDir, { recursive: true });
const datasets = { clientes, productos, pedidos, stock };
for (const [name, rows] of Object.entries(datasets)) {
  if (!Array.isArray(rows)) throw new Error(`${name}: la respuesta no es una lista.`);
  await writeFile(path.join(outputDir, `${name}.json`), JSON.stringify(rows, null, 2), "utf8");
}

await call("cerrarSesion", [], token);
console.log(JSON.stringify({
  ok: true,
  exportedAt: new Date().toISOString(),
  counts: Object.fromEntries(Object.entries(datasets).map(([name, rows]) => [name, rows.length])),
}, null, 2));
