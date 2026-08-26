/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InspectionDraft } from "../types";

const DB_NAME = "gemba_fta_drafts_db";
const STORE_NAME = "inspection_drafts";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB não disponível"));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "draftKey" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error("Erro ao abrir IndexedDB"));
    };
  });
}

function getDraftKey(userId: string, isEditingId?: string): string {
  const cleanUser = (userId || "anonymous").trim().toLowerCase();
  if (isEditingId) {
    return `draft_${cleanUser}_edit_${isEditingId}`;
  }
  return `draft_${cleanUser}_new`;
}

function makeRecord(userId: string, draft: InspectionDraft, isEditingId?: string) {
  const draftKey = getDraftKey(userId, isEditingId);
  return {
    draftKey,
    userId,
    isEditingId: isEditingId || null,
    draft: { ...draft, savedAt: new Date().toISOString() }
  };
}

function mirrorToLocalStorage(record: ReturnType<typeof makeRecord>): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(`gemba_draft_${record.draftKey}`, JSON.stringify(record));
    }
  } catch (err) {
    console.warn("Falha ao salvar espelho local do rascunho:", err);
  }
}

/** Salvamento síncrono para pagehide/visibilitychange. */
export function saveInspectionDraftSync(
  userId: string,
  draft: InspectionDraft,
  isEditingId?: string
): void {
  mirrorToLocalStorage(makeRecord(userId, draft, isEditingId));
}

/**
 * Salva o rascunho de uma inspeção em IndexedDB com fallback para LocalStorage.
 */
export async function saveInspectionDraft(
  userId: string,
  draft: InspectionDraft,
  isEditingId?: string
): Promise<void> {
  const record = makeRecord(userId, draft, isEditingId);

  // O espelho síncrono protege o formulário mesmo se a aba for fechada antes
  // da transação assíncrona do IndexedDB terminar.
  mirrorToLocalStorage(record);

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(record);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    // O espelho no localStorage já foi gravado antes da tentativa no IndexedDB.
  }
}

/**
 * Recupera o rascunho de uma inspeção em IndexedDB ou LocalStorage.
 */
export async function getInspectionDraft(
  userId: string,
  isEditingId?: string
): Promise<InspectionDraft | null> {
  const draftKey = getDraftKey(userId, isEditingId);

  try {
    const db = await openDB();
    const result = await new Promise<any>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(draftKey);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (result && result.draft) {
      return result.draft as InspectionDraft;
    }
  } catch (err) {
    // Continua para o espelho no localStorage.
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(`gemba_draft_${draftKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.draft) return parsed.draft as InspectionDraft;
      }
    }
  } catch (lsErr) {
    console.warn("Falha ao ler rascunho de LocalStorage fallback:", lsErr);
  }

  return null;
}

/**
 * Remove o rascunho salvo do IndexedDB e LocalStorage.
 */
export async function deleteInspectionDraft(
  userId: string,
  isEditingId?: string
): Promise<void> {
  const draftKey = getDraftKey(userId, isEditingId);

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(draftKey);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    // Silently continue to clear localStorage
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(`gemba_draft_${draftKey}`);
    }
  } catch (lsErr) {
    // Ignore
  }
}
