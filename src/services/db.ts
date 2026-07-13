/**
 * GEMBA FTA data service.
 * Firestore is the single source of truth. LocalStorage is intentionally not
 * used for operational data, preventing isolated or reset data per browser.
 */
import {
  Inspection, Supervisor, Area, Contract, SystemConfig, UserProfile,
  AppNotification, AuthorizedEmail, InspectionStatus
} from "../types";
import { auth, db, storage, hasFirebase } from "./firebase";
import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot,
  serverTimestamp, getDocs, query, where, writeBatch
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";

const DEFAULT_CONFIG: SystemConfig = {
  logoUrl: "/logo-fta.png",
  nomeEmpresa: "FTA Serviços Industriais",
  nomeSistema: "GEMBA FTA",
  temaEscuro: false,
  responsavelAssinaturaNome: "Jhonata Gonçalves dos Santos",
  responsavelAssinaturaCargo: "Gerente Operacional dos Contratos",
  tiposInspecao: ["DSS", "AR", "LVCC", "DIAL / Desvio Comportamental", "Desvio Estrutural", "Notificação", "Interdição", "Presença em Campo"],
  processosChecklist: [
    { id: "dss", nome: "DSS", classificacaoPadrao: "DSS" },
    { id: "ar", nome: "AR", classificacaoPadrao: "AR" },
    { id: "lvcc", nome: "LVCC", classificacaoPadrao: "LVCC" },
    { id: "dial", nome: "DIAL", classificacaoPadrao: "DIAL / Desvio Comportamental" },
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
  private unsubscribes: (() => void)[] = [];
  private started = false;

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

  startSync(currentProfile?: UserProfile): void {
    if (this.started || !hasFirebase || !db) return;
    this.started = true;
    const syncCollection = <T,>(name: string, setter: (items: T[]) => void, sort?: (a: T, b: T) => number) => {
      this.unsubscribes.push(onSnapshot(collection(db, name), snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...this.convert(d.data()) } as T));
        if (sort) list.sort(sort);
        setter(list);
        this.emit(name);
      }, err => console.error(`Falha ao sincronizar ${name}:`, err)));
    };

    this.unsubscribes.push(onSnapshot(doc(db, "settings", "config"), snap => {
      this.config = snap.exists() ? ({ ...DEFAULT_CONFIG, ...this.convert(snap.data()) } as SystemConfig) : DEFAULT_CONFIG;
      this.emit("config");
    }, err => console.error("Falha ao sincronizar configurações:", err)));

    syncCollection<Inspection>("inspections", v => this.inspections = v, (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    syncCollection<Supervisor>("supervisors", v => this.supervisors = v);
    syncCollection<Area>("areas", v => this.areas = v);
    syncCollection<Contract>("contracts", v => this.contracts = v);
    const isAdmin = currentProfile?.perfil === "Desenvolvedor/Admin" || currentProfile?.perfil === "Administrador";
    if (isAdmin) syncCollection<UserProfile>("users", v => this.users = v);
    syncCollection<AppNotification>("notifications", v => this.notifications = v, (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (isAdmin) syncCollection<AuthorizedEmail>("authorized_emails", v => this.authorizedEmails = v);
    this.unsubscribes.push(onSnapshot(collection(db, "deleted_names"), snap => {
      this.deletedNames = Object.fromEntries(snap.docs.map(d => [d.id, d.data().name || "Registro removido"]));
      this.emit("deleted_names");
    }));
  }

  stopSync(): void {
    this.unsubscribes.forEach(u => u());
    this.unsubscribes = [];
    this.started = false;
    this.inspections = []; this.supervisors = []; this.areas = []; this.contracts = [];
    this.users = []; this.notifications = []; this.authorizedEmails = [];
  }

  getInspections = () => [...this.inspections];
  getSupervisors = () => [...this.supervisors];
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

  private async uploadImages(inspectionId: string, values: string[], folder: "antes" | "depois"): Promise<string[]> {
    if (!storage) throw new Error("Firebase Storage não está configurado.");
    return Promise.all(values.map(async (value, index) => {
      if (!value.startsWith("data:")) return value;
      const path = `inspections/${inspectionId}/${folder}/${Date.now()}_${index}.jpg`;
      const fileRef = ref(storage, path);
      await uploadString(fileRef, value, "data_url");
      return getDownloadURL(fileRef);
    }));
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
    const fotosAntes = await this.uploadImages(inspection.id, inspection.fotosAntes || [], "antes");
    const fotosDepois = await this.uploadImages(inspection.id, inspection.fotosDepois || [], "depois");
    const payload: any = {
      ...inspection,
      fotosAntes,
      fotosDepois,
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
    if (item) {
      const urls = [...(item.fotosAntes || []), ...(item.fotosDepois || [])];
      await Promise.all(urls.filter(u => u.includes("firebasestorage")).map(async u => {
        try { await deleteObject(ref(storage, u)); } catch { /* arquivo já removido ou URL externa */ }
      }));
    }
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
}

export const dbService = new DBService();
