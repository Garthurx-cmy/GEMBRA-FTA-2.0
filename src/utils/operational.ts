import { Area, Contract, GrupoContrato, GrupoContratoFiltro, Inspection, Supervisor } from "../types";
import { getSingleInspectionScore } from "./scoring";

export type ContractGroupFilter = "Todos" | "Vale" | "VLI";

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
 * Classifica a localidade/área em "vale" ou "vli".
 */
export function getGrupoContratoPorLocalidade(
  localidade: string | Area | undefined | null,
  areas: Area[] = [],
  contracts: Contract[] = []
): GrupoContrato {
  if (!localidade) return "vale";

  // Se for um objeto Area
  if (typeof localidade === "object") {
    if (localidade.grupoContrato === "vli" || localidade.grupoContrato === "vale") {
      return localidade.grupoContrato;
    }
    const name = normalizeName(localidade.nome || "");
    if (name.includes("andaime vale") || name.includes("sucateamento vale") || name.includes("vale")) {
      return "vale";
    }
    if (name.includes("vli") || name.includes("fca") || name.includes("terminal") || name.includes("patio")) {
      return "vli";
    }
    return "vale";
  }

  const str = String(localidade).trim();
  
  // Verificar se é ID de uma Area existente
  const matchedArea = areas.find(a => a.id === str || normalizeName(a.nome) === normalizeName(str));
  if (matchedArea) {
    if (matchedArea.grupoContrato === "vli" || matchedArea.grupoContrato === "vale") {
      return matchedArea.grupoContrato;
    }
    const areaName = normalizeName(matchedArea.nome || "");
    if (areaName.includes("andaime vale") || areaName.includes("sucateamento vale") || areaName.includes("vale")) {
      return "vale";
    }
    if (areaName.includes("vli") || areaName.includes("fca") || areaName.includes("terminal") || areaName.includes("patio")) {
      return "vli";
    }
  }

  // Verificar se é ID de um Contrato existente
  const matchedContract = contracts.find(c => c.id === str || normalizeName(c.nome) === normalizeName(str) || normalizeName(c.codigo) === normalizeName(str));
  if (matchedContract) {
    if (matchedContract.grupoContrato === "vli" || matchedContract.grupoContrato === "vale") {
      return matchedContract.grupoContrato;
    }
    const ctrName = normalizeName((matchedContract.codigo || "") + " " + (matchedContract.nome || ""));
    if (ctrName.includes("andaime vale") || ctrName.includes("sucateamento vale") || ctrName.includes("vale")) {
      return "vale";
    }
    if (ctrName.includes("vli") || ctrName.includes("fca")) {
      return "vli";
    }
  }

  const norm = normalizeName(str);
  if (norm.includes("andaime vale") || norm.includes("sucateamento vale") || norm.includes("vale")) {
    return "vale";
  }
  if (norm.includes("vli") || norm.includes("fca") || norm.includes("terminal") || norm.includes("patio")) {
    return "vli";
  }

  return "vale";
}

/**
 * Determina com precisão o grupoContrato ("vale" ou "vli") de uma inspeção.
 */
export function getInspectionGrupoContrato(
  inspection: Partial<Inspection>,
  areas: Area[] = [],
  contracts: Contract[] = [],
  supervisors: Supervisor[] = [],
  deletedNames: Record<string, string> = {}
): GrupoContrato {
  if (!inspection) return "vale";

  // 1. Campo explícito no documento
  if (inspection.grupoContrato === "vli" || inspection.grupoContrato === "vale") {
    return inspection.grupoContrato;
  }

  // 2. Classificação pela Localidade / Área
  if (inspection.areaId) {
    const area = areas.find(a => a.id === inspection.areaId);
    if (area) {
      return getGrupoContratoPorLocalidade(area, areas, contracts);
    }
    const deletedAreaName = deletedNames[inspection.areaId];
    if (deletedAreaName) {
      return getGrupoContratoPorLocalidade(deletedAreaName, areas, contracts);
    }
  }

  // 3. Classificação pelo Contrato
  if (inspection.contratoId) {
    const contract = contracts.find(c => c.id === inspection.contratoId);
    if (contract) {
      if (contract.grupoContrato === "vli" || contract.grupoContrato === "vale") {
        return contract.grupoContrato;
      }
      const combined = ((contract.codigo || "") + " " + (contract.nome || "")).toLowerCase();
      if (combined.includes("andaime vale") || combined.includes("sucateamento vale") || combined.includes("vale")) return "vale";
      if (combined.includes("vli") || combined.includes("fca")) return "vli";
    }
    const deletedContractName = deletedNames[inspection.contratoId];
    if (deletedContractName) {
      const combined = (deletedContractName + " " + inspection.contratoId).toLowerCase();
      if (combined.includes("andaime vale") || combined.includes("sucateamento vale") || combined.includes("vale")) return "vale";
      if (combined.includes("vli") || combined.includes("fca")) return "vli";
    }
  }

  // 4. Classificação pelo Supervisor
  if (inspection.supervisorId) {
    const supervisor = supervisors.find(s => s.id === inspection.supervisorId);
    if (supervisor) {
      if (isSupervisorFromGrupoContrato(supervisor, "vli")) return "vli";
      if (isSupervisorFromGrupoContrato(supervisor, "vale")) return "vale";
    }
  }

  return "vale";
}

/**
 * Identifica se o supervisor pertence ao grupo de contrato ("vale" ou "vli").
 */
export function isSupervisorFromGrupoContrato(
  supervisor: Supervisor,
  grupo: GrupoContrato
): boolean {
  if (!supervisor) return false;

  // 1. Grupo operacional principal no diretório. Este campo representa
  // a equipe/meta; gruposContratoPermitidos representa somente acesso.
  if (supervisor.grupoContrato === "vli" || supervisor.grupoContrato === "vale") {
    return supervisor.grupoContrato === grupo;
  }

  // 2. Compatibilidade com documentos sem grupo principal.
  if (supervisor.gruposContratoPermitidos && supervisor.gruposContratoPermitidos.length > 0) {
    return supervisor.gruposContratoPermitidos.includes(grupo);
  }

  // 3. Unidade
  if (supervisor.unidade && supervisor.unidade.trim().toUpperCase() === "VLI") {
    return grupo === "vli";
  }

  // 4. Nome/Cargo
  const norm = normalizeName(`${supervisor.nome || ""} ${supervisor.cargo || ""}`);
  if (norm.includes("vli") || norm.includes("fca")) {
    return grupo === "vli";
  }

  // Padrão Vale
  return grupo === "vale";
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

  if (combined.includes("andaime vale") || combined.includes("sucateamento vale") || combined.includes("vale")) return "Vale";
  if (combined.includes("vli") || combined.includes("fca")) return "VLI";
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

export const getOperationalWeek = () => {
  const start = new Date("2026-07-09T00:00:00");
  const end = new Date("2026-07-16T23:59:59.999");
  return { start, end };
};

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

