import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dbService, normalizeUserProfile } from "../src/services/db";
import { state, emit, Sentinel } from "./firestoreMock";
import { getUniqueMonthlyInspections, getEffectiveMonthKey, getOperationalDateKey } from "../src/utils/inspectionUtils";
import { buildUnifiedSupervisors, attachHistoricalSupervisorAliases, resolveInspectionSupervisor } from "../src/utils/supervisors";
import { getInspectionGrupoContrato, getSupervisorTargets } from "../src/utils/operational";
import { getSingleInspectionScore } from "../src/utils/scoring";
import { isDialInspection, isDesvioComportamentalInspection } from "../src/types";
import { getInspectionDraft, saveInspectionDraft, deleteInspectionDraft } from "../src/utils/draftStorage";
import Farol from "../src/components/FarolGembaView";
import Historico from "../src/components/HistoricoView";

const local = new Map<string,string>();
const events = new EventTarget();
Object.assign(globalThis, { window: { localStorage: { getItem:(k:string)=>local.get(k)||null,setItem:(k:string,v:string)=>local.set(k,v),removeItem:(k:string)=>local.delete(k) }, dispatchEvent:events.dispatchEvent.bind(events) } });
Object.defineProperty(globalThis, "navigator", { configurable:true,value:{onLine:true} });
const profile:any={id:"test-admin",nome:"Admin",email:"admin@example.test",perfil:"Administrador",ativo:true,gruposContratoPermitidos:["vale","vli"]};
const sup:any={id:"current",nome:"Supervisora Teste",email:"supervisor@example.test",ativo:true,perfil:"supervisor",gruposContratoPermitidos:["vli"],metaMensal:28};
const areas:any=[{id:"vli",nome:"Ipatinga",ativo:true},{id:"vale",nome:"Andaime Vale",ativo:true}];
const inspection=(changes:any={})=>({id:"i1",data:"2026-08-20",supervisorId:"current",areaId:"vli",contratoId:"c1",atividade:"DSS",tipo:"DSS",tipoLancamento:"DSS",descricao:"Teste",acaoCorretiva:"Teste",responsavel:"Teste",prazo:"2026-08-20",status:"Concluído",potencial:"Leve",...changes}) as any;
beforeEach(()=>{dbService.stopSync(true);state.docs.clear();state.observers=[];state.writes=[];state.failPrefix="";state.autoEmit=false;local.clear();(navigator as any).onLine=true;});

test("month switch keeps August and shows no September records",()=>{const list=[inspection(),inspection({id:"july",data:"31/07/2026"})];assert.equal(getUniqueMonthlyInspections(list,"2026-08").length,1);assert.equal(getUniqueMonthlyInspections(list,"2026-09").length,0);assert.equal(getUniqueMonthlyInspections(list,"2026-08").length,1);assert.equal(list.length,2);});
test("month boundary follows Sao Paulo and leaves a selected historical month fixed",()=>{const before=getOperationalDateKey(new Date("2026-09-01T02:59:59Z")),after=getOperationalDateKey(new Date("2026-09-01T03:00:00Z"));assert.equal(getEffectiveMonthKey("auto",before),"2026-08");assert.equal(getEffectiveMonthKey("auto",after),"2026-09");assert.equal(getEffectiveMonthKey("2026-07",after),"2026-07");});
test("monthly deduplication is by ID, never by description",()=>{const i=inspection();assert.equal(getUniqueMonthlyInspections([i,i,inspection({id:"other"})],"2026-08").length,2);});
test("confirmed duplicate emails retain historical aliases without changing stored IDs",()=>{const old={...sup,id:"old"};const list=buildUnifiedSupervisors([old],[{...sup,id:"current"}]);assert.equal(list.length,1);assert.ok(list[0].legacyIds?.includes("old"));const i=inspection({supervisorId:"old"});assert.equal(resolveInspectionSupervisor(i,list)?.id,"current");assert.equal(i.supervisorId,"old");});
test("homonyms are not merged or guessed",()=>{const list=buildUnifiedSupervisors([sup,{...sup,id:"other",email:"other@example.test"}]);assert.equal(list.length,2);assert.equal(resolveInspectionSupervisor(inspection({supervisorId:"missing",supervisorNome:sup.nome}),list),undefined);});
test("exact historical deleted-name evidence restores a unique association",()=>{const i=inspection({supervisorId:"legacy"});const list=attachHistoricalSupervisorAliases([sup],[i],{legacy:sup.nome});assert.equal(resolveInspectionSupervisor(i,list)?.id,sup.id);});
test("Farol renders complete monthly history with old IDs and no cross-contract contribution",()=>{const list=attachHistoricalSupervisorAliases([sup],[],{});list[0].legacyIds=["old"];
 const inspections=[...Array.from({length:30},(_,n)=>inspection({id:`old${n}`,supervisorId:"old"})),inspection({id:"vale",areaId:"vale"}),inspection({id:"july",data:"2026-07-20"})];
 const html=renderToStaticMarkup(<Farol inspections={inspections} supervisors={list} areas={areas} selectedMonth="2026-08" grupoContrato="vli"/>);
 assert.match(html,/>30<\/td>/);assert.match(html,/>100%<\/span>/);assert.doesNotMatch(html,/sem vínculo confirmado/);
});
test("unresolved history is visible as an explicit warning",()=>{const html=renderToStaticMarkup(<Farol inspections={[inspection({supervisorId:"missing"})]} supervisors={[sup]} areas={areas} selectedMonth="2026-08" grupoContrato="vli"/>);assert.match(html,/sem vínculo confirmado/);});
test("contract classification separates Vale from VLI without mutating documents",()=>{const a=inspection(),b=inspection({areaId:"vale"});assert.equal(getInspectionGrupoContrato(a,areas),"vli");assert.equal(getInspectionGrupoContrato(b,areas),"vale");assert.equal(a.grupoContrato,undefined);});
test("leader goals remain 4/16, supervisor's custom goals remain configured",()=>{assert.deepEqual(getSupervisorTargets({...sup,cargo:"Líder de Equipe",metaMensal:20}),{weekly:4,monthly:16});assert.deepEqual(getSupervisorTargets({...sup,metaSemanal:7,metaMensal:28}),{weekly:7,monthly:28});});
test("DIAL and behavioral deviation are exclusive and keep two points",()=>{const dial=inspection({tipoLancamento:"DIAL",tipo:"Desvio Comportamental"});assert.ok(isDialInspection(dial));assert.equal(isDesvioComportamentalInspection(dial),false);assert.equal(getSingleInspectionScore(dial),2);const behavioral=inspection({tipoLancamento:"Desvio Comportamental",tipo:"DIAL"});assert.equal(isDialInspection(behavioral),false);assert.equal(getSingleInspectionScore(behavioral),2);});
test("legacy permissions normalize to arrays and admin sees both scopes",()=>{assert.deepEqual(normalizeUserProfile({...profile,perfil:"supervisor",gruposContratoPermitidos:"VALE, VLI"},"s").gruposContratoPermitidos,["vale","vli"]);assert.deepEqual(normalizeUserProfile({...profile,gruposContratoPermitidos:["vale"]},profile.id).gruposContratoPermitidos,["vale","vli"]);});
test("restricted listener filters on server; admin history is not capped; startSync is idempotent",()=>{dbService.startSync(profile);const n=state.observers.length;dbService.startSync(profile);assert.equal(state.observers.length,n);assert.equal(state.observers.find(o=>o.ref.path==="inspections").ref.constraints,undefined);dbService.stopSync(true);state.observers=[];dbService.startSync({...profile,perfil:"supervisor",gruposContratoPermitidos:["vli"]});assert.deepEqual(state.observers.find(o=>o.ref.path==="inspections").ref.constraints[0].args,["grupoContrato","==","vli"]);assert.equal(state.observers.some(o=>o.ref.path==="users"),false);});
test("empty initial cache is loading, not an empty database",()=>{dbService.startSync(profile);emit("inspections",{fromCache:true,hasPendingWrites:false});assert.equal(dbService.getSyncState(profile).inspectionsReady,false);emit("inspections");assert.equal(dbService.getSyncState(profile).inspectionsReady,true);});
test("listener failure preserves records and is never synchronized",()=>{dbService.startSync(profile);state.docs.set("inspections/i1",inspection());emit("inspections");const oldError=console.error;console.error=()=>{};state.observers.find(o=>o.ref.path==="inspections").error({code:"permission-denied"});console.error=oldError;assert.equal(dbService.getInspections().length,1);assert.equal(dbService.getSyncState(profile).serverReady,false);assert.equal(dbService.getSyncState(profile).errors[0].code,"permission-denied");});
test("saving sanitizes undefined deeply and preserves Firestore sentinels",async()=>{const result=await dbService.saveInspection(inspection({observacoes:undefined,extras:{missing:undefined,valid:true}}));assert.deepEqual(result.warnings,[]);const write=state.writes.find(w=>w.path==="inspections/i1");assert.equal("observacoes"in write.data,false);assert.deepEqual(write.data.rotacoesFotosAntes,[]);assert.deepEqual(write.data.extras,{valid:true});assert.ok(write.data.atualizadoEm instanceof Sentinel);});
test("notification failure after main save is a warning, not a failed inspection",async()=>{state.failPrefix="notifications/";const result=await dbService.saveInspection(inspection());assert.equal(state.docs.has("inspections/i1"),true);assert.equal(result.warnings.length,1);assert.match(result.warnings[0],/Notificação/);});
test("main write failure does not report success or add notifications",async()=>{state.failPrefix="inspections/";await assert.rejects(dbService.saveInspection(inspection()));assert.equal(state.writes.length,0);});
test("editing status keeps historical contract, ID, date and authorship",async()=>{dbService.startSync(profile);const original=inspection({grupoContrato:"vli",criadoPorUid:"original",createdAt:"2026-08-20T12:00:00Z"});state.docs.set("inspections/i1",original);emit("inspections");await dbService.saveInspection({...original,status:"Aberto",grupoContrato:"vale"});const saved=state.docs.get("inspections/i1");assert.equal(saved.id,"i1");assert.equal(saved.data,original.data);assert.equal(saved.criadoPorUid,"original");assert.equal(saved.grupoContrato,"vli");});
test("drafts survive storage fallback, distinguish editing and creation, and delete after save",async()=>{await saveInspectionDraft("User-A",{...inspection(),fotosAntes:["data:image/png;base64,abc"]});await saveInspectionDraft("User-A",{...inspection(),descricao:"edit"},"i1");assert.equal((await getInspectionDraft("User-A"))?.fotosAntes.length,1);assert.equal((await getInspectionDraft("User-A","i1"))?.descricao,"edit");await deleteInspectionDraft("User-A","i1");assert.equal(await getInspectionDraft("User-A","i1"),null);assert.ok(await getInspectionDraft("User-A"));assert.equal(await getInspectionDraft("user-a"),null);});

test("history applies month before pagination and shows legacy responsible names",()=>{
 const records=[...Array.from({length:30},(_,n)=>inspection({id:`aug${n}`,supervisorId:"old",descricao:`Registro agosto ${n}`})),inspection({id:"july",data:"2026-07-01",descricao:"Registro fora do mes"})];
 const props={inspections:records,supervisors:[{...sup,legacyIds:["old"]}],areas,contracts:[],onEdit:()=>{},onDelete:()=>{},onMarkAsDone:()=>{},onGeneratePDF:()=>{},currentUser:profile};
 const html=renderToStaticMarkup(<Historico {...props} selectedMonth="2026-08"/>);
 assert.match(html,/Página 1 de 2 · 30 inspeções/);assert.match(html,/Supervisora Teste/);
 assert.equal((html.match(/Registro agosto /g)||[]).length,25);assert.doesNotMatch(html,/Registro fora do mes/);
 const empty=renderToStaticMarkup(<Historico {...props} selectedMonth="2026-09"/>);
 assert.match(empty,/Nenhuma inspeção encontrada/);assert.equal(records.length,31);
});
test("server snapshots emit the inspection event consumed by realtime views",()=>{
 const keys:string[]=[];const listener=(event:any)=>keys.push(event.detail.key);
 events.addEventListener("gemba_fta_db_update",listener);
 try { dbService.startSync(profile);emit("inspections");assert.ok(keys.includes("inspections")); }
 finally { events.removeEventListener("gemba_fta_db_update",listener); }
});
