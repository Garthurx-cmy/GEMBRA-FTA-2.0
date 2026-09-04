import { Inspection, getTipoLancamento } from "../types";

export function getNormalizedInspectionDate(raw: any): string | null {
  if (!raw) return null;

  // Handle Inspection object or extract date from candidate fields
  let value = raw;
  if (typeof raw === "object" && raw !== null && !("getTime" in raw) && !("toDate" in raw)) {
    const candidates = [
      raw.data,
      (raw as any).dataHora,
      (raw as any).dataRealizacao,
      (raw as any).dataCriacao,
      (raw as any).dataHoraCriacao,
      (raw as any).createdAt,
      (raw as any).timestamp
    ];
    value = candidates.find(c => c !== undefined && c !== null && String(c).trim() !== "");
    if (!value && typeof (raw as any).mesReferencia === "string" && (raw as any).mesReferencia.includes("-")) {
      value = `${(raw as any).mesReferencia}-01`;
    }
  }

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
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      }
      if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
    }
  }

  if (str.includes("/")) {
    const part = str.split(" ")[0];
    const parts = part.split("/");
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        const y = parts[2];
        const m = parts[1].padStart(2, "0");
        const day = parts[0].padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
      if (parts[0].length === 4) {
        const y = parts[0];
        const m = parts[1].padStart(2, "0");
        const day = parts[2].padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
    }
  }

  if (str.includes(".")) {
    const part = str.split(" ")[0];
    const parts = part.split(".");
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        const y = parts[2];
        const m = parts[1].padStart(2, "0");
        const day = parts[0].padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
      if (parts[0].length === 4) {
        const y = parts[0];
        const m = parts[1].padStart(2, "0");
        const day = parts[2].padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
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

  // A competência mensal vem exclusivamente da data operacional da inspeção.
  // Campos legados como mesReferencia podem ficar defasados depois de edições e
  // não podem deslocar uma inspeção de julho para agosto/setembro.
  const dateStr = getNormalizedInspectionDate(inspectionOrDate);
  if (!dateStr) return null;
  return dateStr.substring(0, 7); // YYYY-MM
}

export function getOperationalDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isAllMonths(selectedMonth?: string | null): boolean {
  if (!selectedMonth) return false;
  const s = selectedMonth.trim().toLowerCase();
  return s === "all" || s === "all_months" || s === "todos" || s === "todos_os_meses";
}

export function getEffectiveMonthKey(selectedMonth: string, today = getOperationalDateKey()): string {
  if (!selectedMonth || selectedMonth === "auto") {
    return today.slice(0, 7);
  }
  if (isAllMonths(selectedMonth)) {
    return "all";
  }
  return selectedMonth;
}

export const MONTH_NAMES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export function getMonthOptions(inspections?: Inspection[]) {
  const currentYear = Number(getOperationalDateKey().slice(0,4));
  const options: { value: string; label: string }[] = [
    { value: "auto", label: "Automático / Mês atual" },
    { value: "all", label: "Todos os Meses (Histórico Completo)" }
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

/**
 * Filtra inspeções respeitando estritamente o filtro mensal ou consolidando todos os meses.
 * Quando selectedMonth for "all" (ou "all_months"):
 * - não aplica currentMonth;
 * - não aplica mês atual como fallback;
 * - não compara com uma única competência;
 * - inclui julho, agosto, setembro e meses futuros disponíveis;
 * - deduplica exclusivamente por document.id.
 */
export function filterInspectionsByMonth(
  inspections: Inspection[],
  selectedMonth: string,
  today = getOperationalDateKey()
): Inspection[] {
  if (!inspections || !Array.isArray(inspections)) return [];

  // Deduplicar exclusivamente por document.id
  const seenIds = new Set<string>();
  const inspectionsAllowed: Inspection[] = [];
  for (const item of inspections) {
    if (!item || !item.id || seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    inspectionsAllowed.push(item);
  }

  if (isAllMonths(selectedMonth)) {
    return inspectionsAllowed;
  }

  const effectiveMonth = (!selectedMonth || selectedMonth === "auto") ? today.slice(0, 7) : selectedMonth;
  return inspectionsAllowed.filter(
    (inspection) => getInspectionMonthKey(inspection) === effectiveMonth
  );
}

export function getUniqueMonthlyInspections(
  inspections: Inspection[],
  selectedYearMonth: string,
  today = getOperationalDateKey()
): Inspection[] {
  return filterInspectionsByMonth(inspections, selectedYearMonth, today);
}

/**
 * Retorna dinamicamente os meses incluídos no período para cálculo de metas acumuladas.
 * VLI iniciou em julho/2026 ("2026-07"). Vale iniciou em setembro/2026 ("2026-09").
 * Inclui os meses decorridos até o mês operacional atual mais quaisquer meses futuros com lançamentos.
 */
export function getIncludedMonths(
  grupoContrato: string = "todos",
  inspections?: Inspection[],
  todayKey = getOperationalDateKey()
): string[] {
  const currentMonthKey = todayKey.slice(0, 7);
  const startMonth = (grupoContrato === "vale") ? "2026-09" : "2026-07";

  const monthSet = new Set<string>();

  // Adiciona meses corridos desde o início do contrato até o mês operacional atual
  let [y, m] = startMonth.split("-").map(Number);
  const [curY, curM] = currentMonthKey.split("-").map(Number);

  while (y < curY || (y === curY && m <= curM)) {
    monthSet.add(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  // Adiciona quaisquer meses futuros onde existam inspeções registradas para o contrato
  if (Array.isArray(inspections)) {
    for (const insp of inspections) {
      const k = getInspectionMonthKey(insp);
      if (k && k >= startMonth) {
        monthSet.add(k);
      }
    }
  }

  return Array.from(monthSet).sort();
}

export function getCanonicalInspectionCategory(inspection: Inspection): string {
  if (!inspection) return "Outros";
  return getTipoLancamento(inspection.atividade, inspection.tipo, inspection.tipoLancamento);
}

export function formatDateDisplay(raw: any, fallback = "-"): string {
  const normalized = getNormalizedInspectionDate(raw);
  if (!normalized) return fallback;
  const parts = normalized.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return normalized;
}

