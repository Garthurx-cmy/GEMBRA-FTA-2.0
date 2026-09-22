import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  getCurrentVersion,
  isChunkLoadError,
  setSubmissionState,
  setFormActive,
  setHasPendingDraft,
  getSubmissionActive,
  getFormActive,
  getHasPendingDraft,
  cleanupOldServiceWorkersAndCaches,
  checkVersionAndMaybeReload,
  handleChunkLoadError
} from "../src/utils/versionManager";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { saveInspectionDraft, getInspectionDraft } from "../src/utils/draftStorage";

// Mock environments for DOM, window, storage and network
function setupTestEnvironment(initialVersion = "build-1000", serverVersion = "build-1000") {
  const sessionStorageMap = new Map<string, string>();
  const localStorageMap = new Map<string, string>();
  const cacheMap = new Map<string, any>();
  const unregisterCalls: string[] = [];
  let reloadCount = 0;
  let currentServerVer = serverVersion;

  (globalThis as any).__APP_BUILD_VERSION__ = initialVersion;

  const mockWindow: any = {
    location: {
      href: "https://gembafta20.netlify.app",
      reload: () => {
        reloadCount++;
      }
    },
    sessionStorage: {
      getItem: (k: string) => sessionStorageMap.get(k) ?? null,
      setItem: (k: string, v: string) => sessionStorageMap.set(k, String(v)),
      removeItem: (k: string) => sessionStorageMap.delete(k),
      clear: () => sessionStorageMap.clear()
    },
    localStorage: {
      getItem: (k: string) => localStorageMap.get(k) ?? null,
      setItem: (k: string, v: string) => localStorageMap.set(k, String(v)),
      removeItem: (k: string) => localStorageMap.delete(k),
      clear: () => localStorageMap.clear()
    },
    caches: {
      keys: async () => Array.from(cacheMap.keys()),
      delete: async (key: string) => {
        cacheMap.delete(key);
        return true;
      }
    },
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const mockNavigator: any = {
    serviceWorker: {
      getRegistrations: async () => [
        {
          unregister: async () => {
            unregisterCalls.push("sw-registered");
            return true;
          }
        }
      ]
    }
  };

  // Global fetch mock
  (globalThis as any).fetch = async (url: string, options: any) => {
    if (url.includes("/version.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ version: currentServerVer })
      };
    }
    return { ok: false, status: 404 };
  };

  (globalThis as any).window = mockWindow;
  try {
    Object.defineProperty(globalThis, "navigator", {
      value: mockNavigator,
      configurable: true,
      writable: true
    });
  } catch {
    // If not reconfigurable, assign properties directly
    Object.assign((globalThis as any).navigator, mockNavigator);
  }
  (globalThis as any).sessionStorage = mockWindow.sessionStorage;
  (globalThis as any).localStorage = mockWindow.localStorage;

  return {
    sessionStorageMap,
    localStorageMap,
    cacheMap,
    unregisterCalls,
    getReloadCount: () => reloadCount,
    setServerVersion: (v: string) => {
      currentServerVer = v;
    }
  };
}

test("Cenário 23: Abrir a versão anterior e simular publicação de uma nova versão", async () => {
  const env = setupTestEnvironment("build-v1-old", "build-v1-old");
  assert.equal(getCurrentVersion(), "build-v1-old", "Versão inicial deve ser a antiga v1");

  // Simula publicação de uma nova versão no servidor
  env.setServerVersion("build-v2-new");
  assert.notEqual(getCurrentVersion(), "build-v2-new", "Cliente ainda está na v1 enquanto servidor publicou v2");
});

test("Cenário 24: Confirmar que a aplicação detecta o novo build", async () => {
  const env = setupTestEnvironment("build-v1-old", "build-v2-new");
  setSubmissionState("idle");
  setFormActive(false);
  setHasPendingDraft(false);

  const reloaded = await checkVersionAndMaybeReload();
  assert.equal(reloaded, true, "Aplicação deve detectar novo build e disparar reload de atualização");
  assert.equal(env.getReloadCount(), 1, "Reload deve ter sido executado exatamente uma vez");
});

test("Cenário 25: Confirmar atualização automática quando não há formulário aberto", async () => {
  const env = setupTestEnvironment("build-v1-old", "build-v2-new");
  setSubmissionState("idle");
  setFormActive(false);
  setHasPendingDraft(false);

  assert.equal(getFormActive(), false, "Não há formulário aberto");
  assert.equal(getSubmissionActive(), false, "Não há envio ativo");
  assert.equal(getHasPendingDraft(), false, "Não há rascunho pendente");

  const reloaded = await checkVersionAndMaybeReload();
  assert.equal(reloaded, true, "Atualização automática deve ser executada quando ambiente está ocioso");
  assert.equal(env.getReloadCount(), 1);
});

test("Cenário 26: Confirmar que não recarrega durante um lançamento (validating, saving, confirming)", async () => {
  const env = setupTestEnvironment("build-v1-old", "build-v2-new");

  // 1. Estado validating
  setFormActive(true);
  setSubmissionState("validating");
  assert.equal(getSubmissionActive(), true);
  let reloaded = await checkVersionAndMaybeReload();
  assert.equal(reloaded, false, "Não deve recarregar no estado validating");
  assert.equal(env.getReloadCount(), 0);

  // 2. Estado saving
  setSubmissionState("saving");
  reloaded = await checkVersionAndMaybeReload();
  assert.equal(reloaded, false, "Não deve recarregar no estado saving");
  assert.equal(env.getReloadCount(), 0);

  // 3. Estado confirming
  setSubmissionState("confirming");
  reloaded = await checkVersionAndMaybeReload();
  assert.equal(reloaded, false, "Não deve recarregar no estado confirming");
  assert.equal(env.getReloadCount(), 0);
});

test("Cenário 27: Confirmar que o rascunho permanece salvo durante a atualização", async () => {
  const env = setupTestEnvironment("build-v1-old", "build-v2-new");
  const testUserId = "user-draft-test";
  const draftData: any = {
    userId: testUserId,
    descricao: "Inspeção em andamento que deve ser preservada",
    atividade: "DSS",
    data: "2026-09-22"
  };

  await saveInspectionDraft(testUserId, draftData, undefined);
  setFormActive(true);
  setHasPendingDraft(true);

  // Auto-reload retido por haver rascunho
  const autoReloaded = await checkVersionAndMaybeReload();
  assert.equal(autoReloaded, false, "Auto-reload não pode ocorrer com rascunho aberto");

  // Rascunho permanece íntegro no storage
  const restoredDraft = await getInspectionDraft(testUserId, undefined);
  assert.ok(restoredDraft, "Rascunho deve existir");
  assert.equal(restoredDraft?.descricao, draftData.descricao, "Conteúdo do rascunho deve ser idêntico");

  // Quando o usuário optar por atualizar manualmente
  const manualReloaded = await checkVersionAndMaybeReload(true);
  assert.equal(manualReloaded, true, "Atualização manual dispara");

  // Rascunho continua intacto após a atualização
  const draftAfterReload = await getInspectionDraft(testUserId, undefined);
  assert.equal(draftAfterReload?.descricao, draftData.descricao, "Rascunho continua intacto após reload");
});

test("Cenário 28: Confirmar que erro de chunk não produz tela branca", () => {
  setupTestEnvironment("build-v1", "build-v1");

  const chunkError = new Error("Failed to fetch dynamically imported module: https://gembafta20.netlify.app/assets/chunk-abc.js");
  assert.equal(isChunkLoadError(chunkError), true, "Deve identificar erro de chunk");

  // Testa diretamente o ciclo getDerivedStateFromError e render do ErrorBoundary
  const boundary = new ErrorBoundary({ fallbackTitle: "Erro de teste", children: null });
  const derivedState = ErrorBoundary.getDerivedStateFromError(chunkError);
  (boundary as any).state = derivedState;

  const rendered = boundary.render() as React.ReactElement;
  const html = renderToString(rendered);

  assert.ok(html.includes("error-boundary-chunk-fallback"), "Deve renderizar fallback de erro de chunk");
  assert.ok(html.includes("Uma nova versão do sistema foi publicada. Clique para atualizar."), "Deve conter mensagem amigável");
  assert.ok(html.includes("Atualizar sistema"), "Deve conter botão 'Atualizar sistema'");
  assert.ok(!html.includes("crash"), "Não pode emitir tela branca");
});


test("Cenário 29: Confirmar que não ocorre loop de reload", async () => {
  const env = setupTestEnvironment("build-v1-old", "build-v2-new");
  setSubmissionState("idle");
  setFormActive(false);
  setHasPendingDraft(false);

  // Primeiro reload
  const firstReload = await checkVersionAndMaybeReload();
  assert.equal(firstReload, true, "Primeiro reload deve ser acionado");
  assert.equal(env.getReloadCount(), 1);

  // Segunda chamada para a mesma versão do servidor
  const secondReload = await checkVersionAndMaybeReload();
  assert.equal(secondReload, false, "Segunda verificação não pode reexecutar reload para evitar loop");
  assert.equal(env.getReloadCount(), 1, "Contador de reload deve continuar em 1");
});

test("Cenário 30: Confirmar que o mesmo link do Netlify apresenta a versão nova", () => {
  const netlifyTomlPath = path.resolve(process.cwd(), "netlify.toml");
  const netlifyContent = fs.readFileSync(netlifyTomlPath, "utf-8");

  // Headers obrigatórios
  assert.ok(netlifyContent.includes('for = "/index.html"'), "Deve configurar headers para index.html");
  assert.ok(netlifyContent.includes("Cache-Control = \"no-cache, no-store, must-revalidate\""), "index.html com no-cache");
  assert.ok(netlifyContent.includes('for = "/version.json"'), "Deve configurar headers para version.json");
  assert.ok(netlifyContent.includes('for = "/assets/*"'), "Deve configurar cache imutável para assets com hash");
  assert.ok(netlifyContent.includes("max-age=31536000, immutable"), "Assets devem ter max-age longo");
  assert.ok(netlifyContent.includes('to = "/index.html"'), "Redirecionamento SPA preservado");
});

test("Cenário 31: Confirmar que localStorage e IndexedDB dos rascunhos não foram apagados", async () => {
  const env = setupTestEnvironment("build-v1", "build-v1");
  env.cacheMap.set("old-app-cache-v1", { cached: true });

  // Cria dados de rascunho e sessão em localStorage
  env.localStorageMap.set("gemba_user_session", "session-token-123");
  await saveInspectionDraft("user-persistent", {
    userId: "user-persistent",
    descricao: "Rascunho importante que não pode sumir",
    data: "2026-09-22"
  } as any, undefined);

  // Executa limpeza de service worker e Cache API
  await cleanupOldServiceWorkersAndCaches();

  // Service worker antigo foi desregistrado
  assert.equal(env.unregisterCalls.length, 1, "Service worker deve ser desregistrado");

  // Cache API antigo foi excluído
  assert.equal(env.cacheMap.size, 0, "Cache API antigo foi expurgado");

  // LocalStorage e IndexedDB permanecem intocados!
  assert.equal(env.localStorageMap.get("gemba_user_session"), "session-token-123", "LocalStorage não pode ser apagado");
  const draft = await getInspectionDraft("user-persistent", undefined);
  assert.ok(draft, "Rascunho de inspeção no IndexedDB/storage permanece íntegro");
});

test("Cenário 32: Confirmar que o usuário não precisa limpar o cache manualmente", async () => {
  const env = setupTestEnvironment("build-v1-old", "build-v2-new");
  setSubmissionState("idle");
  setFormActive(false);
  setHasPendingDraft(false);

  // Detecção e atualização acontecem de forma 100% autônoma
  const updated = await checkVersionAndMaybeReload();
  assert.equal(updated, true, "Atualização executada sem intervenção do usuário");
  assert.equal(env.sessionStorageMap.get("gemba_reloaded_version"), "build-v2-new", "Versão atualizada gravada na sessão");
});
