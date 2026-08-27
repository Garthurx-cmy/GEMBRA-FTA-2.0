import { InspectionDraft } from "../types";

const DB_NAME = "gemba_fta_drafts_db";
const STORE_NAME = "inspection_drafts";
const queues = new Map<string, Promise<unknown>>();
const draftKey = (userId: string, editId?: string) => `draft_${userId || "anonymous"}_${editId ? `edit_${editId}` : "new"}`;
const legacyKey = (userId: string, editId?: string) => draftKey((userId || "anonymous").trim().toLowerCase(), editId);

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("IndexedDB indisponível")); return; }
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "draftKey" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Armazenamento de rascunho bloqueado"));
  });
}

async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = operation(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error || request.error);
      tx.onabort = () => reject(tx.error || new Error("Rascunho não confirmado"));
    });
  } finally { db.close(); }
}
function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const pending = (queues.get(key) || Promise.resolve()).catch(() => undefined).then(operation);
  queues.set(key, pending);
  void pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); }).catch(() => undefined);
  return pending;
}
function readLocal(key: string): any {
  try { return JSON.parse(window.localStorage.getItem(`gemba_draft_${key}`) || "null"); } catch { return null; }
}

/** Synchronous local copy protects a last keystroke during pagehide; IndexedDB keeps photos. */
export function saveInspectionDraft(userId: string, draft: InspectionDraft, editId?: string): Promise<void> {
  const key = draftKey(userId, editId);
  const record = { draftKey: key, userId, isEditingId: editId || null, draft: { ...draft, savedAt: new Date().toISOString() } };
  let localSaved = false;
  try { window.localStorage.setItem(`gemba_draft_${key}`, JSON.stringify(record)); localSaved = true; } catch { /* Try IndexedDB below. */ }
  return enqueue(key, async () => {
    try { await transaction("readwrite", store => store.put(record)); }
    catch (error) { if (!localSaved) throw error; }
  });
}

export async function getInspectionDraft(userId: string, editId?: string): Promise<InspectionDraft | null> {
  const keys = [...new Set([draftKey(userId, editId), legacyKey(userId, editId)])];
  const candidates: InspectionDraft[] = [];
  for (const key of keys) {
    await queues.get(key)?.catch(() => undefined);
    const local = readLocal(key);
    // Exact UID prevents cross-account fallback when IDs differ only by case.
    if (local?.draft && local.userId === userId) candidates.push(local.draft);
    try {
      const stored: any = await transaction("readonly", store => store.get(key));
      if (stored?.draft && stored.userId === userId) candidates.push(stored.draft);
    } catch { /* The local copy remains available even if IndexedDB failed. */ }
  }
  return candidates.sort((a,b) => (b.savedAt || "").localeCompare(a.savedAt || ""))[0] || null;
}

export async function deleteInspectionDraft(userId: string, editId?: string): Promise<void> {
  for (const key of [...new Set([draftKey(userId, editId), legacyKey(userId, editId)])]) {
    let localCleared = false;
    try { window.localStorage.removeItem(`gemba_draft_${key}`); localCleared = true; } catch { /* Still try IndexedDB. */ }
    await enqueue(key, async () => {
      try { await transaction("readwrite", store => store.delete(key)); }
      catch (error) { if (!localCleared) throw error; }
    });
  }
}
