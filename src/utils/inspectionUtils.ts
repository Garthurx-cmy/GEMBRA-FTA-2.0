import { Inspection, getTipoLancamento } from "../types";

export function getNormalizedInspectionDate(raw: any): string | null {
  if (!raw) return null;

  // Handle Inspection object
  const value = (typeof raw === "object" && raw !== null && "data" in raw && !("getTime" in raw) && !("toDate" in raw))
    ? raw.data
    : raw;

  if (!value) return null;

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const d = value.toDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    if (value instanceof Date && !isNaN(value.getTime())) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, "0");
      const day = String(value.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    if (typeof value.seconds === "number") {
      const d = new Date(value.seconds * 1000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }

  const str = String(value).trim();
  if (!str) return null;

  if (str.includes("-")) {
    const part = str.split("T")[0].split(" ")[0];
    const parts = part.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    }
  }

  if (str.includes("/")) {
    const part = str.split(" ")[0];
    const parts = part.split("/");
    if (parts.length === 3 && parts[2].length === 4) {
      const y = parts[2];
      const m = parts[1].padStart(2, "0");
      const day = parts[0].padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }

  if (/^\d{10,13}$/.test(str)) {
    const num = Number(str);
    const d = new Date(num < 10000000000 ? num * 1000 : num);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }

  return null;
}

export function getInspectionMonthKey(inspectionOrDate: any): string | null {
  if (!inspectionOrDate) return null;

  // Check if object contains reference month field (mesReferencia, MESREFERENCIA, mes_referencia, etc.)
  if (typeof inspectionOrDate === "object" && inspectionOrDate !== null) {
    const ref = (inspectionOrDate as any).mesReferencia || (inspectionOrDate as any).MESREFERENCIA || (inspectionOrDate as any).mes_referencia || (inspectionOrDate as any).mes;
    if (ref) {
      const norm = getNormalizedInspectionDate(ref);
      if (norm) return norm.substring(0, 7);
      if (typeof ref === "string" && /^\d{4}-\d{2}$/.test(ref.trim())) {
        return ref.trim();
      }
    }
  }

  const dateStr = getNormalizedInspectionDate(inspectionOrDate);
  if (!dateStr) return null;
  return dateStr.substring(0, 7); // YYYY-MM
}

export function getEffectiveMonthKey(selectedMonth: string): string {
  if (!selectedMonth || selectedMonth === "auto" || selectedMonth === "all_months") {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  return selectedMonth;
}

export const MONTH_NAMES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export function getMonthOptions(inspections?: Inspection[]) {
  const currentYear = new Date().getFullYear();
  const options: { value: string; label: string }[] = [
    { value: "auto", label: "Automático / Mês atual" }
  ];

  const monthSet = new Set<string>();

  // Add 12 months of current year
  for (let m = 1; m <= 12; m++) {
    const mStr = String(m).padStart(2, "0");
    monthSet.add(`${currentYear}-${mStr}`);
  }

  // Also include any other YYYY-MM from actual inspections
  if (Array.isArray(inspections)) {
    inspections.forEach((insp) => {
      const key = getInspectionMonthKey(insp);
      if (key) monthSet.add(key);
    });
  }

  const sortedKeys = Array.from(monthSet).sort();

  sortedKeys.forEach((key) => {
    const [yStr, mStr] = key.split("-");
    const mNum = parseInt(mStr, 10);
    const mName = MONTH_NAMES_PT[mNum - 1] || key;
    const yearNum = parseInt(yStr, 10);
    const label = yearNum === currentYear ? mName : `${mName} / ${yStr}`;
    options.push({ value: key, label });
  });

  return options;
}

export function getUniqueMonthlyInspections(
  inspections: Inspection[],
  selectedYearMonth: string
): Inspection[] {
  if (!inspections || !Array.isArray(inspections)) return [];

  const effectiveKey = getEffectiveMonthKey(selectedYearMonth);
  const seenIds = new Set<string>();
  const result: Inspection[] = [];

  for (const insp of inspections) {
    if (!insp || !insp.id) continue;
    if (seenIds.has(insp.id)) continue;

    const monthKey = getInspectionMonthKey(insp);
    if (monthKey === effectiveKey) {
      seenIds.add(insp.id);
      result.push(insp);
    }
  }

  return result;
}

export function getCanonicalInspectionCategory(inspection: Inspection): string {
  if (!inspection) return "Outros";
  return getTipoLancamento(inspection.atividade, inspection.tipo);
}
