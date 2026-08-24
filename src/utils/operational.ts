import { Inspection, Supervisor } from "../types";
import { getSingleInspectionScore, getSupervisorMetaMensal } from "./scoring";

export const FAROL_VLI_NAMES = [
  "Jose Mauricio Dos Santos Junior",
  "Murilo Henrique Goncallo Nascimento",
  "Klayton Anderson Sabino",
  "Wagner Monteiro",
  "Dener Rodrigues de Souza"
];

export const NAO_PARTICIPANTES_FAROL_GEMBA = [
  "Fábio Alexandre Santos",
  "Vanderson Barbosa dos Santos",
  "Lucas Morelo Mantegazine de Sousa",
  "Jefferson Alves de Carvalho",
  "Daniel Silva de Carvalho",
  "Wesley Moreira Neves",
  "Filipe Viana de Oliveira Brito",
  "Washington Pinha Ferreira",
  "Italo Fernando Gomes de Souza",
  "Bento da Silva Ferreira",
  "Romulo da Silva Lemos",
  "Renzo Nunes de Freitas",
  "Kenia Arcanjo Trindade"
];

export const normalizeName = (value = "") => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, " ");

const farolNames = new Set(FAROL_VLI_NAMES.map(normalizeName));
const naoParticipantesFarolSet = new Set(NAO_PARTICIPANTES_FAROL_GEMBA.map(normalizeName));

export const deveParticiparFarolGemba = (supervisor?: Partial<Supervisor> | null): boolean => {
  if (!supervisor) return false;
  if (supervisor.participaFarolGemba === false) return false;
  if (supervisor.nome && naoParticipantesFarolSet.has(normalizeName(supervisor.nome))) return false;
  return true;
};

export const isFarolVli = (supervisor: Supervisor) => {
  if (supervisor.participaFarolGemba === false) return false;
  if (supervisor.nome && naoParticipantesFarolSet.has(normalizeName(supervisor.nome))) return false;
  return farolNames.has(normalizeName(supervisor.nome));
};

export const getOperationalWeek = () => {
  const start = new Date("2026-07-09T00:00:00");
  const end = new Date("2026-07-16T23:59:59.999");
  return { start, end };
};

export const formatOperationalDate = (date: Date) => date.toLocaleDateString("pt-BR");

export const inspectionDate = (inspection: Inspection) => new Date(`${inspection.data}T00:00:00`);

export const getInspectionScore = (inspection: Inspection) => getSingleInspectionScore(inspection);

export const getSupervisorTargets = (supervisor: Supervisor) => {
  const monthly = getSupervisorMetaMensal(supervisor);
  return {
    weekly: supervisor.metaSemanal ?? (supervisor.unidade === "VLI" ? 7 : Math.round(monthly / 4)),
    monthly
  };
};

