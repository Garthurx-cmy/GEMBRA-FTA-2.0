import { Inspection, Supervisor } from "../types";
import { isFarolVli, FAROL_VLI_NAMES, normalizeName } from "./operational";
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
  const act = (insp.atividade || "").toLowerCase();
  const tp = (insp.tipo || "").toLowerCase();
  const launchType = getTipoLancamento(insp.atividade, insp.tipo, insp.tipoLancamento);

  if (launchType === "Interdição" || act.includes("interdi") || tp.includes("interdi")) {
    return 4;
  }
  if (launchType === "Notificação" || act.includes("notifica") || tp.includes("notifica")) {
    return 3;
  }
  if (launchType === "LVCC" || act.includes("lvcc") || tp.includes("lvcc")) {
    return 2;
  }
  if (launchType === "DIAL" || act.includes("dial") || tp.includes("dial")) {
    return 2;
  }
  if (launchType === "Desvio Comportamental" || act.includes("desvio comportamental") || tp.includes("desvio comportamental")) {
    return 2;
  }
  if (launchType === "Desvio Estrutural" || act.includes("desvio estrutural") || tp.includes("desvio estrutural")) {
    return 2;
  }
  if (launchType === "DSS" || act.includes("dss") || tp.includes("dss")) {
    return 1;
  }
  if (launchType === "Presença em Campo" || act.includes("presen") || tp.includes("presen")) {
    return 1;
  }

  return 1;
}

export function calculateInspectionScore(inspections: Inspection[]): number {
  if (!inspections || !Array.isArray(inspections)) return 0;
  return inspections.reduce((sum, insp) => sum + getSingleInspectionScore(insp), 0);
}

export function isJhonataSupervisor(sup?: Supervisor): boolean {
  if (!sup) return false;
  const email = String(sup.email || "").trim().toLowerCase();
  const nome = String(sup.nome || "").toLowerCase();
  const id = String(sup.id || "").toLowerCase();
  return (
    email === "j.santos@grupofta.com.br" ||
    email === "jhonata.santos@grupofta.com.br" ||
    email.startsWith("jhonata") ||
    id.includes("j_santos") ||
    id.includes("jhonata") ||
    (nome.includes("jhonata") && (nome.includes("santos") || nome.includes("gonçalves") || nome.includes("goncalves")))
  );
}

export function getSupervisorMetaMensal(sup: Supervisor): number {
  if (isJhonataSupervisor(sup)) return 8;
  if (sup.metaMensal !== undefined) return sup.metaMensal;

  const isVli = isFarolVli(sup) || sup.unidade === "VLI" || (sup.nome && (
    sup.nome.toLowerCase().includes("vli") ||
    FAROL_VLI_NAMES.some(n => normalizeName(sup.nome) === normalizeName(n))
  ));

  if (isVli) return 28;
  return 16;
}
