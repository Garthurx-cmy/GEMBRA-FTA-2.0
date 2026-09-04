import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { dbService } from "../src/services/db";
import { getInspectionMonthKey, getUniqueMonthlyInspections } from "../src/utils/inspectionUtils";
import {
  getInspectionGrupoContrato,
  getMembrosMetaDashboard,
  getMembrosFarol,
  isSupervisorOrGestorMeta,
  getSupervisorTargets
} from "../src/utils/operational";
import {
  FirestoreConfirmationTimeoutError,
  sanitizeFirestorePayload,
  waitForFirestoreConfirmation
} from "../src/utils/firestorePayload";
import { state, emit } from "./firestoreMock";

const events = new EventTarget();
const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear()
};
Object.assign(globalThis, {
  window: {
    dispatchEvent: events.dispatchEvent.bind(events),
    localStorage: localStorageMock
  },
  localStorage: localStorageMock
});
console.trace = () => {};
const profile: any = { id: "admin-test", perfil: "Desenvolvedor/Admin", nome: "Admin Teste", email: "admin@example.test", ativo: true, gruposContratoPermitidos: ["vale", "vli"] };
function seed(count = 400) {
  for (let n = 0; n < count; n++) state.docs.set(`inspections/i${n}`, {
    id: `i${n}`,
    data: n >= 385 && n < 390 ? "2026-09-02" : n < 397 ? "2026-08-20" : "2026-07-20",
    supervisorId: "sup-old",
    ...(n >= 385 ? { grupoContrato: n < 390 ? "vale" : "vli" } : {})
  });
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
beforeEach(() => {
  dbService.stopSync(true); state.docs.clear(); state.observers = []; state.writes = [];
  state.deletes = []; state.reads = []; state.autoEmit = false; state.failPrefix = "";
});

test("Admin receives all 400 records including 385 without grupoContrato without changing IDs", () => {
  seed(); const before = JSON.stringify([...state.docs]); dbService.startSync(profile); emit("inspections");
  assert.equal(dbService.getInspections().length, 400);
  assert.equal(dbService.getInspectionSyncInfo().withoutContractGroup, 385);
  assert.equal(state.observers.find(o => o.ref.path === "inspections").ref.constraints, undefined);
  assert.equal(new Set(dbService.getInspections().map(i => i.id)).size, 400);
  assert.equal(JSON.stringify([...state.docs]), before);
});
test("manager and normalized administrator roles include legacy history", () => {
  seed();
  for (const perfil of ["Gestor", "Administrador", "admin", "DESENVOLVEDOR/ADMIN"]) {
    dbService.startSync({ ...profile, perfil }); emit("inspections");
    assert.equal(dbService.getInspections().length, 400, perfil); dbService.stopSync(true); state.observers = [];
  }
});
test("single-contract users retain origin filtering and do not list users", () => {
  seed();
  // Vale supervisor receives 5 Vale records; VLI supervisor receives 395 (385 historical + 10 VLI)
  for (const [group, count] of [["vale", 5], ["vli", 395]] as const) {
    dbService.startSync({ ...profile, perfil: "supervisor", gruposContratoPermitidos: [group] }); emit("inspections");
    assert.equal(dbService.getInspections().length, count);
    assert.equal(state.observers.some(o => o.ref.path === "users"), false);
    dbService.stopSync(true); state.observers = [];
  }
});
test("non-manager dual-contract user receives all classified groups without server query constraints", () => {
  seed(); dbService.startSync({ ...profile, perfil: "supervisor", gruposContratoPermitidos: ["vale", "vli"] }); emit("inspections");
  assert.equal(dbService.getInspections().length, 400);
  assert.equal(state.observers.find(o => o.ref.path === "inspections").ref.constraints, undefined);
});
test("absent/inactive profiles never start a listener; empty permissions never grant all records", () => {
  dbService.startSync(); dbService.startSync({ ...profile, ativo: false }); assert.equal(state.observers.length, 0);
  seed(); dbService.startSync({ ...profile, perfil: "supervisor", gruposContratoPermitidos: [] }); emit("inspections");
  assert.equal(dbService.getInspections().length, 0);
});
test("starting data synchronization and snapshots never reconcile, write, or delete", async () => {
  seed(); state.docs.set("users/uid-new", { id: "uid-new", nome: "Supervisor Teste", email: "sup@example.test", ativo: true, perfil: "supervisor" });
  state.docs.set("supervisors/sup-old", { id: "sup-old", nome: "Supervisor Teste", email: "sup@example.test", ativo: true });
  const before = JSON.stringify([...state.docs]); dbService.startSync(profile); emit(); await tick();
  assert.deepEqual(state.writes, []); assert.deepEqual(state.deletes, []); assert.deepEqual(state.reads, []);
  assert.equal(JSON.stringify([...state.docs]), before);
});
test("explicit directory reconciliation preserves old supervisor documents and inspection IDs", async () => {
  seed(); state.docs.set("users/uid-new", { id: "uid-new", nome: "Supervisor Teste", email: "sup@example.test", ativo: true, perfil: "supervisor" });
  state.docs.set("supervisors/sup_old", { id: "sup_old", nome: "Supervisor Teste", email: "sup@example.test", ativo: true });
  await dbService.reconcileSupervisors(profile);
  assert.ok(state.docs.has("supervisors/sup_old")); assert.deepEqual(state.deletes, []);
  assert.equal(state.writes.some(w => w.path.startsWith("inspections/")), false);
  assert.equal(state.docs.get("inspections/i0").supervisorId, "sup-old");
});
test("read error preserves last received records and is not treated as successful synchronization", () => {
  seed(); dbService.startSync(profile); emit("inspections"); const originalError = console.error; console.error = () => {};
  try { state.observers.find(o => o.ref.path === "inspections").error({ code: "permission-denied" }); }
  finally { console.error = originalError; }
  assert.equal(dbService.getInspections().length, 400);
  assert.equal(dbService.getInspectionSyncInfo().status, "error");
  assert.equal(dbService.getInspectionSyncInfo().errorCode, "permission-denied");
});
test("empty initial cache is not proof of empty history", () => {
  dbService.startSync(profile); emit("inspections", { fromCache: true, hasPendingWrites: false });
  assert.equal(dbService.getReadinessState(profile).inspectionsReady, false);
  assert.equal(dbService.getInspectionSyncInfo().status, "cache");
  assert.equal(dbService.getInspectionSyncInfo().lastServerSnapshotAt, null);
});
test("cache snapshot and pending writes are not advertised as server-confirmed history", () => {
  seed(); dbService.startSync(profile); emit("inspections", { fromCache: true, hasPendingWrites: false });
  assert.equal(dbService.getInspectionSyncInfo().receivedCount, 400); assert.equal(dbService.getInspectionSyncInfo().status, "cache");
  emit("inspections", { fromCache: false, hasPendingWrites: true }); assert.equal(dbService.getInspectionSyncInfo().status, "pending");
  emit("inspections"); assert.equal(dbService.getInspectionSyncInfo().status, "ready"); assert.ok(dbService.getInspectionSyncInfo().lastServerSnapshotAt);
  state.docs.clear(); emit("inspections", { fromCache: true, hasPendingWrites: false }); assert.equal(dbService.getInspections().length, 400);
});
test("genuinely empty server snapshot is represented explicitly", () => {
  dbService.startSync(profile); emit("inspections");
  assert.equal(dbService.getInspectionSyncInfo().status, "ready"); assert.equal(dbService.getInspectionSyncInfo().receivedCount, 0);
});
test("month filters retain historical records and the diagnostics expose raw monthly counts", () => {
  seed(); dbService.startSync(profile); emit("inspections"); const list = dbService.getInspections();
  assert.equal(getUniqueMonthlyInspections(list, "2026-08").length, 392);
  assert.equal(getUniqueMonthlyInspections(list, "2026-09").length, 5);
  assert.equal(getUniqueMonthlyInspections(list, "2026-07").length, 3);
  assert.deepEqual(dbService.getInspectionSyncInfo().byMonth, { "2026-08": 392, "2026-09": 5, "2026-07": 3 });
  assert.equal(list.length, 400); assert.deepEqual(state.writes, []);
});
test("operational date keeps July records in July even when a legacy reference month says August", () => {
  const julyInspection: any = {
    id: "july-stale-reference",
    data: "10/07/2026",
    mesReferencia: "2026-08",
    updatedAt: "2026-09-02T10:00:00.000Z"
  };
  assert.equal(getInspectionMonthKey(julyInspection), "2026-07");
  assert.equal(getUniqueMonthlyInspections([julyInspection], "2026-07").length, 1);
  assert.equal(getUniqueMonthlyInspections([julyInspection], "2026-08").length, 0);
  assert.equal(getInspectionMonthKey({ id: "invalid", data: "" }), null);
});
test("contract group comes from area/contract/explicit record and never from the supervisor", () => {
  const areas: any[] = [
    { id: "area-vale", nome: "Andaime Vale", grupoContrato: "vale" },
    { id: "area-vli", nome: "Ipatinga", grupoContrato: "vli" }
  ];
  const supervisors: any[] = [
    { id: "sup-vli", nome: "Supervisor VLI", gruposContratoPermitidos: ["vli"] },
    { id: "sup-vale", nome: "Supervisor Vale", gruposContratoPermitidos: ["vale"] }
  ];
  assert.equal(getInspectionGrupoContrato({ areaId: "area-vale", grupoContrato: "vli", supervisorId: "sup-vli" }, areas, [], supervisors), "vale");
  assert.equal(getInspectionGrupoContrato({ areaId: "area-vli", grupoContrato: "vale", supervisorId: "sup-vale" }, areas, [], supervisors), "vli");
  assert.equal(getInspectionGrupoContrato({ grupoContrato: "vale", supervisorId: "sup-vli" }, [], [], supervisors), "vale");
  assert.equal(getInspectionGrupoContrato({ supervisorId: "sup-vli" }, [], [], supervisors), "nao_classificado");
});
test("Firestore payload sanitizer removes undefined recursively and preserves special values", () => {
  class SpecialValue { marker = true; }
  const special = new SpecialValue();
  const sanitized: any = sanitizeFirestorePayload({
    keep: "ok",
    omit: undefined,
    nested: { omit: undefined, keep: 2 },
    list: [1, undefined, { omit: undefined, keep: 3 }],
    special
  });
  assert.deepEqual(sanitized.nested, { keep: 2 });
  assert.deepEqual(sanitized.list, [1, { keep: 3 }]);
  assert.equal("omit" in sanitized, false);
  assert.equal(sanitized.special, special);
});
test("save timeout returns control with a stable retry message instead of hanging forever", async () => {
  await assert.rejects(
    waitForFirestoreConfirmation(new Promise<void>(() => {}), 5),
    (error: any) => error instanceof FirestoreConfirmationTimeoutError && error.code === "save-confirmation-timeout"
  );
});
test("inspection confirmation succeeds even when auxiliary notification is forbidden", async () => {
  state.docs.set("areas/area-vale", { id: "area-vale", nome: "Andaime Vale", grupoContrato: "vale", ativo: true });
  state.docs.set("contracts/contract-vale", { id: "contract-vale", codigo: "02", nome: "Vale", grupoContrato: "vale", ativo: true });
  state.docs.set("supervisors/sup-vale", { id: "sup-vale", nome: "Supervisor Vale", gruposContratoPermitidos: ["vale"], ativo: true });
  dbService.startSync(profile); emit();
  state.failPrefix = "notifications/";
  const originalWarn = console.warn; console.warn = () => {};
  try {
    await dbService.saveInspection({
      id: "save-with-aux-failure",
      data: "2026-09-02",
      supervisorId: "sup-vale",
      areaId: "area-vale",
      contratoId: "contract-vale",
      grupoContrato: "vli",
      atividade: "DSS",
      tipo: "DSS",
      tipoLancamento: "DSS",
      potencial: "Leve",
      descricao: "Teste",
      acaoCorretiva: "Realizado DSS em campo",
      responsavel: "Supervisor Vale",
      prazo: "2026-09-02",
      status: "Concluído",
      fotosAntes: [],
      fotosDepois: [],
      rotacoesFotosAntes: undefined,
      rotacoesFotosDepois: undefined,
      observacoes: undefined
    } as any);
    await tick();
  } finally {
    console.warn = originalWarn;
  }

  const primaryWrite = state.writes.find((write) => write.path === "inspections/save-with-aux-failure");
  assert.ok(primaryWrite);
  assert.equal(primaryWrite.data.grupoContrato, "vale");
  assert.deepEqual(primaryWrite.data.rotacoesFotosAntes, []);
  assert.deepEqual(primaryWrite.data.rotacoesFotosDepois, []);
  assert.equal("observacoes" in primaryWrite.data, false);
});
test("primary inspection permission error is explicit and auxiliary writes do not run", async () => {
  state.docs.set("areas/area-vli", { id: "area-vli", nome: "Ipatinga", grupoContrato: "vli", ativo: true });
  state.docs.set("contracts/contract-vli", { id: "contract-vli", codigo: "01", nome: "VLI", grupoContrato: "vli", ativo: true });
  dbService.startSync(profile); emit(); state.failPrefix = "inspections/";
  await assert.rejects(
    dbService.saveInspection({
      id: "forbidden-save", data: "2026-09-02", supervisorId: "sup-vli",
      areaId: "area-vli", contratoId: "contract-vli", grupoContrato: "vli",
      atividade: "DSS", tipo: "DSS", potencial: "Leve", descricao: "Teste",
      acaoCorretiva: "Realizado DSS em campo", responsavel: "Supervisor",
      prazo: "2026-09-02", status: "Concluído"
    } as any),
    /rascunho foi mantido/i
  );
  assert.equal(state.writes.some((write) => write.path.startsWith("auditLogs/") || write.path.startsWith("notifications/")), false);
});
test("history has no arbitrary 1000-record cap and startup stays idempotent", () => {
  seed(1205); dbService.startSync(profile); const count = state.observers.length;
  dbService.startSync(profile); assert.equal(state.observers.length, count);
  emit("inspections"); assert.equal(dbService.getInspections().length, 1205);
});
test("unresolved supervisor IDs are reported without rewriting them", () => {
  seed(); dbService.startSync(profile); emit();
  assert.equal(dbService.getInspectionSyncInfo().unresolvedSupervisorCount, 400);
  assert.equal(dbService.getInspectionSyncInfo().directoryReady, true);
  assert.equal(state.docs.get("inspections/i0").supervisorId, "sup-old"); assert.deepEqual(state.writes, []);
});

test("Dashboard team goal calculation uses all active operational supervisors regardless of participaFarolGemba", () => {
  const sups: any[] = [
    { id: "s1", nome: "Wagner Monteiro", cargo: "Supervisor", perfil: "Supervisor", ativo: true, grupoContrato: "vli", participaFarolGemba: true },
    { id: "s2", nome: "Murilo Henrique", cargo: "Supervisor", perfil: "Supervisor", ativo: true, grupoContrato: "vli", participaFarolGemba: true },
    { id: "s3", nome: "Dener Rodrigues", cargo: "Supervisor", perfil: "Supervisor", ativo: true, grupoContrato: "vli", participaFarolGemba: true },
    { id: "s4", nome: "Klayton Anderson", cargo: "Supervisor", perfil: "Supervisor", ativo: true, grupoContrato: "vli", participaFarolGemba: true },
    { id: "s5", nome: "José Maurício", cargo: "Supervisor", perfil: "Supervisor", ativo: true, grupoContrato: "vli", participaFarolGemba: true },
    { id: "s6", nome: "Supervisor VLI 6", cargo: "Supervisor", perfil: "Supervisor", ativo: true, grupoContrato: "vli", participaFarolGemba: false },
    { id: "s7", nome: "Supervisor VLI 7", cargo: "Supervisor", perfil: "Supervisor", ativo: true, grupoContrato: "vli", participaFarolGemba: false },
    { id: "s8", nome: "Supervisor VLI 8", cargo: "Supervisor", perfil: "Supervisor", ativo: true, grupoContrato: "vli", participaFarolGemba: false },
    { id: "s9", nome: "Líder Equipe 1", cargo: "Líder de Equipe", perfil: "Líder de Equipe", ativo: true, grupoContrato: "vli", participaFarolGemba: false },
    { id: "s10", nome: "Admin 1", cargo: "", perfil: "Desenvolvedor/Admin", ativo: true, grupoContrato: "vli", participaFarolGemba: false },
    { id: "s11", nome: "Inativo 1", cargo: "Supervisor", perfil: "Supervisor", ativo: false, grupoContrato: "vli", participaFarolGemba: true },
    { id: "s12", nome: "Supervisor Vale 1", cargo: "Supervisor", perfil: "Supervisor", ativo: true, grupoContrato: "vale", participaFarolGemba: true }
  ];

  const dashboardMembers = getMembrosMetaDashboard(sups, "vli");
  assert.equal(dashboardMembers.length, 8, "VLI dashboard team goal must include exactly the 8 operational supervisors");

  const farolMembers = getMembrosFarol(sups, "vli");
  assert.equal(farolMembers.length, 5, "Farol must include only the 5 supervisors with participaFarolGemba !== false");

  const totalWeekly = dashboardMembers.reduce((sum, s) => sum + getSupervisorTargets(s).weekly, 0);
  const totalMonthly = dashboardMembers.reduce((sum, s) => sum + getSupervisorTargets(s).monthly, 0);

  assert.equal(totalWeekly, 56, "Weekly target for VLI team must be 56 (8 * 7)");
  assert.equal(totalMonthly, 224, "Monthly target for VLI team must be 224 (8 * 28)");
});

test("Strict deduplication in memory by document ID prevents duplicate records", () => {
  seed(50);
  dbService.startSync(profile);
  emit("inspections");
  assert.equal(dbService.getInspections().length, 50);
  const duplicateIds = new Set(dbService.getInspections().map(i => i.id));
  assert.equal(duplicateIds.size, 50);
});

test("Supervisor with VLI authorization sees all historical inspections with legacy supervisor and contract IDs", () => {
  state.docs.set("inspections/legacy-vli-1", {
    id: "legacy-vli-1",
    data: "2026-07-15",
    supervisorId: "old-unlinked-supervisor-id",
    areaId: "old-area-id",
    contratoId: "old-contrato-id"
  });
  state.docs.set("inspections/legacy-vli-2", {
    id: "legacy-vli-2",
    data: "2026-08-10",
    supervisorId: "another-old-id"
  });
  state.docs.set("inspections/new-vale-1", {
    id: "new-vale-1",
    data: "2026-09-02",
    grupoContrato: "vale",
    supervisorId: "sup-vale-1"
  });

  const vliSupervisorProfile: any = {
    id: "vli-sup-user",
    nome: "Supervisor VLI",
    email: "sup.vli@example.test",
    perfil: "supervisor",
    ativo: true,
    gruposContratoPermitidos: ["vli"]
  };

  dbService.startSync(vliSupervisorProfile);
  emit("inspections");

  const visibleInspections = dbService.getInspections();
  assert.equal(visibleInspections.length, 2);
  assert.ok(visibleInspections.some(i => i.id === "legacy-vli-1"));
  assert.ok(visibleInspections.some(i => i.id === "legacy-vli-2"));
  assert.ok(!visibleInspections.some(i => i.id === "new-vale-1"));
});

test("Classification automatically re-runs when auxiliary collections arrive after inspections", () => {
  state.docs.set("inspections/post-sept-insp", {
    id: "post-sept-insp",
    data: "2026-09-02",
    areaId: "area-andaime-vale",
    supervisorId: "sup-1"
  });

  const valeSupervisorProfile: any = {
    id: "vale-sup-user",
    nome: "Supervisor Vale",
    email: "sup.vale@example.test",
    perfil: "supervisor",
    ativo: true,
    gruposContratoPermitidos: ["vale"]
  };

  dbService.startSync(valeSupervisorProfile);
  emit("inspections");

  // Before areas arrive, area-andaime-vale is not known, so it is unclassified and not visible
  assert.equal(dbService.getInspections().length, 0);

  // Now areas arrive
  state.docs.set("areas/area-andaime-vale", {
    id: "area-andaime-vale",
    nome: "Andaime Vale",
    grupoContrato: "vale",
    ativo: true
  });
  emit("areas");

  // Re-computed immediately!
  assert.equal(dbService.getInspections().length, 1);
  assert.equal(dbService.getInspections()[0].id, "post-sept-insp");
});

test("July 2026 historical inspections without areaId or contractId are assigned to VLI unconditionally", () => {
  const julyRecord: any = {
    id: "july-bare-record",
    data: "2026-07-22"
  };
  const classified = getInspectionGrupoContrato(julyRecord, [], [], [], {});
  assert.equal(classified, "vli");
});

test("September inspections for Vale and VLI are strictly segregated by operational metadata", () => {
  const areas: any[] = [
    { id: "area-vli-1", nome: "Oficina FCA", grupoContrato: "vli" },
    { id: "area-vale-1", nome: "Andaime Vale", grupoContrato: "vale" }
  ];
  const contracts: any[] = [
    { id: "ctr-vli-1", codigo: "01", nome: "Contrato VLI", grupoContrato: "vli" },
    { id: "ctr-vale-1", codigo: "02", nome: "Contrato Vale", grupoContrato: "vale" }
  ];

  const inspVli: any = { id: "vli-1", data: "2026-09-02", areaId: "area-vli-1", contratoId: "ctr-vli-1" };
  const inspVale: any = { id: "vale-1", data: "2026-09-02", areaId: "area-vale-1", contratoId: "ctr-vale-1" };

  assert.equal(getInspectionGrupoContrato(inspVli, areas, contracts), "vli");
  assert.equal(getInspectionGrupoContrato(inspVale, areas, contracts), "vale");
});

test("Wagner Monteiro canonical resolution merges Wagner/Avela in memory without duplicating or modifying documents", () => {
  const {
    CANONICAL_VLI_DIRECTORY,
    isWagnerAlias,
    buildUnifiedSupervisors,
    inspectionBelongsToSupervisor
  } = require("../src/utils/supervisors");

  const supervisors: any[] = [
    { id: "wagner-canonical-id", nome: "Wagner Monteiro", email: "w.monteiro@grupofta.com.br", cargo: "Supervisor", perfil: "Supervisor", ativo: true, gruposContratoPermitidos: ["vli"] }
  ];

  const inspList: any[] = [];
  for (let i = 0; i < 111; i++) {
    inspList.push({ id: `w-avela-${i}`, data: "2026-08-10", supervisorNome: "Wagner/Avela", supervisorId: "legacy-avela-id" });
  }
  for (let i = 0; i < 3; i++) {
    inspList.push({ id: `w-mont-${i}`, data: "2026-08-10", supervisorNome: "Wagner Monteiro", supervisorId: "wagner-canonical-id" });
  }

  const unified = buildUnifiedSupervisors(supervisors, [], null, inspList);
  const wagnerEntries = unified.filter((s: any) => isWagnerAlias(s.nome));
  assert.equal(wagnerEntries.length, 1, "Only one entry for Wagner Monteiro must exist");
  assert.equal(wagnerEntries[0].nome, "Wagner Monteiro");

  const wagnerSup = wagnerEntries[0];
  const matching = inspList.filter((insp: any) => inspectionBelongsToSupervisor(insp, wagnerSup, unified));
  assert.equal(matching.length, 114, "Wagner Monteiro must have exactly 114 inspections (111 + 3)");

  assert.equal(unified.some((s: any) => s.nome === "Wagner/Avela"), false);
});

test("Willian FTA is strictly removed from identity, preserved in totals as Supervisor não identificado", () => {
  const {
    CANONICAL_VLI_DIRECTORY,
    isInvalidWillianIdentity,
    buildUnifiedSupervisors,
    resolveInspectionSupervisor,
    getInspectionSupervisorName,
    inspectionBelongsToSupervisor
  } = require("../src/utils/supervisors");

  const canonicalSupervisors: any[] = CANONICAL_VLI_DIRECTORY.map((c: any, idx: number) => ({
    id: `sup-can-${idx}`,
    nome: c.nome,
    email: c.email,
    cargo: c.cargo,
    perfil: c.perfil,
    ativo: true,
    gruposContratoPermitidos: ["vli"]
  }));

  const willianInsp: any = {
    id: "willian-doc-1",
    data: "2026-08-15",
    supervisorNome: "Willian FTA",
    responsavel: "Willian FTA",
    supervisorId: "raw-willian-id"
  };

  const unified = buildUnifiedSupervisors(canonicalSupervisors, [], null, [willianInsp]);
  assert.equal(unified.some((s: any) => isInvalidWillianIdentity(s.nome)), false);

  const displayName = getInspectionSupervisorName(willianInsp, unified);
  assert.equal(displayName, "Supervisor não identificado");

  const resolved = resolveInspectionSupervisor(willianInsp, unified);
  assert.equal(resolved, undefined);

  const assignedToSomeone = canonicalSupervisors.some((s: any) => inspectionBelongsToSupervisor(willianInsp, s, unified));
  assert.equal(assignedToSomeone, false, "Must not be attributed to another person by guesswork");
});

test("Canonical VLI directory preserves Jhonata as Gestor and exact 6 canonical members", () => {
  const { CANONICAL_VLI_DIRECTORY } = require("../src/utils/supervisors");
  assert.equal(CANONICAL_VLI_DIRECTORY.length, 6);
  const jhonata = CANONICAL_VLI_DIRECTORY.find((c: any) => c.nome.includes("Jhonata"));
  assert.ok(jhonata);
  assert.equal(jhonata.perfil, "Gestor");
  assert.equal(jhonata.cargo, "Gestor");
});

import "./submission_20_scenarios";


