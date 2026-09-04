import { Area, Contract, GrupoContrato, GrupoContratoFiltro, Inspection, Supervisor } from "../types";
import { getSingleInspectionScore } from "./scoring";
import { getNormalizedInspectionDate } from "./inspectionUtils";

export type ContractGroupFilter = "Todos" | "Vale" | "VLI";

export const INICIO_OPERACAO_VALE = "2026-09-01";

export const normalizeName = (value = "") =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/**
 * Identifica se a função/cargo/perfil corresponde a Líder de Equipe.
 * Realizado por normalização textual sem vincular a nomes ou e-mails específicos.
 */
export function isLeaderRole(cargo?: string | null, perfil?: string | null): boolean {
  const combined = `${cargo || ""} ${perfil || ""}`;
  const norm = normalizeName(combined);
  return (
    norm.includes("lider de equipe") ||
    norm.includes("lider equipe") ||
    norm.includes("líder de equipe") ||
    norm.includes("líder equipe") ||
    norm.includes("lider") ||
    norm.includes("líder")
  );
}

/**
 * Identifica se a função/cargo/perfil corresponde a Gestor/Gerente/Admin.
 */
export function isGestorRole(cargo?: string | null, perfil?: string | null): boolean {
  const combined = `${cargo || ""} ${perfil || ""}`;
  const norm = normalizeName(combined);
  return (
    norm.includes("gestor") ||
    norm.includes("gerente") ||
    norm.includes("admin") ||
    norm.includes("administrador") ||
    norm.includes("desenvolvedor")
  );
}

/**
 * Determina se o responsável é um Supervisor ou Gestor operacional
 * que compõe o cálculo da meta da equipe no Dashboard.
 *
 * Regras:
 * 1. Ativo (ativo !== false).
 * 2. Líderes de Equipe não entram na meta dos supervisores.
 * 3. Administradores e Desenvolvedores puros / Visitantes não compõem meta operacional.
 * 4. Não utiliza participaFarolGemba (participaFarolGemba é exclusivo do Farol).
 */
export function isSupervisorOrGestorMeta(supervisor?: Partial<Supervisor> | null): boolean {
  if (!supervisor || supervisor.ativo === false) return false;

  // 1. Líder de Equipe não entra na meta dos supervisores
  if (isLeaderRole(supervisor.cargo, supervisor.perfil)) {
    return false;
  }

  const cargoNorm = normalizeName(supervisor.cargo || "");
  const perfilNorm = normalizeName(supervisor.perfil || "");

  // 2. Administradores e Desenvolvedores puros / Visitantes
  const isPureAdminOrDev =
    perfilNorm.includes("desenvolvedor") ||
    perfilNorm === "administrador" ||
    perfilNorm === "admin" ||
    perfilNorm === "visitante";

  const hasOperationalCargo =
    cargoNorm.includes("supervisor") ||
    cargoNorm.includes("gestor") ||
    cargoNorm.includes("gerente") ||
    cargoNorm.includes("coordenador") ||
    cargoNorm.includes("encarregado");

  if (isPureAdminOrDev && !hasOperationalCargo) {
    return false;
  }

  return true;
}

/**
 * Retorna os membros que compõem a meta do Dashboard (Supervisor e Gestor operacionais).
 * Independentemente de participaFarolGemba.
 */
export function getMembrosMetaDashboard(
  supervisors: Supervisor[] = [],
  grupo?: GrupoContratoFiltro | GrupoContrato
): Supervisor[] {
  return supervisors.filter((s) => {
    if (!isSupervisorOrGestorMeta(s)) return false;
    if (grupo === "vale") return isSupervisorFromGrupoContrato(s, "vale");
    if (grupo === "vli") return isSupervisorFromGrupoContrato(s, "vli");
    return true;
  });
}

/**
 * Retorna os membros participantes do Farol GEMBA (apenas elegíveis com participaFarolGemba !== false).
 */
export function getMembrosFarol(
  supervisors: Supervisor[] = [],
  grupo?: GrupoContratoFiltro | GrupoContrato
): Supervisor[] {
  return supervisors.filter((s) => {
    if (!isSupervisorOrGestorMeta(s) || !deveParticiparFarolGemba(s)) return false;
    if (grupo === "vale") return isSupervisorFromGrupoContrato(s, "vale");
    if (grupo === "vli") return isSupervisorFromGrupoContrato(s, "vli");
    return true;
  });
}

/**
 * Classifica a localidade/área em "vale" ou "vli".
 */
export function getGrupoContratoPorLocalidade(
  localidade: string | Area | undefined | null,
  areas: Area[] = [],
  contracts: Contract[] = []
): GrupoContrato | undefined {
  if (!localidade) return undefined;

  const classifyKnownName = (rawName?: string | null): GrupoContrato | undefined => {
    const name = normalizeName(rawName || "");
    if (!name) return undefined;

    // Regra operacional canônica: somente as duas localidades Vale são Vale.
    // Toda outra localidade/contrato operacional conhecido pertence à VLI.
    if (name.includes("vale") && (name.includes("andaime") || name.includes("sucateamento"))) return "vale";
    return "vli";
  };

  if (typeof localidade === "object") {
    const byName = classifyKnownName(localidade.nome);
    if (byName) return byName;
    if (localidade.grupoContrato === "vli" || localidade.grupoContrato === "vale") {
      return localidade.grupoContrato;
    }
    return undefined;
  }

  const str = String(localidade).trim();
  if (!str) return undefined;
  const norm = normalizeName(str);

  const matchedArea = areas.find(a => a.id === str || normalizeName(a.nome) === norm);
  if (matchedArea) {
    return classifyKnownName(matchedArea.nome)
      ?? (matchedArea.grupoContrato === "vale" || matchedArea.grupoContrato === "vli" ? matchedArea.grupoContrato : undefined);
  }

  const matchedContract = contracts.find(c =>
    c.id === str || normalizeName(c.nome) === norm || normalizeName(c.codigo) === norm
  );
  if (matchedContract) {
    return classifyKnownName(`${matchedContract.codigo || ""} ${matchedContract.nome || ""}`)
      ?? (matchedContract.grupoContrato === "vale" || matchedContract.grupoContrato === "vli" ? matchedContract.grupoContrato : undefined);
  }

  // Fallback legado apenas quando o texto traz evidência operacional suficiente.
  if (norm.includes("vale") && (norm.includes("andaime") || norm.includes("sucateamento"))) return "vale";
  if (
    norm.includes("vli") || norm.includes("fca") || norm.includes("terminal") ||
    norm.includes("patio") || norm.includes("pátio") || norm.includes("oficina") ||
    norm.includes("itaciba") || norm.includes("itacibá") || norm.includes("ipatinga") ||
    norm.includes("trecho") || norm.includes("cenibra") || norm.includes("moega") ||
    norm.includes("armazem") || norm.includes("armazém")
  ) return "vli";

  return undefined;
}

/**
 * Determina o grupo operacional de uma inspeção sem confiar cegamente em
 * `grupoContrato` legado. Área/localidade e contrato conhecidos são a fonte
 * de verdade; o campo persistido é apenas fallback. Isso recupera registros
 * históricos VLI que foram marcados incorretamente como Vale por versões
 * anteriores do frontend, sem alterar o documento no Firestore.
 */
export function getInspectionGrupoContrato(
  inspection: Partial<Inspection>,
  areas: Area[] = [],
  contracts: Contract[] = [],
  _supervisors: Supervisor[] = [],
  deletedNames: Record<string, string> = {}
): GrupoContrato | "nao_classificado" {
  if (!inspection) return "nao_classificado";

  // 1. Obter a data exclusivamente pelo campo operacional data.
  const dataOperacional = getNormalizedInspectionDate(inspection);

  // 2. Se a data for válida e menor que 2026-09-01, retornar imediatamente "vli".
  // Toda inspeção com data operacional anterior a 01/09/2026 pertence à VLI.
  // Vale não possuía inspeções históricas em julho ou agosto.
  if (dataOperacional && dataOperacional < INICIO_OPERACAO_VALE) {
    return "vli";
  }

  // Somente para datas iguais ou posteriores a 2026-09-01 (ou fallback sem data):
  // 1. areaId encontrado no diretório de áreas
  if (inspection.areaId) {
    const area = areas.find(a => a.id === inspection.areaId);
    if (area) {
      const group = getGrupoContratoPorLocalidade(area, areas, contracts);
      if (group) return group;
    }

    // 2. nome da área histórica em deleted_names
    const deletedAreaName = deletedNames[inspection.areaId];
    if (deletedAreaName) {
      const group = getGrupoContratoPorLocalidade(deletedAreaName, areas, contracts);
      if (group) return group;
    }
  }

  // 3. campos legados localidade, areaNome ou area, quando existirem
  const legacyArea = (inspection as any).localidade || (inspection as any).areaNome || (inspection as any).area;
  if (legacyArea) {
    const group = getGrupoContratoPorLocalidade(legacyArea, areas, contracts);
    if (group) return group;
  }

  // 4. contrato encontrado pelo contratoId
  if (inspection.contratoId) {
    const contract = contracts.find(c => c.id === inspection.contratoId);
    if (contract) {
      if (contract.grupoContrato === "vale" || contract.grupoContrato === "vli") return contract.grupoContrato;
      const group = getGrupoContratoPorLocalidade(
        `${contract.codigo || ""} ${contract.nome || ""}`,
        areas,
        contracts
      );
      if (group) return group;
    }

    // 5. nome histórico do contrato em deleted_names
    const deletedContractName = deletedNames[inspection.contratoId];
    if (deletedContractName) {
      const group = getGrupoContratoPorLocalidade(deletedContractName, areas, contracts);
      if (group) return group;
    }
  }

  // 6. campos legados contratoNome, contrato ou código, quando existirem
  const legacyContract = (inspection as any).contratoNome || (inspection as any).contrato || (inspection as any).codigo;
  if (legacyContract) {
    const group = getGrupoContratoPorLocalidade(legacyContract, areas, contracts);
    if (group) return group;
  }

  // 7. grupoContrato canônico já existente
  // Não confiar em grupoContrato = vale em documento anterior a setembro
  if (inspection.grupoContrato === "vli" || inspection.grupoContrato === "vale") {
    if (inspection.grupoContrato === "vale" && dataOperacional && dataOperacional < INICIO_OPERACAO_VALE) {
      return "vli";
    }
    return inspection.grupoContrato;
  }

  // 8. nao_classificado
  return "nao_classificado";
}

/**
 * Identifica se o supervisor pertence ao grupo de contrato ("vale" ou "vli").
 */
export function isSupervisorFromGrupoContrato(
  supervisor: Supervisor,
  grupo: GrupoContrato
): boolean {
  if (!supervisor) return false;

  // 1. Grupos permitidos explícitos
  if (supervisor.gruposContratoPermitidos && supervisor.gruposContratoPermitidos.length > 0) {
    return supervisor.gruposContratoPermitidos.includes(grupo);
  }

  // 2. Grupo direto no documento
  if (supervisor.grupoContrato === "vli" || supervisor.grupoContrato === "vale") {
    return supervisor.grupoContrato === grupo;
  }

  // 3. Unidade
  const unidade = normalizeName(supervisor.unidade || "");
  if (unidade.includes("vli") || unidade.includes("fca")) return grupo === "vli";
  if (unidade.includes("vale")) return grupo === "vale";

  // 4. Identificação operacional textual (não usa nomes de pessoas).
  const norm = normalizeName(`${supervisor.cargo || ""} ${supervisor.perfil || ""}`);
  if (norm.includes("vli") || norm.includes("fca")) return grupo === "vli";
  if (norm.includes("vale")) return grupo === "vale";

  // Compatibilidade com a base histórica: antes da criação do contrato Vale,
  // os responsáveis operacionais existentes pertenciam à VLI. Não enviar
  // supervisores sem classificação para o Vale.
  return grupo === "vli";
}

export const getContractGroup = (
  contratoId: string,
  contracts: Contract[] = [],
  deletedNames: Record<string, string> = {}
): "Vale" | "VLI" | "Outros" => {
  if (!contratoId) return "Outros";
  const contract = contracts.find((c) => c.id === contratoId);
  const combined = (
    (contract?.codigo || "") + " " +
    (contract?.nome || "") + " " +
    (deletedNames[contratoId] || "") + " " +
    contratoId
  ).toLowerCase();

  if (combined.includes("vale") && (combined.includes("andaime") || combined.includes("sucateamento"))) return "Vale";
  if (combined.includes("vli") || combined.includes("fca")) return "VLI";
  if (contract) {
    if (contract.grupoContrato === "vale") return "Vale";
    if (contract.grupoContrato === "vli") return "VLI";
    // Contrato operacional cadastrado que não é uma das duas operações Vale
    // pertence à base histórica VLI.
    return "VLI";
  }
  return "Outros";
};

/**
 * Validação de participação no Farol GEMBA:
 * O flag participaFarolGemba === false afeta EXCLUSIVAMENTE a exibição no Farol.
 * Não bloqueia acesso, histórico, relatórios, lançamento ou ranking.
 */
export const deveParticiparFarolGemba = (supervisor?: Partial<Supervisor> | null): boolean => {
  if (!supervisor) return false;
  if (supervisor.participaFarolGemba === false) return false;
  return true;
};

export const isFarolVli = (supervisor: Supervisor) => {
  return isSupervisorFromGrupoContrato(supervisor, "vli");
};

export { getOperationalWeek } from "./operationalWeek";

export const formatOperationalDate = (date: Date) => date.toLocaleDateString("pt-BR");

export const inspectionDate = (inspection: Inspection) => new Date(`${inspection.data}T00:00:00`);

export const getInspectionScore = (inspection: Inspection) => getSingleInspectionScore(inspection);

/**
 * Retorna as metas operacionais semanais e mensais para Líderes e Supervisores.
 * Regras:
 * - Líder de Equipe: metaSemanal = 4, metaMensal = 16 (fixo, não aumenta em 5ª semana parcial).
 * - Supervisor VLI: metaSemanal = 7, metaMensal = 28 (ou valor personalizado se definido).
 * - Supervisor Vale: metaSemanal = 4, metaMensal = 16 (ou valor personalizado se definido).
 */
export const getSupervisorTargets = (supervisor: Supervisor) => {
  if (!supervisor) {
    return { weekly: 4, monthly: 16 };
  }

  const isLeader = isLeaderRole(supervisor.cargo, supervisor.perfil);
  if (isLeader) {
    return {
      weekly: 4,
      monthly: 16
    };
  }

  if (supervisor.metaMensal !== undefined && supervisor.metaSemanal !== undefined) {
    return {
      weekly: supervisor.metaSemanal,
      monthly: supervisor.metaMensal
    };
  }

  const isVli = isSupervisorFromGrupoContrato(supervisor, "vli");
  if (isVli) {
    return {
      weekly: supervisor.metaSemanal ?? 7,
      monthly: supervisor.metaMensal ?? 28
    };
  }

  return {
    weekly: supervisor.metaSemanal ?? 4,
    monthly: supervisor.metaMensal ?? 16
  };
};

export function getSupervisorMetaMensal(sup: Supervisor): number {
  if (!sup) return 16;
  const isLeader = isLeaderRole(sup.cargo, sup.perfil);
  if (isLeader) return 16;
  if (sup.metaMensal !== undefined) return sup.metaMensal;
  return getSupervisorTargets(sup).monthly;
}

/**
 * Alias para isSupervisorOrGestorMeta
 */
export const isOperationalGoalMember = isSupervisorOrGestorMeta;

