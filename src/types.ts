/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ActivityType {
  DSS = "DSS",
  AR = "AR",
  LVCC = "LVCC",
  DIAL = "DIAL"
}

export enum InspectionType {
  DSS = "DSS",
  AR = "AR",
  LVCC = "LVCC",
  DIAL_COMPORTAMENTAL = "DIAL / Desvio Comportamental",
  ESTRUTURAL = "Desvio Estrutural",
  NOTIFICACAO = "Notificação",
  INTERDICAO = "Interdição"
}

export const TIPO_LANCAMENTO_CONFIG: Record<string, {
  color: string;
  hex: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  badgeClass: string;
  icon: string;
  label: string;
}> = {
  "DSS": {
    color: "blue",
    hex: "#3b82f6",
    bgClass: "bg-blue-50",
    textClass: "text-blue-700",
    borderClass: "border-blue-200",
    badgeClass: "bg-blue-100 text-blue-800 border border-blue-200",
    icon: "🦺",
    label: "DSS"
  },
  "AR": {
    color: "gray",
    hex: "#6b7280",
    bgClass: "bg-gray-100",
    textClass: "text-gray-700",
    borderClass: "border-gray-200",
    badgeClass: "bg-gray-100 text-gray-800 border border-gray-300",
    icon: "📋",
    label: "AR"
  },
  "LVCC": {
    color: "green",
    hex: "#10b981",
    bgClass: "bg-green-50",
    textClass: "text-green-700",
    borderClass: "border-green-200",
    badgeClass: "bg-green-100 text-green-800 border border-green-200",
    icon: "🔍",
    label: "LVCC"
  },
  "DIAL / Desvio Comportamental": {
    color: "purple",
    hex: "#8b5cf6",
    bgClass: "bg-purple-50",
    textClass: "text-purple-700",
    borderClass: "border-purple-200",
    badgeClass: "bg-purple-100 text-purple-800 border border-purple-200",
    icon: "👥",
    label: "DIAL / Desvio Comportamental"
  },
  "Desvio Estrutural": {
    color: "orange",
    hex: "#f97316",
    bgClass: "bg-orange-50",
    textClass: "text-orange-700",
    borderClass: "border-orange-200",
    badgeClass: "bg-orange-100 text-orange-800 border border-orange-200",
    icon: "🏗️",
    label: "Desvio Estrutural"
  },
  "Notificação": {
    color: "yellow",
    hex: "#eab308",
    bgClass: "bg-yellow-50",
    textClass: "text-yellow-700",
    borderClass: "border-yellow-200",
    badgeClass: "bg-yellow-100 text-yellow-800 border border-yellow-200",
    icon: "⚠️",
    label: "Notificação"
  },
  "Interdição": {
    color: "red",
    hex: "#ef4444",
    bgClass: "bg-red-50",
    textClass: "text-red-700",
    borderClass: "border-red-200",
    badgeClass: "bg-red-100 text-red-800 border border-red-200",
    icon: "⛔",
    label: "Interdição"
  },
  "Presença em Campo": {
    color: "teal",
    hex: "#0d9488",
    bgClass: "bg-teal-50",
    textClass: "text-teal-700",
    borderClass: "border-teal-200",
    badgeClass: "bg-teal-100 text-teal-800 border border-teal-200",
    icon: "🚶",
    label: "Presença em Campo"
  }
};

export function getTipoLancamento(atividade: string, tipo: string): string {
  const act = (atividade || "").trim();
  const tip = (tipo || "").trim();

  // Exact matching first
  if (act === "Presença em Campo" || act === "Presenca em Campo" || tip === "Presença em Campo" || tip === "Presenca em Campo") {
    return "Presença em Campo";
  }
  if (act === "DSS" || tip === "DSS" || tip.includes("Diálogo Semanal") || tip.includes("Dialogo Semanal")) {
    return "DSS";
  }
  if (act === "AR" || tip === "AR" || tip.includes("Análise de Risco") || tip.includes("Analise de Risco")) {
    return "AR";
  }
  if (act === "LVCC" || tip === "LVCC" || tip.includes("Levantamento/Verificação") || tip.includes("Levantamento/Verificacao")) {
    return "LVCC";
  }
  if (act === "DIAL" || act.includes("DIAL") || tip === "DIAL" || tip.includes("DIAL") || tip.includes("Desvio Comportamental")) {
    return "DIAL / Desvio Comportamental";
  }
  if (act === "Desvio Estrutural" || tip === "Desvio Estrutural" || tip.includes("Estrutural")) {
    return "Desvio Estrutural";
  }
  if (act === "Notificação" || act === "Notificacao" || tip === "Notificação" || tip === "Notificacao") {
    return "Notificação";
  }
  if (act === "Interdição" || act === "Interdicao" || tip === "Interdição" || tip === "Interdicao") {
    return "Interdição";
  }
  
  // Try matching inside values
  const lowerAct = act.toLowerCase();
  const lowerTip = tip.toLowerCase();
  
  if (lowerAct.includes("presen") || lowerTip.includes("presen")) return "Presença em Campo";
  if (lowerAct.includes("dss") || lowerTip.includes("dss")) return "DSS";
  if (lowerAct.includes("ar") || lowerTip.includes("ar")) return "AR";
  if (lowerAct.includes("lvcc") || lowerTip.includes("lvcc")) return "LVCC";
  if (lowerAct.includes("dial") || lowerTip.includes("dial") || lowerTip.includes("comportamental")) return "DIAL / Desvio Comportamental";
  if (lowerAct.includes("estrutural") || lowerTip.includes("estrutural")) return "Desvio Estrutural";
  if (lowerAct.includes("notific") || lowerTip.includes("notific")) return "Notificação";
  if (lowerAct.includes("interdi") || lowerTip.includes("interdi")) return "Interdição";

  return "DSS"; // Fallback
}

export enum Potential {
  LEVE = "Leve",
  MEDIO = "Médio",
  GRAVE = "Grave",
  CRITICO = "Crítico"
}

export enum InspectionStatus {
  ABERTO = "Aberto",
  EM_ANDAMENTO = "Em andamento",
  CONCLUIDO = "Concluído"
}

export interface Photo {
  id: string;
  url: string; // Base64 string or Firebase storage URL
  type: "before" | "after";
}

export interface Inspection {
  id: string;
  data: string; // YYYY-MM-DD
  supervisorId: string;
  areaId: string;
  contratoId: string;
  atividade: string; // Dynamic Process/Checklist Name
  tipo: string; // Dynamic Deviation Classification
  potencial: Potential; // Leve, Médio, Grave, Crítico
  descricao: string;
  acaoCorretiva: string;
  responsavel: string;
  prazo: string; // YYYY-MM-DD
  status: InspectionStatus; // Aberto, Em andamento, Concluído
  observacoes?: string;
  fotosAntes: string[]; // Array of Base64/URLs
  fotosDepois: string[]; // Array of Base64/URLs
  createdAt: string;
  updatedAt: string;
  temaDSS?: string;
  quantidadeParticipantes?: number;
  dataConclusao?: string;
}


export interface Area {
  id: string;
  nome: string;
  codigo?: string;
  ativa: boolean;
}

export interface Contract {
  id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
}

export interface ProcessoChecklist {
  id: string;
  nome: string;
  classificacaoPadrao: string;
}

export interface SystemConfig {
  logoUrl: string;
  nomeEmpresa: string;
  nomeSistema: string;
  temaEscuro: boolean;
  responsavelAssinaturaNome?: string;
  responsavelAssinaturaCargo?: string;
  tiposInspecao?: string[];
  processosChecklist?: ProcessoChecklist[];
}

export interface UserProfile {
  id: string;
  nome: string;
  email: string;
  perfil: "Desenvolvedor/Admin" | "Supervisor" | "Administrador" | "Gestor";
  ativo: boolean;
  cargo?: string;
  contratoId?: string;       // Assinalado para supervisores / gestores
  localidadeId?: string;     // Assinalado para supervisores / gestores
  primeiroAcesso?: boolean;   // Se precisa alterar a senha temporária
  deveAlterarSenha?: boolean; // Se precisa alterar a senha
  permissoes?: string[];      // Lista de permissões concedidas
}

export interface Supervisor {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  ativo: boolean;
  contratoId?: string;   // Contrato associado
  localidadeId?: string; // Localidade associada
  permissoes?: string[]; // Permissões associadas
  unidade?: "VLI" | "VALE";
  metaSemanal?: number;
  metaMensal?: number;
  tipoMeta?: "por_tipo" | "quantitativa";
}

export interface AuthorizedEmail {
  id: string;
  email: string;
  ativo: boolean;
  perfilPadrao: "Gestor" | "Supervisor" | "Administrador";
}

export interface AppNotification {
  id: string;
  userName: string;
  action: string;
  tipoLancamento?: string; // DSS, Interdição, LVCC, Desvio Estrutural, etc.
  dataHora: string;       // ISO or pre-formatted date/time string
  read: boolean;
  createdAt: string;
}
