import { InspectionDraft } from "../types";

const DB_NAME = "gemba_fta_drafts_db";
const STORE_NAME = "inspection_drafts";
const queues = new Map<string, Promise<unknown>>();
const draftGenerations = new Map<string, number>();

const isDev = Boolean(
  typeof process !== "undefined"
    ? process.env?.NODE_ENV !== "production"
    : typeof import.meta !== "undefined" && (import.meta as any)?.env?.DEV
);

const draftKey = (userId: string, editId?: string) => `draft_${userId || "anonymous"}_${editId ? `edit_${editId}` : "new"}`;
const legacyKey = (userId: string, editId?: string) => draftKey((userId || "anonymous").trim().toLowerCase(), editId);

function hasIndexedDB(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getDraftGeneration(userId: string, editId?: string): number {
  const key = draftKey(userId, editId);
  return draftGenerations.get(key) || 0;
}

export function invalidateDraftGeneration(userId: string, editId?: string): number {
  const key = draftKey(userId, editId);
  const next = (draftGenerations.get(key) || 0) + 1;
  draftGenerations.set(key, next);
  if (isDev) {
    console.log(`[DRAFT] Invalidação: chave=${key}, nova geração=${next}`);
  }
  return next;
}

export async function waitForPendingDraftWrites(userId: string, editId?: string): Promise<void> {
  const keys = [...new Set([draftKey(userId, editId), legacyKey(userId, editId)])];
  for (const key of keys) {
    const queue = queues.get(key);
    if (queue) {
      await queue.catch(() => undefined);
    }
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) { reject(new Error("IndexedDB indisponível")); return; }
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
  if (!hasIndexedDB()) {
    throw new Error("IndexedDB indisponível");
  }
  let db: IDBDatabase | null = null;
  try {
    db = await openDB();
    return await new Promise<T>((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, mode);
      const request = operation(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error || request.error);
      tx.onabort = () => reject(tx.error || new Error("Rascunho não confirmado"));
    });
  } finally {
    if (db && typeof db.close === "function") {
      db.close();
    }
  }
}

function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const pending = (queues.get(key) || Promise.resolve()).catch(() => undefined).then(operation);
  queues.set(key, pending);
  void pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); }).catch(() => undefined);
  return pending;
}

function readLocal(key: string): any {
  if (!hasLocalStorage()) return null;
  try { return JSON.parse(window.localStorage.getItem(`gemba_draft_${key}`) || "null"); } catch { return null; }
}

/** Synchronous local copy protects a last keystroke during pagehide; IndexedDB keeps photos. */
export function saveInspectionDraft(
  userId: string,
  draft: Partial<InspectionDraft>,
  editId?: string,
  expectedGen?: number
): Promise<void> {
  const key = draftKey(userId, editId);
  const currentGen = draftGenerations.get(key) || 0;
  if (expectedGen !== undefined && expectedGen !== currentGen) {
    if (isDev) {
      console.log(`[DRAFT] Descartando gravação de rascunho obsoleto: recebido gen=${expectedGen}, atual gen=${currentGen}`);
    }
    return Promise.resolve();
  }

  const record = { draftKey: key, userId, isEditingId: editId || null, generation: currentGen, draft: { ...draft, savedAt: new Date().toISOString() } };
  let localSaved = false;
  try {
    if (hasLocalStorage() && (expectedGen === undefined || (draftGenerations.get(key) || 0) === expectedGen)) {
      window.localStorage.setItem(`gemba_draft_${key}`, JSON.stringify(record));
      localSaved = true;
    }
  } catch { /* Try IndexedDB below. */ }

  return enqueue(key, async () => {
    if (expectedGen !== undefined && (draftGenerations.get(key) || 0) !== expectedGen) {
      if (isDev) {
        console.log(`[DRAFT] Ignorando persistência no IndexedDB: geração invalidada (${expectedGen} != ${draftGenerations.get(key)})`);
      }
      return;
    }
    try {
      await transaction("readwrite", store => store.put(record));
      if (isDev) {
        console.log(`[DRAFT] Rascunho salvo: chave=${key}, gen=${currentGen}`);
      }
    } catch (error) {
      if (!localSaved) throw error;
    }
  });
}

export async function getInspectionDraft(userId: string, editId?: string): Promise<Partial<InspectionDraft> | null> {
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
  const keys = [...new Set([draftKey(userId, editId), legacyKey(userId, editId)])];
  for (const key of keys) {
    draftGenerations.set(key, (draftGenerations.get(key) || 0) + 1);
  }
  for (const key of keys) {
    await queues.get(key)?.catch(() => undefined);
  }
  for (const key of keys) {
    let localCleared = false;
    try {
      if (hasLocalStorage()) {
        window.localStorage.removeItem(`gemba_draft_${key}`);
        window.localStorage.removeItem(`gemba_draft_${key.toLowerCase()}`);
        localCleared = true;
      }
    } catch { /* Still try IndexedDB. */ }
    await enqueue(key, async () => {
      try {
        await transaction("readwrite", store => store.delete(key));
        if (isDev) {
          console.log(`[DRAFT] Rascunho excluído: chave=${key}`);
        }
      } catch (error) {
        if (!localCleared) throw error;
      }
    });
  }
}


