/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { auth, db } from "./services/firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail, updatePassword } from "firebase/auth";
import { doc, getDoc, updateDoc as fbUpdateDoc, setDoc as fbSetDoc, serverTimestamp } from "firebase/firestore";

// Trace helper for writes in development
const setDoc = async (ref: any, data: any, options?: any) => {
  if (process.env.NODE_ENV !== "production") {
    const path = ref && typeof ref.path === "string" ? ref.path : "unknown-path";
    console.trace("[FIRESTORE WRITE]", path, "setDoc", data);
  }
  return fbSetDoc(ref, data, options);
};

const updateDoc = async (ref: any, data: any) => {
  if (process.env.NODE_ENV !== "production") {
    const path = ref && typeof ref.path === "string" ? ref.path : "unknown-path";
    console.trace("[FIRESTORE WRITE]", path, "updateDoc", data);
  }
  return fbUpdateDoc(ref, data);
};
import { dbService } from "./services/db";
import {
  Inspection,
  Supervisor,
  Area,
  Contract,
  SystemConfig,
  UserProfile,
  InspectionStatus,
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
import { CheckCircle, AlertCircle, Building2, Bell, Search, FileText, X, ExternalLink } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Remove dados deixados pelas versoes antigas, que usavam localStorage como
  // banco e podiam exibir usuarios duplicados. A sessao oficial do Firebase
  // usa chaves proprias e nao e afetada por esta limpeza.
  useEffect(() => {
    const legacyKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("gemba_fta_")) legacyKeys.push(key);
    }
    legacyKeys.forEach((key) => window.localStorage.removeItem(key));
  }, []);

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
  const [isSyncing, setIsSyncing] = useState(false);

  // --- SPECIAL INTERACTIVE STATES ---
  const [editingInspection, setEditingInspection] = useState<Inspection | null>(null);
  const [reportSelectedInspectionId, setReportSelectedInspectionId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // --- GLOBAL SEARCH & MONTH FILTER STATES ---
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [viewingGlobalInspection, setViewingGlobalInspection] = useState<Inspection | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("auto");

  const globalSearchResults = useMemo(() => {
    const term = globalSearchTerm.trim().toLowerCase();
    if (!term) return [];
    return inspections.filter((insp) => {
      const sup = supervisors.find((s) => s.id === insp.supervisorId)?.nome || dbService.getDeletedNames()[insp.supervisorId] || "";
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
  }, [globalSearchTerm, inspections, supervisors, contracts, areas]);

  // Fetch / Sync all local states with Database Service
  const refreshDatabaseStates = () => {
    setInspections(dbService.getInspections());
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

  // Debounce ref to manage and throttle dynamic listener synchronization
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Centralized dynamic listener synchronization manager
  useEffect(() => {
    // Clear any pending sync execution to prevent overlapping/duplicate listeners
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    if (!currentUser) {
      dbService.stopSync(true); // Logout: clear cache & cancel listeners
      setIsSyncing(false);
      return;
    }

    if (!isVisible || !isOnline) {
      dbService.stopSync(false); // Hidden/Offline: cancel listeners, keep cache
      setIsSyncing(false);
      return;
    }

    // visible + online + authenticated: Set syncing state and schedule synchronization with a 1-second debounce
    setIsSyncing(true);

    syncTimeoutRef.current = setTimeout(() => {
      // Ensure any previously active listeners are stopped right before starting new ones to prevent leaks
      dbService.stopSync(false);

      // Preload metadata (now cached internally to prevent repeating getDocs)
      dbService.preloadMetadata().then(() => {
        refreshDatabaseStates();
      });

      dbService.startSync(currentUser, activeTab);
      refreshDatabaseStates();

      setIsSyncing(false);
    }, 1000);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [currentUser?.id, activeTab, isVisible, isOnline]);

  // Firebase Authentication is the only session source. Firestore listeners start
  // only after authentication, avoiding permission errors on the login screen.
  useEffect(() => {
    if (!auth || !db) {
      setLoginError("Firebase não está configurado corretamente.");
      setAuthLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthLoading(true);
      try {
        if (!firebaseUser) {
          dbService.stopSync(true);
          setCurrentUser(null);
          setAuthLoading(false);
          return;
        }
        const profileSnap = await getDoc(doc(db, "users", firebaseUser.uid));
        let profile: UserProfile;

        if (!profileSnap.exists()) {
          if (firebaseUser.email === "visitante@grupofta.com.br") {
            const visitorData = {
              id: firebaseUser.uid,
              nome: "Visitante FTA",
              email: "visitante@grupofta.com.br",
              perfil: "visitante",
              ativo: true
            };
            try {
              await setDoc(doc(db, "users", firebaseUser.uid), visitorData);
              profile = visitorData as UserProfile;
            } catch (err) {
              console.warn("Falha ao salvar perfil de visitante no Firestore (regras pendentes). Usando em memória.", err);
              profile = visitorData as UserProfile;
            }
          } else {
            await signOut(auth);
            setLoginError("Seu acesso foi autenticado, mas o perfil ainda não está configurado.");
            setAuthLoading(false);
            return;
          }
        } else {
          const rawProfile: any = { id: profileSnap.id, ...profileSnap.data() };
          const normalizedPerfil = rawProfile.perfil === "desenvolvedor" ? "Desenvolvedor/Admin" : rawProfile.perfil === "admin" ? "Administrador" : rawProfile.perfil === "gestor" ? "Gestor" : rawProfile.perfil === "supervisor" ? "Supervisor" : rawProfile.perfil;
          profile = { ...rawProfile, perfil: normalizedPerfil } as UserProfile;
        }

        if (!profile.ativo) {
          await signOut(auth);
          setLoginError("Seu acesso está inativo. Entre em contato com o administrador.");
          setAuthLoading(false);
          return;
        }
        setCurrentUser(profile);
        
        let shouldUpdateLogin = true;
        if (profile && profile.ultimoLogin) {
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
              // Grava no máximo uma vez a cada 24 horas (86400000 ms)
              if (diffMs < 24 * 60 * 60 * 1000) {
                shouldUpdateLogin = false;
              }
            }
          } catch (e) {
            console.warn("Erro ao ler ultimoLogin do perfil:", e);
          }
        }

        if (shouldUpdateLogin) {
          await updateDoc(doc(db, "users", firebaseUser.uid), { ultimoLogin: serverTimestamp() }).catch(() => undefined);
        }
        setTimeout(refreshDatabaseStates, 100);
      } catch (error) {
        console.error(error);
        setLoginError("Não foi possível carregar seu perfil de acesso.");
      } finally {
        setAuthLoading(false);
      }
    });
    return unsubscribe;
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
      setEditingInspection(null);
      triggerAlert(editingInspection ? "Inspeção atualizada com sucesso!" : "Nova inspeção GEMBA lançada com sucesso!");
      setActiveTab("historico");
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
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, loginEmail.trim().toLowerCase(), loginPassword);
    } catch (error: any) {
      console.error(error);
      setLoginError("E-mail ou senha incorretos.");
    }
  };

  const handlePasswordReset = async () => {
    if (!loginEmail.trim()) {
      setLoginError("Informe seu e-mail para recuperar a senha.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, loginEmail.trim().toLowerCase());
      triggerAlert("E-mail de recuperação enviado.");
    } catch {
      setLoginError("Não foi possível enviar o e-mail de recuperação.");
    }
  };

  const handleFirstPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) return setLoginError("A nova senha deve ter pelo menos 6 caracteres.");
    if (newPassword !== confirmPassword) return setLoginError("As senhas não conferem.");
    if (!auth.currentUser || !currentUser) return;
    try {
      await updatePassword(auth.currentUser, newPassword);
      await updateDoc(doc(db, "users", currentUser.id), { primeiroAcesso: false, deveAlterarSenha: false, updatedAt: serverTimestamp() });
      setCurrentUser({ ...currentUser, primeiroAcesso: false, deveAlterarSenha: false });
      setNewPassword(""); setConfirmPassword("");
      triggerAlert("Senha criada com sucesso.");
    } catch (error) {
      console.error(error);
      setLoginError("Não foi possível alterar a senha. Entre novamente e tente outra vez.");
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
                }}
                className="bg-slate-50 border border-slate-200 focus:border-[#0B2E59] rounded-lg p-2.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] focus:bg-white transition-all font-medium"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Senha</label>
              <input type="password" required value={loginPassword} onChange={(e) => { setLoginPassword(e.target.value); setLoginError(""); }} className="bg-slate-50 border border-slate-200 focus:border-[#0B2E59] rounded-lg p-2.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] focus:bg-white transition-all font-medium" />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <label className="flex items-center gap-2 text-gray-600 cursor-pointer"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> Lembrar de mim</label>
              <button type="button" onClick={handlePasswordReset} className="text-[#0B2E59] font-bold hover:underline">Esqueci minha senha</button>
            </div>

            {loginError && (
              <p className="text-[11px] text-red-500 font-bold flex items-center gap-1 bg-red-50 p-2 rounded">
                <AlertCircle size={12} /> {loginError}
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
      <div className="h-screen w-screen bg-[#0B2E59] flex items-center justify-center p-4">
        <form onSubmit={handleFirstPasswordChange} className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md space-y-4">
          <img src={config.logoUrl || "/logo-fta.png"} className="h-14 mx-auto object-contain" />
          <div className="text-center"><h1 className="font-extrabold text-[#0B2E59]">Crie sua senha de acesso</h1><p className="text-xs text-gray-500 mt-1">Por segurança, defina uma nova senha pessoal antes de continuar.</p></div>
          <input type="password" required placeholder="Nova senha" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full border rounded-lg p-3 text-sm" />
          <input type="password" required placeholder="Confirmar nova senha" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full border rounded-lg p-3 text-sm" />
          {loginError && <p className="text-xs text-red-600">{loginError}</p>}
          <button className="w-full bg-[#0B2E59] text-white rounded-lg p-3 text-sm font-bold">Salvar nova senha</button>
        </form>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

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
                  const sup = supervisors.find((s) => s.id === insp.supervisorId)?.nome || dbService.getDeletedNames()[insp.supervisorId] || "Outros";

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
        <main className="flex-1 overflow-y-auto px-4 py-4 md:py-5 print:p-0">
          <div className="max-w-7xl mx-auto h-full">
            
            {activeTab === "dashboard" && (
              <DashboardView
                inspections={inspections}
                supervisors={supervisors}
                areas={areas}
                contracts={contracts}
                selectedMonth={selectedMonth}
                onSelectMonth={setSelectedMonth}
                onEditInspection={handleEditInspectionInitiate}
                onSelectTab={setActiveTab}
              />
            )}

            {activeTab === "lancar" && currentUser?.perfil !== "visitante" && (
              <LancarInspecaoView
                supervisors={supervisors}
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
                supervisors={supervisors}
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
                supervisors={supervisors}
                areas={areas}
                contracts={contracts}
                config={config}
                initialSelectedInspectionId={reportSelectedInspectionId}
              />
            )}

            {activeTab === "ranking" && (
              <RankingView
                inspections={inspections}
                supervisors={supervisors}
                selectedMonth={selectedMonth}
                onSelectMonth={setSelectedMonth}
              />
            )}

            {activeTab === "exportacoes" && currentUser?.perfil !== "visitante" && (
              <ExportacoesView
                inspections={inspections}
                supervisors={supervisors}
                areas={areas}
                onSelectInspectionReport={handleSelectInspectionReport}
              />
            )}

            {activeTab === "configuracoes" && currentUser?.perfil !== "visitante" && (
              <ConfiguracoesView
                supervisors={supervisors}
                areas={areas}
                contracts={contracts}
                config={config}
                users={users}
                onRefreshDB={refreshDatabaseStates}
              />
            )}

          </div>
        </main>

        {/* HIGH-DENSITY SYSTEM FOOTER */}
        <footer className="app-footer no-print">
          <div className="app-footer-company">
            {config.nomeEmpresa} &copy; {new Date().getFullYear()} — {config.nomeSistema}
          </div>

          <div className="app-footer-developer">
            <span className="developer-icon">&lt;/&gt;</span>
            DESENVOLVIDO POR ARTHUR SANTOS
            <span className="footer-mobile-status items-center gap-1 text-green-400 ml-1.5 hidden">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              ONLINE
            </span>
          </div>

          <div className="app-footer-status">
            <span className="firebase-status">● FIREBASE SINCRONIZADO EM TEMPO REAL</span>
            <span className="footer-separator">|</span>
            <span className="access-status">ACESSO: {currentUser?.nome || "USUÁRIO"} ({currentUser?.perfil || "PERFIL"})</span>
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
                    {supervisors.find(s => s.id === viewingGlobalInspection.supervisorId)?.nome || dbService.getDeletedNames()[viewingGlobalInspection.supervisorId] || "Outros"}
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
