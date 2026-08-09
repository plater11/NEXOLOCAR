"use client";

export type SyncState = "PENDING" | "SYNCING" | "FAILED" | "CONFLICT";
export type OfflineOperation = {
  id: string;
  fn: string;
  args: unknown[];
  createdAt: string;
  updatedAt: string;
  attempts: number;
  nextAttemptAt: number;
  state: SyncState;
  lastError?: string;
};

const DB_NAME = "nexoventa_offline";
const DB_VERSION = 1;
const STORE = "operations";

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("state", "state");
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento offline."));
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function enqueueOperation(fn: string, args: unknown[], id = crypto.randomUUID()) {
  const now = new Date().toISOString();
  const operation: OfflineOperation = { id, fn, args, createdAt: now, updatedAt: now, attempts: 0, nextAttemptAt: 0, state: "PENDING" };
  await transaction("readwrite", store => store.put(operation));
  window.dispatchEvent(new CustomEvent("nexo:queue-change"));
  return operation;
}

export async function listOperations() {
  return transaction<OfflineOperation[]>("readonly", store => store.getAll());
}

export async function removeOperation(id: string) {
  await transaction("readwrite", store => store.delete(id));
  window.dispatchEvent(new CustomEvent("nexo:queue-change"));
}

export async function updateOperation(operation: OfflineOperation) {
  await transaction("readwrite", store => store.put({ ...operation, updatedAt: new Date().toISOString() }));
  window.dispatchEvent(new CustomEvent("nexo:queue-change"));
}

export async function migrateLegacySaleQueue() {
  const raw = localStorage.getItem("nexo_sale_queue");
  if (!raw) return;
  try {
    const rows = JSON.parse(raw) as Array<{ id: string; payload: unknown }>;
    for (const row of rows) await enqueueOperation("registrarVenta", [row.payload], row.id);
    localStorage.removeItem("nexo_sale_queue");
  } catch { /* La cola anterior permanece disponible para recuperación manual. */ }
}

export async function synchronizeOperations(run: (fn: string, args: unknown[]) => Promise<unknown>) {
  const rows = (await listOperations()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let synced = 0, conflicts = 0;
  for (const row of rows) {
    if (row.nextAttemptAt > Date.now()) continue;
    const syncing = { ...row, state: "SYNCING" as const };
    await updateOperation(syncing);
    try {
      await run(row.fn, row.args);
      await removeOperation(row.id);
      synced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de sincronización";
      const conflict = /conflicto|stock insuficiente|versi[oó]n|duplicad/i.test(message);
      const attempts = row.attempts + 1;
      await updateOperation({ ...row, attempts, lastError: message, state: conflict ? "CONFLICT" : "FAILED", nextAttemptAt: conflict ? Number.MAX_SAFE_INTEGER : Date.now() + Math.min(300000, 2000 * 2 ** Math.min(attempts, 7)) });
      if (conflict) conflicts += 1;
    }
  }
  return { total: rows.length, synced, conflicts, pending: rows.length - synced };
}
