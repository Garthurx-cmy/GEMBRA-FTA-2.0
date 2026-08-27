/**
 * GEMBA FTA data service.
 * Firestore is the single source of truth. LocalStorage is intentionally not
 * used for operational data, preventing isolated or reset data per browser.
 */
import {
  Inspection, Supervisor, Area, Contract, SystemConfig, UserProfile,
  AppNotification, AuthorizedEmail, InspectionStatus, getTipoLancamento, GrupoContrato,
  LegacyReconciliationItem, LegacyReconciliationPreview
} from "../types";
import { isOperationalRole } from "../utils/supervisors";
import { getInspectionMonthKey } from "../utils/inspectionUtils";
import {
  getInspectionGrupoContrato,
  isFarolVli,
  isSupervisorFromGrupoContrato,
  getGrupoContratoPorLocalidade,
  getContractGroup
} from "../utils/operational";
import { auth, db, hasFirebase } from "./firebase";
import {
  collection, doc,
  setDoc as fbSetDoc,
  updateDoc as fbUpdateDoc,
  deleteDoc as fbDeleteDoc,
  onSnapshot as fbOnSnapshot,
  serverTimestamp, getDocs as fbGetDocs, query, where,
  writeBatch as fbWriteBatch,
  orderBy, limit, startAfter, getDoc as fbGetDoc,
  deleteField
} from "firebase/firestore";

// Instrumenting Read operations
const getDoc = async (ref: any): Promise<any> => {
  const path = ref && typeof ref.path === "string" ? ref.path : "unknown-path";
  const horario = new Date().toISOString();
  console.trace("[FIRESTORE READ]", {
    operacao: "getDoc",
    colecao: path,
    origem: "DBService",
    horario,
    motivo: "Busca de documento único",
    componente: "DBService"
  });
  return fbGetDoc(ref);
};

const getDocs = async (ref: any): Promise<any> => {
  let path = "unknown-path";
  if (ref) {
    if (typeof ref.path === "string") {
      path = ref.path;
    } else if (ref._query && ref._query.path) {
      path = ref._query.path.toString();
    }
  }
  const horario = new Date().toISOString();
  console.trace("[FIRESTORE READ]", {
    operacao: "getDocs",
    colecao: path,
    origem: "DBService",
    horario,
    motivo: "Busca de coleção / consulta",
    componente: "DBService"
  });
  return fbGetDocs(ref);
};

const onSnapshot = (ref: any, ...args: any[]) => {
  let path = "unknown-path";
  if (ref) {
    if (typeof ref.path === "string") {
      path = ref.path;
    } else if (ref._query && ref._query.path) {
      path = ref._query.path.toString();
    }
  }
  const horario = new Date().toISOString();
  console.trace("[FIRESTORE READ - LISTENER CREATED]", {
    operacao: "onSnapshot",
    colecao: path,
    origem: "DBService",
    horario,
    motivo: "Sincronização em tempo real",
    componente: "DBService"
  });

  const unsubscribe = (fbOnSnapshot as any)(ref, ...args);

  return () => {
    console.trace("[FIRESTORE READ - LISTENER CLOSED]", {
      operacao: "unsubscribe",
      colecao: path,
      origem: "DBService",
      horario: new Date().toISOString(),
      componente: "DBService"
    });
    unsubscribe();
  };
};

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

const deleteDoc = async (ref: any) => {
  if (process.env.NODE_ENV !== "production") {
    const path = ref && typeof ref.path === "string" ? ref.path : "unknown-path";
    console.trace("[FIRESTORE WRITE]", path, "deleteDoc");
  }
  return fbDeleteDoc(ref);
};

const writeBatch = (firestoreInstance: any) => {
  const batch = fbWriteBatch(firestoreInstance);
  if (process.env.NODE_ENV !== "production") {
    console.trace("[FIRESTORE WRITE] Batch created");
  }
  return batch;
};

const DEFAULT_CONFIG: SystemConfig = {
  logoUrl: "/logo-fta.png",
  nomeEmpresa: "FTA Serviços Industriais",
  nomeSistema: "GEMBA FTA",
  temaEscuro: false,
  responsavelAssinaturaNome: "Jhonata Gonçalves dos Santos",
  responsavelAssinaturaCargo: "Gerente Operacional dos Contratos",
  tiposInspecao: ["DSS", "AR", "LVCC", "DIAL", "Desvio Comportamental", "Desvio Estrutural", "Notificação", "Interdição", "Presença em Campo"],
  processosChecklist: [
    { id: "dss", nome: "DSS", classificacaoPadrao: "DSS" },
    { id: "ar", nome: "AR", classificacaoPadrao: "AR" },
    { id: "lvcc", nome: "LVCC", classificacaoPadrao: "LVCC" },
    { id: "dial", nome: "DIAL", classificacaoPadrao: "DIAL" },
    { id: "presenca", nome: "Presença em Campo", classificacaoPadrao: "Presença em Campo" }
  ]
};

const normalize = (value = "") => value
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .trim().toLowerCase().replace(/\s+/g, " ");
const normalizeCode = (value = "") => normalize(value).replace(/[^a-z0-9]/g, "");
const idFrom = (prefix: string, value: string) => `${prefix}_${normalizeCode(value) || crypto.randomUUID()}`;

export const NOVOS_13_USUARIOS_PADRAO = [
  { email: "fabiosantox91@gmail.com", cargo: "LÍDER DE EQUIPE" },
  { email: "vandersonbarbosa923@gmail.com", cargo: "LÍDER DE EQUIPE - MEC" },
  { email: "l.sousa@grupofta.com.br", cargo: "LÍDER DE EQUIPE" },
  { email: "jeffersoncarvalhoalves52@gmail.com", cargo: "LÍDER DE EQUIPE" },
  { email: "silvadecarvalhodaniel30@gmail.com", cargo: "LÍDER DE EQUIPE" },
  { email: "wesley-neves@hotmail.com", cargo: "LÍDER DE EQUIPE" },
  { email: "filipeviana425@gmail.com", cargo: "LÍDER DE EQUIPE" },
  { email: "washingtonpinha@gmail.com", cargo: "LÍDER DE EQUIPE" },
  { email: "fitalo306@gmail.com", cargo: "LÍDER DE EQUIPE" },
  { email: "bentodasilvaferreira07@gmail.com", cargo: "LÍDER DE EQUIPE" },
  { email: "r.slemos@grupofta.com.br", cargo: "LÍDER DE EQUIPE" },
  { email: "r.freitas@grupofta.com.br", cargo: "ENGENHEIRO DE SEGURANÇA" },
  { email: "k.trindade@grupofta.com.br", cargo: "ANALISTA DE SEGURANÇA" }
];

export function normalizarPerfil(rawRole?: any): string {
  const p = String(rawRole ?? "").trim().toLowerCase();
  if (p === "desenvolvedor" || p === "desenvolvedor/admin" || p === "dev" || p === "desenvolvedor / admin") {
    return "Desenvolvedor/Admin";
  }
  if (p === "admin" || p === "administrador") {
    return "Administrador";
  }
  if (p === "gestor") {
    return "Gestor";
  }
  if (
    p === "supervisor" ||
    p === "lider" ||
    p === "líder" ||
    p === "lider de equipe" ||
    p === "líder de equipe" ||
    p === "lider de equipe - mec" ||
    p === "líder de equipe - mecânica" ||
    p === "engenheiro de segurança" ||
    p === "analista de segurança"
  ) {
    return "supervisor";
  }
  if (p === "visitante") {
    return "visitante";
  }
  return rawRole ? String(rawRole).trim() : "supervisor";
}

export function hasLegacyUppercaseFields(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  return (
    data.ATIVO !== undefined ||
    data.CARGO !== undefined ||
    data.DEVEALTERARSENHA !== undefined ||
    data.EMAIL !== undefined ||
    data.NOME !== undefined ||
    data.PERFIL !== undefined ||
    data.PRIMEIROACESSO !== undefined ||
    data.ULTIMOLOGIN !== undefined
  );
}

export function normalizeUserProfile(data: any, docId?: string): UserProfile {
  if (!data) {
    return {
      id: docId || "",
      nome: "",
      email: "",
      perfil: "visitante",
      cargo: "",
      ativo: false,
      participaFarolGemba: true,
      primeiroAcesso: false,
      deveAlterarSenha: false,
      ultimoLogin: null
    };
  }

  // 1. ativo: data.ativo ?? data.ATIVO ?? (data.status === "ativo")
  let ativo = true;
  if (data.ativo !== undefined) {
    ativo = typeof data.ativo === "string" ? data.ativo.toLowerCase() === "true" || data.ativo.toLowerCase() === "ativo" : Boolean(data.ativo);
  } else if (data.ATIVO !== undefined) {
    ativo = typeof data.ATIVO === "string" ? data.ATIVO.toLowerCase() === "true" || data.ATIVO.toLowerCase() === "ativo" : Boolean(data.ATIVO);
  } else if (data.status !== undefined) {
    ativo = String(data.status).toLowerCase() === "ativo";
  }

  // 2. cargo: data.cargo ?? data.CARGO ?? data.funcao ?? data.function ?? ""
  const cargo = String(data.cargo ?? data.CARGO ?? data.funcao ?? data.function ?? data.CARGO_FUNCAO ?? "").trim();

  // 3. deveAlterarSenha: data.deveAlterarSenha ?? data.DEVEALTERARSENHA ?? false
  let deveAlterarSenha = false;
  if (data.deveAlterarSenha !== undefined) {
    deveAlterarSenha = typeof data.deveAlterarSenha === "string" ? data.deveAlterarSenha.toLowerCase() === "true" : Boolean(data.deveAlterarSenha);
  } else if (data.DEVEALTERARSENHA !== undefined) {
    deveAlterarSenha = typeof data.DEVEALTERARSENHA === "string" ? data.DEVEALTERARSENHA.toLowerCase() === "true" : Boolean(data.DEVEALTERARSENHA);
  }

  // 4. email: String(data.email ?? data.EMAIL ?? "").trim().toLowerCase()
  const email = String(data.email ?? data.EMAIL ?? "").trim().toLowerCase();

  // 5. nome: data.nome ?? data.NOME ?? data.name ?? ""
  const nome = String(data.nome ?? data.NOME ?? data.name ?? "").trim();

  // 6. perfil: normalizarPerfil(data.perfil ?? data.PERFIL ?? data.role ?? "visitante")
  const rawPerfil = data.perfil ?? data.PERFIL ?? data.role ?? (email === "visitante@grupofta.com.br" ? "visitante" : "supervisor");
  const perfil = normalizarPerfil(rawPerfil);

  // 7. primeiroAcesso: data.primeiroAcesso ?? data.PRIMEIROACESSO ?? false
  let primeiroAcesso = false;
  if (data.primeiroAcesso !== undefined) {
    primeiroAcesso = typeof data.primeiroAcesso === "string" ? data.primeiroAcesso.toLowerCase() === "true" : Boolean(data.primeiroAcesso);
  } else if (data.PRIMEIROACESSO !== undefined) {
    primeiroAcesso = typeof data.PRIMEIROACESSO === "string" ? data.PRIMEIROACESSO.toLowerCase() === "true" : Boolean(data.PRIMEIROACESSO);
  }

  // 8. participaFarolGemba: data.participaFarolGemba ?? true (com suporte a false explícito)
  let participaFarolGemba = true;
  if (data.participaFarolGemba !== undefined) {
    participaFarolGemba = typeof data.participaFarolGemba === "string" ? data.participaFarolGemba.toLowerCase() === "true" : Boolean(data.participaFarolGemba);
  }

  // 9. gruposContratoPermitidos: ["vale"], ["vli"], ou ["vale", "vli"]
  let gruposContratoPermitidos: GrupoContrato[] = [];
  if (Array.isArray(data.gruposContratoPermitidos)) {
    gruposContratoPermitidos = data.gruposContratoPermitidos
      .map((g: any) => String(g).toLowerCase().trim() as GrupoContrato)
      .filter((g: any) => g === "vale" || g === "vli");
  } else if (typeof data.grupoContrato === "string") {
    const g = data.grupoContrato.toLowerCase().trim();
    if (g === "vale" || g === "vli") gruposContratoPermitidos = [g as GrupoContrato];
  } else if (typeof data.contrato === "string") {
    const g = data.contrato.toLowerCase().trim();
    if (g.includes("vale") && g.includes("vli")) gruposContratoPermitidos = ["vale", "vli"];
    else if (g.includes("vli")) gruposContratoPermitidos = ["vli"];
    else if (g.includes("vale")) gruposContratoPermitidos = ["vale"];
  }

  // Fallback padrão se não especificado
  if (gruposContratoPermitidos.length === 0) {
    if (perfil === "Desenvolvedor/Admin" || perfil === "Administrador" || perfil === "Gestor") {
      gruposContratoPermitidos = ["vale", "vli"];
    } else if (isFarolVli({ nome, email, id: docId || data.id, participaFarolGemba })) {
      gruposContratoPermitidos = ["vli"];
    } else {
      gruposContratoPermitidos = ["vale"];
    }
  }

  return {
    id: docId || data.id || "",
    nome,
    email,
    perfil,
    cargo,
    ativo,
    participaFarolGemba,
    gruposContratoPermitidos,
    primeiroAcesso,
    deveAlterarSenha,
    ultimoLogin: data.ultimoLogin ?? data.ULTIMOLOGIN ?? data.lastLogin ?? null
  };
}

class DBService {
  private inspections: Inspection[] = [];
  private supervisors: Supervisor[] = [];
  private areas: Area[] = [];
  private contracts: Contract[] = [];
  private users: UserProfile[] = [];
  private config: SystemConfig = DEFAULT_CONFIG;
  private notifications: AppNotification[] = [];
  private deletedNames: Record<string, string> = {};
  private authorizedEmails: AuthorizedEmail[] = [];
  private syncActive = false;
  private unsubscribers: Array<() => void> = [];
  private metadataPreloaded = false;
  private hasReconciledSupervisors = false;
  private inspectionSync: {
    status: "idle" | "loading" | "cache" | "pending" | "ready" | "error";
    errorCode: string | null;
    lastServerSnapshotAt: string | null;
  } = { status: "idle", errorCode: null, lastServerSnapshotAt: null };

  private readiness = {
    configReady: false,
    deletedNamesReady: false,
    notificationsReady: false,
    supervisorsReady: false,
    areasReady: false,
    contractsReady: false,
    inspectionsReady: false,
    usersReady: false
  };

  private convert(value: any): any {
    if (Array.isArray(value)) return value.map(v => this.convert(v));
    if (value && typeof value === "object") {
      if (typeof value.toDate === "function") return value.toDate().toISOString();
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.convert(v)]));
    }
    return value;
  }

  private emit(key: string) {
    window.dispatchEvent(new CustomEvent("gemba_fta_db_update", { detail: { key } }));
  }

  getReadinessState(currentProfile?: UserProfile | null) {
    const isAdmin = currentProfile?.perfil === "Desenvolvedor/Admin" || currentProfile?.perfil === "Administrador";
    const profileReady = !!currentProfile;
    const settingsReady = this.readiness.configReady;
    const supervisorsReady = this.readiness.supervisorsReady;
    const areasReady = this.readiness.areasReady;
    const contractsReady = this.readiness.contractsReady;
    const inspectionsReady = this.readiness.inspectionsReady;
    const usersReady = !isAdmin || this.readiness.usersReady;

    const appDataReady = profileReady && settingsReady && supervisorsReady && areasReady && contractsReady && inspectionsReady && usersReady;

    return {
      profileReady,
      settingsReady,
      supervisorsReady,
      areasReady,
      contractsReady,
      inspectionsReady,
      usersReady,
      appDataReady
    };
  }

  // Read-only diagnostics: no migration, backfill or database write.
  getInspectionSyncInfo() {
    const byMonth: Record<string, number> = {};
    for (const item of this.inspections) {
      const month = getInspectionMonthKey(item) || "sem-data";
      byMonth[month] = (byMonth[month] || 0) + 1;
    }
    const knownIds = new Set([...this.supervisors.map(s => s.id), ...this.users.map(u => u.id)]);
    return {
      ...this.inspectionSync,
      receivedCount: this.inspections.length,
      withoutContractGroup: this.inspections.filter(i => i.grupoContrato !== "vale" && i.grupoContrato !== "vli").length,
      byMonth,
      directoryReady: this.readiness.supervisorsReady && this.readiness.usersReady,
      unresolvedSupervisorCount: this.inspections.filter(i => !knownIds.has(i.supervisorId)).length
    };
  }

  startSync(currentProfile?: UserProfile): void {
    if (this.syncActive || !hasFirebase || !db || !currentProfile || currentProfile.ativo === false) return;
    this.syncActive = true;
    this.inspectionSync = { ...this.inspectionSync, status: "loading", errorCode: null };

    const role = normalizarPerfil(currentProfile.perfil);
    const isAdmin = role === "Desenvolvedor/Admin" || role === "Administrador";
    const isGestor = role === "Gestor";
    
    // Keep server-side contract restrictions for non-admin/non-manager users.
    const rawGroups = currentProfile.gruposContratoPermitidos as unknown;
    const requestedGroups = Array.isArray(rawGroups) ? rawGroups :
      typeof rawGroups === "string" ? rawGroups.toLowerCase().split(/[^a-z]+/) : [];
    const permittedGroups: GrupoContrato[] = isAdmin || isGestor ? ["vale", "vli"] :
      [...new Set(requestedGroups.map(group => String(group).trim().toLowerCase())
        .filter((group): group is GrupoContrato => group === "vale" || group === "vli"))];

    // 1. Settings (config) - Global listener
    this.unsubscribers.push(onSnapshot(doc(db, "settings", "config"), snap => {
      this.config = snap.exists() ? ({ ...DEFAULT_CONFIG, ...this.convert(snap.data()) } as SystemConfig) : DEFAULT_CONFIG;
      this.readiness.configReady = true;
      this.emit("config");
    }, err => {
      console.error("Falha ao sincronizar configurações:", err);
      this.readiness.configReady = true;
    }));

    // 2. Deleted Names - Global listener
    this.unsubscribers.push(onSnapshot(collection(db, "deleted_names"), snap => {
      this.deletedNames = Object.fromEntries(snap.docs.map(d => [d.id, d.data().name || "Registro removido"]));
      this.readiness.deletedNamesReady = true;
      this.emit("deleted_names");
    }, err => {
      console.error("Falha ao sincronizar nomes removidos:", err);
      this.readiness.deletedNamesReady = true;
    }));

    // 3. Notifications - Global listener
    this.unsubscribers.push(onSnapshot(query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(20)), snap => {
      this.notifications = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as AppNotification));
      this.readiness.notificationsReady = true;
      this.emit("notifications");
    }, err => {
      console.error("Falha ao sincronizar notificações:", err);
      this.readiness.notificationsReady = true;
    }));

    // 4. Supervisors - Operational directory filtered by contract permission
    this.unsubscribers.push(onSnapshot(collection(db, "supervisors"), snap => {
      const allSups = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Supervisor));
      if (permittedGroups.length === 1) {
        const targetGroup = permittedGroups[0];
        this.supervisors = allSups.filter(s => isSupervisorFromGrupoContrato(s, targetGroup));
      } else {
        this.supervisors = allSups;
      }
      this.readiness.supervisorsReady = true;
      this.emit("supervisors");
    }, err => {
      console.error("Falha ao sincronizar supervisores:", err);
      this.readiness.supervisorsReady = true;
    }));

    // 5. Areas - Filtered by contract permission
    this.unsubscribers.push(onSnapshot(collection(db, "areas"), snap => {
      const allAreas = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Area));
      if (permittedGroups.length === 1) {
        const targetGroup = permittedGroups[0];
        this.areas = allAreas.filter(a => getGrupoContratoPorLocalidade(a, allAreas, this.contracts) === targetGroup);
      } else {
        this.areas = allAreas;
      }
      this.readiness.areasReady = true;
      this.emit("areas");
    }, err => {
      console.error("Falha ao sincronizar áreas:", err);
      this.readiness.areasReady = true;
    }));

    // 6. Contracts - Filtered by contract permission
    this.unsubscribers.push(onSnapshot(collection(db, "contracts"), snap => {
      const allContracts = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Contract));
      if (permittedGroups.length === 1) {
        const targetGroup = permittedGroups[0];
        this.contracts = allContracts.filter(c => {
          const g = c.grupoContrato || (getContractGroup(c.id, allContracts).toLowerCase() as GrupoContrato);
          return g === targetGroup;
        });
      } else {
        this.contracts = allContracts;
      }
      this.readiness.contractsReady = true;
      this.emit("contracts");
    }, err => {
      console.error("Falha ao sincronizar contratos:", err);
      this.readiness.contractsReady = true;
    }));

    // Admin/manager must also receive legacy records without grupoContrato.
    // Do not filter or cap this authorized history query and do not backfill documents.
    const inspectionsRef = collection(db, "inspections");
    const inspQuery = isAdmin || isGestor ? inspectionsRef : permittedGroups.length === 1
      ? query(inspectionsRef, where("grupoContrato", "==", permittedGroups[0]))
      : query(inspectionsRef, where("grupoContrato", "in", permittedGroups.length ? permittedGroups : ["sem_acesso"]));

    this.unsubscribers.push(onSnapshot(inspQuery, { includeMetadataChanges: true }, snap => {
      const metadata = snap.metadata || { fromCache: false, hasPendingWrites: false };
      // Empty cache is not proof of an empty server collection. Keep the last data.
      if (!(metadata.fromCache && snap.empty)) {
        this.inspections = snap.docs
          .map(d => ({ id: d.id, ...this.convert(d.data()) } as Inspection))
          .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")) ||
            String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        this.readiness.inspectionsReady = true;
      }
      this.inspectionSync = {
        status: metadata.fromCache ? "cache" : metadata.hasPendingWrites ? "pending" : "ready",
        errorCode: null,
        lastServerSnapshotAt: !metadata.fromCache && !metadata.hasPendingWrites
          ? new Date().toISOString() : this.inspectionSync.lastServerSnapshotAt
      };
      this.emit("inspections");
    }, err => {
      console.error("Falha ao carregar histórico de inspeções:", err);
      this.inspectionSync = { ...this.inspectionSync, status: "error", errorCode: err?.code || "unavailable" };
      // Keep previous records. A failed read must never be presented as zero records.
      this.emit("inspections");
    }));

    // 8. Admin-only reads. Synchronization never reconciles or deletes records.
    if (isAdmin) {
      this.unsubscribers.push(onSnapshot(collection(db, "users"), snap => {
        this.users = snap.docs.map(d => normalizeUserProfile(this.convert(d.data()), d.id));
        this.readiness.usersReady = true;
        this.emit("users");
      }, err => {
        console.error("Falha ao sincronizar usuários:", err);
        this.readiness.usersReady = true;
      }));

      this.unsubscribers.push(onSnapshot(collection(db, "authorized_emails"), snap => {
        this.authorizedEmails = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as AuthorizedEmail));
        this.emit("authorized_emails");
      }, err => console.error("Falha ao sincronizar e-mails autorizados:", err)));

      // Reconciliation must be an explicit administrative action, never run at login.
    } else {
      this.readiness.usersReady = true;
    }
  }

  async reconcileSupervisors(currentProfile?: UserProfile): Promise<{ reconciled: number; errors: string[] }> {
    if (this.hasReconciledSupervisors || !hasFirebase || !db) return { reconciled: 0, errors: [] };
    const isAdmin = currentProfile?.perfil === "Desenvolvedor/Admin" || currentProfile?.perfil === "Administrador";
    if (!isAdmin) return { reconciled: 0, errors: [] };

    this.hasReconciledSupervisors = true;
    let reconciled = 0;
    const errors: string[] = [];

    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const existingUsers = usersSnap.docs.map(d => normalizeUserProfile(d.data(), d.id));

      const supSnap = await getDocs(collection(db, "supervisors"));
      const existingSups = supSnap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Supervisor));

      for (const u of existingUsers) {
        if (!u.id || !u.nome) continue;
        const emailLower = (u.email || "").trim().toLowerCase();

        // Check if supervisor doc exists by ID or email
        const matchingSupByEmail = emailLower ? existingSups.find(s => s.email && s.email.trim().toLowerCase() === emailLower) : undefined;

        const supPayload = {
          id: u.id,
          nome: u.nome.trim(),
          email: emailLower,
          cargo: (u.cargo || u.perfil || "Supervisor").trim(),
          perfil: u.perfil || "supervisor",
          ativo: Boolean(u.ativo),
          participaFarolGemba: u.participaFarolGemba !== false,
          gruposContratoPermitidos: u.gruposContratoPermitidos || ["vale", "vli"],
          updatedAt: serverTimestamp()
        };

        try {
          await setDoc(doc(db, "supervisors", u.id), supPayload, { merge: true });
          reconciled++;

          // Preserve old supervisor IDs: historical inspections can still reference them.
          // No document is deleted or reassigned by this routine.
        } catch (err: any) {
          console.warn(`Erro ao reconciliar supervisor para ${u.email}:`, err);
          errors.push(`Erro para ${u.email}: ${err?.message || err}`);
        }
      }
    } catch (err: any) {
      console.error("Erro na rotina de reconciliação de supervisores:", err);
      errors.push(`Erro geral: ${err?.message || err}`);
    }

    return { reconciled, errors };
  }

  stopSync(clearData: boolean = false): void {
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
    this.syncActive = false;
    this.hasReconciledSupervisors = false;
    if (clearData) {
      this.inspectionSync = { status: "idle", errorCode: null, lastServerSnapshotAt: null };
      this.inspections = [];
      this.supervisors = [];
      this.areas = [];
      this.contracts = [];
      this.users = [];
      this.notifications = [];
      this.authorizedEmails = [];
      this.metadataPreloaded = false;
      this.readiness = {
        configReady: false,
        deletedNamesReady: false,
        notificationsReady: false,
        supervisorsReady: false,
        areasReady: false,
        contractsReady: false,
        inspectionsReady: false,
        usersReady: false
      };
    }
  }

  async getPaginatedInspections(options: {
    limit: number;
    startAfterDocId?: string | null;
    filters?: {
      searchTerm?: string;
      supervisorId?: string;
      areaId?: string;
      contratoId?: string;
      status?: string;
      potencial?: string;
      data?: string;
      tipo?: string;
    };
  }) {
    this.assertFirebase();
    const f = options.filters || {};
    
    try {
      // Build optimized query with direct Firestore filters
      let q = query(collection(db, "inspections"), orderBy("data", "desc"));
      
      if (f.supervisorId && f.supervisorId !== "all" && f.supervisorId !== "") {
        q = query(q, where("supervisorId", "==", f.supervisorId));
      }
      if (f.areaId && f.areaId !== "all" && f.areaId !== "") {
        q = query(q, where("areaId", "==", f.areaId));
      }
      if (f.contratoId && f.contratoId !== "all" && f.contratoId !== "") {
        q = query(q, where("contratoId", "==", f.contratoId));
      }
      if (f.status && f.status !== "all" && f.status !== "") {
        q = query(q, where("status", "==", f.status));
      }
      if (f.potencial && f.potencial !== "all" && f.potencial !== "") {
        q = query(q, where("potencial", "==", f.potencial));
      }
      if (f.data) {
        q = query(q, where("data", "==", f.data));
      }

      if (options.startAfterDocId) {
        const docSnap = await getDoc(doc(db, "inspections", options.startAfterDocId));
        if (docSnap.exists()) {
          q = query(q, startAfter(docSnap));
        }
      }

      q = query(q, limit(options.limit));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Inspection));
      
      let filteredList = list;
      if (f.tipo && f.tipo !== "all" && f.tipo !== "") {
        filteredList = list.filter(item => getTipoLancamento(item.atividade, item.tipo) === f.tipo);
      }
      if (f.searchTerm) {
        const term = f.searchTerm.toLowerCase();
        filteredList = filteredList.filter(item => 
          item.descricao.toLowerCase().includes(term) ||
          item.acaoCorretiva.toLowerCase().includes(term) ||
          item.responsavel.toLowerCase().includes(term) ||
          (item.observacoes && item.observacoes.toLowerCase().includes(term)) ||
          item.id.toLowerCase().includes(term)
        );
      }

      return {
        items: filteredList,
        lastDocId: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : null,
        hasMore: snap.docs.length === options.limit
      };
    } catch (err) {
      console.warn("Firestore index query failed, using safe fallback client-side filtering:", err);
      
      // Fallback query: orderBy date and limit 300 to do filtering client-side
      let q = query(collection(db, "inspections"), orderBy("data", "desc"), limit(300));
      const snap = await getDocs(q);
      let list = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Inspection));
      
      if (f.supervisorId && f.supervisorId !== "all" && f.supervisorId !== "") {
        list = list.filter(item => item.supervisorId === f.supervisorId);
      }
      if (f.areaId && f.areaId !== "all" && f.areaId !== "") {
        list = list.filter(item => item.areaId === f.areaId);
      }
      if (f.contratoId && f.contratoId !== "all" && f.contratoId !== "") {
        list = list.filter(item => item.contratoId === f.contratoId);
      }
      if (f.status && f.status !== "all" && f.status !== "") {
        list = list.filter(item => item.status === f.status);
      }
      if (f.potencial && f.potencial !== "all" && f.potencial !== "") {
        list = list.filter(item => item.potencial === f.potencial);
      }
      if (f.data) {
        list = list.filter(item => item.data === f.data);
      }
      if (f.tipo && f.tipo !== "all" && f.tipo !== "") {
        list = list.filter(item => getTipoLancamento(item.atividade, item.tipo) === f.tipo);
      }
      if (f.searchTerm) {
        const term = f.searchTerm.toLowerCase();
        list = list.filter(item => 
          item.descricao.toLowerCase().includes(term) ||
          item.acaoCorretiva.toLowerCase().includes(term) ||
          item.responsavel.toLowerCase().includes(term) ||
          (item.observacoes && item.observacoes.toLowerCase().includes(term)) ||
          item.id.toLowerCase().includes(term)
        );
      }

      let startIndex = 0;
      if (options.startAfterDocId) {
        const foundIdx = list.findIndex(item => item.id === options.startAfterDocId);
        if (foundIdx !== -1) {
          startIndex = foundIdx + 1;
        }
      }

      const paginatedList = list.slice(startIndex, startIndex + options.limit);
      return {
        items: paginatedList,
        lastDocId: paginatedList.length > 0 ? paginatedList[paginatedList.length - 1].id : null,
        hasMore: startIndex + options.limit < list.length
      };
    }
  }

  async getInspectionById(id: string): Promise<Inspection | null> {
    this.assertFirebase();
    const cached = this.inspections.find(i => i.id === id);
    if (cached) return cached;
    
    const docSnap = await getDoc(doc(db, "inspections", id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...this.convert(docSnap.data()) } as Inspection;
    }
    return null;
  }

  async preloadMetadata(): Promise<void> {
    if (!hasFirebase || !db) return;
    if (this.metadataPreloaded) return;
    this.metadataPreloaded = true;
    try {
      // 1. Preload settings once
      const configSnap = await getDoc(doc(db, "settings", "config"));
      if (configSnap.exists()) {
        this.config = { ...DEFAULT_CONFIG, ...this.convert(configSnap.data()) } as SystemConfig;
        this.emit("config");
      }

      // 2. Preload deleted names once
      const deletedSnap = await getDocs(collection(db, "deleted_names"));
      this.deletedNames = Object.fromEntries(deletedSnap.docs.map(d => [d.id, d.data().name || "Registro removido"]));
      this.emit("deleted_names");

      // 3. Preload supervisors once if empty
      if (this.supervisors.length === 0) {
        const supervisorsSnap = await getDocs(collection(db, "supervisors"));
        this.supervisors = supervisorsSnap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Supervisor));
        this.emit("supervisors");
      }

      // 4. Preload areas once if empty
      if (this.areas.length === 0) {
        const areasSnap = await getDocs(collection(db, "areas"));
        this.areas = areasSnap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Area));
        this.emit("areas");
      }

      // 5. Preload contracts once if empty
      if (this.contracts.length === 0) {
        const contractsSnap = await getDocs(collection(db, "contracts"));
        this.contracts = contractsSnap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Contract));
        this.emit("contracts");
      }
    } catch (err) {
      console.warn("Falha ao pré-carregar metadados em segundo plano:", err);
      this.metadataPreloaded = false; // reset in case of error so it can retry
    }
  }

  getInspections = () => [...this.inspections];
  getSupervisors = () => {
    return this.supervisors.map(sup => {
      if (this.isJhonata(sup)) {
        return {
          ...sup,
          metaSemanal: 2,
          metaMensal: 8
        };
      }
      return sup;
    });
  };
  getAreas = () => [...this.areas];
  getContracts = () => [...this.contracts];
  getUsers = () => [...this.users];
  getConfig = () => this.config;
  getNotifications = () => [...this.notifications];
  getDeletedNames = () => ({ ...this.deletedNames });
  getAuthorizedEmails = () => [...this.authorizedEmails];

  private assertFirebase() {
    if (!hasFirebase || !db) throw new Error("Firebase não está configurado.");
  }

  private async addAuditLog(action: string, entity: string, entityId: string, details?: Record<string, unknown>) {
    if (!db || !auth?.currentUser) return;
    const id = `audit_${crypto.randomUUID()}`;
    await setDoc(doc(db, "auditLogs", id), {
      id, action, entity, entityId,
      userId: auth.currentUser.uid,
      userEmail: auth.currentUser.email || "",
      details: details || {},
      createdAt: new Date().toISOString(),
      createdAtServer: serverTimestamp()
    });
  }

  async saveInspection(inspection: Inspection): Promise<void> {
    this.assertFirebase();
    const isNew = !this.inspections.some(i => i.id === inspection.id);
    const grupoContrato = inspection.grupoContrato || getInspectionGrupoContrato(
      inspection,
      this.areas,
      this.contracts,
      this.supervisors,
      this.deletedNames
    );
    const payload: any = {
      ...inspection,
      grupoContrato,
      fotosAntes: inspection.fotosAntes || [],
      fotosDepois: inspection.fotosDepois || [],
      createdAt: inspection.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      atualizadoEm: serverTimestamp()
    };
    await setDoc(doc(db, "inspections", inspection.id), payload, { merge: true });
    await this.addAuditLog(isNew ? "create" : "update", "inspection", inspection.id, { supervisorId: inspection.supervisorId, status: inspection.status });
    const supName = this.supervisors.find(s => s.id === inspection.supervisorId)?.nome || this.users.find(u => u.id === inspection.supervisorId)?.nome || (auth?.currentUser?.uid === inspection.supervisorId ? (auth.currentUser.displayName || auth.currentUser.email) : "") || "Usuário";
    await this.addNotification(supName, isNew ? "lançou uma inspeção" : "atualizou uma inspeção", inspection.atividade || inspection.tipo);
  }

  async deleteInspection(id: string): Promise<void> {
    this.assertFirebase();
    const item = this.inspections.find(i => i.id === id);
    await deleteDoc(doc(db, "inspections", id));
    await this.addAuditLog("delete", "inspection", id, { supervisorId: item?.supervisorId || "" });
  }

  async saveSupervisor(supervisor: Supervisor): Promise<void> {
    this.assertFirebase();
    const emailKey = normalize(supervisor.email || "");
    const nameKey = normalize(supervisor.nome);
    const duplicate = this.supervisors.find(s => s.id !== supervisor.id && ((emailKey && normalize(s.email || "") === emailKey) || normalize(s.nome) === nameKey));
    if (duplicate) throw new Error("Este supervisor já está cadastrado.");
    const id = supervisor.id || idFrom("sup", supervisor.email || supervisor.nome);
    await setDoc(doc(db, "supervisors", id), { ...supervisor, id, nomeNormalizado: nameKey, emailNormalizado: emailKey, updatedAt: serverTimestamp() }, { merge: true });
  }
  async updateSupervisor(id: string, data: Partial<Supervisor>) { await this.saveSupervisor({ ...(this.supervisors.find(s => s.id === id) as Supervisor), ...data, id }); }
  async deleteSupervisor(id: string) { this.assertFirebase(); await deleteDoc(doc(db, "supervisors", id)); }

  async saveArea(area: Area): Promise<void> {
    this.assertFirebase();
    const key = normalize(area.nome);
    const duplicate = this.areas.find(a => a.id !== area.id && normalize(a.nome) === key);
    if (duplicate) throw new Error("Esta localidade já está cadastrada.");
    const id = area.id || idFrom("loc", area.nome);
    await setDoc(doc(db, "areas", id), { ...area, id, nomeNormalizado: key, updatedAt: serverTimestamp() }, { merge: true });
  }
  async updateArea(id: string, data: Partial<Area>) { await this.saveArea({ ...(this.areas.find(a => a.id === id) as Area), ...data, id }); }
  async deleteArea(id: string) { this.assertFirebase(); await deleteDoc(doc(db, "areas", id)); }

  async saveContract(contract: Contract): Promise<void> {
    this.assertFirebase();
    const codeKey = normalizeCode(contract.codigo);
    const nameKey = normalize(contract.nome);
    const duplicate = this.contracts.find(c => c.id !== contract.id && ((codeKey && normalizeCode(c.codigo) === codeKey) || (!codeKey && normalize(c.nome) === nameKey)));
    if (duplicate) throw new Error("Este contrato já está cadastrado.");
    const id = contract.id || idFrom("ctr", contract.codigo || contract.nome);
    await setDoc(doc(db, "contracts", id), { ...contract, id, codigoNormalizado: codeKey, nomeNormalizado: nameKey, updatedAt: serverTimestamp() }, { merge: true });
  }
  async updateContract(id: string, data: Partial<Contract>) { await this.saveContract({ ...(this.contracts.find(c => c.id === id) as Contract), ...data, id }); }
  async deleteContract(id: string) { this.assertFirebase(); await deleteDoc(doc(db, "contracts", id)); }

  async saveConfig(config: SystemConfig) { this.assertFirebase(); await setDoc(doc(db, "settings", "config"), config, { merge: true }); }

  async saveUser(user: UserProfile): Promise<void> {
    this.assertFirebase();
    const emailKey = normalize(user.email);
    const duplicate = this.users.find(u => u.id !== user.id && normalize(u.email) === emailKey);
    if (duplicate) throw new Error("Este e-mail já está cadastrado.");
    await setDoc(doc(db, "users", user.id), { ...user, email: emailKey, updatedAt: serverTimestamp() }, { merge: true });

    // Sync operational supervisors directory
    const supPayload = {
      id: user.id,
      nome: user.nome.trim(),
      email: emailKey,
      cargo: (user.cargo || user.perfil || "Supervisor").trim(),
      perfil: user.perfil,
      ativo: Boolean(user.ativo),
      participaFarolGemba: user.participaFarolGemba !== false,
      gruposContratoPermitidos: user.gruposContratoPermitidos || ["vale", "vli"],
      updatedAt: serverTimestamp()
    };
    await setDoc(doc(db, "supervisors", user.id), supPayload, { merge: true });
  }

  async updateUser(id: string, data: {
    nome: string;
    email: string;
    cargo: string;
    perfil: string;
    ativo: boolean;
    participaFarolGemba: boolean;
    gruposContratoPermitidos?: GrupoContrato[];
  }): Promise<void> {
    this.assertFirebase();
    const emailKey = normalize(data.email);
    const duplicate = this.users.find(u => u.id !== id && normalize(u.email) === emailKey);
    if (duplicate) throw new Error("Este e-mail já está cadastrado.");

    const gruposPermitidos = data.gruposContratoPermitidos && data.gruposContratoPermitidos.length > 0
      ? data.gruposContratoPermitidos
      : ["vale", "vli"];

    // Strict canonical payload - no uppercase fields, only documented canonical fields
    const payload = {
      nome: data.nome.trim(),
      email: emailKey,
      cargo: data.cargo.trim(),
      perfil: data.perfil,
      ativo: Boolean(data.ativo),
      participaFarolGemba: Boolean(data.participaFarolGemba),
      gruposContratoPermitidos: gruposPermitidos,
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, "users", id), payload, { merge: true });

    // Sync operational supervisors directory with merge
    const supPayload = {
      id,
      nome: data.nome.trim(),
      email: emailKey,
      cargo: (data.cargo.trim() || data.perfil || "Supervisor").trim(),
      perfil: data.perfil,
      ativo: Boolean(data.ativo),
      participaFarolGemba: Boolean(data.participaFarolGemba),
      gruposContratoPermitidos: gruposPermitidos,
      updatedAt: serverTimestamp()
    };
    await setDoc(doc(db, "supervisors", id), supPayload, { merge: true });
  }

  /**
   * Rotina administrativa de prévia da reconciliação de inspeções legadas.
   * Não altera nenhuma inspeção; analisa e retorna as previsões de classificação.
   */
  async previewLegacyInspectionsReconciliation(): Promise<LegacyReconciliationPreview> {
    this.assertFirebase();
    let allInsps: Inspection[] = [];
    try {
      const snap = await getDocs(query(collection(db, "inspections"), limit(3000)));
      allInsps = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Inspection));
    } catch {
      allInsps = this.inspections;
    }

    const items: LegacyReconciliationItem[] = [];
    let semGrupoContrato = 0;
    let paraVale = 0;
    let paraVli = 0;
    let naoClassificados = 0;

    for (const insp of allInsps) {
      const currentGrupo = insp.grupoContrato;
      const isMissing = !currentGrupo || (currentGrupo !== "vale" && currentGrupo !== "vli");

      if (isMissing) {
        semGrupoContrato++;

        const supervisor = this.supervisors.find(s => s.id === insp.supervisorId);
        const area = this.areas.find(a => a.id === insp.areaId);
        const contract = this.contracts.find(c => c.id === insp.contratoId);

        const areaName = (area?.nome || this.deletedNames[insp.areaId || ""] || insp.areaId || "").toLowerCase();
        const contractCombined = ((contract?.codigo || "") + " " + (contract?.nome || "") + " " + (this.deletedNames[insp.contratoId || ""] || "") + " " + (insp.contratoId || "")).toLowerCase();
        const supName = (supervisor?.nome || "").toLowerCase();
        const allText = `${areaName} ${contractCombined} ${supName} ${insp.observacoes || ""} ${(insp as any).localidade || ""}`.trim();

        let grupoSugerido: "vale" | "vli" | "nao_classificado" = "nao_classificado";
        let motivo = "";

        if (
          areaName.includes("andaime vale") ||
          areaName.includes("sucateamento vale") ||
          contractCombined.includes("andaime vale") ||
          contractCombined.includes("sucateamento vale") ||
          allText.includes("andaime vale") ||
          allText.includes("sucateamento vale")
        ) {
          grupoSugerido = "vale";
          motivo = 'Classificado como Vale (Andaime Vale / Sucateamento Vale)';
          paraVale++;
        } else if (
          areaName.includes("vale") ||
          contractCombined.includes("vale")
        ) {
          grupoSugerido = "vale";
          motivo = 'Classificado como Vale (Localidade/Contrato Vale)';
          paraVale++;
        } else if (
          areaName.includes("vli") ||
          areaName.includes("fca") ||
          contractCombined.includes("vli") ||
          contractCombined.includes("fca") ||
          (supervisor && isSupervisorFromGrupoContrato(supervisor, "vli")) ||
          (area && area.nome) ||
          (contract && (contract.codigo || contract.nome))
        ) {
          grupoSugerido = "vli";
          motivo = 'Classificado como VLI (Localidade/Contrato operacional)';
          paraVli++;
        } else if (!allText || allText.length < 2) {
          grupoSugerido = "nao_classificado";
          motivo = 'Registro sem localidade, contrato ou supervisor identificável';
          naoClassificados++;
        } else {
          grupoSugerido = "vli";
          motivo = 'Classificado como VLI (Localidade operacional padrão)';
          paraVli++;
        }

        items.push({
          id: insp.id,
          data: insp.data,
          supervisorNome: supervisor?.nome || insp.supervisorId || "Não informado",
          localidade: area?.nome || insp.areaId || "Não informada",
          contrato: contract?.nome || contract?.codigo || insp.contratoId || "Não informado",
          grupoAtual: currentGrupo || "Sem grupo",
          grupoSugerido,
          motivo
        });
      }
    }

    return {
      totalAnalisadas: allInsps.length,
      semGrupoContrato,
      paraVale,
      paraVli,
      naoClassificados,
      items
    };
  }

  /**
   * Executa a reconciliação das inspeções legadas em lote no Firestore.
   * Apenas atualiza o campo grupoContrato; não apaga nem duplica registros.
   */
  async executeLegacyInspectionsReconciliation(items: LegacyReconciliationItem[]): Promise<{ updatedCount: number; errors: string[] }> {
    this.assertFirebase();
    const toUpdate = items.filter(item => item.grupoSugerido === "vale" || item.grupoSugerido === "vli");
    let updatedCount = 0;
    const errors: string[] = [];

    const CHUNK_SIZE = 400;
    for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
      const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      for (const item of chunk) {
        const ref = doc(db, "inspections", item.id);
        batch.set(ref, {
          grupoContrato: item.grupoSugerido,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      try {
        await batch.commit();
        updatedCount += chunk.length;
      } catch (err: any) {
        console.error("Erro ao aplicar lote de reconciliação:", err);
        errors.push(`Erro no lote ${Math.floor(i / CHUNK_SIZE) + 1}: ${err?.message || err}`);
      }
    }

    // Update local cache
    for (const item of toUpdate) {
      const existing = this.inspections.find(i => i.id === item.id);
      if (existing) {
        existing.grupoContrato = item.grupoSugerido as "vale" | "vli";
      }
    }
    this.emit("inspections");

    return { updatedCount, errors };
  }

  async deleteUser(id: string) {
    this.assertFirebase();
    await deleteDoc(doc(db, "users", id));
    await deleteDoc(doc(db, "supervisors", id)).catch(() => undefined);
  }

  async saveDeletedName(id: string, name: string) { this.assertFirebase(); await setDoc(doc(db, "deleted_names", id), { name }, { merge: true }); }

  async addNotification(userName: string, action: string, tipoLancamento?: string) {
    this.assertFirebase();
    const id = `notif_${crypto.randomUUID()}`;
    const now = new Date();
    const payload: AppNotification = {
      id, userName, action, tipoLancamento,
      dataHora: now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      read: false, createdAt: now.toISOString()
    };
    await setDoc(doc(db, "notifications", id), payload);
  }
  async markNotificationAsRead(id: string) { this.assertFirebase(); await updateDoc(doc(db, "notifications", id), { read: true }); }
  async markAllNotificationsAsRead() { this.assertFirebase(); await Promise.all(this.notifications.filter(n => !n.read).map(n => updateDoc(doc(db, "notifications", n.id), { read: true }))); }

  async saveAuthorizedEmail(item: AuthorizedEmail) {
    this.assertFirebase();
    const normalized = normalize(item.email);
    const duplicate = this.authorizedEmails.find(e => e.id !== item.id && normalize(e.email) === normalized);
    if (duplicate) throw new Error("Este e-mail já está autorizado.");
    const id = item.id || idFrom("email", normalized);
    await setDoc(doc(db, "authorized_emails", id), { ...item, id, email: normalized }, { merge: true });
  }
  async deleteAuthorizedEmail(id: string) { this.assertFirebase(); await deleteDoc(doc(db, "authorized_emails", id)); }

  getBackupJSON(): string {
    return JSON.stringify({ inspections: this.inspections, supervisors: this.supervisors, areas: this.areas, contracts: this.contracts, users: this.users, notifications: this.notifications, authorizedEmails: this.authorizedEmails, deletedNames: this.deletedNames, config: this.config, exportedAt: new Date().toISOString() }, null, 2);
  }
  async restoreBackup(json: string): Promise<boolean> {
    this.assertFirebase();
    try {
      const data = JSON.parse(json);
      const batch = writeBatch(db);
      for (const [collectionName, values] of Object.entries({ inspections: data.inspections, supervisors: data.supervisors, areas: data.areas, contracts: data.contracts, users: data.users, notifications: data.notifications, authorized_emails: data.authorizedEmails })) {
        if (Array.isArray(values)) values.forEach((item: any) => batch.set(doc(db, collectionName, item.id), item, { merge: true }));
      }
      if (data.deletedNames && typeof data.deletedNames === "object") Object.entries(data.deletedNames).forEach(([id, name]) => batch.set(doc(db, "deleted_names", id), { name }, { merge: true }));
      if (data.config) batch.set(doc(db, "settings", "config"), data.config, { merge: true });
      await batch.commit();
      return true;
    } catch (error) { console.error(error); return false; }
  }

  async resetToDefault(): Promise<void> { throw new Error("Restauração de dados de demonstração foi removida da versão de produção."); }
  async testFirestoreConnection(): Promise<boolean> { return !!(hasFirebase && db); }

  async registerUserInAuth(email: string, temporaryPassword: string): Promise<string> {
    if (!hasFirebase) throw new Error("Firebase não está configurado.");
    if (temporaryPassword.length < 6) throw new Error("A senha temporária deve ter pelo menos 6 caracteres.");
    const { initializeApp, deleteApp } = await import("firebase/app");
    const { getAuth, createUserWithEmailAndPassword } = await import("firebase/auth");
    const configModule = await import("../../firebase-applet-config.json");
    const secondary = initializeApp(configModule.default, `user-provisioning-${Date.now()}`);
    try {
      const credential = await createUserWithEmailAndPassword(getAuth(secondary), email.trim().toLowerCase(), temporaryPassword);
      return credential.user.uid;
    } finally {
      await deleteApp(secondary).catch(() => undefined);
    }
  }

  /** One-time, explicit maintenance. Keeps the oldest document of each normalized key. */
  async deduplicateConfiguration(): Promise<Record<string, number>> {
    this.assertFirebase();
    const result: Record<string, number> = {};
    const rules = [
      { col: "supervisors", key: (d: any) => normalize(d.email || d.nome) },
      { col: "areas", key: (d: any) => normalize(d.nome) },
      { col: "contracts", key: (d: any) => normalizeCode(d.codigo) || `${normalize(d.nome)}` },
      { col: "authorized_emails", key: (d: any) => normalize(d.email) }
    ];
    for (const rule of rules) {
      const snap = await getDocs(collection(db, rule.col));
      const seen = new Map<string, string>();
      const batch = writeBatch(db);
      let removed = 0;
      snap.docs.forEach(d => {
        const key = rule.key(d.data());
        if (!key) return;
        if (seen.has(key)) { batch.delete(d.ref); removed++; } else seen.set(key, d.id);
      });
      if (removed) await batch.commit();
      result[rule.col] = removed;
    }
    return result;
  }

  async getUserById(id: string): Promise<UserProfile | null> {
    this.assertFirebase();
    const cached = this.users.find(u => u.id === id);
    if (cached) return cached;
    const docSnap = await getDoc(doc(db, "users", id));
    if (docSnap.exists()) {
      return normalizeUserProfile(this.convert(docSnap.data()), docSnap.id);
    }
    return null;
  }

  async previewStandardizeUserProfiles(): Promise<{
    totalAnalyzed: number;
    toUpdate: Array<{
      id: string;
      email: string;
      nome: string;
      changes: string[];
      legacyFields: string[];
      canonicalValues: Record<string, any>;
    }>;
    alreadyStandard: number;
    missingNameOrEmail: Array<{ id: string; email: string; nome: string }>;
  }> {
    this.assertFirebase();
    const snap = await getDocs(collection(db, "users"));
    const toUpdate: Array<{
      id: string;
      email: string;
      nome: string;
      changes: string[];
      legacyFields: string[];
      canonicalValues: Record<string, any>;
    }> = [];
    let alreadyStandard = 0;
    const missingNameOrEmail: Array<{ id: string; email: string; nome: string }> = [];

    snap.docs.forEach(userDoc => {
      const rawData = userDoc.data();
      const normalized = normalizeUserProfile(rawData, userDoc.id);
      const changes: string[] = [];
      const legacyFields: string[] = [];

      // Detect legacy uppercase fields
      if (rawData.ATIVO !== undefined) legacyFields.push("ATIVO");
      if (rawData.CARGO !== undefined) legacyFields.push("CARGO");
      if (rawData.DEVEALTERARSENHA !== undefined) legacyFields.push("DEVEALTERARSENHA");
      if (rawData.EMAIL !== undefined) legacyFields.push("EMAIL");
      if (rawData.NOME !== undefined) legacyFields.push("NOME");
      if (rawData.PERFIL !== undefined) legacyFields.push("PERFIL");
      if (rawData.PRIMEIROACESSO !== undefined) legacyFields.push("PRIMEIROACESSO");
      if (rawData.ULTIMOLOGIN !== undefined) legacyFields.push("ULTIMOLOGIN");

      if (legacyFields.length > 0) {
        changes.push(`Remover ${legacyFields.length} campo(s) em maiúsculas: ${legacyFields.join(", ")}`);
      }

      // Check missing canonical fields
      if (rawData.ativo === undefined && normalized.ativo !== undefined) changes.push(`ativo: ${normalized.ativo}`);
      if (rawData.email === undefined && normalized.email) changes.push(`email: ${normalized.email}`);
      if (rawData.nome === undefined && normalized.nome) changes.push(`nome: ${normalized.nome}`);
      if (rawData.perfil === undefined && normalized.perfil) changes.push(`perfil: ${normalized.perfil}`);
      if (rawData.cargo === undefined && normalized.cargo) changes.push(`cargo: ${normalized.cargo}`);
      if (rawData.primeiroAcesso === undefined && normalized.primeiroAcesso !== undefined) changes.push(`primeiroAcesso: ${normalized.primeiroAcesso}`);
      if (rawData.deveAlterarSenha === undefined && normalized.deveAlterarSenha !== undefined) changes.push(`deveAlterarSenha: ${normalized.deveAlterarSenha}`);
      if (rawData.participaFarolGemba === undefined) changes.push(`participaFarolGemba: ${normalized.participaFarolGemba}`);

      // Check special 13 users
      const special13 = NOVOS_13_USUARIOS_PADRAO.find(u => u.email.toLowerCase() === normalized.email.toLowerCase());
      if (special13) {
        if (normalized.participaFarolGemba !== false) {
          changes.push("Definir participaFarolGemba: false (Regra Liderança/Segurança)");
          normalized.participaFarolGemba = false;
        }
        if (special13.cargo && !normalized.cargo) {
          changes.push(`Definir cargo padrão: "${special13.cargo}"`);
          normalized.cargo = special13.cargo;
        }
      }

      if (!normalized.email || !normalized.nome) {
        missingNameOrEmail.push({ id: userDoc.id, email: normalized.email, nome: normalized.nome });
      }

      if (changes.length > 0) {
        toUpdate.push({
          id: userDoc.id,
          email: normalized.email || "(sem e-mail)",
          nome: normalized.nome || "(sem nome)",
          changes,
          legacyFields,
          canonicalValues: {
            ativo: normalized.ativo,
            cargo: normalized.cargo || "",
            deveAlterarSenha: normalized.deveAlterarSenha,
            email: normalized.email,
            nome: normalized.nome,
            perfil: normalized.perfil,
            primeiroAcesso: normalized.primeiroAcesso,
            participaFarolGemba: normalized.participaFarolGemba
          }
        });
      } else {
        alreadyStandard++;
      }
    });

    return {
      totalAnalyzed: snap.docs.length,
      toUpdate,
      alreadyStandard,
      missingNameOrEmail
    };
  }

  async standardizeUserProfiles(): Promise<{
    totalAnalyzed: number;
    updatedCount: number;
    details: Array<{ id: string; email: string; nome: string; changes: string[] }>;
    errors: string[];
  }> {
    this.assertFirebase();
    const snap = await getDocs(collection(db, "users"));
    const details: Array<{ id: string; email: string; nome: string; changes: string[] }> = [];
    const errors: string[] = [];
    let updatedCount = 0;

    for (const userDoc of snap.docs) {
      const rawData = userDoc.data();
      const normalized = normalizeUserProfile(rawData, userDoc.id);
      const changes: string[] = [];
      const legacyFields: string[] = [];

      if (rawData.ATIVO !== undefined) legacyFields.push("ATIVO");
      if (rawData.CARGO !== undefined) legacyFields.push("CARGO");
      if (rawData.DEVEALTERARSENHA !== undefined) legacyFields.push("DEVEALTERARSENHA");
      if (rawData.EMAIL !== undefined) legacyFields.push("EMAIL");
      if (rawData.NOME !== undefined) legacyFields.push("NOME");
      if (rawData.PERFIL !== undefined) legacyFields.push("PERFIL");
      if (rawData.PRIMEIROACESSO !== undefined) legacyFields.push("PRIMEIROACESSO");
      if (rawData.ULTIMOLOGIN !== undefined) legacyFields.push("ULTIMOLOGIN");

      if (legacyFields.length > 0) {
        changes.push(`Campos legados removidos: ${legacyFields.join(", ")}`);
      }

      if (rawData.ativo === undefined) changes.push(`ativo: ${normalized.ativo}`);
      if (rawData.email === undefined) changes.push(`email: ${normalized.email}`);
      if (rawData.nome === undefined) changes.push(`nome: ${normalized.nome}`);
      if (rawData.perfil === undefined) changes.push(`perfil: ${normalized.perfil}`);
      if (rawData.cargo === undefined && normalized.cargo) changes.push(`cargo: ${normalized.cargo}`);
      if (rawData.primeiroAcesso === undefined) changes.push(`primeiroAcesso: ${normalized.primeiroAcesso}`);
      if (rawData.deveAlterarSenha === undefined) changes.push(`deveAlterarSenha: ${normalized.deveAlterarSenha}`);
      if (rawData.participaFarolGemba === undefined) changes.push(`participaFarolGemba: ${normalized.participaFarolGemba}`);

      // Special 13 users check
      const special13 = NOVOS_13_USUARIOS_PADRAO.find(u => u.email.toLowerCase() === normalized.email.toLowerCase());
      if (special13) {
        if (normalized.participaFarolGemba !== false) {
          normalized.participaFarolGemba = false;
          changes.push("participaFarolGemba: false");
        }
        if (special13.cargo && !normalized.cargo) {
          normalized.cargo = special13.cargo;
          changes.push(`cargo: ${special13.cargo}`);
        }
      }

      if (changes.length > 0) {
        try {
          const updatePayload: Record<string, any> = {
            ativo: normalized.ativo,
            cargo: normalized.cargo || "",
            deveAlterarSenha: normalized.deveAlterarSenha,
            email: normalized.email,
            nome: normalized.nome,
            perfil: normalized.perfil,
            primeiroAcesso: normalized.primeiroAcesso,
            participaFarolGemba: normalized.participaFarolGemba,
            updatedAt: serverTimestamp()
          };

          // Exclusively delete legacy uppercase fields without touching any other fields
          if (rawData.ATIVO !== undefined) updatePayload.ATIVO = deleteField();
          if (rawData.CARGO !== undefined) updatePayload.CARGO = deleteField();
          if (rawData.DEVEALTERARSENHA !== undefined) updatePayload.DEVEALTERARSENHA = deleteField();
          if (rawData.EMAIL !== undefined) updatePayload.EMAIL = deleteField();
          if (rawData.NOME !== undefined) updatePayload.NOME = deleteField();
          if (rawData.PERFIL !== undefined) updatePayload.PERFIL = deleteField();
          if (rawData.PRIMEIROACESSO !== undefined) updatePayload.PRIMEIROACESSO = deleteField();
          if (rawData.ULTIMOLOGIN !== undefined) updatePayload.ULTIMOLOGIN = deleteField();

          await updateDoc(doc(db, "users", userDoc.id), updatePayload);
          updatedCount++;
          details.push({
            id: userDoc.id,
            email: normalized.email || "(sem e-mail)",
            nome: normalized.nome || "(sem nome)",
            changes
          });
        } catch (err: any) {
          console.error(`Erro ao padronizar usuário ${userDoc.id}:`, err);
          errors.push(`Erro ao padronizar usuário ${userDoc.id} (${normalized.email}): ${err?.message || err}`);
        }
      }
    }

    try {
      await this.addAuditLog("standardize_user_profiles", "users", "all", {
        totalAnalyzed: snap.docs.length,
        updatedCount,
        errorCount: errors.length
      });
    } catch (auditErr) {
      console.warn("Não foi possível registrar o log de auditoria da padronização:", auditErr);
    }

    return {
      totalAnalyzed: snap.docs.length,
      updatedCount,
      details,
      errors
    };
  }

  async initializeStandard13Users(): Promise<{
    created: number;
    updated: number;
    errors: string[];
  }> {
    this.assertFirebase();
    const snap = await getDocs(collection(db, "users"));
    const existingUsers = snap.docs.map(d => normalizeUserProfile(d.data(), d.id));
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const item of NOVOS_13_USUARIOS_PADRAO) {
      const emailLower = item.email.trim().toLowerCase();
      const existing = existingUsers.find(u => u.email.toLowerCase() === emailLower);

      if (existing) {
        try {
          await updateDoc(doc(db, "users", existing.id), {
            perfil: "supervisor",
            cargo: existing.cargo || item.cargo,
            ativo: true,
            primeiroAcesso: existing.primeiroAcesso ?? true,
            deveAlterarSenha: existing.deveAlterarSenha ?? true,
            participaFarolGemba: false,
            updatedAt: serverTimestamp()
          });
          updated++;
        } catch (err: any) {
          errors.push(`Erro ao atualizar ${item.email}: ${err?.message || err}`);
        }
      } else {
        // Also ensure pre-authorization exists
        try {
          const authEmailId = idFrom("email", emailLower);
          await setDoc(doc(db, "authorized_emails", authEmailId), {
            id: authEmailId,
            email: emailLower,
            perfilPadrao: "Supervisor",
            ativo: true,
            updatedAt: serverTimestamp()
          }, { merge: true });
          created++;
        } catch (err: any) {
          errors.push(`Erro ao pré-autorizar ${item.email}: ${err?.message || err}`);
        }
      }
    }

    return { created, updated, errors };
  }

  private isJhonata(sup?: any): boolean {
    if (!sup) return false;
    const email = String(sup.email || "").trim().toLowerCase();
    const nome = String(sup.nome || "").toLowerCase();
    const id = String(sup.id || "").toLowerCase();
    return (
      email === "j.santos@grupofta.com.br" ||
      email === "jhonata.santos@grupofta.com.br" ||
      email.startsWith("jhonata") ||
      id.includes("j_santos") ||
      id.includes("jhonata") ||
      (nome.includes("jhonata") && (nome.includes("santos") || nome.includes("gonçalves") || nome.includes("goncalves")))
    );
  }
}

export const dbService = new DBService();
