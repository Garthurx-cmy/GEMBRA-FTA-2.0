import { Inspection, Supervisor, UserProfile } from "../types";

export const normalizeText = (value = ""): string => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
const emailKey = (value?: string) => (value || "").trim().toLowerCase();

export function isOperationalRole(role?: string): boolean {
  const value = normalizeText(role).replace(/_/g, " ");
  return value === "supervisor" || value === "lider" || value.startsWith("lider de equipe");
}

export function supervisorMatchesId(supervisor: Supervisor, id?: string): boolean {
  return !!id && (supervisor.id === id || !!supervisor.legacyIds?.includes(id));
}

/** Merge only confirmed identities (ID or email). Names alone do not merge accounts. */
export function buildUnifiedSupervisors(rawSupervisors: Supervisor[] = [], users: UserProfile[] = [], currentUser?: UserProfile | null): Supervisor[] {
  const allUsers = [...users];
  if (currentUser && !allUsers.some(u => u.id === currentUser.id)) allUsers.push(currentUser);
  const result: Supervisor[] = [];
  const add = (item: Supervisor) => {
    if (!item?.id) return;
    const matches = result.filter(s => supervisorMatchesId(s, item.id) ||
      (emailKey(item.email) && emailKey(s.email) === emailKey(item.email)));
    if (matches.length > 1) return; // Conflicting identity: do not guess.
    const previous = matches[0];
    if (!previous) { result.push({ ...item, legacyIds: [...(item.legacyIds || [])] }); return; }
    const aliases = [...new Set([previous.id, item.id, ...(previous.legacyIds || []), ...(item.legacyIds || [])])];
    Object.assign(previous, { ...previous, ...item,
      metaSemanal: item.metaSemanal ?? previous.metaSemanal,
      metaMensal: item.metaMensal ?? previous.metaMensal,
      participaFarolGemba: item.participaFarolGemba ?? previous.participaFarolGemba,
      gruposContratoPermitidos: item.gruposContratoPermitidos ?? previous.gruposContratoPermitidos,
      legacyIds: aliases.filter(id => id !== item.id)
    });
  };
  for (const sup of rawSupervisors) {
    const owners = allUsers.filter(u => u.id === sup.id ||
      (emailKey(u.email) && emailKey(u.email) === emailKey(sup.email)));
    const owner = owners.length === 1 ? owners[0] : undefined;
    add({ ...sup,
      nome: owner?.nome || sup.nome,
      ativo: owner?.ativo ?? sup.ativo,
      cargo: owner?.cargo || sup.cargo,
      perfil: owner?.perfil || sup.perfil,
      participaFarolGemba: owner?.participaFarolGemba ?? sup.participaFarolGemba,
      gruposContratoPermitidos: owner?.gruposContratoPermitidos ?? sup.gruposContratoPermitidos
    });
  }
  for (const user of allUsers) {
    if (!isOperationalRole(user.perfil)) continue;
    add({ id: user.id, nome: user.nome, email: user.email, cargo: user.cargo, perfil: user.perfil,
      ativo: user.ativo, participaFarolGemba: user.participaFarolGemba,
      gruposContratoPermitidos: user.gruposContratoPermitidos });
  }
  return result.filter(s => s.ativo !== false).sort((a,b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
}

export function resolveInspectionSupervisor(inspection: Partial<Inspection>, supervisors: Supervisor[], deletedNames: Record<string,string> = {}): Supervisor | undefined {
  const direct = supervisors.filter(s => supervisorMatchesId(s, inspection.supervisorId));
  if (direct.length) return direct.length === 1 ? direct[0] : undefined;
  const storedEmail = emailKey(inspection.supervisorEmail);
  if (storedEmail) {
    const byEmail = supervisors.filter(s => emailKey(s.email) === storedEmail);
    if (byEmail.length) return byEmail.length === 1 ? byEmail[0] : undefined;
  }
  const historicName = normalizeText(inspection.supervisorNome || deletedNames[inspection.supervisorId || ""] || "");
  if (!historicName) return undefined;
  const byExactName = supervisors.filter(s => normalizeText(s.nome) === historicName);
  // Require an exact, unambiguous historical name, never partial/fuzzy names or the author.
  return byExactName.length === 1 ? byExactName[0] : undefined;
}

export function attachHistoricalSupervisorAliases(supervisors: Supervisor[], inspections: Inspection[], deletedNames: Record<string,string> = {}): Supervisor[] {
  const result = supervisors.map(s => ({...s, legacyIds: [...(s.legacyIds || [])]}));
  const candidates = new Map<string, Set<string>>();
  for (const inspection of inspections) {
    if (!inspection.supervisorId) continue;
    const match = resolveInspectionSupervisor(inspection, supervisors, deletedNames);
    if (!match) continue;
    const ids = candidates.get(inspection.supervisorId) || new Set<string>();
    ids.add(match.id); candidates.set(inspection.supervisorId, ids);
  }
  for (const [oldId, ids] of candidates) {
    if (ids.size !== 1) continue;
    const sup = result.find(s => s.id === [...ids][0]);
    if (sup && sup.id !== oldId && !sup.legacyIds.includes(oldId)) sup.legacyIds.push(oldId);
  }
  return result;
}

export function inspectionBelongsToSupervisor(inspection: Inspection, supervisor: Supervisor, supervisors: Supervisor[], deletedNames: Record<string,string> = {}): boolean {
  return resolveInspectionSupervisor(inspection, supervisors, deletedNames)?.id === supervisor.id;
}

export function resolveSupervisorName(id: string, supervisors: Supervisor[] = [], users: UserProfile[] = [], currentUser?: UserProfile | null, deletedNames: Record<string,string> = {}): string {
  return supervisors.find(s => supervisorMatchesId(s,id))?.nome || users.find(u => u.id === id)?.nome ||
    (currentUser?.id === id ? currentUser.nome : "") || deletedNames[id] || "Responsável não identificado";
}
