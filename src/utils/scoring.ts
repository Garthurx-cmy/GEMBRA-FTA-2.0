import { Inspection } from "../types";
import { getTipoLancamento } from "../types";

export interface ScoringRule {
  key: string;
  label: string;
  points: number;
}

export const SCORING_RULES: ScoringRule[] = [
  { key: "LVCC", label: "LVCC", points: 2 },
  { key: "DIAL", label: "DIAL", points: 2 },
  { key: "DESVIO_COMPORTAMENTAL", label: "Desvio Comportamental", points: 2 },
  { key: "DSS", label: "DSS", points: 1 },
  { key: "PRESENCA_EM_CAMPO", label: "Presença em Campo", points: 1 },
  { key: "DESVIO_ESTRUTURAL", label: "Desvio Estrutural", points: 2 },
  { key: "NOTIFICACAO", label: "Notificação", points: 3 },
  { key: "INTERDICAO", label: "Interdição", points: 4 },
];

export function getSingleInspectionScore(insp: Inspection): number {
  if (!insp) return 0;
  const launchType = getTipoLancamento(insp.atividade, insp.tipo, (insp as any).tipoLancamento);

  if (launchType === "Interdição") return 4;
  if (launchType === "Notificação") return 3;
  if (launchType === "LVCC") return 2;
  if (launchType === "DIAL") return 2;
  if (launchType === "Desvio Comportamental") return 2;
  if (launchType === "Desvio Estrutural") return 2;
  if (launchType === "DSS") return 1;
  if (launchType === "Presença em Campo") return 1;
  if (launchType === "AR") return 1;

  const act = (insp.atividade || "").toLowerCase();
  const tp = (insp.tipo || "").toLowerCase();

  if (act.includes("interdi") || tp.includes("interdi")) return 4;
  if (act.includes("notifica") || tp.includes("notifica")) return 3;
  if (act.includes("lvcc") || tp.includes("lvcc")) return 2;
  if (act.includes("dial") || tp.includes("dial")) return 2;
  if (act.includes("desvio comportamental") || tp.includes("desvio comportamental")) return 2;
  if (act.includes("desvio estrutural") || tp.includes("desvio estrutural")) return 2;
  if (act.includes("dss") || tp.includes("dss")) return 1;
  if (act.includes("presen") || tp.includes("presen")) return 1;

  return 1;
}

export function calculateInspectionScore(inspections: Inspection[]): number {
  if (!inspections || !Array.isArray(inspections)) return 0;
  return inspections.reduce((sum, insp) => sum + getSingleInspectionScore(insp), 0);
}
