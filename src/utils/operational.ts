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
  supervisors: Supervisor[] = [],
  deletedNames: Record<string, string> = {}
): GrupoContrato | "nao_classificado" {
  if (!inspection) return "nao_classificado";

  // 1. Área/localidade conhecida é autoritativa.
  if (inspection.areaId) {
    const area = areas.find(a => a.id === inspection.areaId);
    if (area) {
      const group = getGrupoContratoPorLocalidade(area, areas, contracts);
      if (group) return group;
    }

    const deletedAreaName = deletedNames[inspection.areaId];
    if (deletedAreaName) {
      const group = getGrupoContratoPorLocalidade(deletedAreaName, areas, contracts);
      if (group) return group;
      // Uma localidade histórica identificável que não seja uma das duas Vale
      // pertence à operação VLI.
      if (normalizeName(deletedAreaName)) return "vli";
    }
  }

  // 2. Contrato conhecido é a segunda fonte de verdade.
  if (inspection.contratoId) {
    const contract = contracts.find(c => c.id === inspection.contratoId);
    if (contract) {
      const group = getGrupoContratoPorLocalidade(
        `${contract.codigo || ""} ${contract.nome || ""}`,
        areas,
        contracts
      );
      if (group) return group;
      if (contract.grupoContrato === "vale" || contract.grupoContrato === "vli") return contract.grupoContrato;
    }

    const deletedContractName = deletedNames[inspection.contratoId];
    if (deletedContractName) {
      const group = getGrupoContratoPorLocalidade(deletedContractName, areas, contracts);
      if (group) return group;
      if (normalizeName(deletedContractName)) return "vli";
    }
  }

  // 3. Vínculo operacional do responsável, somente quando for inequívoco.
  // Isso ajuda a recuperar inspeções VLI antigas cujo campo grupoContrato foi
  // preenchido incorretamente como Vale, sem forçar usuários com acesso aos dois.
  if (inspection.supervisorId) {
    const supervisor = supervisors.find(s => s.id === inspection.supervisorId);
    if (supervisor) {
      const explicitGroups = supervisor.gruposContratoPermitidos || [];
      if (explicitGroups.length === 1) return explicitGroups[0];
      if (supervisor.grupoContrato === "vli" || supervisor.grupoContrato === "vale") return supervisor.grupoContrato;

      if (explicitGroups.length === 0) {
        const unidade = normalizeName(supervisor.unidade || "");
        if (unidade.includes("vale")) return "vale";
        if (unidade.includes("vli") || unidade.includes("fca")) return "vli";

        const role = normalizeName(`${supervisor.cargo || ""} ${supervisor.perfil || ""}`);
        if (role.includes("vale")) return "vale";
        if (role.includes("vli") || role.includes("fca")) return "vli";

        // Base histórica sem classificação contratual: VLI.
        return "vli";
      }
    }
  }

  // 4. Campo explícito é fallback final, pois versões anteriores podem tê-lo
  // gravado incorretamente em registros históricos.
  if (inspection.grupoContrato === "vli" || inspection.grupoContrato === "vale") {
    return inspection.grupoContrato;
  }

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


