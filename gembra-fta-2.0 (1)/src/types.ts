export enum Potential {
  CRITICO = "Crítico",
  GRAVE = "Grave",
  MEDIO = "Médio",
  LEVE = "Leve"
}

export enum InspectionStatus {
  ABERTO = "Aberto",
  EM_ANDAMENTO = "Em Andamento",
  CONCLUIDO = "Concluído"
}

export type InspectionType = string;

export interface ProcessoChecklist {
  id: string;
  nome: string;
  classificacaoPadrao: string;
}

export interface Inspection {
  id: string;
  data: string;
  supervisorId: string;
  areaId: string;
  contratoId: string;
  atividade: string;
  tipo: string;
  potencial: Potential;
  descricao: string;
  acaoCorretiva: string;
  responsavel: string;
  prazo: string;
  status: InspectionStatus;
  observacoes?: string | null;
  fotosAntes?: string[];
  fotosDepois?: string[];
  rotacoesFotosAntes?: number[];
  rotacoesFotosDepois?: number[];
  armazenamentoFotos?: "firestore-inline";
  temaDSS?: string | null;
  quantidadeParticipantes?: number | "" | null;
  dataConclusao?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Supervisor {
  id: string;
  nome: string;
  email?: string;
  unidade?: string;
  metaSemanal?: number;
  metaMensal?: number;
  tipoMeta?: string;
  ativo?: boolean;
}

export interface Area {
  id: string;
  nome: string;
  codigo?: string;
  ativa?: boolean;
  ativo?: boolean;
}

export interface Contract {
  id: string;
  codigo: string;
  nome: string;
  ativo?: boolean;
}

export interface SystemConfig {
  logoUrl: string;
  nomeEmpresa: string;
  nomeSistema: string;
  temaEscuro: boolean;
  responsavelAssinaturaNome: string;
  responsavelAssinaturaCargo: string;
  tiposInspecao: string[];
  processosChecklist: ProcessoChecklist[];
}

export interface UserProfile {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  cargo?: string;
  ativo: boolean;
  primeiroAcesso?: boolean;
  deveAlterarSenha?: boolean;
  ultimoLogin?: any;
}

export interface AppNotification {
  id: string;
  userName: string;
  action: string;
  tipoLancamento?: string;
  dataHora: string;
  read: boolean;
  createdAt: string;
}

export interface AuthorizedEmail {
  id: string;
  email: string;
  perfil?: string;
  perfilPadrao?: string;
  ativo?: boolean;
}

export function getTipoLancamento(atividade: string = "", tipo: string = ""): string {
  const act = (atividade || "").trim().toLowerCase();
  const tp = (tipo || "").trim().toLowerCase();

  if (act.includes("dss") || tp.includes("dss")) return "DSS";
  if (act.includes("presenca") || tp.includes("presenca") || act.includes("presença") || tp.includes("presença")) return "Presença em Campo";
  if (act.includes("ar") || tp.includes("ar")) return "AR";
  if (act.includes("lvcc") || tp.includes("lvcc")) return "LVCC";
  if (act.includes("dial") || tp.includes("dial") || act.includes("desvio comportamental") || tp.includes("desvio comportamental")) return "DIAL / Desvio Comportamental";
  if (act.includes("desvio estrutural") || tp.includes("desvio estrutural")) return "Desvio Estrutural";
  if (act.includes("notificacao") || tp.includes("notificacao") || act.includes("notificação") || tp.includes("notificação")) return "Notificação";
  if (act.includes("interdicao") || tp.includes("interdicao") || act.includes("interdição") || tp.includes("interdição")) return "Interdição";

  // Fallbacks using exact match if any
  if (atividade === "DSS" || tipo === "DSS") return "DSS";
  if (atividade === "AR" || tipo === "AR") return "AR";
  if (atividade === "LVCC" || tipo === "LVCC") return "LVCC";
  if (atividade === "DIAL / Desvio Comportamental" || tipo === "DIAL / Desvio Comportamental") return "DIAL / Desvio Comportamental";
  if (atividade === "Desvio Estrutural" || tipo === "Desvio Estrutural") return "Desvio Estrutural";
  if (atividade === "Notificação" || tipo === "Notificação") return "Notificação";
  if (atividade === "Interdição" || tipo === "Interdição") return "Interdição";
  if (atividade === "Presença em Campo" || tipo === "Presença em Campo") return "Presença em Campo";

  return atividade || tipo || "Outros";
}

export const TIPO_LANCAMENTO_CONFIG: Record<string, {
  icon: string;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = {
  "DSS": {
    icon: "💬",
    color: "#3b82f6",
    bgClass: "bg-blue-50",
    textClass: "text-blue-700",
    borderClass: "border-blue-200"
  },
  "AR": {
    icon: "📋",
    color: "#10b981",
    bgClass: "bg-emerald-50",
    textClass: "text-emerald-700",
    borderClass: "border-emerald-200"
  },
  "LVCC": {
    icon: "✔️",
    color: "#6366f1",
    bgClass: "bg-indigo-50",
    textClass: "text-indigo-700",
    borderClass: "border-indigo-200"
  },
  "DIAL / Desvio Comportamental": {
    icon: "👤",
    color: "#f59e0b",
    bgClass: "bg-amber-50",
    textClass: "text-amber-800",
    borderClass: "border-amber-200"
  },
  "Desvio Estrutural": {
    icon: "🏗️",
    color: "#ef4444",
    bgClass: "bg-red-50",
    textClass: "text-red-700",
    borderClass: "border-red-200"
  },
  "Notificação": {
    icon: "⚠️",
    color: "#f97316",
    bgClass: "bg-orange-50",
    textClass: "text-orange-700",
    borderClass: "border-orange-200"
  },
  "Interdição": {
    icon: "🚫",
    color: "#7f1d1d",
    bgClass: "bg-rose-50",
    textClass: "text-rose-900",
    borderClass: "border-rose-200"
  },
  "Presença em Campo": {
    icon: "🚶",
    color: "#8b5cf6",
    bgClass: "bg-purple-50",
    textClass: "text-purple-700",
    borderClass: "border-purple-200"
  }
};
