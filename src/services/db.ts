/**
 * GEMBA FTA data service.
 * Firestore is the single source of truth. LocalStorage is intentionally not
 * used for operational data, preventing isolated or reset data per browser.
 */
import {
  Inspection, Supervisor, Area, Contract, SystemConfig, UserProfile,
  AppNotification, AuthorizedEmail, InspectionStatus, getTipoLancamento
} from "../types";
import { auth, db, hasFirebase } from "./firebase";
import {
  collection, doc,
  setDoc as fbSetDoc,
  updateDoc as fbUpdateDoc,
  deleteDoc as fbDeleteDoc,
  onSnapshot as fbOnSnapshot,
  serverTimestamp, getDocs as fbGetDocs, query, where,
  writeBatch as fbWriteBatch,
  orderBy, limit, startAfter, getDoc as fbGetDoc
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

  startSync(currentProfile?: UserProfile, activeTab?: string): void {
    if (this.syncActive || !hasFirebase || !db) return;
    this.syncActive = true;

    const currentTab = activeTab || "dashboard";
    const isAdmin = currentProfile?.perfil === "Desenvolvedor/Admin" || currentProfile?.perfil === "Administrador";

    // 1. Settings (config) - always needed when active
    this.unsubscribers.push(onSnapshot(doc(db, "settings", "config"), snap => {
      this.config = snap.exists() ? ({ ...DEFAULT_CONFIG, ...this.convert(snap.data()) } as SystemConfig) : DEFAULT_CONFIG;
      this.emit("config");
    }, err => console.error("Falha ao sincronizar configurações:", err)));

    // 2. Deleted Names - always needed to resolve deleted item labels
    this.unsubscribers.push(onSnapshot(collection(db, "deleted_names"), snap => {
      this.deletedNames = Object.fromEntries(snap.docs.map(d => [d.id, d.data().name || "Registro removido"]));
      this.emit("deleted_names");
    }, err => console.error("Falha ao sincronizar nomes removidos:", err)));

    // 3. Notifications - always needed for alert badge
    this.unsubscribers.push(onSnapshot(query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(20)), snap => {
      this.notifications = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as AppNotification));
      this.emit("notifications");
    }, err => console.error("Falha ao sincronizar notificações:", err)));

    // 4. Page/Tab Specific Sourcing
    if (currentTab === "dashboard" || currentTab === "farol" || currentTab === "ranking") {
      // Dashboard needs inspections
      this.unsubscribers.push(onSnapshot(query(collection(db, "inspections"), orderBy("data", "desc"), limit(1000)), snap => {
        this.inspections = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Inspection));
        this.emit("inspections");
      }, err => console.error("Falha ao sincronizar inspeções do Dashboard:", err)));
    } else if (currentTab === "historico" || currentTab === "relatorios" || currentTab === "lancar") {
      // These pages need supervisors, areas, and contracts for selects and display
      this.unsubscribers.push(onSnapshot(collection(db, "supervisors"), snap => {
        this.supervisors = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Supervisor));
        this.emit("supervisors");
      }, err => console.error("Falha ao sincronizar supervisores:", err)));

      this.unsubscribers.push(onSnapshot(collection(db, "areas"), snap => {
        this.areas = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Area));
        this.emit("areas");
      }, err => console.error("Falha ao sincronizar áreas:", err)));

      this.unsubscribers.push(onSnapshot(collection(db, "contracts"), snap => {
        this.contracts = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Contract));
        this.emit("contracts");
      }, err => console.error("Falha ao sincronizar contratos:", err)));
    } else if (currentTab === "configuracoes") {
      // Configuracoes page needs admin tables
      this.unsubscribers.push(onSnapshot(collection(db, "supervisors"), snap => {
        this.supervisors = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Supervisor));
        this.emit("supervisors");
      }, err => console.error("Falha ao sincronizar supervisores:", err)));

      this.unsubscribers.push(onSnapshot(collection(db, "areas"), snap => {
        this.areas = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Area));
        this.emit("areas");
      }, err => console.error("Falha ao sincronizar áreas:", err)));

      this.unsubscribers.push(onSnapshot(collection(db, "contracts"), snap => {
        this.contracts = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as Contract));
        this.emit("contracts");
      }, err => console.error("Falha ao sincronizar contratos:", err)));

      if (isAdmin) {
        this.unsubscribers.push(onSnapshot(collection(db, "users"), snap => {
          this.users = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as UserProfile));
          this.emit("users");
        }, err => console.error("Falha ao sincronizar usuários:", err)));

        this.unsubscribers.push(onSnapshot(collection(db, "authorized_emails"), snap => {
          this.authorizedEmails = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as AuthorizedEmail));
          this.emit("authorized_emails");
        }, err => console.error("Falha ao sincronizar e-mails autorizados:", err)));
      }
    }
  }

  stopSync(clearData: boolean = false): void {
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
    this.syncActive = false;
    if (clearData) {
      this.inspections = [];
      this.supervisors = [];
      this.areas = [];
      this.contracts = [];
      this.users = [];
      this.notifications = [];
      this.authorizedEmails = [];
      this.metadataPreloaded = false;
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
    const payload: any = {
      ...inspection,
      fotosAntes: inspection.fotosAntes || [],
      fotosDepois: inspection.fotosDepois || [],
      createdAt: inspection.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      atualizadoEm: serverTimestamp()
    };
    await setDoc(doc(db, "inspections", inspection.id), payload, { merge: true });
    await this.addAuditLog(isNew ? "create" : "update", "inspection", inspection.id, { supervisorId: inspection.supervisorId, status: inspection.status });
    const supName = this.supervisors.find(s => s.id === inspection.supervisorId)?.nome || "Usuário";
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
  }
  async deleteUser(id: string) { this.assertFirebase(); await deleteDoc(doc(db, "users", id)); }

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
