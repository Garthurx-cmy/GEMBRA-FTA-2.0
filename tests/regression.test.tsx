import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { dbService } from "../src/services/db";
import { getInspectionMonthKey, getUniqueMonthlyInspections } from "../src/utils/inspectionUtils";
import { getInspectionGrupoContrato } from "../src/utils/operational";
import {
  FirestoreConfirmationTimeoutError,
  sanitizeFirestorePayload,
  waitForFirestoreConfirmation
} from "../src/utils/firestorePayload";
import { state, emit } from "./firestoreMock";

const events = new EventTarget();
Object.assign(globalThis, { window: { dispatchEvent: events.dispatchEvent.bind(events) } });
console.trace = () => {};
const profile: any = { id: "admin-test", perfil: "Desenvolvedor/Admin", nome: "Admin Teste", email: "admin@example.test", ativo: true, gruposContratoPermitidos: ["vale", "vli"] };
function seed(count = 400) {
  for (let n = 0; n < count; n++) state.docs.set(`inspections/i${n}`, {
    id: `i${n}`, data: n < 397 ? "2026-08-20" : "2026-07-20", supervisorId: "sup-old",
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
  for (const [group, count] of [["vale", 5], ["vli", 10]] as const) {
    dbService.startSync({ ...profile, perfil: "supervisor", gruposContratoPermitidos: [group] }); emit("inspections");
    assert.equal(dbService.getInspections().length, count);
    assert.ok(dbService.getInspections().every(i => i.grupoContrato === group));
    assert.equal(state.observers.some(o => o.ref.path === "users"), false);
    dbService.stopSync(true); state.observers = [];
  }
});
test("non-manager dual-contract user remains constrained to classified groups", () => {
  seed(); dbService.startSync({ ...profile, perfil: "supervisor" }); emit("inspections");
  assert.equal(dbService.getInspections().length, 15);
  assert.deepEqual(state.observers.find(o => o.ref.path === "inspections").ref.constraints[0].args, ["grupoContrato", "in", ["vale", "vli"]]);
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
  assert.equal(getUniqueMonthlyInspections(list, "2026-08").length, 397);
  assert.equal(getUniqueMonthlyInspections(list, "2026-09").length, 0);
  assert.equal(getUniqueMonthlyInspections(list, "2026-08").length, 397);
  assert.deepEqual(dbService.getInspectionSyncInfo().byMonth, { "2026-08": 397, "2026-07": 3 });
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
