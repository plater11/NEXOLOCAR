import { admin, input, clean, number, dedupe, report, upsertBatches } from "./lib.mjs";

const yes = value => /^(SI|SÍ|TRUE|1)$/i.test(clean(value));
const fractions = value => (Array.isArray(value) ? value : clean(value).split(",")).map(item => {
  const raw = clean(item), parts = raw.split("/").map(Number);
  return parts.length === 2 && parts[1] ? parts[0] / parts[1] : number(raw);
}).filter(value => value > 0 && value <= 1);

const source = await input("productos");
const normalized = source.map((row, index) => ({
  codigo: clean(row.codigo).toUpperCase(),
  nombre: clean(row.nombre) || "SIN NOMBRE",
  unidad_base: clean(row.unidad || "UND"),
  grupo: clean(row.grupo || "General"),
  stock_min: number(row.stockMin),
  costo_actual: number(row.precioCosto),
  precio_venta: number(row.precioVenta),
  imagen: clean(row.imagen) || null,
  promocion_activa: yes(row.promocionActiva),
  cantidad_promo: number(row.cantidadPromo),
  precio_promo: number(row.precioPromo),
  descripcion_promo: clean(row.descripcionPromo) || null,
  permite_fraccionamiento: yes(row.permiteFraccionamiento),
  controla_decimales: yes(row.controlaDecimales),
  activo: !row.estado || clean(row.estado).toUpperCase() !== "INACTIVO",
  legacy_id: clean(row.codigo).toUpperCase(),
  legacy_row: index + 2,
  legacy_source: "SHEETS",
}));
const unique = dedupe(normalized, row => row.codigo);
const db = admin();
const base = await upsertBatches(db, "productos", unique.rows, "codigo");
const { data: products, error: readError } = await db.from("productos").select("id,codigo").in("codigo", unique.rows.map(row => row.codigo));
if (readError) throw readError;
const ids = new Map((products || []).map(row => [row.codigo, row.id]));
const presentations = source.filter(row => ids.has(clean(row.codigo).toUpperCase())).map(row => ({
  producto_id: ids.get(clean(row.codigo).toUpperCase()),
  nombre: clean(row.nombrePresentacion || row.unidad || "UND"),
  factor: Math.max(number(row.factorPresentacion), 1),
  precio: number(row.precioPresentacion || row.precioVenta),
  permite_fraccionamiento: yes(row.permiteFraccionamiento),
  fracciones_permitidas: fractions(row.fraccionesPermitidas),
  es_venta: true,
  activo: true,
  legacy_id: clean(row.codigo).toUpperCase(),
}));
const detail = await upsertBatches(db, "presentaciones", presentations, "producto_id,nombre");
await report("productos", { source: source.length, valid: unique.rows.length, duplicates: unique.duplicates, productos: base, presentaciones: detail });
if (base.errors.length || detail.errors.length) process.exitCode = 1;
