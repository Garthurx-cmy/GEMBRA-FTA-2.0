/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { auth, db } from "./services/firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail, updatePassword } from "firebase/auth";
import { doc, getDoc, onSnapshot, updateDoc as fbUpdateDoc, serverTimestamp } from "firebase/firestore";

const updateDoc = async (ref: any, data: any) => {
  if (process.env.NODE_ENV !== "production") {
    const path = ref && typeof ref.path === "string" ? ref.path : "unknown-path";
    console.trace("[FIRESTORE WRITE]", path, "updateDoc", data);
  }
  return fbUpdateDoc(ref, data);
};
import { dbService, normalizeUserProfile, hasLegacyUppercaseFields } from "./services/db";
import { buildUnifiedSupervisors, resolveSupervisorName } from "./utils/supervisors";
import {
  Inspection,
  Supervisor,
  Area,
  Contract,
  SystemConfig,
  UserProfile,
  InspectionStatus,
  GrupoContrato,
  GrupoContratoFiltro,
  getTipoLancamento,
  TIPO_LANCAMENTO_CONFIG,
  AppNotification
} from "./types";
import Sidebar from "./components/Sidebar";
import DashboardView from "./components/DashboardView";
import LancarInspecaoView from "./components/LancarInspecaoView";
import HistoricoView from "./components/HistoricoView";
import RankingView from "./components/RankingView";
import RelatoriosView from "./components/RelatoriosView";
import ExportacoesView from "./components/ExportacoesView";
import ConfiguracoesView from "./components/ConfiguracoesView";
import ResolvedImage from "./components/ResolvedImage";
import { CheckCircle, AlertCircle, Building2, Bell, Search, FileText, X, ExternalLink, Eye, EyeOff } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Preserve legacy browser data for incident analysis; do not import it into Firestore.

  // --- DATABASE STATES ---
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [config, setConfig] = useState<SystemConfig>(dbService.getConfig());
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  // --- VISIBILITY & SYNC STATES ---
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isVisible, setIsVisible] = useState(document.visibilityState === "visible");
  const [inspectionSyncInfo, setInspectionSyncInfo] = useState(() => dbService.getInspectionSyncInfo());
  const isSyncing = inspectionSyncInfo.status === "loading" || inspectionSyncInfo.status === "cache" || inspectionSyncInfo.status === "pending";

  // --- SPECIAL INTERACTIVE STATES ---
  const [editingInspection, setEditingInspection] = useState<Inspection | null>(null);
  const [reportSelectedInspectionId, setReportSelectedInspectionId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // --- GLOBAL SEARCH, MONTH & CONTRACT GROUP FILTER STATES ---
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [viewingGlobalInspection, setViewingGlobalInspection] = useState<Inspection | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("auto");
  const [grupoContratoSelecionado, setGrupoContratoSelecionadoState] = useState<GrupoContratoFiltro>("todos");

  const permittedGruposContrato: GrupoContrato[] = useMemo(() => {
    if (!currentUser) return ["vale", "vli"];
    if (currentUser.gruposContratoPermitidos && currentUser.gruposContratoPermitidos.length > 0) {
      return currentUser.gruposContratoPermitidos;
    }
    return ["vale", "vli"];
  }, [currentUser]);

  // Sync default or stored preference when currentUser changes
  useEffect(() => {
    if (!currentUser) return;
    const permitted = permittedGruposContrato;
    const storageKey = `gemba_selected_contract_${currentUser.id}`;
    let saved: GrupoContratoFiltro | null = null;
    try {
      saved = localStorage.getItem(storageKey) as GrupoContratoFiltro | null;
    } catch (_) {}

    if (permitted.length === 1) {
      setGrupoContratoSelecionadoState(permitted[0]);
    } else if (saved && (saved === "todos" || saved === "vale" || saved === "vli")) {
      setGrupoContratoSelecionadoState(saved);
    } else {
      setGrupoContratoSelecionadoState("todos");
    }
  }, [currentUser?.id, permittedGruposContrato]);

  const setGrupoContratoSelecionado = (novoGrupo: GrupoContratoFiltro) => {
    if (currentUser) {
      const storageKey = `gemba_selected_contract_${currentUser.id}`;
      try {
        localStorage.setItem(storageKey, novoGrupo);
      } catch (_) {}
    }
    setGrupoContratoSelecionadoState(novoGrupo);
  };

  // Unified operational supervisors (collection supervisors + operational users + currentUser + history)
  const unifiedSupervisors = useMemo(() => {
    return buildUnifiedSupervisors(supervisors, users, currentUser, inspections);
  }, [supervisors, users, currentUser, inspections]);

  const globalSearchResults = useMemo(() => {
    const term = globalSearchTerm.trim().toLowerCase();
    if (!term) return [];
    return inspections.filter((insp) => {
      const sup = resolveSupervisorName(insp.supervisorId, unifiedSupervisors, users, currentUser, dbService.getDeletedNames());
      const contract = contracts.find((c) => c.id === insp.contratoId) || (dbService.getDeletedNames()[insp.contratoId] ? { id: insp.contratoId, codigo: dbService.getDeletedNames()[insp.contratoId], nome: dbService.getDeletedNames()[insp.contratoId], ativo: false } : undefined);
      const contractCode = contract ? contract.codigo : "";
      const contractName = contract ? contract.nome : "";
      const area = areas.find((a) => a.id === insp.areaId)?.nome || dbService.getDeletedNames()[insp.areaId] || "";
      const typeName = getTipoLancamento(insp.atividade, insp.tipo);
      
      return (
        insp.id.toLowerCase().includes(term) ||
        insp.descricao.toLowerCase().includes(term) ||
        sup.toLowerCase().includes(term) ||
        contractCode.toLowerCase().includes(term) ||
        contractName.toLowerCase().includes(term) ||
        area.toLowerCase().includes(term) ||
        typeName.toLowerCase().includes(term)
      );
    });
  }, [globalSearchTerm, inspections, unifiedSupervisors, users, currentUser, contracts, areas]);

  // Fetch / Sync all local states with Database Service
  const refreshDatabaseStates = () => {
    setInspections(dbService.getInspections());
    setInspectionSyncInfo(dbService.getInspectionSyncInfo());
    setSupervisors(dbService.getSupervisors());
    setAreas(dbService.getAreas());
    setContracts(dbService.getContracts());
    setUsers(dbService.getUsers());
    setConfig(dbService.getConfig());
    setNotifications(dbService.getNotifications());
  };

  useEffect(() => {
    const handleDbUpdate = () => refreshDatabaseStates();
    window.addEventListener("gemba_fta_db_update", handleDbUpdate);
    return () => window.removeEventListener("gemba_fta_db_update", handleDbUpdate);
  }, []);

  // Centralized Visibility, Online, and Tab Page event listeners
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === "visible");
    };

    const handlePageShow = () => {
      setIsVisible(true);
    };

    const handlePageHide = () => {
      setIsVisible(false);
    };

    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // HMR Dispose listener for development
    if ((import.meta as any).hot) {
      (import.meta as any).hot.dispose(() => {
        dbService.stopSync(false);
      });
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Keep listeners attached through tab/visibility changes. Firebase handles reconnects.
  const syncPermissions = JSON.stringify(currentUser?.gruposContratoPermitidos || []);
  useEffect(() => {
    if (!currentUser || currentUser.ativo === false) {
      dbService.stopSync(true);
      refreshDatabaseStates();
      return;
    }
    dbService.startSync(currentUser);
    refreshDatabaseStates();
    return () => dbService.stopSync(true);
  }, [currentUser?.id, currentUser?.perfil, currentUser?.ativo, syncPermissions]);

  // Firebase Authentication is the only session source. Firestore listeners start
  // only after authentication, avoiding permission errors on the login screen.
  useEffect(() => {
    if (!auth || !db) {
      setLoginError("Firebase não está configurado corretamente.");
      setAuthLoading(false);
      return;
    }

    let profileUnsubscribe: (() => void) | null = null;
    let authTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const clearAuthTimeout = () => {
      if (authTimeoutId !== null) {
        clearTimeout(authTimeoutId);
        authTimeoutId = null;
      }
    };

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        clearAuthTimeout();
        if (profileUnsubscribe) {
          profileUnsubscribe();
          profileUnsubscribe = null;
        }

        if (!firebaseUser) {
          dbService.stopSync(true);
          setCurrentUser(null);
          setAuthLoading(false);
          return;
        }

        // 1. Check offline local cache for fast startup
        const cacheKey = `gemba_profile_${firebaseUser.uid}`;
        let hasValidCache = false;
        try {
          const cachedRaw = localStorage.getItem(cacheKey);
          if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw);
            if (parsed && parsed.id === firebaseUser.uid && parsed.ativo !== false) {
              setCurrentUser(parsed);
              setAuthLoading(false);
              hasValidCache = true;
            }
          }
        } catch (e) {
          console.warn("Erro ao ler perfil do cache local:", e);
        }

        // 2. Only show loading if we do not have a valid cached profile
        if (!hasValidCache) {
          setAuthLoading(true);
        }

        // 3. Safety timeout of 8 seconds to prevent infinite "Verificando sessão..."
        authTimeoutId = setTimeout(() => {
          authTimeoutId = null;
          let fallbackProfile: UserProfile | null = null;
          try {
            const cachedRaw = localStorage.getItem(cacheKey);
            if (cachedRaw) {
              const parsed = JSON.parse(cachedRaw);
              if (parsed && parsed.id === firebaseUser.uid && parsed.ativo !== false) {
                fallbackProfile = parsed;
              }
            }
          } catch (_) {}

          if (fallbackProfile) {
            setCurrentUser(fallbackProfile);
            setAuthLoading(false);
          } else {
            setAuthLoading(false);
            setLoginError("Não foi possível verificar sua sessão. Confira a conexão e tente entrar novamente.");
          }
        }, 8000);

        // 4. Subscribe to user profile document via onSnapshot for real-time and offline tolerance
        const userDocRef = doc(db, "users", firebaseUser.uid);
        profileUnsubscribe = onSnapshot(
          userDocRef,
          async (profileSnap) => {
            clearAuthTimeout();
            try {
              if (!profileSnap.exists()) {
                console.warn("Perfil não encontrado no Firestore para UID:", firebaseUser.uid);
                localStorage.removeItem(cacheKey);
                await signOut(auth);
                setLoginError("Conta autenticada, mas o perfil de acesso não foi encontrado. Procure o administrador.");
                setAuthLoading(false);
                return;
              }

              const rawProfileData: any = profileSnap.data();
              if (hasLegacyUppercaseFields(rawProfileData)) {
                console.warn("Aviso: Perfil do usuário contém campos legados em maiúsculas.", rawProfileData);
              }
              const profile: UserProfile = normalizeUserProfile(rawProfileData, profileSnap.id);

              if (profile.ativo === false) {
                localStorage.removeItem(cacheKey);
                await signOut(auth);
                setLoginError("Seu acesso está inativo. Procure o administrador.");
                setAuthLoading(false);
                return;
              }

              // Save valid active profile in local storage
              try {
                localStorage.setItem(cacheKey, JSON.stringify(profile));
              } catch (_) {}

              setCurrentUser(profile);
              setLoginError(null);
              setAuthLoading(false);

              // Update ultimoLogin if more than 24h passed
              let shouldUpdateLogin = true;
              if (profile.ultimoLogin) {
                try {
                  let lastLoginDate: Date | null = null;
                  if (profile.ultimoLogin && typeof profile.ultimoLogin.toDate === "function") {
                    lastLoginDate = profile.ultimoLogin.toDate();
                  } else if (profile.ultimoLogin && typeof profile.ultimoLogin === "object" && (profile.ultimoLogin as any).seconds) {
                    lastLoginDate = new Date((profile.ultimoLogin as any).seconds * 1000);
                  } else if (profile.ultimoLogin) {
                    lastLoginDate = new Date(profile.ultimoLogin);
                  }
                  if (lastLoginDate && !isNaN(lastLoginDate.getTime())) {
                    const diffMs = Date.now() - lastLoginDate.getTime();
                    if (diffMs < 24 * 60 * 60 * 1000) {
                      shouldUpdateLogin = false;
                    }
                  }
                } catch (e) {
                  console.warn("Erro ao ler ultimoLogin do perfil:", e);
                }
              }

              if (shouldUpdateLogin) {
                updateDoc(userDocRef, { ultimoLogin: serverTimestamp() }).catch(() => undefined);
              }
              setTimeout(refreshDatabaseStates, 100);
            } catch (err: any) {
              console.error("Erro ao processar dados de perfil:", err);
              setAuthLoading(false);
            }
          },
          async (error: any) => {
            clearAuthTimeout();
            console.warn("Aviso na escuta do documento de perfil:", error);
            const isPermissionError =
              error?.code === "permission-denied" ||
              error?.message?.toLowerCase().includes("permission") ||
              error?.message?.toLowerCase().includes("insufficient");

            if (isPermissionError) {
              localStorage.removeItem(cacheKey);
              await signOut(auth);
              setLoginError("Foi encontrada uma inconsistência no perfil de acesso. Procure o administrador.");
              setAuthLoading(false);
              return;
            }

            // In case of network / offline issues, use cached profile if available
            try {
              const cachedRaw = localStorage.getItem(cacheKey);
              if (cachedRaw) {
                const parsed = JSON.parse(cachedRaw);
                if (parsed && parsed.id === firebaseUser.uid && parsed.ativo !== false) {
                  setCurrentUser(parsed);
                  setAuthLoading(false);
                  return;
                }
              }
            } catch (_) {}

            setAuthLoading(false);
            setLoginError("Não foi possível verificar sua sessão. Confira a conexão e tente entrar novamente.");
          }
        );
      },
      (error: any) => {
        clearAuthTimeout();
        console.error("Erro ao verificar autenticação:", error);
        setCurrentUser(null);
        setAuthLoading(false);
        setLoginError("Falha ao verificar a autenticação. Confira a conexão e tente novamente.");
      }
    );

    return () => {
      clearAuthTimeout();
      if (profileUnsubscribe) {
        profileUnsubscribe();
      }
      unsubscribe();
    };
  }, []);

  const triggerAlert = (text: string, type: "success" | "error" = "success") => {
    setAlertMessage({ text, type });
    setTimeout(() => setAlertMessage(null), 4000);
  };

  const handleMarkAsRead = (id: string) => {
    dbService.markNotificationAsRead(id);
    refreshDatabaseStates();
  };

  const handleMarkAllAsRead = () => {
    dbService.markAllNotificationsAsRead();
    refreshDatabaseStates();
  };

  // --- CORE WORKFLOW HANDLERS ---

  // Lançar / Editar Save
  const handleSaveInspection = async (inspection: Inspection) => {
    try {
      await dbService.saveInspection(inspection);
      refreshDatabaseStates();
      triggerAlert(editingInspection ? "Inspeção atualizada com sucesso!" : "Nova inspeção GEMBA lançada com sucesso!");
    } catch (error: any) {
      console.error(error);
      triggerAlert(error?.message || "Não foi possível salvar a inspeção.", "error");
      throw error;
    }
  };

  // Delete Inspection
  const handleDeleteInspection = async (id: string) => {
    try {
      await dbService.deleteInspection(id);
      refreshDatabaseStates();
      triggerAlert("🗑️ Inspeção excluída com sucesso.", "success");
    } catch (error: any) {
      console.error(error);
      triggerAlert(error?.message || "Não foi possível excluir a inspeção.", "error");
    }
  };

  // Duplicate Inspection
  const handleDuplicateInspection = (inspection: Inspection) => {
    const duplicated: Inspection = {
      ...inspection,
      id: "insp_" + Math.random().toString(36).substring(2, 9),
      data: new Date().toISOString().split("T")[0], // Today
      descricao: inspection.descricao + " - CÓPIA",
      status: InspectionStatus.ABERTO, // Duplicate defaults back to open status
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    dbService.saveInspection(duplicated);
    refreshDatabaseStates();
    triggerAlert(`Inspeção duplicada com sucesso! Registro salvo sob ID: ${duplicated.id.toUpperCase()}`);
  };

  // Instantly mark inspection as completed
  const handleMarkAsDone = async (id: string) => {
    const found = inspections.find((i) => i.id === id);
    if (found) {
      const updated: Inspection = {
        ...found,
        status: InspectionStatus.CONCLUIDO,
        dataConclusao: found.dataConclusao || new Date().toISOString().split("T")[0],
        updatedAt: new Date().toISOString()
      };
      await dbService.saveInspection(updated);
      refreshDatabaseStates();
      triggerAlert("Medida corretiva registrada! Status alterado para Concluído.");
    }
  };

  // Open individual inspection report inside Relatorios View
  const handleSelectInspectionReport = async (id: string) => {
    setReportSelectedInspectionId(id);
    setActiveTab("relatorios");

    // On-demand loading of selected report if not already loaded in the preloaded inspections list
    const alreadyLoaded = inspections.some(i => i.id === id);
    if (!alreadyLoaded) {
      try {
        const fetched = await dbService.getInspectionById(id);
        if (fetched) {
          setInspections(prev => {
            if (prev.some(i => i.id === fetched.id)) return prev;
            return [fetched, ...prev];
          });
        }
      } catch (err) {
        console.error("Erro ao carregar relatório selecionado sob demanda:", err);
      }
    }
  };

  const handleEditInspectionInitiate = (inspection: Inspection) => {
    setEditingInspection(inspection);
    setActiveTab("lancar");
  };

  const handleCancelForm = () => {
    setEditingInspection(null);
    setActiveTab("historico");
  };

  // If no user is logged in, show the Login Portal
  const handleLoginByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setResetSuccessMsg("");
    const normalizedEmail = loginEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setLoginError("Por favor, preencha o e-mail de acesso.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setLoginError("O formato do e-mail informado é inválido.");
      return;
    }
    if (!loginPassword) {
      setLoginError("Por favor, preencha a senha.");
      return;
    }

    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, normalizedEmail, loginPassword);
    } catch (error: any) {
      console.warn("Erro ao realizar login:", error?.code || error?.message);
      if (
        error?.code === "auth/invalid-credential" ||
        error?.code === "auth/user-not-found" ||
        error?.code === "auth/wrong-password" ||
        error?.code === "auth/invalid-login-credentials"
      ) {
        setLoginError("Não foi possível entrar. Confira seu e-mail e senha ou utilize ‘Esqueci minha senha’.");
      } else if (error?.code === "auth/too-many-requests") {
        setLoginError("Muitas tentativas sem sucesso. Aguarde alguns minutos ou redefina sua senha.");
      } else if (error?.code === "auth/user-disabled") {
        setLoginError("Seu acesso está inativo. Procure o administrador.");
      } else if (error?.code === "auth/invalid-email") {
        setLoginError("O formato do e-mail informado é inválido.");
      } else if (error?.code === "auth/network-request-failed") {
        setLoginError("Falha de conexão com os serviços de autenticação. Verifique sua conexão com a internet.");
      } else {
        setLoginError("Não foi possível entrar. Confira seu e-mail e senha ou utilize ‘Esqueci minha senha’.");
      }
    }
  };

  const handlePasswordReset = async () => {
    setLoginError("");
    setResetSuccessMsg("");
    const normalizedEmail = loginEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setLoginError("Informe seu e-mail de acesso para recuperar a senha.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setLoginError("O formato do e-mail informado é inválido.");
      return;
    }

    setIsResettingPassword(true);
    try {
      const actionCodeSettings = {
        url: "https://gembafta20.netlify.app",
        handleCodeInApp: false
      };
      await sendPasswordResetEmail(auth, normalizedEmail, actionCodeSettings);
      setResetSuccessMsg(
        "Se existir uma conta cadastrada para este e-mail, enviaremos as instruções para redefinição da senha. Verifique também a caixa de spam."
      );
    } catch (error: any) {
      console.warn("Erro ao enviar redefinição de senha:", error?.code || error?.message);
      if (
        error?.code === "auth/user-not-found" ||
        error?.code === "auth/invalid-credential"
      ) {
        // Não expor se determinado e-mail está ou não cadastrado
        setResetSuccessMsg(
          "Se existir uma conta cadastrada para este e-mail, enviaremos as instruções para redefinição da senha. Verifique também a caixa de spam."
        );
      } else if (error?.code === "auth/invalid-email") {
        setLoginError("O formato do e-mail informado é inválido.");
      } else if (error?.code === "auth/too-many-requests") {
        setLoginError("Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.");
      } else if (error?.code === "auth/network-request-failed") {
        setLoginError("Falha de conexão com os serviços de autenticação. Verifique sua conexão com a internet.");
      } else if (
        error?.code === "auth/unauthorized-continue-uri" ||
        error?.code === "auth/domain-not-allowed" ||
        error?.message?.toLowerCase().includes("continue-uri") ||
        error?.message?.toLowerCase().includes("domain")
      ) {
        setLoginError("O domínio da aplicação (gembafta20.netlify.app) precisa ser adicionado aos Domínios Autorizados no Firebase Console.");
      } else {
        setLoginError("Ocorreu um erro ao processar a recuperação de senha. Tente novamente.");
      }
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleFirstPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    if (!newPassword || newPassword.length < 6) {
      setLoginError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setLoginError("As senhas não conferem. Verifique a confirmação digitada.");
      return;
    }
    if (!auth.currentUser || !currentUser) {
      setLoginError("Sessão não identificada. Entre novamente.");
      return;
    }

    setIsChangingPassword(true);
    try {
      // 1. Update password in Firebase Auth only
      await updatePassword(auth.currentUser, newPassword);

      // 2. Only after success, update Firestore document flags
      await updateDoc(doc(db, "users", currentUser.id), {
        primeiroAcesso: false,
        deveAlterarSenha: false,
        updatedAt: serverTimestamp()
      });

      // 3. Update local user state
      const updatedProfile = {
        ...currentUser,
        primeiroAcesso: false,
        deveAlterarSenha: false
      };
      setCurrentUser(updatedProfile);
      try {
        localStorage.setItem(`gemba_profile_${currentUser.id}`, JSON.stringify(updatedProfile));
      } catch (_) {}

      setNewPassword("");
      setConfirmPassword("");
      triggerAlert("Senha criada com sucesso! Seja bem-vindo.", "success");
    } catch (error: any) {
      console.error("Erro ao atualizar senha no Firebase Auth:", error);
      if (error?.code === "auth/requires-recent-login") {
        setLoginError("Por segurança, sua sessão expirou para troca de senha. Saia e entre novamente com sua senha temporária.");
      } else if (error?.code === "auth/weak-password") {
        setLoginError("A senha escolhida é muito fraca. Utilize letras, números ou caracteres especiais.");
      } else {
        setLoginError("Não foi possível alterar a senha. Tente novamente ou entre em contato com o suporte.");
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleConfirmAlreadyReset = async () => {
    if (!auth.currentUser || !currentUser) return;
    setLoginError("");
    setIsChangingPassword(true);
    try {
      await updateDoc(doc(db, "users", currentUser.id), {
        primeiroAcesso: false,
        deveAlterarSenha: false,
        updatedAt: serverTimestamp()
      });
      const updatedProfile = {
        ...currentUser,
        primeiroAcesso: false,
        deveAlterarSenha: false
      };
      setCurrentUser(updatedProfile);
      try {
        localStorage.setItem(`gemba_profile_${currentUser.id}`, JSON.stringify(updatedProfile));
      } catch (_) {}
      triggerAlert("Acesso confirmado com sucesso!", "success");
    } catch (error) {
      console.error("Erro ao confirmar acesso pós-redefinição:", error);
      setLoginError("Não foi possível confirmar o acesso. Por favor, cadastre uma nova senha nos campos acima.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (authLoading) {
    return <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#f8fafc] text-gray-500 gap-3"><div className="w-10 h-10 border-4 border-[#0B2E59] border-t-transparent rounded-full animate-spin"/><span className="text-xs font-semibold">Verificando sessão...</span></div>;
  }

  if (!currentUser) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0B2E59] p-4 relative overflow-hidden">
        {/* Subtle geometric circles in background */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#F58220]/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 space-y-6 border border-slate-100 relative z-10 animate-fade-in">
          {/* Logo Brand Header */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-48 h-16 flex items-center justify-center p-2 rounded-xl bg-slate-50 border border-slate-100">
              {config?.logoUrl ? (
                <img src={config.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
              ) : (
                <span className="font-bold text-[#0B2E59]">GEMBA FTA</span>
              )}
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-extrabold text-[#0B2E59] tracking-tight">Portal de Acesso GEMBA</h1>
              <p className="text-xs text-gray-500 font-medium">Acesse com seu e-mail e senha cadastrados</p>
            </div>
          </div>

          {/* Email login form */}
          <form onSubmit={handleLoginByEmail} className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">E-mail de Acesso</label>
              <input
                type="email"
                required
                placeholder="seu.email@grupofta.com.br"
                value={loginEmail}
                onChange={(e) => {
                  setLoginEmail(e.target.value);
                  setLoginError("");
                  setResetSuccessMsg("");
                }}
                className="bg-slate-50 border border-slate-200 focus:border-[#0B2E59] rounded-lg p-2.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] focus:bg-white transition-all font-medium"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Senha</label>
              <div className="relative flex items-center">
                <input
                  type={showLoginPassword ? "text" : "password"}
                  required
                  placeholder="Sua senha"
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    setLoginError("");
                  }}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-[#0B2E59] rounded-lg p-2.5 pr-10 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] focus:bg-white transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  aria-label={showLoginPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-[#0B2E59] rounded cursor-pointer transition-colors focus:outline-none"
                >
                  {showLoginPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <label className="flex items-center gap-2 text-gray-600 cursor-pointer">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> Lembrar de mim
              </label>
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={isResettingPassword}
                className="text-[#0B2E59] font-bold hover:underline disabled:opacity-50 cursor-pointer"
              >
                {isResettingPassword ? "Enviando..." : "Esqueci minha senha"}
              </button>
            </div>

            {loginError && (
              <p className="text-[11px] text-red-500 font-bold flex items-center gap-1 bg-red-50 p-2 rounded">
                <AlertCircle size={12} className="shrink-0" /> <span>{loginError}</span>
              </p>
            )}

            {resetSuccessMsg && (
              <p className="text-[11px] text-green-700 font-semibold flex items-start gap-1.5 bg-green-50 border border-green-200 p-2.5 rounded-lg">
                <CheckCircle size={14} className="shrink-0 mt-0.5 text-green-600" />
                <span>{resetSuccessMsg}</span>
              </p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-[#0B2E59] hover:bg-[#071f3e] text-white font-bold rounded-lg text-xs cursor-pointer transition-colors shadow-sm"
            >
              Entrar no Sistema
            </button>
          </form>

        </div>
      </div>
    );
  }

  if (currentUser && (currentUser.primeiroAcesso || currentUser.deveAlterarSenha)) {
    return (
      <div className="h-screen w-screen bg-[#0B2E59] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#F58220]/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md space-y-5 border border-slate-100 relative z-10 animate-fade-in">
          {/* Logo Brand Header */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-48 h-16 flex items-center justify-center p-2 rounded-xl bg-slate-50 border border-slate-100">
              {config?.logoUrl ? (
                <img src={config.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
              ) : (
                <span className="font-bold text-[#0B2E59]">GEMBA FTA</span>
              )}
            </div>
            <div className="space-y-1 mt-2">
              <h1 className="text-lg font-extrabold text-[#0B2E59] tracking-tight">Crie sua senha de acesso</h1>
              <p className="text-xs text-gray-500 font-medium">Por segurança, defina uma nova senha pessoal para continuar.</p>
            </div>
          </div>

          <form onSubmit={handleFirstPasswordChange} className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Nova Senha</label>
              <div className="relative flex items-center">
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setLoginError(""); }}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-[#0B2E59] rounded-lg p-2.5 pr-10 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] focus:bg-white transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(prev => !prev)}
                  aria-label={showNewPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-[#0B2E59] rounded cursor-pointer transition-colors focus:outline-none"
                >
                  {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Confirmar Nova Senha</label>
              <div className="relative flex items-center">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  placeholder="Repita a nova senha"
                  minLength={6}
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setLoginError(""); }}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-[#0B2E59] rounded-lg p-2.5 pr-10 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] focus:bg-white transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(prev => !prev)}
                  aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-[#0B2E59] rounded cursor-pointer transition-colors focus:outline-none"
                >
                  {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {loginError && (
              <p className="text-[11px] text-red-500 font-bold flex items-center gap-1 bg-red-50 p-2 rounded">
                <AlertCircle size={12} className="shrink-0" /> <span>{loginError}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={isChangingPassword}
              className="w-full py-2.5 bg-[#0B2E59] hover:bg-[#071f3e] disabled:opacity-50 text-white font-bold rounded-lg text-xs cursor-pointer transition-colors shadow-sm"
            >
              {isChangingPassword ? "Gravando nova senha..." : "Salvar nova senha e acessar"}
            </button>
          </form>

          {/* Fallback option for users who just reset password via email link */}
          <div className="pt-2 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={handleConfirmAlreadyReset}
              disabled={isChangingPassword}
              className="text-[11px] text-slate-500 hover:text-[#0B2E59] font-medium hover:underline cursor-pointer"
            >
              Já redefiniu sua senha pelo link de e-mail? <span className="font-bold text-[#0B2E59]">Clique aqui para continuar</span>
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={async () => {
                await signOut(auth);
                setCurrentUser(null);
              }}
              className="text-[11px] text-red-500 hover:underline font-bold cursor-pointer"
            >
              Cancelar e Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const sidebarWidth = sidebarCollapsed ? 64 : 224;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-gray-800 font-sans">
      {/* SIDEBAR NAVIGATION */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          // Clean selections if navigating away
          if (tab !== "lancar") setEditingInspection(null);
          if (tab !== "relatorios") setReportSelectedInspectionId(null);
        }}
        config={config}
        currentUser={currentUser}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        onLogout={async () => {
          await signOut(auth);
          dbService.stopSync(true);
          setCurrentUser(null);
          setActiveTab("dashboard");
          triggerAlert("Sessão encerrada com sucesso.", "success");
        }}
      />

      {/* MAIN CONTAINER WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        
        {/* APP GLOBAL TOP BAR */}
        <header
          id="app-header"
          className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between shrink-0 no-print"
        >
          {/* Left Title and Status */}
          <div className="flex items-center gap-3">
            <Building2 className="text-[#0B2E59]" size={18} />
            <div className="flex flex-col">
              <span className="font-extrabold text-xs text-[#0B2E59] tracking-wide uppercase">
                {config.nomeEmpresa}
              </span>
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                SISTEMA DE GESTÃO GEMBA
              </span>
            </div>
            {isSyncing && (
              <div className="ml-2.5 flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-full animate-pulse">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                <span className="text-[9px] text-blue-600 font-extrabold tracking-wider uppercase">Sincronizando...</span>
              </div>
            )}
          </div>

          {/* Centered Global Search Input */}
          <div className="flex-1 max-w-sm mx-6 relative hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={14} />
              <input
                type="text"
                placeholder="Busca Global (Supervisor, Contrato, ID...)"
                value={globalSearchTerm}
                onChange={(e) => setGlobalSearchTerm(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg pl-9 pr-8 py-2 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] focus:bg-white transition-all font-medium"
              />
              {globalSearchTerm && (
                <button
                  onClick={() => setGlobalSearchTerm("")}
                  className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Results popup overlay */}
            {globalSearchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100 font-medium">
                {globalSearchResults.map((insp) => {
                  const typeName = getTipoLancamento(insp.atividade, insp.tipo);
                  const conf = TIPO_LANCAMENTO_CONFIG[typeName];
                  const sup = resolveSupervisorName(insp.supervisorId, unifiedSupervisors, users, currentUser, dbService.getDeletedNames());

                  return (
                    <button
                      key={insp.id}
                      onClick={() => {
                        setViewingGlobalInspection(insp);
                        setGlobalSearchTerm("");
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center justify-between text-xs gap-3 transition-colors"
                    >
                      <div className="flex flex-col truncate">
                        <span className="font-extrabold text-[#0B2E59] text-[10px]">
                          ID: {insp.id.toUpperCase()} - {sup}
                        </span>
                        <span className="text-gray-500 truncate text-[11px] font-medium mt-0.5">
                          {insp.descricao}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shrink-0 border ${
                          conf ? `${conf.bgClass} ${conf.textClass} ${conf.borderClass}` : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {conf?.icon} {typeName.split(" ")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Meta info / Notifications */}
          <div className="flex items-center gap-4">
            {/* Quick alert bar */}
            {alertMessage && (
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 animate-fade-in ${
                  alertMessage.type === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {alertMessage.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {alertMessage.text}
              </div>
            )}

            <div className="relative">
              <button
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className="relative p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-all cursor-pointer flex items-center justify-center focus:outline-none border border-slate-100"
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[#F58220] text-white text-[9px] font-black h-5 w-5 rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {isNotificationOpen && (
                <>
                  <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsNotificationOpen(false)} />
                  <div
                    onMouseLeave={() => setIsNotificationOpen(false)}
                    className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100/80 z-50 overflow-hidden animate-fade-in"
                  >
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <span className="font-extrabold text-slate-800 text-xs">Notificações</span>
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllAsRead}
                          className="text-[10px] font-bold text-[#F58220] hover:underline cursor-pointer"
                        >
                          Marcar todas como lidas
                        </button>
                      )}
                    </div>

                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-1">
                        <Bell size={24} className="text-slate-200" />
                        <span className="font-bold">Nenhuma notificação</span>
                        <span>Você está atualizado!</span>
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                        {notifications.map((notif) => {
                          const hasLaunchType = !!notif.tipoLancamento;
                          return (
                            <div
                              key={notif.id}
                              onMouseEnter={() => handleMarkAsRead(notif.id)}
                              onClick={() => handleMarkAsRead(notif.id)}
                              className={`p-3 text-left transition-colors cursor-pointer select-none relative ${
                                notif.read
                                  ? "bg-white hover:bg-slate-50"
                                  : "bg-orange-50/30 hover:bg-orange-50/50 border-l-4 border-l-[#F58220]"
                              }`}
                            >
                              <div className="flex gap-2 items-start">
                                <span className="text-xs font-semibold text-slate-800 leading-tight">
                                  <span className="font-extrabold text-[#0B2E59]">{notif.userName}</span>{" "}
                                  <span className="text-slate-600 font-medium">{notif.action}</span>
                                </span>
                              </div>
                              
                              <div className="flex items-center justify-between mt-2">
                                {hasLaunchType && (
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-slate-100 text-slate-600">
                                    {notif.tipoLancamento}
                                  </span>
                                )}
                                <span className="text-[9px] text-slate-400 font-medium font-mono ml-auto">
                                  {notif.dataHora}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="text-right hidden md:block">
              <span className="text-xs font-bold text-gray-800 block leading-tight">
                {currentUser ? currentUser.nome : "Arthur Santos"}
              </span>
              <span className="text-[9px] text-[#F58220] font-black uppercase tracking-widest block mt-0.5">
                {currentUser ? currentUser.perfil : "Desenvolvedor do Sistema"}
              </span>
            </div>
          </div>
        </header>

        {/* SCREEN WORKSPACE INNER CONTAINER */}
        <main className="flex-1 overflow-y-auto px-4 pt-4 pb-20 md:pt-5 md:pb-20 print:p-0">
          <div className="max-w-7xl mx-auto h-full">

            {inspectionSyncInfo.status === "error" && (
              <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                Não foi possível confirmar o histórico no servidor ({inspectionSyncInfo.errorCode}). Os dados já recebidos foram mantidos.
                <button type="button" className="ml-3 underline font-bold" onClick={() => {
                  if (currentUser) { dbService.stopSync(false); dbService.startSync(currentUser); refreshDatabaseStates(); }
                }}>Tentar novamente</button>
              </div>
            )}
            {inspectionSyncInfo.receivedCount === 0 && inspectionSyncInfo.status !== "ready" && activeTab !== "lancar" && activeTab !== "configuracoes" ? (
              <p role="status" className="p-8 text-center text-slate-600">Aguardando confirmação do histórico. Ainda não é possível concluir que não existem inspeções.</p>
            ) : <>
            {activeTab === "dashboard" && (
              <DashboardView
                inspections={inspections}
                supervisors={unifiedSupervisors}
                areas={areas}
                contracts={contracts}
                selectedMonth={selectedMonth}
                onSelectMonth={setSelectedMonth}
                onEditInspection={handleEditInspectionInitiate}
                onSelectTab={setActiveTab}
                grupoContrato={grupoContratoSelecionado}
                onSelectGrupoContrato={setGrupoContratoSelecionado}
                permittedGruposContrato={permittedGruposContrato}
                currentUser={currentUser}
              />
            )}

            {activeTab === "lancar" && currentUser?.perfil !== "visitante" && (
              <LancarInspecaoView
                supervisors={unifiedSupervisors}
                areas={areas}
                contracts={contracts}
                config={config}
                editingInspection={editingInspection}
                onSave={handleSaveInspection}
                onCancel={handleCancelForm}
                currentUser={currentUser}
              />
            )}

            {activeTab === "historico" && (
              <HistoricoView
                inspections={inspections}
                supervisors={unifiedSupervisors}
                areas={areas}
                contracts={contracts}
                selectedMonth={selectedMonth}
                onSelectMonth={setSelectedMonth}
                onEdit={handleEditInspectionInitiate}
                onDelete={handleDeleteInspection}
                onMarkAsDone={handleMarkAsDone}
                onGeneratePDF={(inspection) => handleSelectInspectionReport(inspection.id)}
                currentUser={currentUser}
              />
            )}

            {activeTab === "relatorios" && (
              <RelatoriosView
                inspections={inspections}
                supervisors={unifiedSupervisors}
                areas={areas}
                contracts={contracts}
                config={config}
                initialSelectedInspectionId={reportSelectedInspectionId}
              />
            )}

            {activeTab === "ranking" && (
              <RankingView
                inspections={inspections}
                supervisors={unifiedSupervisors}
                contracts={contracts}
                areas={areas}
                users={users}
                currentUser={currentUser}
                selectedMonth={selectedMonth}
                onSelectMonth={setSelectedMonth}
                grupoContrato={grupoContratoSelecionado}
                onSelectGrupoContrato={setGrupoContratoSelecionado}
                permittedGruposContrato={permittedGruposContrato}
              />
            )}

            {activeTab === "exportacoes" && currentUser?.perfil !== "visitante" && (
              <ExportacoesView
                inspections={inspections}
                supervisors={unifiedSupervisors}
                areas={areas}
                onSelectInspectionReport={handleSelectInspectionReport}
              />
            )}

            {activeTab === "configuracoes" && (currentUser?.perfil === "Desenvolvedor/Admin" || currentUser?.perfil === "Administrador") && (
              <ConfiguracoesView
                supervisors={supervisors}
                areas={areas}
                contracts={contracts}
                config={config}
                users={users}
                currentUser={currentUser}
                onRefreshDB={refreshDatabaseStates}
              />
            )}

            </>}
          </div>
        </main>

        {/* HIGH-DENSITY SYSTEM FOOTER */}
        <footer
          id="app-footer"
          className="app-footer no-print"
          style={{
            left: `${sidebarWidth}px`,
            width: `calc(100% - ${sidebarWidth}px)`
          }}
        >
          <div className="app-footer-company">
            {config.nomeEmpresa} &copy; {new Date().getFullYear()} — {config.nomeSistema}
          </div>

          <div className="app-footer-developer">
            <span className="developer-icon">&lt;/&gt;</span>
            DESENVOLVIDO POR ARTHUR SANTOS
          </div>

          <div className="app-footer-status">
            <span className="firebase-status">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline && inspectionSyncInfo.status === "ready" ? "bg-emerald-400" : "bg-amber-400"}`}></span>
              {!isOnline ? "OFFLINE — HISTÓRICO LOCAL" : inspectionSyncInfo.status === "ready" ? "HISTÓRICO CONFIRMADO NO SERVIDOR" : inspectionSyncInfo.status === "error" ? "ERRO AO CARREGAR HISTÓRICO" : "CARREGANDO HISTÓRICO"}
            </span>
            <span className="footer-separator">|</span>
            <span
              className="access-status truncate max-w-[130px] sm:max-w-[240px]"
              title={`${currentUser?.nome || "USUÁRIO"} (${currentUser?.perfil || "PERFIL"})`}
            >
              ACESSO: {currentUser?.nome || "USUÁRIO"}
            </span>
          </div>
        </footer>
      </div>

      {/* GLOBAL INSPECTION DETAIL MODAL */}
      {viewingGlobalInspection && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 bg-[#0B2E59] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[#F58220]" />
                <h3 className="font-extrabold text-sm tracking-wide uppercase">
                  Detalhamento da Inspeção: {viewingGlobalInspection.id.toUpperCase()}
                </h3>
              </div>
              <button
                onClick={() => setViewingGlobalInspection(null)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-200 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Top stats block */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl text-xs font-semibold">
                <div>
                  <span className="block text-[10px] text-gray-400 font-bold uppercase">Data</span>
                  <span className="font-bold text-gray-800">{viewingGlobalInspection.data.split("-").reverse().join("/")}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400 font-bold uppercase">Supervisor</span>
                  <span className="font-bold text-gray-800">
                    {resolveSupervisorName(viewingGlobalInspection.supervisorId, unifiedSupervisors, users, currentUser, dbService.getDeletedNames())}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400 font-bold uppercase">Área</span>
                  <span className="font-bold text-gray-800">
                    {areas.find(a => a.id === viewingGlobalInspection.areaId)?.nome || dbService.getDeletedNames()[viewingGlobalInspection.areaId] || "Geral"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400 font-bold uppercase">Contrato</span>
                  <span className="font-bold text-gray-800">
                    {contracts.find(c => c.id === viewingGlobalInspection.contratoId)?.codigo || dbService.getDeletedNames()[viewingGlobalInspection.contratoId] || "N/A"}
                  </span>
                </div>
              </div>

              {/* Categorization indicators */}
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                {(() => {
                  const typeName = getTipoLancamento(viewingGlobalInspection.atividade, viewingGlobalInspection.tipo);
                  const conf = TIPO_LANCAMENTO_CONFIG[typeName];
                  return (
                    <span className={`px-2.5 py-1 rounded border flex items-center gap-1 ${conf ? `${conf.bgClass} ${conf.textClass} ${conf.borderClass}` : "bg-gray-100 text-gray-800 border-gray-200"}`}>
                      <span>{conf?.icon || "🔍"}</span>
                      <span>Tipo de Lançamento: {typeName}</span>
                    </span>
                  );
                })()}
                <span className={`px-2.5 py-1 rounded border ${
                  viewingGlobalInspection.potencial === "Crítico"
                    ? "bg-red-50 text-red-700 border-red-200"
                    : viewingGlobalInspection.potencial === "Grave"
                    ? "bg-orange-50 text-orange-700 border-orange-100"
                    : "bg-blue-50 text-blue-700 border-blue-100"
                }`}>
                  Risco: {viewingGlobalInspection.potencial}
                </span>
                <span className={`px-2.5 py-1 rounded border ${
                  viewingGlobalInspection.status === "Concluído"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-yellow-50 text-yellow-700 border-yellow-200"
                }`}>
                  Status: {viewingGlobalInspection.status}
                </span>
              </div>

              {/* Desvio Description */}
              <div className="space-y-1">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Descrição do Desvio</span>
                <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-lg leading-relaxed border-l-4 border-[#0B2E59]">
                  {viewingGlobalInspection.descricao}
                </p>
              </div>

              {/* Ação Corretiva */}
              <div className="space-y-1">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ação Corretiva Aplicada/Proposta</span>
                <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-lg leading-relaxed border-l-4 border-green-500">
                  {viewingGlobalInspection.acaoCorretiva}
                </p>
              </div>

              {/* Photos Gallery */}
              {((viewingGlobalInspection.fotosAntes && viewingGlobalInspection.fotosAntes.length > 0) || 
                (viewingGlobalInspection.fotosDepois && viewingGlobalInspection.fotosDepois.length > 0)) && (
                <div className="space-y-2">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Evidências Fotográficas</span>
                  <div className="grid grid-cols-2 gap-3">
                    {viewingGlobalInspection.fotosAntes && viewingGlobalInspection.fotosAntes.map((pic, idx) => (
                      <div key={idx} className="relative rounded-lg overflow-hidden border border-gray-100 bg-slate-50 h-28 flex flex-col justify-between">
                        <ResolvedImage
                          src={pic}
                          rotation={viewingGlobalInspection.rotacoesFotosAntes ? viewingGlobalInspection.rotacoesFotosAntes[idx] || 0 : 0}
                          alt="Antes"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute bottom-1 left-1 bg-red-600/95 text-white font-extrabold text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded">Antes</span>
                      </div>
                    ))}
                    {viewingGlobalInspection.fotosDepois && viewingGlobalInspection.fotosDepois.map((pic, idx) => (
                      <div key={idx} className="relative rounded-lg overflow-hidden border border-gray-100 bg-slate-50 h-28 flex flex-col justify-between">
                        <ResolvedImage
                          src={pic}
                          rotation={viewingGlobalInspection.rotacoesFotosDepois ? viewingGlobalInspection.rotacoesFotosDepois[idx] || 0 : 0}
                          alt="Depois"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute bottom-1 left-1 bg-green-600/95 text-white font-extrabold text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded">Depois</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer actions */}
            <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-t border-slate-100">
              <button
                onClick={() => {
                  handleSelectInspectionReport(viewingGlobalInspection.id);
                  setViewingGlobalInspection(null);
                }}
                className="flex items-center gap-1.5 bg-[#0B2E59] text-white hover:bg-[#082343] transition font-extrabold text-xs px-4 py-2 rounded-lg cursor-pointer"
              >
                <ExternalLink size={14} />
                <span>Ver Relatório Completo (PDF)</span>
              </button>

              <button
                onClick={() => setViewingGlobalInspection(null)}
                className="border border-slate-200 text-slate-600 hover:bg-slate-100 transition font-extrabold text-xs px-4 py-2 rounded-lg cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
