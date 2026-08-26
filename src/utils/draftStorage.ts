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

/**
 * Salva o rascunho de uma inspeção em IndexedDB com fallback para LocalStorage.
 */
export async function saveInspectionDraft(
  userId: string,
  draft: InspectionDraft,
  isEditingId?: string
): Promise<void> {
  const draftKey = getDraftKey(userId, isEditingId);
  const record = {
    draftKey,
    userId,
    isEditingId: isEditingId || null,
    draft: {
      ...draft,
      savedAt: new Date().toISOString()
    }
  };

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
    // Fallback para localStorage
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(`gemba_draft_${draftKey}`, JSON.stringify(record));
      }
    } catch (lsErr) {
      console.warn("Falha ao salvar rascunho em LocalStorage fallback:", lsErr);
    }
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
    // Fallback para localStorage
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem(`gemba_draft_${draftKey}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.draft) {
            return parsed.draft as InspectionDraft;
          }
        }
      }
    } catch (lsErr) {
      console.warn("Falha ao ler rascunho de LocalStorage fallback:", lsErr);
    }
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
