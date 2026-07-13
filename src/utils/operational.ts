import { Inspection, InspectionStatus, Potential, Supervisor, getTipoLancamento } from "../types";

export const FAROL_VLI_NAMES = [
  "Jose Mauricio Dos Santos Junior",
  "Murilo Henrique Goncallo Nascimento",
  "Klayton Anderson Sabino",
  "Wagner Monteiro",
  "Dener Rodrigues de Souza"
];

export const normalizeName = (value = "") => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, " ");

const farolNames = new Set(FAROL_VLI_NAMES.map(normalizeName));

export const isFarolVli = (supervisor: Supervisor) => farolNames.has(normalizeName(supervisor.nome));

export const getOperationalWeek = (reference = new Date()) => {
  const end = new Date(reference);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
};

export const formatOperationalDate = (date: Date) => date.toLocaleDateString("pt-BR");

export const inspectionDate = (inspection: Inspection) => new Date(`${inspection.data}T00:00:00`);

export const getInspectionScore = (inspection: Inspection) => {
  if (getTipoLancamento(inspection.atividade, inspection.tipo) === "Presença em Campo") return 3;
  const potentialScore = inspection.potencial === Potential.CRITICO ? 5
    : inspection.potencial === Potential.GRAVE ? 3
    : inspection.potencial === Potential.MEDIO ? 2
    : inspection.potencial === Potential.LEVE ? 1
    : 0;
  return potentialScore + (inspection.status === InspectionStatus.CONCLUIDO ? 2 : 0);
};

export const getSupervisorTargets = (supervisor: Supervisor) => ({
  weekly: supervisor.metaSemanal ?? (supervisor.unidade === "VLI" ? 7 : 4),
  monthly: supervisor.metaMensal ?? (supervisor.unidade === "VLI" ? 28 : 16)
});
