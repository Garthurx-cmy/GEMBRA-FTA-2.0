import { Inspection, Supervisor, UserProfile } from "../types";

export const normalizeText = (value = ""): string => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
export const emailKey = (value?: string) => (value || "").trim().toLowerCase();

export interface CanonicalVliPerson {
  nome: string;
  email: string;
  perfil: "Supervisor" | "Gestor";
  cargo: string;
}

export const CANONICAL_VLI_DIRECTORY: readonly CanonicalVliPerson[] = [
  {
    nome: "Dener Rodrigues de Souza",
    email: "d.souza@grupofta.com.br",
    perfil: "Supervisor",
    cargo: "Supervisor"
  },
  {
    nome: "Jhonata Gonçalves Santos",
    email: "j.santos@grupofta.com.br",
    perfil: "Gestor",
    cargo: "Gestor"
  },
  {
    nome: "Wagner Monteiro",
    email: "w.monteiro@grupofta.com.br",
    perfil: "Supervisor",
    cargo: "Supervisor"
  },
  {
    nome: "Klayton Anderson Sabino",
    email: "k.sabino@grupofta.com.br",
    perfil: "Supervisor",
    cargo: "Supervisor"
  },
  {
    nome: "Murilo Henrique Gonçallo Nascimento",
    email: "m.nascimento@grupofta.com.br",
    perfil: "Supervisor",
    cargo: "Supervisor"
  },
  {
    nome: "Jose Mauricio Dos Santos Junior",
    email: "j.junior@grupofta.com.br",
    perfil: "Supervisor",
    cargo: "Supervisor"
  }
] as const;

export function isWagnerAlias(nameOrEmail?: string): boolean {
  if (!nameOrEmail) return false;
  const n = normalizeText(nameOrEmail);
  const e = emailKey(nameOrEmail);
  return (
    e === "w.monteiro@grupofta.com.br" ||
    n === "wagner/avela" ||
    n === "wagner avela" ||
    n === "wagner monteiro" ||
    n.startsWith("wagner/avela") ||
    n.startsWith("wagner avela") ||
    n.includes("wagner/avela")
  );
}

export function isInvalidWillianIdentity(text?: string): boolean {
  if (!text) return false;
  const n = normalizeText(text);
  return (
    n === "willian fta" ||
    n === "willian" ||
    n.includes("willian fta") ||
    n === "willian_fta" ||
    n.startsWith("willian fta")
  );
}

export function findCanonicalPerson(nameOrEmail?: string): CanonicalVliPerson | undefined {
  if (!nameOrEmail) return undefined;
  const e = emailKey(nameOrEmail);
  const n = normalizeText(nameOrEmail);
  if (isWagnerAlias(nameOrEmail)) {
    return CANONICAL_VLI_DIRECTORY.find(c => c.nome === "Wagner Monteiro");
  }
  return CANONICAL_VLI_DIRECTORY.find(c =>
    emailKey(c.email) === e ||
    normalizeText(c.nome) === n ||
    n.includes(normalizeText(c.nome)) ||
    normalizeText(c.nome).includes(n)
  );
}

export function isSupervisorOrLeaderRole(role?: string): boolean {
  const value = normalizeText(role).replace(/_/g, " ");
  return value === "supervisor" || value === "lider" || value.startsWith("lider de equipe") || value === "gestor";
}

export function isOperationalRole(role?: string): boolean {
  const value = normalizeText(role).replace(/_/g, " ");
  return (
    isSupervisorOrLeaderRole(value) ||
    value.includes("admin") ||
    value.includes("desenvolvedor") ||
    value.includes("engenheiro") ||
    value.includes("analista")
  );
}

export function canLaunchInspection(userOrRole?: string | UserProfile | null): boolean {
  if (!userOrRole) return false;
  if (typeof userOrRole === "object" && userOrRole.ativo === false) return false;
  const roleStr = typeof userOrRole === "string" ? userOrRole : (userOrRole.perfil || userOrRole.cargo || "");
  const value = normalizeText(roleStr).replace(/_/g, " ");
  if (value === "visitante") return false;
  return isOperationalRole(value);
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
    if (isInvalidWillianIdentity(item.nome) || isInvalidWillianIdentity(item.id)) return;

    // Normalize Wagner Monteiro in memory
    if (isWagnerAlias(item.nome) || emailKey(item.email) === "w.monteiro@grupofta.com.br") {
      item.nome = "Wagner Monteiro";
      item.email = item.email || "w.monteiro@grupofta.com.br";
    }

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
    if (isInvalidWillianIdentity(sup.nome) || isInvalidWillianIdentity(sup.id)) continue;
    const isJhonata = emailKey(sup.email) === "j.santos@grupofta.com.br" || normalizeText(sup.nome).includes("jhonata");
    const canonical = findCanonicalPerson(sup.email || sup.nome);
    const owners = allUsers.filter(u => u.id === sup.id ||
      (emailKey(u.email) && emailKey(u.email) === emailKey(sup.email)));
    const owner = owners.length === 1 ? owners[0] : undefined;
    add({ ...sup,
      nome: canonical?.nome || owner?.nome || sup.nome,
      ativo: owner?.ativo ?? sup.ativo ?? true,
      cargo: canonical?.cargo || (isJhonata ? "Gestor" : (owner?.cargo || sup.cargo || "Supervisor")),
      perfil: canonical?.perfil || (isJhonata ? "Gestor" : (owner?.perfil || sup.perfil || "Supervisor")),
      participaFarolGemba: isJhonata ? false : (owner?.participaFarolGemba ?? sup.participaFarolGemba ?? true),
      gruposContratoPermitidos: owner?.gruposContratoPermitidos ?? sup.gruposContratoPermitidos ?? ["vli"]
    });
  }

  for (const user of allUsers) {
    if (isInvalidWillianIdentity(user.nome) || isInvalidWillianIdentity(user.id)) continue;
    if (!isSupervisorOrLeaderRole(user.perfil)) continue;
    const isJhonata = emailKey(user.email) === "j.santos@grupofta.com.br" || normalizeText(user.nome).includes("jhonata");
    const canonical = findCanonicalPerson(user.email || user.nome);
    add({
      id: user.id,
      nome: canonical?.nome || user.nome,
      email: canonical?.email || user.email,
      cargo: canonical?.cargo || user.cargo || (isJhonata ? "Gestor" : "Supervisor"),
      perfil: canonical?.perfil || (isJhonata ? "Gestor" : user.perfil),
      ativo: user.ativo ?? true,
      participaFarolGemba: isJhonata ? false : (user.participaFarolGemba ?? true),
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

      if (isInvalidWillianIdentity(directName) || isInvalidWillianIdentity(insp.supervisorId)) {
        // Ignorar "Willian FTA" como identidade válida.
        // NÃO criar "Willian FTA" como usuário, supervisor, alias ou participante do Farol.
        continue;
      }

      if (isWagnerAlias(directName) || emailKey(insp.supervisorEmail) === "w.monteiro@grupofta.com.br") {
        // Resolver em memória: Wagner/Avela -> Wagner Monteiro
        // Exibir somente uma linha chamada “Wagner Monteiro”.
        const wagner = result.find(s => isWagnerAlias(s.nome) || emailKey(s.email) === "w.monteiro@grupofta.com.br");
        if (wagner) {
          if (insp.supervisorId && !supervisorMatchesId(wagner, insp.supervisorId)) {
            wagner.legacyIds = [...(wagner.legacyIds || []), insp.supervisorId];
          }
        } else {
          add({
            id: insp.supervisorId || "sup-wagner-monteiro",
            nome: "Wagner Monteiro",
            email: "w.monteiro@grupofta.com.br",
            cargo: "Supervisor",
            perfil: "Supervisor",
            ativo: true,
            participaFarolGemba: true,
            metaSemanal: 7,
            metaMensal: 28,
            grupoContrato: "vli",
            gruposContratoPermitidos: ["vli"],
            legacyIds: insp.supervisorId ? [insp.supervisorId] : []
          });
        }
        continue;
      }

      const canonical = findCanonicalPerson(directName) || (insp.supervisorEmail ? findCanonicalPerson(insp.supervisorEmail) : undefined);
      if (canonical) {
        const existing = result.find(s => normalizeText(s.nome) === normalizeText(canonical.nome) || emailKey(s.email) === emailKey(canonical.email));
        if (existing) {
          if (insp.supervisorId && !supervisorMatchesId(existing, insp.supervisorId)) {
            existing.legacyIds = [...(existing.legacyIds || []), insp.supervisorId];
          }
        } else {
          add({
            id: insp.supervisorId || `sup-canonical-${normalizeText(canonical.nome).replace(/\s+/g, "-")}`,
            nome: canonical.nome,
            email: canonical.email,
            cargo: canonical.cargo,
            perfil: canonical.perfil,
            ativo: true,
            participaFarolGemba: canonical.perfil === "Supervisor",
            metaSemanal: canonical.perfil === "Supervisor" ? 7 : 0,
            metaMensal: canonical.perfil === "Supervisor" ? 28 : 0,
            grupoContrato: "vli",
            gruposContratoPermitidos: ["vli"],
            legacyIds: insp.supervisorId ? [insp.supervisorId] : []
          });
        }
        continue;
      }

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

  const rawHistoricName = inspection.supervisorNome ||
    (inspection as any).SUPERVISORNOME ||
    (inspection as any).supervisor ||
    (inspection as any).SUPERVISOR ||
    inspection.responsavel ||
    (inspection as any).criadoPorNome ||
    deletedNames[inspection.supervisorId || ""] ||
    "";
  const rawEmail = inspection.supervisorEmail || (inspection as any).email || (inspection as any).EMAIL;

  // 1. Willian FTA - NÃO É UMA IDENTIDADE VÁLIDA
  // As 19 inspeções atualmente apresentadas como “Willian FTA” devem ser auditadas individualmente pelos campos reais:
  // document.id; supervisorId; supervisorEmail; supervisorNome; responsavel; legacyIds; área; contrato; tipo de lançamento.
  // Tentar vincular cada documento a uma das seis pessoas do diretório VLI somente quando existir correspondência exata e única por ID, legacyId ou e-mail.
  // Não utilizar primeiro nome, aproximação ou distribuição proporcional.
  // Quando não existir evidência única: retornar undefined (colocar em Vínculos pendentes).
  const isWillian = isInvalidWillianIdentity(rawHistoricName) || isInvalidWillianIdentity(inspection.supervisorId);
  if (isWillian) {
    if (inspection.supervisorId && !isInvalidWillianIdentity(inspection.supervisorId)) {
      const byId = supervisors.filter(s => supervisorMatchesId(s, inspection.supervisorId));
      if (byId.length === 1) return byId[0];
    }
    const e = emailKey(rawEmail || inspection.criadoPorEmail);
    if (e && !isInvalidWillianIdentity(e)) {
      const byEmail = supervisors.filter(s => emailKey(s.email) === e);
      if (byEmail.length === 1) return byEmail[0];
    }
    if (inspection.criadoPorUid && !isInvalidWillianIdentity(inspection.criadoPorUid)) {
      const byCreator = supervisors.filter(s => supervisorMatchesId(s, inspection.criadoPorUid));
      if (byCreator.length === 1) return byCreator[0];
    }
    return undefined;
  }

  // 2. Wagner Monteiro / Wagner/Avela
  if (isWagnerAlias(rawHistoricName) || emailKey(rawEmail) === "w.monteiro@grupofta.com.br") {
    const wagner = supervisors.find(s => isWagnerAlias(s.nome) || emailKey(s.email) === "w.monteiro@grupofta.com.br");
    if (wagner) return wagner;
  }

  // 3. Match by supervisorId or legacyIds
  if (inspection.supervisorId) {
    const direct = supervisors.filter(s => supervisorMatchesId(s, inspection.supervisorId));
    if (direct.length === 1) return direct[0];
    if (direct.length > 1) return direct[0];
  }
  
  // 4. Match by email
  const storedEmail = emailKey(rawEmail);
  if (storedEmail) {
    const byEmail = supervisors.filter(s => emailKey(s.email) === storedEmail);
    if (byEmail.length === 1) return byEmail[0];
  }
  
  // 5. Match by historic name
  const historicName = normalizeText(rawHistoricName);
  if (historicName) {
    const canonical = findCanonicalPerson(rawHistoricName);
    if (canonical) {
      const byCanonical = supervisors.find(s => normalizeText(s.nome) === normalizeText(canonical.nome) || emailKey(s.email) === emailKey(canonical.email));
      if (byCanonical) return byCanonical;
    }

    const byExactName = supervisors.filter(s => normalizeText(s.nome) === historicName);
    if (byExactName.length === 1) return byExactName[0];

    const byContainsName = supervisors.filter(s => {
      const supNorm = normalizeText(s.nome);
      if (!supNorm) return false;
      return supNorm.includes(historicName) || historicName.includes(supNorm);
    });
    if (byContainsName.length === 1) return byContainsName[0];
  }

  // 6. Match by creator
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
  const rawHistoricName = inspection.supervisorNome ||
    (inspection as any).SUPERVISORNOME ||
    (inspection as any).supervisor ||
    (inspection as any).SUPERVISOR ||
    inspection.responsavel ||
    inspection.criadoPorNome ||
    deletedNames[inspection.supervisorId || ""] ||
    "";

  // If marked as Willian FTA, never display that name
  if (isInvalidWillianIdentity(rawHistoricName) || isInvalidWillianIdentity(inspection.supervisorId)) {
    const resolved = resolveInspectionSupervisor(inspection, supervisors, deletedNames);
    if (resolved?.nome && !isInvalidWillianIdentity(resolved.nome)) return resolved.nome;
    return "Supervisor não identificado";
  }

  // Wagner/Avela -> Wagner Monteiro
  if (isWagnerAlias(rawHistoricName) || emailKey(inspection.supervisorEmail) === "w.monteiro@grupofta.com.br") {
    return "Wagner Monteiro";
  }

  const resolved = resolveInspectionSupervisor(inspection, supervisors, deletedNames);
  if (resolved?.nome) return resolved.nome;
  
  if (rawHistoricName && typeof rawHistoricName === "string" && rawHistoricName.trim().length > 0) {
    return rawHistoricName.trim();
  }
  
  return "Supervisor não identificado";
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

  const rawHistoricName = inspection.supervisorNome ||
    (inspection as any).SUPERVISORNOME ||
    (inspection as any).supervisor ||
    (inspection as any).SUPERVISOR ||
    inspection.responsavel ||
    inspection.criadoPorNome ||
    deletedNames[inspection.supervisorId || ""] ||
    "";
  const rawEmail = inspection.supervisorEmail || (inspection as any).email || (inspection as any).EMAIL;

  // Wagner Monteiro matching:
  // "Wagner/Avela" belongs to Wagner Monteiro.
  // Wagner Monteiro with 114 inspections expected.
  const isSupWagner = isWagnerAlias(supervisor.nome) || emailKey(supervisor.email) === "w.monteiro@grupofta.com.br";
  if (isSupWagner) {
    if (isWagnerAlias(rawHistoricName)) return true;
    if (emailKey(rawEmail) === "w.monteiro@grupofta.com.br") return true;
    if (supervisorMatchesId(supervisor, inspection.supervisorId)) return true;
  }

  // Willian FTA inspection:
  // Tentar vincular cada documento a uma das seis pessoas do diretório VLI somente quando existir correspondência exata e única por ID, legacyId ou e-mail.
  // Não utilizar primeiro nome, aproximação ou distribuição proporcional.
  const isWillian = isInvalidWillianIdentity(rawHistoricName) || isInvalidWillianIdentity(inspection.supervisorId);
  if (isWillian) {
    if (inspection.supervisorId && !isInvalidWillianIdentity(inspection.supervisorId) && supervisorMatchesId(supervisor, inspection.supervisorId)) {
      return true;
    }
    const e = emailKey(rawEmail || inspection.criadoPorEmail);
    if (e && !isInvalidWillianIdentity(e) && emailKey(supervisor.email) === e) {
      return true;
    }
    if (inspection.criadoPorUid && supervisorMatchesId(supervisor, inspection.criadoPorUid)) {
      return true;
    }
    return false;
  }
  
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
  if (rawHistoricName && normalizeText(supervisor.nome) && normalizeText(supervisor.nome) === normalizeText(rawHistoricName)) {
    return true;
  }

  return false;
}

export function resolveSupervisorName(id: string, supervisors: Supervisor[] = [], users: UserProfile[] = [], currentUser?: UserProfile | null, deletedNames: Record<string,string> = {}): string {
  if (isInvalidWillianIdentity(id)) return "Supervisor não identificado";
  if (isWagnerAlias(id)) return "Wagner Monteiro";

  const sup = supervisors.find(s => supervisorMatchesId(s, id));
  if (sup) {
    if (isInvalidWillianIdentity(sup.nome)) return "Supervisor não identificado";
    if (isWagnerAlias(sup.nome)) return "Wagner Monteiro";
    return sup.nome;
  }

  const usr = users.find(u => u.id === id);
  if (usr) {
    if (isInvalidWillianIdentity(usr.nome)) return "Supervisor não identificado";
    if (isWagnerAlias(usr.nome)) return "Wagner Monteiro";
    return usr.nome;
  }

  if (currentUser?.id === id) {
    if (isInvalidWillianIdentity(currentUser.nome)) return "Supervisor não identificado";
    if (isWagnerAlias(currentUser.nome)) return "Wagner Monteiro";
    return currentUser.nome;
  }

  const del = deletedNames[id];
  if (del) {
    if (isInvalidWillianIdentity(del)) return "Supervisor não identificado";
    if (isWagnerAlias(del)) return "Wagner Monteiro";
    return del;
  }

  return "Responsável não identificado";
}

