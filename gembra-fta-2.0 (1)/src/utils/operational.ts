import { Inspection, Supervisor } from "../types";
import { getSingleInspectionScore, getSupervisorMetaMensal } from "./scoring";

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

