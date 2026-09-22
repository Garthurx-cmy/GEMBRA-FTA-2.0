// Version and Cache Manager for Netlify Automatic Deployments and Cache Busting
// Guarantees zero stale index.html, auto-updates when safe, preserves drafts,
// unregisters old service workers and prevents reload loops and chunk white screens.

let isSubmissionActive = false;
let isFormActive = false;
let hasPendingDraftState = false;

const RELOAD_VERSION_KEY = "gemba_reloaded_version";
const CHUNK_RELOAD_KEY = "gemba_chunk_reload_version";

type VersionListener = (info: {
  currentVersion: string;
  serverVersion: string | null;
  hasUpdate: boolean;
  canAutoReload: boolean;
}) => void;

const listeners = new Set<VersionListener>();
let currentServerVersion: string | null = null;
let updateAvailable = false;
let intervalId: any = null;

export function getCurrentVersion(): string {
  if (typeof __APP_BUILD_VERSION__ !== "undefined") {
    return __APP_BUILD_VERSION__;
  }
  return "dev";
}

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg = String((error as any)?.message || error || "");
  const name = String((error as any)?.name || "");
  return (
    name === "ChunkLoadError" ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("vite:preloadError") ||
    msg.includes("Unable to preload CSS")
  );
}

export function setSubmissionState(state: "idle" | "validating" | "saving" | "saved" | "error" | "confirming"): void {
  isSubmissionActive = state === "validating" || state === "saving" || state === "confirming";
}

export function setFormActive(active: boolean): void {
  isFormActive = active;
}

export function setHasPendingDraft(hasDraft: boolean): void {
  hasPendingDraftState = hasDraft;
}

export function getSubmissionActive(): boolean {
  return isSubmissionActive;
}

export function getFormActive(): boolean {
  return isFormActive;
}

export function getHasPendingDraft(): boolean {
  return hasPendingDraftState;
}

export function subscribeVersionChanges(listener: VersionListener): () => void {
  listeners.add(listener);
  listener({
    currentVersion: getCurrentVersion(),
    serverVersion: currentServerVersion,
    hasUpdate: updateAvailable,
    canAutoReload: !isSubmissionActive && !isFormActive && !hasPendingDraftState
  });
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(): void {
  const current = getCurrentVersion();
  const canAuto = !isSubmissionActive && !isFormActive && !hasPendingDraftState;
  listeners.forEach(fn => {
    try {
      fn({
        currentVersion: current,
        serverVersion: currentServerVersion,
        hasUpdate: updateAvailable,
        canAutoReload: canAuto
      });
    } catch {
      // Ignore listener error
    }
  });
}

// 1. Cleanup old service workers and Cache API from previous deployments
// Strictly preserves localStorage, IndexedDB, Firebase offline and draft stores!
export async function cleanupOldServiceWorkersAndCaches(): Promise<void> {
  if (typeof window === "undefined") return;

  // Unregister service workers only on current origin/domain
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
        console.log("[VersionManager] Service Worker antigo desregistrado com sucesso.");
      }
    } catch (err) {
      console.warn("[VersionManager] Aviso ao desregistrar service worker:", err);
    }
  }

  // Clear Cache API items belonging to this app
  if ("caches" in window) {
    try {
      const keys = await window.caches.keys();
      for (const key of keys) {
        await window.caches.delete(key);
        console.log(`[VersionManager] Cache antigo removido: ${key}`);
      }
    } catch (err) {
      console.warn("[VersionManager] Aviso ao limpar Cache API:", err);
    }
  }
}

// 2. Consult /version.json?timestamp=DATA_ATUAL with cache: "no-store"
export async function fetchServerVersion(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const timestamp = Date.now();
    const response = await fetch(`/version.json?timestamp=${timestamp}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache"
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return typeof data?.version === "string" ? data.version.trim() : null;
  } catch (err) {
    // Network down or offline
    return null;
  }
}

// 3. Process version comparison and perform safe update
export async function checkVersionAndMaybeReload(forceManual = false): Promise<boolean> {
  const current = getCurrentVersion();
  const server = await fetchServerVersion();

  if (!server) {
    return false;
  }

  currentServerVersion = server;

  // Compare loaded version with server version
  if (server !== current) {
    updateAvailable = true;
    notifyListeners();

    // Check if we are currently submitting an inspection
    // NEVER reload during validating, saving or confirming!
    if (isSubmissionActive && !forceManual) {
      console.log("[VersionManager] Atualização retida: envio de inspeção em andamento.");
      return false;
    }

    // Check if form is open or draft is pending
    if ((isFormActive || hasPendingDraftState) && !forceManual) {
      console.log("[VersionManager] Atualização retida: formulário ou rascunho em aberto.");
      return false;
    }

    // Prevent infinite reload loops via sessionStorage
    let lastReloaded: string | null = null;
    try {
      lastReloaded = window.sessionStorage?.getItem(RELOAD_VERSION_KEY) || null;
    } catch {
      // sessionStorage unavailable
    }

    if (lastReloaded === server && !forceManual) {
      console.log("[VersionManager] Recarregamento automático já executado para esta versão. Evitando loop.");
      return false;
    }

    // Safe to reload automatically once
    try {
      window.sessionStorage?.setItem(RELOAD_VERSION_KEY, server);
    } catch {
      // Ignore
    }

    console.log(`[VersionManager] Aplicando atualização: ${current} -> ${server}`);
    if (typeof window !== "undefined") {
      window.location.reload();
      return true;
    }
  } else {
    updateAvailable = false;
    notifyListeners();
  }

  return false;
}

// 4. Handle Chunk Load Errors safely
export function handleChunkLoadError(error: unknown): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(error)) {
    return false;
  }

  // Never reload during active submission
  if (isSubmissionActive) {
    return false;
  }

  let chunkReloaded: string | null = null;
  try {
    chunkReloaded = window.sessionStorage?.getItem(CHUNK_RELOAD_KEY) || null;
  } catch {
    // Ignore
  }

  const current = getCurrentVersion();
  if (chunkReloaded !== current) {
    try {
      window.sessionStorage?.setItem(CHUNK_RELOAD_KEY, current);
    } catch {
      // Ignore
    }
    console.warn("[VersionManager] Erro de chunk detectado. Executando recarregamento único...");
    window.location.reload();
    return true;
  }

  // Reload already attempted for this build. Return false so ErrorBoundary renders friendly recovery UI.
  return false;
}

// 5. Initialize listeners and periodic check
export function startVersionManager(intervalMs = 60000): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  // Cleanup old service workers & Cache API on startup
  cleanupOldServiceWorkersAndCaches();

  // Listen for Vite preload error
  const onPreloadError = (event: Event) => {
    event.preventDefault();
    handleChunkLoadError((event as any)?.payload || new Error("vite:preloadError"));
  };
  window.addEventListener("vite:preloadError", onPreloadError as EventListener);

  // Global error listener for chunk errors
  const onGlobalError = (event: ErrorEvent) => {
    if (isChunkLoadError(event.error || event.message)) {
      handleChunkLoadError(event.error || event.message);
    }
  };
  window.addEventListener("error", onGlobalError);

  // Initial check shortly after boot
  const initialTimer = setTimeout(() => {
    checkVersionAndMaybeReload().catch(() => {});
  }, 3000);

  // Periodic check
  if (intervalMs > 0) {
    intervalId = setInterval(() => {
      checkVersionAndMaybeReload().catch(() => {});
    }, intervalMs);
  }

  // Also check on tab focus / visibilitychange
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      checkVersionAndMaybeReload().catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    clearTimeout(initialTimer);
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    window.removeEventListener("vite:preloadError", onPreloadError as EventListener);
    window.removeEventListener("error", onGlobalError);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
