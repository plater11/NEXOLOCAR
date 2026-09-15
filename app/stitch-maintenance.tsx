"use client";
import { useState } from "react";
import { StitchHeader } from "./stitch-ui";
export function StitchMaintenance({ onIntegrity }: { onIntegrity: () => void }) {
 const [busy,setBusy] = useState(false);
 const [result,setResult] = useState<{connected: boolean; message: string} | null>(null);
 async function check() { setBusy(true); try { const response = await fetch("/api/data-source?check=1", {cache:"no-store"}); const data = await response.json(); setResult({connected:response.ok && data.database?.connected === true,message:response.ok && data.database?.connected ? "Base de datos disponible. Clientes, productos y pedidos accesibles." : "No se pudo verificar la conexión. Revisa la configuración del servidor."}); } catch { setResult({connected:false,message:"No se pudo contactar al servidor. Comprueba tu conexión."}); } finally {setBusy(false);} }
 return <div className="sx-layout"><StitchHeader title="APIs y mantenimiento" subtitle="Estado de los servicios de NEXA GROUP"/><section className="sx-panel"><h3>Supabase · Base de datos y autenticación</h3><p className="sx-help">Las credenciales se administran en el servidor y no se muestran en esta pantalla.</p><p role="status" className="sx-alert">{result ? result.message : "Conexión aún no verificada en esta sesión."}</p><div className="sx-actions"><button disabled={busy} onClick={check}>{busy ? "Verificando…" : "Verificar conexión"}</button><button onClick={onIntegrity}>Verificar integridad</button></div></section><section className="sx-panel"><h3>Integraciones adicionales</h3><p>No hay integración de impresora, gaveta ni facturación electrónica configurada en esta pantalla.</p></section></div>;
}
