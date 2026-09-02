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

/** Merge only confirmed identities (ID or email) and include supervisors from history. */
export function buildUnifiedSupervisors(
  rawSupervisors: Supervisor[] = [],
  users: UserProfile[] = [],
  currentUser?: UserProfile | null,
  inspections: Inspection[] = []
): Supervisor[] {
  const allUsers = [...users];
  if (currentUser && !allUsers.some(u => u.id === currentUser.id)) allUsers.push(currentUser);
  const result: Supervisor[] = [];
  const add = (item: Supervisor) => {
    if (!item?.id && !item?.nome) return;
    const matches = result.filter(s =>
      (item.id && supervisorMatchesId(s, item.id)) ||
      (emailKey(item.email) && emailKey(s.email) === emailKey(item.email)) ||
      (normalizeText(item.nome) && normalizeText(s.nome) === normalizeText(item.nome))
    );
    if (matches.length > 1) return; // Conflicting identity: do not guess.
    const previous = matches[0];
    if (!previous) { result.push({ ...item, legacyIds: [...(item.legacyIds || [])] }); return; }
    const aliases = [...new Set([previous.id, item.id || previous.id, ...(previous.legacyIds || []), ...(item.legacyIds || [])])];
    Object.assign(previous, {
      ...previous,
      ...item,
      id: previous.id || item.id,
      nome: previous.nome || item.nome,
      metaSemanal: item.metaSemanal ?? previous.metaSemanal ?? 7,
      metaMensal: item.metaMensal ?? previous.metaMensal ?? 28,
      participaFarolGemba: item.participaFarolGemba ?? previous.participaFarolGemba ?? true,
      gruposContratoPermitidos: item.gruposContratoPermitidos ?? previous.gruposContratoPermitidos ?? ["vli"],
      legacyIds: aliases.filter(id => id !== previous.id)
    });
  };

  for (const sup of rawSupervisors) {
    const owners = allUsers.filter(u => u.id === sup.id ||
      (emailKey(u.email) && emailKey(u.email) === emailKey(sup.email)));
    const owner = owners.length === 1 ? owners[0] : undefined;
    add({ ...sup,
      nome: owner?.nome || sup.nome,
      ativo: owner?.ativo ?? sup.ativo ?? true,
      cargo: owner?.cargo || sup.cargo || "Supervisor",
      perfil: owner?.perfil || sup.perfil || "Supervisor",
      participaFarolGemba: owner?.participaFarolGemba ?? sup.participaFarolGemba ?? true,
      gruposContratoPermitidos: owner?.gruposContratoPermitidos ?? sup.gruposContratoPermitidos ?? ["vli"]
    });
  }

  for (const user of allUsers) {
    if (!isOperationalRole(user.perfil)) continue;
    add({
      id: user.id,
      nome: user.nome,
      email: user.email,
      cargo: user.cargo || "Supervisor",
      perfil: user.perfil,
      ativo: user.ativo ?? true,
      participaFarolGemba: user.participaFarolGemba ?? true,
      gruposContratoPermitidos: user.gruposContratoPermitidos ?? ["vli"]
    });
  }

  // Include supervisors who have inspections recorded in history
  if (Array.isArray(inspections)) {
    for (const insp of inspections) {
      const directName = (
        insp.supervisorNome ||
        (insp as any).SUPERVISORNOME ||
        (insp as any).supervisor ||
        (insp as any).SUPERVISOR ||
        insp.responsavel ||
        insp.criadoPorNome ||
        ""
      ).trim();

      if (directName && directName.length >= 3 && !/^(sistema|admin|teste|outros)$/i.test(directName)) {
        const id = insp.supervisorId || `sup-hist-${normalizeText(directName).replace(/\s+/g, "-")}`;
        add({
          id,
          nome: directName,
          email: insp.supervisorEmail || insp.criadoPorEmail || "",
          cargo: "Supervisor de Campo",
          perfil: "Supervisor",
          ativo: true,
          participaFarolGemba: true,
          metaSemanal: 7,
          metaMensal: 28,
          grupoContrato: insp.grupoContrato || "vli",
          gruposContratoPermitidos: insp.grupoContrato ? [insp.grupoContrato] : ["vli"]
        });
      }
    }
  }

  return result.filter(s => s.ativo !== false).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
}

export function resolveInspectionSupervisor(
  inspection: Partial<Inspection>,
  supervisors: Supervisor[],
  deletedNames: Record<string, string> = {}
): Supervisor | undefined {
  if (!inspection) return undefined;
  
  if (inspection.supervisorId) {
    const direct = supervisors.filter(s => supervisorMatchesId(s, inspection.supervisorId));
    if (direct.length) return direct[0];
  }
  
  const storedEmail = emailKey(inspection.supervisorEmail || (inspection as any).email || (inspection as any).EMAIL);
  if (storedEmail) {
    const byEmail = supervisors.filter(s => emailKey(s.email) === storedEmail);
    if (byEmail.length) return byEmail[0];
  }
  
  const rawHistoricName = inspection.supervisorNome ||
    (inspection as any).SUPERVISORNOME ||
    (inspection as any).supervisor ||
    (inspection as any).SUPERVISOR ||
    inspection.responsavel ||
    (inspection as any).criadoPorNome ||
    deletedNames[inspection.supervisorId || ""] ||
    "";
  const historicName = normalizeText(rawHistoricName);
  if (historicName) {
    const byExactName = supervisors.filter(s => normalizeText(s.nome) === historicName);
    if (byExactName.length) return byExactName[0];

    const byContainsName = supervisors.filter(s => {
      const supNorm = normalizeText(s.nome);
      if (!supNorm) return false;
      return supNorm.includes(historicName) || historicName.includes(supNorm);
    });
    if (byContainsName.length === 1) return byContainsName[0];
  }

  if (inspection.criadoPorUid) {
    const byCreator = supervisors.filter(s => supervisorMatchesId(s, inspection.criadoPorUid));
    if (byCreator.length === 1) return byCreator[0];
  }

  if (inspection.criadoPorEmail) {
    const creatorEmail = emailKey(inspection.criadoPorEmail);
    const byCreatorEmail = supervisors.filter(s => emailKey(s.email) === creatorEmail);
    if (byCreatorEmail.length === 1) return byCreatorEmail[0];
  }

  return undefined;
}

export function getInspectionSupervisorName(
  inspection: Partial<Inspection>,
  supervisors: Supervisor[] = [],
  deletedNames: Record<string, string> = {}
): string {
  const resolved = resolveInspectionSupervisor(inspection, supervisors, deletedNames);
  if (resolved?.nome) return resolved.nome;
  
  const directName = inspection.supervisorNome ||
    (inspection as any).SUPERVISORNOME ||
    (inspection as any).supervisor ||
    (inspection as any).SUPERVISOR ||
    inspection.responsavel ||
    inspection.criadoPorNome ||
    deletedNames[inspection.supervisorId || ""];
    
  if (directName && typeof directName === "string" && directName.trim().length > 0) {
    return directName.trim();
  }
  
  return "Outros";
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

export function inspectionBelongsToSupervisor(
  inspection: Inspection,
  supervisor: Supervisor,
  supervisors: Supervisor[],
  deletedNames: Record<string, string> = {}
): boolean {
  if (!inspection || !supervisor) return false;
  
  // Direct ID or legacy ID match
  if (supervisorMatchesId(supervisor, inspection.supervisorId)) return true;
  
  const resolved = resolveInspectionSupervisor(inspection, supervisors, deletedNames);
  if (resolved) {
    if (resolved.id === supervisor.id) return true;
    if (supervisorMatchesId(supervisor, resolved.id)) return true;
    if (supervisorMatchesId(resolved, supervisor.id)) return true;
    if (emailKey(supervisor.email) && emailKey(resolved.email) === emailKey(supervisor.email)) return true;
    if (normalizeText(supervisor.nome) && normalizeText(resolved.nome) === normalizeText(supervisor.nome)) return true;
  }
  
  // Direct name fallback match
  const rawHistoricName = inspection.supervisorNome ||
    (inspection as any).SUPERVISORNOME ||
    (inspection as any).supervisor ||
    (inspection as any).SUPERVISOR ||
    inspection.responsavel ||
    inspection.criadoPorNome ||
    deletedNames[inspection.supervisorId || ""] ||
    "";
  if (rawHistoricName && normalizeText(supervisor.nome) && normalizeText(supervisor.nome) === normalizeText(rawHistoricName)) {
    return true;
  }

  return false;
}

export function resolveSupervisorName(id: string, supervisors: Supervisor[] = [], users: UserProfile[] = [], currentUser?: UserProfile | null, deletedNames: Record<string,string> = {}): string {
  return supervisors.find(s => supervisorMatchesId(s,id))?.nome || users.find(u => u.id === id)?.nome ||
    (currentUser?.id === id ? currentUser.nome : "") || deletedNames[id] || "Responsável não identificado";
}
