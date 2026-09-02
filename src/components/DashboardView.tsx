import { useOperationalDate } from "../utils/useOperationalDate";
import {
  inspectionBelongsToSupervisor,
  resolveInspectionSupervisor,
  supervisorMatchesId,
  getInspectionSupervisorName
} from "../utils/supervisors";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { dbService } from "../services/db";
import {
  Inspection,
  Supervisor,
  Area,
  Contract,
  Potential,
  InspectionStatus,
  getTipoLancamento,
  isDialInspection,
  isDesvioComportamentalInspection,
  TIPO_LANCAMENTO_CONFIG,
  GrupoContrato,
  GrupoContratoFiltro,
  UserProfile
} from "../types";
import {
  getNormalizedInspectionDate,
  getInspectionMonthKey,
  getEffectiveMonthKey,
  getMonthOptions,
  getUniqueMonthlyInspections,
  getCanonicalInspectionCategory
} from "../utils/inspectionUtils";
import {
  Users,
  AlertTriangle,
  FileCheck,
  AlertOctagon,
  Award,
  Filter,
  RefreshCw,
  Search,
  CheckCircle,
  HelpCircle,
  TrendingUp,
  MapPin,
  Flame,
  Clock,
  PlusCircle,
  AlertCircle,
  XCircle,
  ShieldAlert,
  Calendar,
  Building2,
  ChevronDown,
  ChevronUp,
  Database,
  ShieldCheck
} from "lucide-react";
import FarolGembaView from "./FarolGembaView";
import ResolvedImage from "./ResolvedImage";
import {
  getInspectionScore,
  deveParticiparFarolGemba,
  getInspectionGrupoContrato,
  isSupervisorFromGrupoContrato,
  getGrupoContratoPorLocalidade,
  getSupervisorTargets
} from "../utils/operational";
import {
  getOperationalWeek,
  normalizeInspectionDate,
  formatOperationalWeekLabel
} from "../utils/operationalWeek";
import {
  ResponsiveContainer,
  AreaChart,
  Area as RechartsArea,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip
} from "recharts";



interface DashboardViewProps {
  inspections: Inspection[];
  supervisors: Supervisor[];
  areas: Area[];
  contracts: Contract[];
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
  onEditInspection: (inspection: Inspection) => void;
  onSelectTab: (tab: string) => void;
  grupoContrato?: GrupoContratoFiltro;
  onSelectGrupoContrato?: (grupo: GrupoContratoFiltro) => void;
  permittedGruposContrato?: GrupoContrato[];
  currentUser?: UserProfile | null;
}

export default function DashboardView({
  inspections,
  supervisors,
  areas,
  contracts,
  selectedMonth: propSelectedMonth,
  onSelectMonth,
  onEditInspection,
  onSelectTab,
  grupoContrato = "todos",
  onSelectGrupoContrato,
  permittedGruposContrato = ["vale", "vli"],
  currentUser
}: DashboardViewProps) {
  const [isAuditCardOpen, setIsAuditCardOpen] = useState(false);
  const [localMonth, setLocalMonth] = useState("auto");
  const activeMonth = propSelectedMonth !== undefined ? propSelectedMonth : localMonth;
  const operationalToday = useOperationalDate();
  const effectiveMonthKey = getEffectiveMonthKey(activeMonth, operationalToday);

  const handleMonthChange = (val: string) => {
    if (onSelectMonth) {
      onSelectMonth(val);
    } else {
      setLocalMonth(val);
    }
  };
  // --- HELPERS FOR BLOCK REPRESENTATION ---
  const getBlockProgressString = (done: number, target: number) => {
    const ratio = target > 0 ? Math.min(done, target) / target : 0;
    const filledCount = Math.round(ratio * 10);
    const emptyCount = 10 - filledCount;
    return "█".repeat(filledCount) + "░".repeat(emptyCount);
  };

  const renderBlockProgressRow = (label: string, icon: string, count: number, target: number) => {
    const capped = Math.min(count, target);
    const ratio = target > 0 ? capped / target : 0;
    const filledCount = Math.round(ratio * 10);
    const emptyCount = 10 - filledCount;
    const blocks = "█".repeat(filledCount) + "░".repeat(emptyCount);
    const isCompleted = count >= target;
    return (
      <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-1.5 hover:bg-slate-100/60 transition" id={`progress-card-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-700">
          <span className="flex items-center gap-1.5">{icon} {label}</span>
          <span className={isCompleted ? "text-emerald-600 font-black" : "text-[#F58220] font-black"}>
            {count} / {target}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="font-mono text-xs font-bold tracking-widest text-slate-600 leading-none">
            {blocks}
          </span>
          {isCompleted && (
            <span className="px-2 py-0.5 text-[8px] font-black rounded uppercase tracking-wider leading-none bg-emerald-100 text-emerald-800 border border-emerald-200">
              META CUMPRIDA
            </span>
          )}
        </div>
      </div>
    );
  };

  // --- FILTER STATES ---
  const [timeframe, setTimeframe] = useState<"all" | "diario" | "semanal" | "mensal" | "personalizado">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedSupervisorId, setSelectedSupervisorId] = useState("all");
  const [selectedAreaId, setSelectedAreaId] = useState("all");
  const [selectedTipo, setSelectedTipo] = useState("all");
  const [selectedPotencial, setSelectedPotencial] = useState("all");
  const [selectedOperationalWeekDate, setSelectedOperationalWeekDate] = useState<string>("");

  const resetFilters = () => {
    setTimeframe("all");
    setStartDate("");
    setEndDate("");
    setSelectedSupervisorId("all");
    setSelectedAreaId("all");
    setSelectedTipo("all");
    setSelectedPotencial("all");
    setSelectedOperationalWeekDate("");
    handleMonthChange("auto");
    setCurrentCalendarMonth(new Date());
  };

  // --- SELECTED OPERATIONAL WEEK RANGE ---
  const activeOperationalWeek = useMemo(() => {
    if (timeframe === "personalizado" && startDate && endDate) {
      const s = normalizeInspectionDate(startDate);
      const e = normalizeInspectionDate(endDate);
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    } else if (timeframe === "personalizado" && startDate) {
      return getOperationalWeek(startDate);
    } else if (timeframe === "semanal" && selectedOperationalWeekDate) {
      return getOperationalWeek(selectedOperationalWeekDate);
    } else {
      return getOperationalWeek(operationalToday);
    }
  }, [timeframe, startDate, endDate, selectedOperationalWeekDate, operationalToday]);

  // --- FILTERED INSPECTIONS ---
  const filteredInspections = useMemo(() => {
    return inspections.filter((item) => {
      if (getInspectionMonthKey(item) !== effectiveMonthKey) return false;
      // 1. Timeframe filter
      const itemDate = new Date(`${item.data}T00:00:00`);
      const today = normalizeInspectionDate(operationalToday);

      if (timeframe === "diario") {
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);
        if (itemDate < todayStart || itemDate > todayEnd) return false;
      } else if (timeframe === "semanal") {
        const { start, end } = activeOperationalWeek;
        if (itemDate < start || itemDate > end) return false;
      } else if (timeframe === "mensal") {
        const [year, month] = effectiveMonthKey.split("-").map(Number);
        const startOfMonth = new Date(year, month - 1, 1);
        startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(year, month, 0);
        endOfMonth.setHours(23, 59, 59, 999);
        if (itemDate < startOfMonth || itemDate > endOfMonth) return false;
      } else if (timeframe === "personalizado") {
        if (startDate) {
          const sDate = new Date(`${startDate}T00:00:00`);
          if (itemDate < sDate) return false;
        }
        if (endDate) {
          const eDate = new Date(`${endDate}T23:59:59.999`);
          if (itemDate > eDate) return false;
        }
      }

      // 2. Supervisor filter
      if (selectedSupervisorId !== "all" && !supervisorMatchesId(supervisors.find(s => s.id === selectedSupervisorId) || { id: selectedSupervisorId, nome: "" }, item.supervisorId)) {
        return false;
      }

      // 3. Area filter
      if (selectedAreaId !== "all" && item.areaId !== selectedAreaId) {
        return false;
      }

      // 4. Type filter
      if (selectedTipo !== "all" && getTipoLancamento(item.atividade, item.tipo, item.tipoLancamento) !== selectedTipo) {
        return false;
      }

      // 5. Potential filter
      if (selectedPotencial !== "all" && item.potencial !== selectedPotencial) {
        return false;
      }

      // 6. Contract Group filter (Vale vs VLI)
      if (grupoContrato === "vale") {
        const inspGrupo = getInspectionGrupoContrato(item, areas, contracts, supervisors, dbService.getDeletedNames());
        if (inspGrupo !== "vale") return false;
      } else if (grupoContrato === "vli") {
        const inspGrupo = getInspectionGrupoContrato(item, areas, contracts, supervisors, dbService.getDeletedNames());
        if (inspGrupo !== "vli") return false;
      }

      return true;
    });
  }, [inspections, effectiveMonthKey, operationalToday, timeframe, activeOperationalWeek, startDate, endDate, selectedSupervisorId, selectedAreaId, selectedTipo, selectedPotencial, grupoContrato, areas, contracts, supervisors]);

  // Available supervisors based on selected contract group
  const availableSupervisors = useMemo(() => {
    if (grupoContrato === "vale") {
      return supervisors.filter((s) => isSupervisorFromGrupoContrato(s, "vale"));
    }
    if (grupoContrato === "vli") {
      return supervisors.filter((s) => isSupervisorFromGrupoContrato(s, "vli"));
    }
    return supervisors;
  }, [supervisors, grupoContrato]);

  // Available areas based on selected contract group
  const availableAreas = useMemo(() => {
    if (grupoContrato === "vale") {
      return areas.filter((a) => getGrupoContratoPorLocalidade(a.id, areas, contracts) === "vale");
    }
    if (grupoContrato === "vli") {
      return areas.filter((a) => getGrupoContratoPorLocalidade(a.id, areas, contracts) === "vli");
    }
    return areas;
  }, [areas, contracts, grupoContrato]);

  // --- CENTRALIZED WEEKLY INSPECTIONS FOR MULTIPLE COMPONENTS ---
  const weeklyInspections = useMemo(() => {
    const { start, end } = activeOperationalWeek;
    return filteredInspections.filter((item) => {
      const itemDate = new Date(`${item.data}T12:00:00`);
      return itemDate >= start && itemDate <= end;
    });
  }, [filteredInspections, activeOperationalWeek]);

  const isDashboardFiltered = useMemo(() => {
    return selectedAreaId !== "all" || selectedTipo !== "all" || selectedPotencial !== "all" || timeframe !== "all";
  }, [selectedAreaId, selectedTipo, selectedPotencial, timeframe]);

  // --- CALENDAR STATES & MEMOS ---
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  );

  const normalizeDateToKey = (rawDate: any): string | null => {
    if (!rawDate) return null;

    if (typeof rawDate === "object") {
      if (typeof rawDate.toDate === "function") {
        const d = rawDate.toDate();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
      if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        const y = rawDate.getFullYear();
        const m = String(rawDate.getMonth() + 1).padStart(2, "0");
        const day = String(rawDate.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
      if (typeof rawDate.seconds === "number") {
        const d = new Date(rawDate.seconds * 1000);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
    }

    const str = String(rawDate).trim();
    if (!str) return null;

    if (str.includes("-")) {
      const part = str.split("T")[0].split(" ")[0];
      const parts = part.split("-");
      if (parts.length === 3 && parts[0].length === 4) {
        const y = parts[0];
        const m = parts[1].padStart(2, "0");
        const d = parts[2].padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    }

    if (str.includes("/")) {
      const part = str.split(" ")[0];
      const parts = part.split("/");
      if (parts.length === 3 && parts[2].length === 4) {
        const y = parts[2];
        const m = parts[1].padStart(2, "0");
        const d = parts[0].padStart(2, "0");
        return `${y}-${m}-${d}`;
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
  };

  useEffect(() => {
    if (effectiveMonthKey && /^\d{4}-\d{2}$/.test(effectiveMonthKey)) {
      const [y, m] = effectiveMonthKey.split("-").map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        setCurrentCalendarMonth(new Date(y, m - 1, 1));
      }
    }
  }, [effectiveMonthKey]);

  const dashboardMonthKey = effectiveMonthKey;

  const monthlyInspections = useMemo(() => {
    const baseList = getUniqueMonthlyInspections(inspections, dashboardMonthKey);
    return baseList.filter((insp) => {
      const inspGrupo = getInspectionGrupoContrato(insp, areas, contracts, supervisors, dbService.getDeletedNames());
      if (grupoContrato === "vale" && inspGrupo !== "vale") return false;
      if (grupoContrato === "vli" && inspGrupo !== "vli") return false;
      if (selectedSupervisorId !== "all" && !supervisorMatchesId(supervisors.find(s => s.id === selectedSupervisorId) || { id: selectedSupervisorId, nome: "" }, insp.supervisorId)) return false;
      if (selectedAreaId !== "all" && insp.areaId !== selectedAreaId) return false;
      if (selectedTipo !== "all" && getTipoLancamento(insp.atividade, insp.tipo, insp.tipoLancamento) !== selectedTipo) return false;
      if (selectedPotencial !== "all" && insp.potencial !== selectedPotencial) return false;
      return true;
    });
  }, [inspections, dashboardMonthKey, selectedSupervisorId, selectedAreaId, selectedTipo, selectedPotencial, grupoContrato, areas, contracts, supervisors]);

  const calendarDays = useMemo(() => {
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    const daysInMonth = lastDayOfMonth.getDate();
    const startOffset = firstDayOfMonth.getDay();
    
    const days = [];
    
    // Padding
    for (let i = 0; i < startOffset; i++) {
      days.push(null);
    }
    
    // Dates
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push(dateStr);
    }
    
    return days;
  }, [currentCalendarMonth]);

  const inspectionsByDate = useMemo(() => {
    return monthlyInspections.reduce((map: Record<string, Inspection[]>, insp) => {
      const dateKey = getNormalizedInspectionDate(insp);
      if (!dateKey) return map;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(insp);
      return map;
    }, {});
  }, [monthlyInspections]);

  // --- CORE INDICATORS ---
  const indicators = useMemo(() => {
    const total = filteredInspections.length;
    const activeSups = new Set(filteredInspections.map((i) => i.supervisorId)).size;

    const dss = filteredInspections.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "DSS").length;
    const ar = filteredInspections.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "AR").length;
    const lvcc = filteredInspections.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "LVCC").length;
    const dial = filteredInspections.filter(isDialInspection).length;
    const desviosComportamentais = filteredInspections.filter(isDesvioComportamentalInspection).length;
    const desviosEstruturais = filteredInspections.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Desvio Estrutural").length;
    const notificacoes = filteredInspections.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Notificação").length;
    const interdicoes = filteredInspections.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Interdição").length;
    const presenca = filteredInspections.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Presença em Campo").length;
    const criticos = filteredInspections.filter((i) => i.potencial === Potential.CRITICO).length;

    // Supervisor Destaque da Semana math (Most inspections in this current filtered list)
    const counts: Record<string, number> = {};
    filteredInspections.forEach((i) => {
      counts[i.supervisorId] = (counts[i.supervisorId] || 0) + 1;
    });

    let bestSupervisorId = "";
    let maxCount = 0;
    Object.entries(counts).forEach(([id, count]) => {
      if (count > maxCount) {
        maxCount = count;
        bestSupervisorId = id;
      }
    });

    const highlightSupervisor = supervisors.find((s) => s.id === bestSupervisorId)?.nome || dbService.getDeletedNames()[bestSupervisorId] || "Nenhum";

    return {
      total,
      activeSups,
      dss,
      ar,
      lvcc,
      dial,
      desviosComportamentais,
      desviosEstruturais,
      notificacoes,
      interdicoes,
      presenca,
      criticos,
      highlightSupervisor,
      highlightCount: maxCount
    };
  }, [filteredInspections, supervisors]);

  // --- TODAY DATE STRING HELPER ---
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // --- WEEKLY AND MONTHLY TARGET CALCULATIONS ---
  const targets = useMemo(() => {
    const today = new Date();
    
    // Start of current month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const activeSups = supervisors.filter((s) => {
      if (s.ativo === false) return false;
      if (grupoContrato === "vale") return isSupervisorFromGrupoContrato(s, "vale");
      if (grupoContrato === "vli") return isSupervisorFromGrupoContrato(s, "vli");
      return true;
    });
    const activeSupsForGoals = activeSups.filter(s => deveParticiparFarolGemba(s));
    const selectedSupervisor = activeSups.find(s => s.id === selectedSupervisorId);
    const targetPerType = 7;
    const weeklyGoal = (sup?: Supervisor) => sup ? getSupervisorTargets(sup).weekly : 4;
    const monthlyGoal = (sup?: Supervisor) => sup ? getSupervisorTargets(sup).monthly : 16;
    const totalWeeklyTarget = selectedSupervisorId === "all"
      ? Math.max(activeSupsForGoals.reduce((sum, sup) => sum + weeklyGoal(sup), 0), 1)
      : weeklyGoal(selectedSupervisor);
    const isQuantitativeGoal = selectedSupervisorId !== "all" && selectedSupervisor?.tipoMeta === "quantitativa";

    // Use centralized weeklyInspections
    const weekInspections = weeklyInspections;

    const monthInspections = monthlyInspections;

    // Counts for each of the types for this week
    const dssCount = weekInspections.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "DSS").length;
    const arCount = weekInspections.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "AR").length;
    const lvccCount = weekInspections.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "LVCC").length;
    const dialCount = weekInspections.filter(isDialInspection).length;
    const comportamentalCount = weekInspections.filter(isDesvioComportamentalInspection).length;
    const estruturalCount = weekInspections.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Desvio Estrutural").length;
    const notificacaoCount = weekInspections.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Notificação").length;
    const interdicaoCount = weekInspections.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Interdição").length;

    // A Type is achieved for the week if its count reaches targetPerType
    const dssAchieved = dssCount >= targetPerType;
    const arAchieved = arCount >= targetPerType;
    const lvccAchieved = lvccCount >= targetPerType;
    const dialAchieved = dialCount >= targetPerType;
    const comportamentalAchieved = comportamentalCount >= targetPerType;
    const estruturalAchieved = estruturalCount >= targetPerType;
    const notificacaoAchieved = notificacaoCount >= targetPerType;
    const interdicaoAchieved = interdicaoCount >= targetPerType;

    // Total weekly achieved (sum of capped counts)
    const dssCapped = Math.min(dssCount, targetPerType);
    const arCapped = Math.min(arCount, targetPerType);
    const lvccCapped = Math.min(lvccCount, targetPerType);
    const dialCapped = Math.min(dialCount, targetPerType);
    const comportamentalCapped = Math.min(comportamentalCount, targetPerType);
    const estruturalCapped = Math.min(estruturalCount, targetPerType);
    const notificacaoCapped = Math.min(notificacaoCount, targetPerType);
    const interdicaoCapped = Math.min(interdicaoCount, targetPerType);

    const typeBasedWeeklyAchieved = dssCapped + arCapped + lvccCapped + dialCapped + comportamentalCapped + estruturalCapped + notificacaoCapped + interdicaoCapped;
    const totalWeeklyAchieved = selectedSupervisorId === "all"
      ? activeSupsForGoals.reduce((sum, sup) => {
          const count = weekInspections.filter(i => inspectionBelongsToSupervisor(i, sup, supervisors)).length;
          if (sup.tipoMeta === "quantitativa") return sum + Math.min(count, weeklyGoal(sup));
          const achievedTypes = new Set(
            weekInspections
              .filter(i => inspectionBelongsToSupervisor(i, sup, supervisors))
              .map(i => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento))
              .filter(type => type !== "Presença em Campo")
          ).size;
          return sum + Math.min(achievedTypes, weeklyGoal(sup));
        }, 0)
      : isQuantitativeGoal
        ? Math.min(weekInspections.length, totalWeeklyTarget)
        : typeBasedWeeklyAchieved;
    const weeklyPercentage = Math.min(100, Math.round((totalWeeklyAchieved / totalWeeklyTarget) * 100));

    // Monthly progress
    const goalSupervisors = selectedSupervisorId === "all" ? activeSupsForGoals : selectedSupervisor ? [selectedSupervisor] : [];
    const monthlyTotalCount = monthInspections.filter(i => goalSupervisors.some(sup => inspectionBelongsToSupervisor(i, sup, supervisors))).length;
    const monthlyTarget = selectedSupervisorId === "all"
      ? activeSupsForGoals.reduce((sum, sup) => sum + monthlyGoal(sup), 0)
      : monthlyGoal(selectedSupervisor);
    const monthlyPercentage = monthlyTarget > 0 ? Math.min(100, Math.round((monthlyTotalCount / monthlyTarget) * 100)) : 0;

    // Dynamic smart alerts with priorities
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const smartAlertsList: { text: string; type: "critico" | "atencao" | "pendente" | "informativo" }[] = [];

    // 1. Team-level aggregated alerts if "all" is selected
    if (selectedSupervisorId === "all") {
      const unresolved = filteredInspections.filter((i) => i.status !== InspectionStatus.CONCLUIDO);
      const overdueCount = unresolved.filter((i) => i.prazo < todayStr).length;
      const totalOpenAndInProgress = unresolved.length;

      if (overdueCount > 0) {
        smartAlertsList.push({
          text: `Existem ${overdueCount} inspeções com prazo vencido.`,
          type: "critico"
        });
      }
      if (totalOpenAndInProgress > 0) {
        smartAlertsList.push({
          text: `Equipe possui ${totalOpenAndInProgress} tratativas em aberto.`,
          type: "atencao"
        });
      }
    }

    // 2. Specific supervisor checks
    const supsToCheck = selectedSupervisorId === "all" 
      ? activeSupsForGoals 
      : supervisors.filter((s) => s.id === selectedSupervisorId);

    supsToCheck.forEach((sup) => {
      const supInsps = filteredInspections.filter((i) => inspectionBelongsToSupervisor(i, sup, supervisors));
      const unresolved = supInsps.filter((i) => i.status !== InspectionStatus.CONCLUIDO);

      // Crítico check
      const overdue = unresolved.filter((i) => i.prazo < todayStr);
      if (overdue.length > 0) {
        smartAlertsList.push({
          text: `${sup.nome} possui ${overdue.length} inspeção(ões) com prazo vencido.`,
          type: "critico"
        });
      }

      const openInterdicao = unresolved.some((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Interdição");
      if (openInterdicao) {
        smartAlertsList.push({
          text: `${sup.nome} possui Interdição com tratativa pendente.`,
          type: "critico"
        });
      }

      const openCritical = unresolved.some((i) => i.potencial === Potential.CRITICO);
      if (openCritical) {
        smartAlertsList.push({
          text: `Desvio Crítico pendente de tratativa sob responsabilidade de ${sup.nome}.`,
          type: "critico"
        });
      }

      // Atenção check
      const inProgress = unresolved.filter((i) => i.status === InspectionStatus.EM_ANDAMENTO);
      if (inProgress.length > 0) {
        smartAlertsList.push({
          text: `${sup.nome} possui tratativa em andamento.`,
          type: "atencao"
        });
      }

      const openNotificacao = unresolved.some((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Notificação");
      if (openNotificacao) {
        smartAlertsList.push({
          text: `${sup.nome} possui Notificação pendente.`,
          type: "atencao"
        });
      }

      // Pendente weekly targets
      const supWeekInsps = weeklyInspections.filter((i) => inspectionBelongsToSupervisor(i, sup, supervisors));

      const supDss = supWeekInsps.some((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "DSS");
      const supAr = supWeekInsps.some((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "AR");
      const supLvcc = supWeekInsps.some((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "LVCC");
      const supDial = supWeekInsps.some(isDialInspection);
      const supComportamental = supWeekInsps.some(isDesvioComportamentalInspection);
      const supEstrutural = supWeekInsps.some((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Desvio Estrutural");
      const supNotificacao = supWeekInsps.some((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Notificação");
      const supInterdicao = supWeekInsps.some((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Interdição");

      if (sup.tipoMeta === "quantitativa") {
        const goal = weeklyGoal(sup);
        if (supWeekInsps.length < goal) smartAlertsList.push({ text: `${sup.nome} realizou ${supWeekInsps.length}/${goal} inspeções nesta semana.`, type: "pendente" });
      } else {
        if (!supDss) smartAlertsList.push({ text: `${sup.nome} ainda não realizou DSS nesta semana.`, type: "pendente" });
        if (!supAr) smartAlertsList.push({ text: `${sup.nome} ainda não realizou AR nesta semana.`, type: "pendente" });
        if (!supLvcc) smartAlertsList.push({ text: `${sup.nome} ainda não realizou LVCC nesta semana.`, type: "pendente" });
        if (!supDial) smartAlertsList.push({ text: `${sup.nome} ainda não realizou DIAL nesta semana.`, type: "pendente" });
        if (!supComportamental) smartAlertsList.push({ text: `${sup.nome} ainda não realizou Desvio Comportamental nesta semana.`, type: "pendente" });
        if (!supEstrutural) smartAlertsList.push({ text: `${sup.nome} ainda não realizou Desvio Estrutural nesta semana.`, type: "pendente" });
        if (!supNotificacao) smartAlertsList.push({ text: `${sup.nome} ainda não realizou Notificação nesta semana.`, type: "pendente" });
        if (!supInterdicao) smartAlertsList.push({ text: `${sup.nome} ainda não realizou Interdição nesta semana.`, type: "pendente" });
      }

      // Informativo checks
      const weeklyProgressCount = 
        (supDss ? 1 : 0) + 
        (supAr ? 1 : 0) + 
        (supLvcc ? 1 : 0) + 
        (supDial ? 1 : 0) + 
        (supComportamental ? 1 : 0) + 
        (supEstrutural ? 1 : 0) + 
        (supNotificacao ? 1 : 0) + 
        (supInterdicao ? 1 : 0);

      if ((sup.tipoMeta === "quantitativa" && supWeekInsps.length >= weeklyGoal(sup)) || (sup.tipoMeta !== "quantitativa" && weeklyProgressCount >= weeklyGoal(sup))) {
        smartAlertsList.push({
          text: `Meta semanal 100% concluída por ${sup.nome}!`,
          type: "informativo"
        });
      }

      const hasRecentInWeek = supWeekInsps.length > 0;
      if (hasRecentInWeek) {
        smartAlertsList.push({
          text: `Nova inspeção registrada por ${sup.nome}.`,
          type: "informativo"
        });
      }

      const hasCompletedInWeek = supWeekInsps.some((i) => i.status === InspectionStatus.CONCLUIDO);
      if (hasCompletedInWeek) {
        smartAlertsList.push({
          text: `Tratativa concluída por ${sup.nome}.`,
          type: "informativo"
        });
      }
    });

    return {
      dssCount,
      arCount,
      lvccCount,
      dialCount,
      comportamentalCount,
      estruturalCount,
      notificacaoCount,
      interdicaoCount,
      dssAchieved,
      arAchieved,
      lvccAchieved,
      dialAchieved,
      comportamentalAchieved,
      estruturalAchieved,
      notificacaoAchieved,
      interdicaoAchieved,
      totalWeeklyAchieved,
      totalWeeklyTarget,
      targetPerType,
      isQuantitativeGoal,
      weeklyPercentage,
      monthlyTotalCount,
      monthlyTarget,
      monthlyPercentage,
      smartAlerts: smartAlertsList
    };
  }, [weeklyInspections, monthlyInspections, filteredInspections, selectedSupervisorId, supervisors, grupoContrato]);


  const contractGoalSummaries = useMemo(() => {
    const build = (group: GrupoContrato) => {
      const groupSupervisors = supervisors.filter(
        (sup) => sup.ativo !== false && deveParticiparFarolGemba(sup) && isSupervisorFromGrupoContrato(sup, group)
      );
      const groupWeek = weeklyInspections.filter(
        (insp) => getInspectionGrupoContrato(insp, areas, contracts, supervisors, dbService.getDeletedNames()) === group
      );
      const groupMonth = monthlyInspections.filter(
        (insp) => getInspectionGrupoContrato(insp, areas, contracts, supervisors, dbService.getDeletedNames()) === group
      );

      const weeklyTarget = groupSupervisors.reduce((sum, sup) => sum + getSupervisorTargets(sup).weekly, 0);
      const monthlyTarget = groupSupervisors.reduce((sum, sup) => sum + getSupervisorTargets(sup).monthly, 0);
      const monthlyDone = groupMonth.filter(i => groupSupervisors.some(sup => inspectionBelongsToSupervisor(i, sup, supervisors))).length;
      const weeklyDone = groupSupervisors.reduce((sum, sup) => {
        const own = groupWeek.filter((insp) => inspectionBelongsToSupervisor(insp, sup, supervisors));
        const goal = getSupervisorTargets(sup).weekly;
        if (sup.tipoMeta === "quantitativa") return sum + Math.min(own.length, goal);
        const uniqueTypes = new Set(
          own.map((insp) => getTipoLancamento(insp.atividade, insp.tipo, insp.tipoLancamento))
            .filter((type) => type !== "Presença em Campo")
        ).size;
        return sum + Math.min(uniqueTypes, goal);
      }, 0);

      return {
        weeklyDone,
        weeklyTarget,
        weeklyPercentage: weeklyTarget > 0 ? Math.min(100, Math.round((weeklyDone / weeklyTarget) * 100)) : 0,
        monthlyDone,
        monthlyTarget,
        monthlyPercentage: monthlyTarget > 0 ? Math.min(100, Math.round((monthlyDone / monthlyTarget) * 100)) : 0
      };
    };

    const vale = build("vale");
    const vli = build("vli");
    const totalWeeklyTarget = vale.weeklyTarget + vli.weeklyTarget;
    const totalMonthlyTarget = vale.monthlyTarget + vli.monthlyTarget;
    const total = {
      weeklyDone: vale.weeklyDone + vli.weeklyDone,
      weeklyTarget: totalWeeklyTarget,
      weeklyPercentage: totalWeeklyTarget > 0
        ? Math.min(100, Math.round(((vale.weeklyDone + vli.weeklyDone) / totalWeeklyTarget) * 100))
        : 0,
      monthlyDone: vale.monthlyDone + vli.monthlyDone,
      monthlyTarget: totalMonthlyTarget,
      monthlyPercentage: totalMonthlyTarget > 0
        ? Math.min(100, Math.round(((vale.monthlyDone + vli.monthlyDone) / totalMonthlyTarget) * 100))
        : 0
    };

    return { vale, vli, total };
  }, [weeklyInspections, monthlyInspections, supervisors, areas, contracts]);

  // --- NEW MEMOS FOR ADVANCED CARDS ---
  const topSupervisorsOfWeek = useMemo(() => {
    const getMostRecentInspectionTime = (insps: Inspection[]) => {
      if (insps.length === 0) return 0;
      let maxTime = 0;
      insps.forEach(i => {
        const t = i.createdAt ? new Date(i.createdAt).getTime() : new Date(`${i.data}T00:00:00`).getTime();
        if (t > maxTime) maxTime = t;
      });
      return maxTime;
    };

    return supervisors
      .map((sup) => {
        const supWeekInsps = weeklyInspections.filter((i) => inspectionBelongsToSupervisor(i, sup, supervisors));

        // Count unique types achieved
        const dssCount = supWeekInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "DSS").length;
        const arCount = supWeekInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "AR").length;
        const lvccCount = supWeekInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "LVCC").length;
        const dialCount = supWeekInsps.filter(isDialInspection).length;
        const comportamentalCount = supWeekInsps.filter(isDesvioComportamentalInspection).length;
        const estruturalCount = supWeekInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Desvio Estrutural").length;
        const notificacaoCount = supWeekInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Notificação").length;
        const interdicaoCount = supWeekInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Interdição").length;

        const typeBasedAchievedCount = 
          (dssCount >= 1 ? 1 : 0) + 
          (arCount >= 1 ? 1 : 0) + 
          (lvccCount >= 1 ? 1 : 0) + 
          (dialCount >= 1 ? 1 : 0) + 
          (comportamentalCount >= 1 ? 1 : 0) + 
          (estruturalCount >= 1 ? 1 : 0) + 
          (notificacaoCount >= 1 ? 1 : 0) + 
          (interdicaoCount >= 1 ? 1 : 0);

        // Weekly target
        const weeklyTarget = getSupervisorTargets(sup).weekly;
        const weeklyAchievedCount = sup.tipoMeta === "quantitativa"
          ? Math.min(supWeekInsps.length, weeklyTarget)
          : Math.min(typeBasedAchievedCount, weeklyTarget);
        const percentage = Math.min(100, Math.round((weeklyAchievedCount / weeklyTarget) * 100));

        // Scoring
        const pontuacao = supWeekInsps.reduce((sum, i) => sum + getInspectionScore(i), 0);
        const mostRecentTime = getMostRecentInspectionTime(supWeekInsps);

        return {
          id: sup.id,
          nome: sup.nome,
          weeklyAchievedCount,
          weeklyTarget,
          percentage,
          totalInsps: supWeekInsps.length,
          pontuacao,
          mostRecentTime
        };
      })
      .sort((a, b) => {
        // 1. Maior pontuação
        if (b.pontuacao !== a.pontuacao) {
          return b.pontuacao - a.pontuacao;
        }
        // 2. Maior percentual da meta
        if (b.percentage !== a.percentage) {
          return b.percentage - a.percentage;
        }
        // 3. Maior quantidade de inspeções
        if (b.totalInsps !== a.totalInsps) {
          return b.totalInsps - a.totalInsps;
        }
        // 4. Inspeção mais recente
        return b.mostRecentTime - a.mostRecentTime;
      })
      .slice(0, 5); // top 5
  }, [weeklyInspections, supervisors]);

  const pendingOperationalCounts = useMemo(() => {
    const unresolved = filteredInspections.filter((i) => i.status !== InspectionStatus.CONCLUIDO);

    const ar = unresolved.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "AR").length;
    const lvcc = unresolved.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "LVCC").length;
    const dial = unresolved.filter(isDialInspection).length;
    const comportamental = unresolved.filter(isDesvioComportamentalInspection).length;
    const estrutural = unresolved.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Desvio Estrutural").length;
    const notificacao = unresolved.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Notificação").length;
    const interdicao = unresolved.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Interdição").length;

    return { ar, lvcc, dial, comportamental, estrutural, notificacao, interdicao };
  }, [filteredInspections]);

  const last10Inspections = useMemo(() => {
    return [...filteredInspections]
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : new Date(a.data + "T12:00:00").getTime();
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : new Date(b.data + "T12:00:00").getTime();
        return timeB - timeA;
      })
      .slice(0, 10);
  }, [filteredInspections]);

  // --- ADVANCED OPERATIONAL KPIS MATH ---
  const advancedKPIs = useMemo(() => {
    const todayStr = getTodayStr();
    
    // Filters matched list for advanced KPIs
    const weekCount = weeklyInspections.length;

    const monthCount = monthlyInspections.length;

    const unresolved = monthlyInspections.filter((i) => i.status !== InspectionStatus.CONCLUIDO);
    const pendingCount = unresolved.length;
    const completedCount = monthlyInspections.filter((i) => i.status === InspectionStatus.CONCLUIDO).length;
    const inProgressCount = monthlyInspections.filter((i) => i.status === InspectionStatus.EM_ANDAMENTO).length;
    const overdueCount = unresolved.filter((i) => i.prazo < todayStr).length;
    const criticalCount = monthlyInspections.filter((i) => i.potencial === Potential.CRITICO).length;

    // Leaderboard score calculations for monthly highlight
    const scores: Record<string, number> = {};
    supervisors.forEach(s => { scores[s.id] = 0; });
    monthlyInspections.forEach((i) => {
      const sup = resolveInspectionSupervisor(i, supervisors, dbService.getDeletedNames());
      const supId = sup?.id || i.supervisorId;
      if (supId) {
        scores[supId] = (scores[supId] || 0);
        if (i.potencial === Potential.LEVE) scores[supId] += 1;
        else if (i.potencial === Potential.MEDIO) scores[supId] += 2;
        else if (i.potencial === Potential.GRAVE) scores[supId] += 3;
        else if (i.potencial === Potential.CRITICO) scores[supId] += 5;

        if (i.status === InspectionStatus.CONCLUIDO) {
          scores[supId] += 2;
        }
      }
    });

    let topSupervisorId = "";
    let highestScore = 0;
    Object.entries(scores).forEach(([id, score]) => {
      if (score > highestScore) {
        highestScore = score;
        topSupervisorId = id;
      }
    });

    const topSupervisorName = supervisors.find(s => s.id === topSupervisorId)?.nome ||
      (topSupervisorId && !topSupervisorId.startsWith("sup-hist-") ? topSupervisorId : "Nenhum");

    return {
      weekCount,
      monthCount,
      pendingCount,
      completedCount,
      inProgressCount,
      overdueCount,
      criticalCount,
      topSupervisorName,
      highestScore
    };
  }, [weeklyInspections, monthlyInspections, supervisors]);

  // --- PENDÊNCIAS E VENCIMENTOS PANEL MATH ---
  const { pendingInspections, overdueInspections } = useMemo(() => {
    const todayStr = getTodayStr();
    
    const unresolved = filteredInspections.filter((i) => {
      return i.status !== InspectionStatus.CONCLUIDO;
    });

    const pending = [...unresolved].sort((a, b) => new Date(a.prazo).getTime() - new Date(b.prazo).getTime());
    const overdue = unresolved.filter((i) => i.prazo < todayStr)
      .sort((a, b) => new Date(a.prazo).getTime() - new Date(b.prazo).getTime());

    return {
      pendingInspections: pending,
      overdueInspections: overdue
    };
  }, [filteredInspections]);

  // --- CHART 1: Inspeções por Supervisor ---
  const chartSupervisors = useMemo(() => {
    const counts: Record<string, number> = {};
    
    // Seed existing supervisors with 0
    supervisors.forEach((s) => {
      if (s.nome) counts[s.nome] = 0;
    });

    filteredInspections.forEach((i) => {
      const supName = getInspectionSupervisorName(i, supervisors, dbService.getDeletedNames());
      counts[supName] = (counts[supName] || 0) + 1;
    });

    // Return entries with at least 1 inspection, plus top seeded supervisors
    return Object.entries(counts)
      .filter(([name, count]) => count > 0 || (supervisors.some(s => s.nome === name) && filteredInspections.length === 0))
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        // Keep "Outros" at the bottom if any other named supervisors exist
        if (a.name === "Outros") return 1;
        if (b.name === "Outros") return -1;
        return b.count - a.count;
      });
  }, [filteredInspections, supervisors]);

  // --- CHART 2: Inspeções por Área ---
  const chartAreas = useMemo(() => {
    const counts: Record<string, number> = {};
    areas.forEach((a) => {
      if (a.nome) counts[a.nome] = 0;
    });

    filteredInspections.forEach((i) => {
      const area = areas.find((a) => a.id === i.areaId);
      const areaName = area?.nome ||
        (i as any).areaNome ||
        (i as any).area ||
        dbService.getDeletedNames()[i.areaId] ||
        "Outros";
      counts[areaName] = (counts[areaName] || 0) + 1;
    });

    return Object.entries(counts)
      .filter(([name, count]) => count > 0 || (areas.some(a => a.nome === name) && filteredInspections.length === 0))
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (a.name === "Outros") return 1;
        if (b.name === "Outros") return -1;
        return b.count - a.count;
      });
  }, [filteredInspections, areas]);

  // --- CHART 3: Inspeções por Tipo ---
  const chartTypes = useMemo(() => {
    const counts: Record<string, number> = {
      "DSS": 0,
      "AR": 0,
      "LVCC": 0,
      "DIAL": 0,
      "Desvio Comportamental": 0,
      "Desvio Estrutural": 0,
      "Notificação": 0,
      "Interdição": 0
    };

    filteredInspections.forEach((i) => {
      const type = getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento);
      if (counts[type] !== undefined) {
        counts[type]++;
      }
    });

    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [filteredInspections]);

  // --- CHART 4: Status das Tratativas ---
  const chartStatus = useMemo(() => {
    const counts = {
      [InspectionStatus.ABERTO]: 0,
      [InspectionStatus.EM_ANDAMENTO]: 0,
      [InspectionStatus.CONCLUIDO]: 0
    };

    filteredInspections.forEach((i) => {
      if (counts[i.status] !== undefined) {
        counts[i.status]++;
      }
    });

    const total = filteredInspections.length || 1;
    return {
      aberto: counts[InspectionStatus.ABERTO],
      andamento: counts[InspectionStatus.EM_ANDAMENTO],
      concluido: counts[InspectionStatus.CONCLUIDO],
      percConcluido: Math.round((counts[InspectionStatus.CONCLUIDO] / total) * 100)
    };
  }, [filteredInspections]);

  // --- CHART 5: Evolução Diária do Mês ---
  const chartEvolution = useMemo(() => {
    const [yearStr, monthStr] = dashboardMonthKey.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed month

    if (isNaN(year) || isNaN(month) || month < 0 || month > 11) return [];

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const dailyCounts: Record<string, number> = {};

    monthlyInspections.forEach((insp) => {
      const dateKey = getNormalizedInspectionDate(insp);
      if (dateKey && dateKey.startsWith(dashboardMonthKey)) {
        dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
      }
    });

    const days: { data: string; total: number }[] = [];

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dayFormatted = String(dayNum).padStart(2, "0");
      const monthFormatted = String(month + 1).padStart(2, "0");
      const dateKey = `${year}-${monthFormatted}-${dayFormatted}`;
      const label = `${dayFormatted}/${monthFormatted}`;

      days.push({
        data: label,
        total: dailyCounts[dateKey] || 0
      });
    }

    return days;
  }, [monthlyInspections, dashboardMonthKey]);

  const lastSyncTime = useMemo(() => {
    const now = new Date();
    return now.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }, [inspections]);

  const isAdminOrGestor = useMemo(() => {
    const role = currentUser?.perfil;
    return role === "Desenvolvedor/Admin" || role === "Administrador" || role === "Gestor" || role === "admin" || role === "gestor";
  }, [currentUser?.perfil]);

  const auditData = useMemo(() => {
    const delNames = dbService.getDeletedNames();
    const totalFirestore = inspections.length;
    let totalVli = 0;
    let totalVale = 0;
    let totalNaoClassificado = 0;
    let semGrupo = 0;
    let julho2026 = 0;
    let agosto2026 = 0;
    let setembro2026 = 0;
    let vinculosPendentes = 0;
    const byMonth: Record<string, number> = {};
    const byLocalidade: Record<string, number> = {};
    const byContrato: Record<string, number> = {};
    const bySupervisor: Record<string, number> = {};

    inspections.forEach((i) => {
      const g = getInspectionGrupoContrato(i, areas, contracts, supervisors, delNames);
      if (g === "vale") totalVale++;
      else if (g === "vli") totalVli++;
      else totalNaoClassificado++;

      if (!i.grupoContrato) semGrupo++;

      const m = getInspectionMonthKey(i) || "sem_data";
      byMonth[m] = (byMonth[m] || 0) + 1;
      if (m === "2026-07") julho2026++;
      if (m === "2026-08") agosto2026++;
      if (m === "2026-09") setembro2026++;

      const sup = resolveInspectionSupervisor(i, supervisors, delNames);
      if (!sup) vinculosPendentes++;

      const loc = areas.find(a => a.id === i.areaId)?.nome || delNames[i.areaId || ""] || (i as any).localidade || "Desconhecida";
      byLocalidade[loc] = (byLocalidade[loc] || 0) + 1;

      const cont = contracts.find(c => c.id === i.contratoId)?.nome || delNames[i.contratoId || ""] || (i as any).contratoNome || "Desconhecido";
      byContrato[cont] = (byContrato[cont] || 0) + 1;

      const supId = i.supervisorId || "sem_id";
      bySupervisor[supId] = (bySupervisor[supId] || 0) + 1;
    });

    return {
      totalFirestore,
      totalVli,
      totalVale,
      totalNaoClassificado,
      semGrupo,
      julho2026,
      agosto2026,
      setembro2026,
      vinculosPendentes,
      byMonth,
      byLocalidade,
      byContrato,
      bySupervisor,
      syncInfo: dbService.getInspectionSyncInfo()
    };
  }, [inspections, areas, contracts, supervisors]);

  useEffect(() => {
    if (!isAdminOrGestor || inspections.length === 0) return;
    console.info("[Auditoria Histórico Gemba]", {
      totalFirestore: auditData.totalFirestore,
      totalMostradoDashboard: filteredInspections.length,
      diferenca: auditData.totalFirestore - filteredInspections.length,
      vli: auditData.totalVli,
      vale: auditData.totalVale,
      naoClassificado: auditData.totalNaoClassificado,
      semGrupoContrato: auditData.semGrupo,
      vinculosPendentes: auditData.vinculosPendentes,
      julho2026: auditData.julho2026,
      agosto2026: auditData.agosto2026,
      setembro2026: auditData.setembro2026,
      porMes: auditData.byMonth,
      porLocalidade: auditData.byLocalidade,
      porContrato: auditData.byContrato,
      porSupervisorId: auditData.bySupervisor
    });
  }, [isAdminOrGestor, auditData, filteredInspections.length]);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <h1 id="dashboard-title" className="text-3xl font-black bg-gradient-to-r from-[#0B2E59] to-[#1b4372] bg-clip-text text-transparent tracking-tight pb-1">
            Painel Executivo GEMBA FTA
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Indicadores de segurança em tempo real alimentados pelo lançamento de inspeções em campo.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 lg:self-center">
          {/* Centralized Operational Week Banner */}
          <div className="bg-blue-50 border border-blue-100 px-4 py-2 rounded-xl flex flex-col items-start text-left shadow-2xs gap-0.5">
            <span className="text-[9px] uppercase tracking-widest font-black text-[#F58220]">Semana Operacional</span>
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#0B2E59]">
              <Calendar size={14} />
              {formatOperationalWeekLabel(activeOperationalWeek)}
            </div>
          </div>

          {/* Executive Sync and Database Status Panel */}
          <div className="bg-slate-50 border border-slate-200/80 px-3.5 py-2 rounded-xl flex flex-col items-start sm:items-end text-left sm:text-right shadow-2xs gap-1 min-w-[200px]">
            <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest leading-none">
              Última Sincronização
            </div>
            <div className="font-mono text-xs font-bold text-slate-700 leading-tight">
              {lastSyncTime}
            </div>
            <div className="text-[10px] text-slate-500 font-bold flex items-center gap-1.5 mt-1 pt-1 border-t border-slate-200/50 w-full justify-start sm:justify-end">
              <span>Status do banco:</span>
              <span className="text-emerald-600 font-extrabold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                Firebase Online
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg border border-gray-200 shadow-sm transition-all duration-150 cursor-pointer"
            >
              <RefreshCw size={14} /> Limpar Filtros
            </button>
            <button
              onClick={() => onSelectTab("lancar")}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#F58220] hover:bg-orange-600 text-white text-xs font-bold rounded-lg shadow-sm transition-all duration-150 cursor-pointer"
            >
              <PlusCircle size={14} /> Nova Inspeção
            </button>
          </div>
        </div>
      </div>

      {/* Visual Integrity Audit Card for Admins & Managers */}
      {isAdminOrGestor && (
        <div className="bg-slate-900 text-slate-100 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setIsAuditCardOpen(!isAuditCardOpen)}
            className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="text-emerald-400" size={18} />
              <div>
                <span className="font-extrabold text-xs tracking-wider uppercase text-white">
                  Auditoria de Integridade do Histórico
                </span>
                <span className="ml-2 text-[10px] text-slate-400 font-medium hidden sm:inline">
                  (Modo somente leitura • {auditData.totalFirestore} documentos no banco)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Listener Ativo
              </span>
              {isAuditCardOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </div>
          </button>

          {isAuditCardOpen && (
            <div className="px-5 pb-5 pt-2 border-t border-slate-800 bg-slate-950/50 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400">Total Firestore</span>
                  <span className="text-lg font-black text-white mt-1 font-mono">{auditData.totalFirestore}</span>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-[#F58220]">Total VLI</span>
                  <span className="text-lg font-black text-[#F58220] mt-1 font-mono">{auditData.totalVli}</span>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-emerald-400">Total Vale</span>
                  <span className="text-lg font-black text-emerald-400 mt-1 font-mono">{auditData.totalVale}</span>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-amber-400">Não Classificados</span>
                  <span className="text-lg font-black text-amber-400 mt-1 font-mono">{auditData.totalNaoClassificado}</span>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-rose-400">Vínculos Pendentes</span>
                  <span className="text-lg font-black text-rose-400 mt-1 font-mono">{auditData.vinculosPendentes}</span>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-blue-400">Julho/2026</span>
                  <span className="text-lg font-black text-blue-400 mt-1 font-mono">{auditData.julho2026}</span>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-indigo-400">Agosto/2026</span>
                  <span className="text-lg font-black text-indigo-400 mt-1 font-mono">{auditData.agosto2026}</span>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-teal-400">Setembro/2026</span>
                  <span className="text-lg font-black text-teal-400 mt-1 font-mono">{auditData.setembro2026}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                <div className="flex items-center gap-4">
                  <span>Status da sincronização: <strong className="text-white capitalize">{auditData.syncInfo.status}</strong></span>
                  <span>Sem grupo persistido: <strong className="text-white">{auditData.semGrupo}</strong></span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  Diferença para visualização filtrada atual: {auditData.totalFirestore - filteredInspections.length} registros
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FILTER PANEL */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-gray-50 pb-3">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-[#0B2E59]" />
            <h2 className="text-sm font-bold text-[#0B2E59] uppercase tracking-wider">
              Filtros Dinâmicos de Consulta
            </h2>
          </div>

          {/* Contract Group Selector (Vale vs VLI) */}
          {onSelectGrupoContrato && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1 rounded-xl">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 px-2 flex items-center gap-1">
                <Building2 size={12} /> Contrato:
              </span>
              {permittedGruposContrato.length > 1 && (
                <button
                  type="button"
                  onClick={() => onSelectGrupoContrato("todos")}
                  className={`px-3 py-1 text-xs font-black uppercase rounded-lg transition-all cursor-pointer ${
                    grupoContrato === "todos"
                      ? "bg-[#0B2E59] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                >
                  Todos os Contratos
                </button>
              )}
              {permittedGruposContrato.includes("vale") && (
                <button
                  type="button"
                  onClick={() => onSelectGrupoContrato("vale")}
                  className={`px-3 py-1 text-xs font-black uppercase rounded-lg transition-all cursor-pointer ${
                    grupoContrato === "vale"
                      ? "bg-emerald-700 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                >
                  Vale
                </button>
              )}
              {permittedGruposContrato.includes("vli") && (
                <button
                  type="button"
                  onClick={() => onSelectGrupoContrato("vli")}
                  className={`px-3 py-1 text-xs font-black uppercase rounded-lg transition-all cursor-pointer ${
                    grupoContrato === "vli"
                      ? "bg-[#F58220] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                >
                  VLI
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Mês de Referência */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-600">Mês de Referência</label>
            <select
              value={activeMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-800 font-extrabold focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-colors"
            >
              {getMonthOptions(inspections).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Período */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-600">Período de Tempo</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as any)}
              className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-colors"
            >
              <option value="all">Todo o Histórico</option>
              <option value="diario">Inspeções de Hoje (Diário)</option>
              <option value="semanal">Semana Operacional (Sexta a Quinta)</option>
              <option value="mensal">Últimos 30 Dias (Mensal)</option>
              <option value="personalizado">Período Personalizado</option>
            </select>
          </div>

          {/* Supervisor */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-600">Supervisor</label>
            <select
              value={selectedSupervisorId}
              onChange={(e) => setSelectedSupervisorId(e.target.value)}
              className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-colors"
            >
              <option value="all">Todos os Supervisores</option>
              {availableSupervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Área */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-600">Área Operacional</label>
            <select
              value={selectedAreaId}
              onChange={(e) => setSelectedAreaId(e.target.value)}
              className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-colors"
            >
              <option value="all">Todas as Áreas</option>
              {availableAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de Lançamento */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-600">Tipo de Lançamento</label>
            <select
              value={selectedTipo}
              onChange={(e) => setSelectedTipo(e.target.value)}
              className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-colors font-semibold"
            >
              <option value="all">Todos os Tipos</option>
              {Object.keys(TIPO_LANCAMENTO_CONFIG).map((t) => (
                <option key={t} value={t}>
                  {TIPO_LANCAMENTO_CONFIG[t].icon} {t}
                </option>
              ))}
            </select>
          </div>

          {/* Potencial */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-600">Potencial de Risco</label>
            <select
              value={selectedPotencial}
              onChange={(e) => setSelectedPotencial(e.target.value)}
              className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-colors"
            >
              <option value="all">Todos os Potenciais</option>
              {Object.values(Potential).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Date Custom inputs */}
          {timeframe === "personalizado" && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-600">Data Inicial</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-600">Data Final</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                />
              </div>
            </>
          )}
        </div>

        {/* Active Filters Display */}
        {(timeframe !== "all" || selectedSupervisorId !== "all" || selectedAreaId !== "all" || selectedTipo !== "all" || selectedPotencial !== "all") && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">Filtros Ativos:</span>
            
            {timeframe !== "all" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-800 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-1">
                <span>Período: {timeframe === "diario" ? "Hoje" : timeframe === "semanal" ? `Semana Operacional (${formatOperationalWeekLabel(activeOperationalWeek)})` : timeframe === "mensal" ? "30 dias" : `Personalizado (${startDate} a ${endDate})`}</span>
                <button onClick={() => setTimeframe("all")} className="text-blue-500 hover:text-blue-850 font-black ml-1 cursor-pointer">×</button>
              </span>
            )}

            {selectedSupervisorId !== "all" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-800 bg-orange-50 border border-orange-100 rounded-full px-2.5 py-1">
                <span>Supervisor: {supervisors.find(s => s.id === selectedSupervisorId)?.nome || "Selecionado"}</span>
                <button onClick={() => setSelectedSupervisorId("all")} className="text-orange-500 hover:text-orange-855 font-black ml-1 cursor-pointer">×</button>
              </span>
            )}

            {selectedAreaId !== "all" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
                <span>Área: {areas.find(a => a.id === selectedAreaId)?.nome || "Selecionada"}</span>
                <button onClick={() => setSelectedAreaId("all")} className="text-emerald-500 hover:text-emerald-855 font-black ml-1 cursor-pointer">×</button>
              </span>
            )}

            {selectedTipo !== "all" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-800 bg-purple-50 border border-purple-100 rounded-full px-2.5 py-1">
                <span>Tipo: {selectedTipo}</span>
                <button onClick={() => setSelectedTipo("all")} className="text-purple-500 hover:text-purple-855 font-black ml-1 cursor-pointer">×</button>
              </span>
            )}

            {selectedPotencial !== "all" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 bg-rose-50 border border-rose-100 rounded-full px-2.5 py-1">
                <span>Risco: {selectedPotencial}</span>
                <button onClick={() => setSelectedPotencial("all")} className="text-rose-500 hover:text-rose-855 font-black ml-1 cursor-pointer">×</button>
              </span>
            )}

            <button 
              onClick={resetFilters} 
              className="text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-red-500 ml-auto flex items-center gap-1 cursor-pointer"
            >
              Limpar tudo
            </button>
          </div>
        )}
      </div>

      {filteredInspections.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 flex flex-col items-center justify-center text-center my-6 gap-4 py-16">
          <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-3xl shadow-inner animate-bounce">
            🔍
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-sm font-black text-[#0B2E59] uppercase tracking-wider">
              Nenhuma inspeção encontrada
            </h3>
            <p className="text-xs text-gray-400 font-semibold leading-relaxed">
              Nenhuma inspeção encontrada para os filtros selecionados.
            </p>
          </div>
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#0B2E59] text-white text-xs font-bold rounded-lg hover:bg-blue-900 transition-colors shadow-sm cursor-pointer"
          >
            <RefreshCw size={12} /> Limpar Todos os Filtros
          </button>
        </div>
      ) : (
        <>
          {/* 2.0 META CARDS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0">
        {/* META DA SEMANA */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-2 mb-3">
              <span className="text-xs font-black text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                🎯 Meta da Semana
              </span>
              <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                {selectedSupervisorId === "all" ? "Equipe Completa" : "Individual"}
              </span>
            </div>
            
            {grupoContrato === "todos" ? (
              <div className="space-y-4">
                {(["vale", "vli"] as const).map((group) => {
                  const summary = contractGoalSummaries[group];
                  return (
                    <div key={group} className="rounded-lg border border-slate-100 p-3 bg-slate-50/60">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-black uppercase text-[#0B2E59]">{group === "vale" ? "Vale" : "VLI"}</span>
                        <span className="font-black text-gray-900">{summary.weeklyDone}/{summary.weeklyTarget} • {summary.weeklyPercentage}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-3 rounded-lg overflow-hidden">
                        <div className="bg-[#F58220] h-full transition-all duration-500" style={{ width: `${summary.weeklyPercentage}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="rounded-lg border-2 border-[#0B2E59]/15 p-3 bg-blue-50/70">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-black uppercase text-[#0B2E59]">Total Geral</span>
                    <span className="font-black text-gray-900">{contractGoalSummaries.total.weeklyDone}/{contractGoalSummaries.total.weeklyTarget} • {contractGoalSummaries.total.weeklyPercentage}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-3 rounded-lg overflow-hidden">
                    <div className="bg-[#0B2E59] h-full transition-all duration-500" style={{ width: `${contractGoalSummaries.total.weeklyPercentage}%` }} />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase text-center">Vale e VLI separados; total geral somente em Todos</p>
              </div>
            ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-gray-500">Progresso Geral:</span>
                <span className="font-black text-gray-900">{targets.totalWeeklyAchieved} / {targets.totalWeeklyTarget} Atividades</span>
              </div>
              
              {/* Progress Bar Display */}
              <div className="space-y-1.5">
                <div className="w-full bg-slate-100 h-4 rounded-lg overflow-hidden flex relative items-center">
                  <div 
                    style={{ width: `${targets.weeklyPercentage}%` }} 
                    className="bg-gradient-to-r from-blue-600 to-[#F58220] h-full transition-all duration-500"
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-slate-850 drop-shadow-xs">
                    {targets.weeklyPercentage}%
                  </span>
                </div>
                {/* Block representation as requested: ██████░░░ */}
                <div className="text-xs font-mono font-bold text-slate-700 tracking-wider flex items-center justify-between bg-slate-50 p-1.5 rounded-md border border-slate-100">
                  <span className="text-[#F58220]">
                    {getBlockProgressString(targets.totalWeeklyAchieved, targets.totalWeeklyTarget)}
                  </span>
                  <span>{targets.totalWeeklyAchieved}/{targets.totalWeeklyTarget}</span>
                </div>
              </div>

              {/* Itemized Status with Modern Block Progress for each activity */}
              <div className="pt-2 border-t border-slate-50 space-y-2.5">
                {targets.isQuantitativeGoal ? (
                  <p className="text-[11px] text-slate-500 font-semibold bg-blue-50 border border-blue-100 rounded-lg p-3">
                    Meta quantitativa individual: qualquer tipo de inspeção válida conta para o objetivo semanal.
                  </p>
                ) : (
                  <>
                    {renderBlockProgressRow("DSS", "🦺", targets.dssCount, targets.targetPerType)}
                    {renderBlockProgressRow("AR", "📋", targets.arCount, targets.targetPerType)}
                    {renderBlockProgressRow("LVCC", "🔍", targets.lvccCount, targets.targetPerType)}
                    {renderBlockProgressRow("DIAL", "👥", targets.dialCount, targets.targetPerType)}
                    {renderBlockProgressRow("Desvio Comportamental", "👤", targets.comportamentalCount, targets.targetPerType)}
                    {renderBlockProgressRow("Desvio Estrutural", "🏗️", targets.estruturalCount, targets.targetPerType)}
                    {renderBlockProgressRow("Notificação", "⚠️", targets.notificacaoCount, targets.targetPerType)}
                    {renderBlockProgressRow("Interdição", "⛔", targets.interdicaoCount, targets.targetPerType)}
                  </>
                )}
              </div>
            </div>
            )}
          </div>
          
          <div className="mt-4 pt-2 border-t border-slate-50 text-[10px] text-gray-400 font-bold uppercase tracking-wider text-center">
            {grupoContrato === "todos" ? "Metas Vale e VLI separadas" : `Percentual de Conformidade: ${targets.weeklyPercentage}%`}
          </div>
        </div>

        {/* META DO MÊS */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-2 mb-3">
              <span className="text-xs font-black text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                📅 Meta do Mês
              </span>
              <span className="text-[10px] bg-orange-50 text-[#F58220] px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                {selectedSupervisorId === "all" ? "Equipe Completa" : "Individual"}
              </span>
            </div>

            {grupoContrato === "todos" ? (
              <div className="space-y-4 py-4">
                {(["vale", "vli"] as const).map((group) => {
                  const summary = contractGoalSummaries[group];
                  return (
                    <div key={group} className="rounded-lg border border-slate-100 p-3 bg-slate-50/60">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-black uppercase text-[#0B2E59]">{group === "vale" ? "Vale" : "VLI"}</span>
                        <span className="font-black text-gray-900">{summary.monthlyDone}/{summary.monthlyTarget} • {summary.monthlyPercentage}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-3 rounded-lg overflow-hidden">
                        <div className="bg-[#F58220] h-full transition-all duration-500" style={{ width: `${summary.monthlyPercentage}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="rounded-lg border-2 border-[#0B2E59]/15 p-3 bg-blue-50/70">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-black uppercase text-[#0B2E59]">Total Geral</span>
                    <span className="font-black text-gray-900">{contractGoalSummaries.total.monthlyDone}/{contractGoalSummaries.total.monthlyTarget} • {contractGoalSummaries.total.monthlyPercentage}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-3 rounded-lg overflow-hidden">
                    <div className="bg-[#0B2E59] h-full transition-all duration-500" style={{ width: `${contractGoalSummaries.total.monthlyPercentage}%` }} />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase text-center">Metas mensais separadas; total geral somente em Todos</p>
              </div>
            ) : (
            <div className="flex flex-col items-center justify-center py-4">
              {/* Circular Gauge */}
              <div className="relative w-44 h-44 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" stroke="#f1f5f9" strokeWidth="8" fill="none" />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="#F58220"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (251.2 * targets.monthlyPercentage) / 100}
                    className="transition-all duration-1000 ease-out"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-3xl font-black text-gray-800 leading-none block">
                    {targets.monthlyPercentage}%
                  </span>
                  <span className="text-xs text-gray-500 font-bold block mt-1.5">
                    {targets.monthlyTotalCount} / {targets.monthlyTarget}
                  </span>
                </div>
              </div>

              <div className="text-center mt-4 space-y-1">
                <p className="text-xs font-black text-slate-700">
                  {selectedSupervisorId === "all" ? "Meta Mensal da Equipe" : "Meta Mensal Individual"}
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase">
                  Alvo: {targets.monthlyTarget} lançamentos
                </p>
              </div>
            </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-50 text-[10px] text-gray-400 font-bold uppercase tracking-wider text-center">
            {grupoContrato === "todos" ? "Metas mensais Vale e VLI separadas" : (targets.monthlyTotalCount >= targets.monthlyTarget ? "🎉 Meta Mensal Atingida!" : "🚀 Lançamentos ativos na base")}
          </div>
        </div>

        {/* SMART ALERTAS DE CONFORMIDADE */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-2 mb-3">
              <span className="text-xs font-black text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                ⚠️ Alertas da Semana
              </span>
              <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider animate-pulse">
                {targets.smartAlerts.length} Ativos
              </span>
            </div>

            <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
              {targets.smartAlerts.map((alert, idx) => {
                let badgeColor = "border-yellow-200 bg-yellow-50 text-yellow-800";
                let priorityText = "🟡 Pendente";
                
                if (alert.type === "critico") {
                  badgeColor = "border-red-200 bg-red-50 text-red-800";
                  priorityText = "🔴 Crítico";
                } else if (alert.type === "atencao") {
                  badgeColor = "border-amber-200 bg-amber-50 text-amber-800";
                  priorityText = "🟠 Atenção";
                } else if (alert.type === "informativo") {
                  badgeColor = "border-emerald-200 bg-emerald-50 text-emerald-800";
                  priorityText = "🟢 Informativo";
                }

                return (
                  <div 
                    key={idx} 
                    className={`p-2.5 border rounded-lg text-[10px] font-bold flex flex-col gap-1.5 transition ${badgeColor} animate-fade-in`}
                  >
                    <div className="flex items-center justify-between border-b border-black/5 pb-1">
                      <span className="uppercase text-[8px] tracking-wider font-black">{priorityText}</span>
                      <AlertCircle size={10} className="shrink-0" />
                    </div>
                    <span className="leading-relaxed font-semibold">{alert.text}</span>
                  </div>
                );
              })}

              {targets.smartAlerts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 gap-2">
                  <div className="p-3 bg-emerald-50 rounded-full text-emerald-600">
                    <CheckCircle size={32} />
                  </div>
                  <p className="text-xs font-black text-slate-700">Tudo em conformidade!</p>
                  <p className="text-[10px] text-slate-400 font-semibold max-w-[180px]">
                    Nenhum alerta pendente ou desvio de conformidade detectado para esta seleção.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 mt-4 border-t border-slate-50 text-[10px] text-center text-gray-400 font-bold uppercase tracking-wider">
            Monitor de metas e riscos semanais
          </div>
        </div>
      </div>

      {/* 3 NEW INTERACTIVE DASHBOARDS CARDS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 shrink-0">
        {/* CARD 1: SUPERVISORES DA SEMANA */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-2 mb-3">
              <span className="text-xs font-black text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                🏆 Supervisores da Semana
              </span>
              <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                Top 5
              </span>
            </div>

            <div className="space-y-4">
              {topSupervisorsOfWeek.map((sup, idx) => {
                const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}º`;
                const blocks = "█".repeat(sup.weeklyAchievedCount) + "░".repeat(Math.max(0, sup.weeklyTarget - sup.weeklyAchievedCount));
                return (
                  <div key={sup.id} className="text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-gray-700">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm shrink-0 w-5">{medal}</span>
                        <span className="truncate max-w-[140px] text-slate-800">{sup.nome.split(" ")[0]}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {sup.weeklyAchievedCount} / {sup.weeklyTarget} ({sup.percentage}%)
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs font-bold text-amber-500 tracking-widest leading-none">
                        {blocks}
                      </span>
                      <span className="text-[9px] text-gray-400 font-extrabold shrink-0">{sup.totalInsps} lançs.</span>
                    </div>
                  </div>
                );
              })}

              {topSupervisorsOfWeek.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6 italic">Nenhum registro encontrado nesta semana.</p>
              )}
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-slate-50 text-[10px] text-gray-400 font-bold uppercase tracking-wider text-center">
            Leaderboard de Gestão Operacional
          </div>
        </div>

        {/* CARD 2: PENDÊNCIAS OPERACIONAIS */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-2 mb-3">
              <span className="text-xs font-black text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                📋 Pendências Operacionais
              </span>
              <span className="text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                Não Concluídos
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex flex-col justify-between">
                <span className="text-gray-400 text-[9px] font-black uppercase tracking-wider">AR</span>
                <div className="flex items-end justify-between mt-1">
                  <span className="text-base font-black text-slate-700">{pendingOperationalCounts.ar}</span>
                  <span className="text-[8px] text-gray-400 font-bold uppercase">Abertos</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex flex-col justify-between">
                <span className="text-gray-400 text-[9px] font-black uppercase tracking-wider">LVCC</span>
                <div className="flex items-end justify-between mt-1">
                  <span className="text-base font-black text-slate-700">{pendingOperationalCounts.lvcc}</span>
                  <span className="text-[8px] text-gray-400 font-bold uppercase">Abertos</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex flex-col justify-between">
                <span className="text-gray-400 text-[9px] font-black uppercase tracking-wider">DIAL</span>
                <div className="flex items-end justify-between mt-1">
                  <span className="text-base font-black text-slate-700">{pendingOperationalCounts.dial}</span>
                  <span className="text-[8px] text-gray-400 font-bold uppercase">Abertos</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex flex-col justify-between">
                <span className="text-gray-400 text-[9px] font-black uppercase tracking-wider">Comportamental</span>
                <div className="flex items-end justify-between mt-1">
                  <span className="text-base font-black text-slate-700">{pendingOperationalCounts.comportamental}</span>
                  <span className="text-[8px] text-gray-400 font-bold uppercase">Abertos</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex flex-col justify-between col-span-2">
                <span className="text-gray-400 text-[9px] font-black uppercase tracking-wider">Estrutural</span>
                <div className="flex items-end justify-between mt-1">
                  <span className="text-base font-black text-slate-700">{pendingOperationalCounts.estrutural}</span>
                  <span className="text-[8px] text-gray-400 font-bold uppercase">Abertos</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex flex-col justify-between col-span-2">
                <div className="flex justify-between items-center text-[9px] text-gray-400 font-black uppercase tracking-wider">
                  <span>Notificação / Interdição</span>
                  <span className="px-1.5 py-0.5 bg-red-100 text-red-800 rounded-full font-black text-[7px] uppercase tracking-wider leading-none">Risco Alto</span>
                </div>
                <div className="flex items-center justify-around mt-2 divide-x divide-slate-200">
                  <div className="text-center flex-1">
                    <span className="block text-base font-black text-red-600">{pendingOperationalCounts.notificacao}</span>
                    <span className="text-[8px] text-gray-400 font-bold uppercase">Notifs</span>
                  </div>
                  <div className="text-center flex-1">
                    <span className="block text-base font-black text-red-800">{pendingOperationalCounts.interdicao}</span>
                    <span className="text-[8px] text-gray-400 font-bold uppercase">Interdições</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-slate-50 text-[10px] text-gray-400 font-bold uppercase tracking-wider text-center">
            Total Pendentes: {pendingOperationalCounts.ar + pendingOperationalCounts.lvcc + pendingOperationalCounts.dial + pendingOperationalCounts.comportamental + pendingOperationalCounts.estrutural + pendingOperationalCounts.notificacao + pendingOperationalCounts.interdicao} vistorias
          </div>
        </div>

        {/* CARD 3: ÚLTIMAS INSPEÇÕES */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-2 mb-3">
              <span className="text-xs font-black text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                📝 Últimas Inspeções
              </span>
              <span className="text-[10px] bg-blue-50 text-[#0B2E59] px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                Tempo Real
              </span>
            </div>

            <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
              {last10Inspections.map((i) => {
                const timeStr = i.createdAt ? new Date(i.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "12:00";
                const supShortName = supervisors.find(s => supervisorMatchesId(s, i.supervisorId))?.nome.split(" ")[0] || dbService.getDeletedNames()[i.supervisorId]?.split(" ")[0] || "Outros";
                const typeStr = getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento);
                const contractStr = contracts.find(c => c.id === i.contratoId)?.nome || "Geral";

                return (
                  <div key={i.id} className="p-2 bg-slate-50 hover:bg-slate-100/70 border border-slate-100/80 rounded-lg transition text-[10px] flex items-center justify-between gap-2 font-bold text-slate-700">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[8px] bg-slate-200 px-1 py-0.5 rounded font-mono text-slate-600 font-black">{timeStr}</span>
                        <span className="text-[#0B2E59] font-black">{supShortName}</span>
                        <span className="text-[#F58220] font-black uppercase text-[8px]">{typeStr}</span>
                      </div>
                      <p className="text-gray-400 text-[8px] font-black uppercase tracking-wider flex items-center gap-1">
                        <MapPin size={9} className="text-gray-400 shrink-0" /> {contractStr}
                      </p>
                    </div>
                    <span className={`px-1.5 py-0.5 text-[8px] font-black rounded uppercase tracking-wider shrink-0 ${
                      i.status === InspectionStatus.CONCLUIDO ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {i.status}
                    </span>
                  </div>
                );
              })}

              {last10Inspections.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-10 italic">Nenhuma inspeção lançada.</p>
              )}
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-slate-50 text-[10px] text-gray-400 font-bold uppercase tracking-wider text-center">
            Últimos 10 lançamentos em campo
          </div>
        </div>
      </div>

      {/* 2.0 ADVANCED FLOW INDICATORS GRID */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 border-b border-gray-100 pb-2">
          <TrendingUp size={16} className="text-[#F58220]" />
          <h3 className="text-xs font-black text-[#0B2E59] uppercase tracking-wider">
            Indicadores de Fluxo e Conformidade Operacional
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 shrink-0">
          {/* Inspeções Semana */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-blue-500 p-3 flex flex-col justify-between hover:shadow-md transition-all">
            <div className="space-y-0.5">
              <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">Vistorias / Semana</p>
              <h3 className="text-lg font-black text-blue-700 leading-tight">{advancedKPIs.weekCount}</h3>
            </div>
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50 text-[9px] text-gray-500 font-semibold truncate">
              <span>Semana Atual</span>
              <Calendar size={12} className="text-blue-500" />
            </div>
          </div>

          {/* Inspeções Mês */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-slate-700 p-3 flex flex-col justify-between hover:shadow-md transition-all">
            <div className="space-y-0.5">
              <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">Vistorias / Mês</p>
              <h3 className="text-lg font-black text-slate-800 leading-tight">{advancedKPIs.monthCount}</h3>
            </div>
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50 text-[9px] text-gray-500 font-semibold truncate">
              <span>Mês de Referência</span>
              <Calendar size={12} className="text-slate-500" />
            </div>
          </div>

          {/* Pendentes */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-yellow-500 p-3 flex flex-col justify-between hover:shadow-md transition-all">
            <div className="space-y-0.5">
              <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">Total Pendentes</p>
              <h3 className="text-lg font-black text-yellow-600 leading-tight">{advancedKPIs.pendingCount}</h3>
            </div>
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50 text-[9px] text-gray-500 font-semibold truncate">
              <span>Não Concluídas</span>
              <Clock size={12} className="text-yellow-500" />
            </div>
          </div>

          {/* Concluídas */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-green-600 p-3 flex flex-col justify-between hover:shadow-md transition-all">
            <div className="space-y-0.5">
              <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">Tratadas / OK</p>
              <h3 className="text-lg font-black text-green-700 leading-tight">{advancedKPIs.completedCount}</h3>
            </div>
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50 text-[9px] text-gray-500 font-semibold truncate">
              <span>Resolvidas</span>
              <CheckCircle size={12} className="text-green-500" />
            </div>
          </div>

          {/* Em Andamento */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-orange-500 p-3 flex flex-col justify-between hover:shadow-md transition-all col-span-1">
            <div className="space-y-0.5">
              <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">Em Andamento</p>
              <h3 className="text-lg font-black text-orange-600 leading-tight">{advancedKPIs.inProgressCount}</h3>
            </div>
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50 text-[9px] text-gray-500 font-semibold truncate">
              <span>Plano Iniciado</span>
              <AlertTriangle size={12} className="text-orange-500" />
            </div>
          </div>

          {/* Prazo Vencido */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-red-600 p-3 flex flex-col justify-between hover:shadow-md transition-all col-span-1">
            <div className="space-y-0.5">
              <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">Prazo Vencido</p>
              <h3 className="text-lg font-black text-red-600 leading-tight">{advancedKPIs.overdueCount}</h3>
            </div>
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-red-50 text-[9px] text-red-500 font-black truncate">
              <span>Atrasadas</span>
              <AlertOctagon size={12} className="text-red-500 shrink-0" />
            </div>
          </div>

          {/* Críticos */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-purple-600 p-3 flex flex-col justify-between hover:shadow-md transition-all">
            <div className="space-y-0.5">
              <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">Desvios Críticos</p>
              <h3 className="text-lg font-black text-purple-700 leading-tight">{advancedKPIs.criticalCount}</h3>
            </div>
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50 text-[9px] text-purple-600 font-black truncate">
              <span>Risco Gravíssimo</span>
              <ShieldAlert size={12} className="text-purple-500 shrink-0" />
            </div>
          </div>

          {/* Destaque / Score */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-amber-500 p-3 flex flex-col justify-between hover:shadow-md transition-all">
            <div className="space-y-0.5">
              <p className="text-[9px] uppercase font-extrabold text-amber-600 tracking-wider">Destaque Mês</p>
              <h3 className="text-[9px] font-black text-amber-700 leading-tight truncate" title={advancedKPIs.topSupervisorName}>
                {advancedKPIs.topSupervisorName}
              </h3>
            </div>
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50 text-[8px] text-gray-400 font-extrabold truncate">
              <span>{advancedKPIs.highestScore} pts</span>
              <Award size={12} className="text-amber-500 shrink-0" />
            </div>
          </div>
        </div>
      </div>

      {/* CORE STAT CARDS GRID */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 border-b border-gray-100 pb-2">
          <FileCheck size={16} className="text-[#0B2E59]" />
          <h3 className="text-xs font-black text-[#0B2E59] uppercase tracking-wider">
            Totalizações de Lançamentos Acumulados
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-2.5 shrink-0">
        {/* Total Inspeções */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-[#0B2E59] p-3 flex flex-col justify-between hover:shadow-md transition-all">
          <div className="space-y-0.5">
            <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">TOTAL REGISTRADO</p>
            <h3 className="text-lg font-black text-[#0B2E59] leading-tight">{indicators.total}</h3>
          </div>
          <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50">
            <span className="text-[9px] text-gray-500 font-semibold truncate">Lançamentos</span>
            <FileCheck size={14} className="text-[#0B2E59] shrink-0" />
          </div>
        </div>

        {/* DSS */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-blue-600 p-3 flex flex-col justify-between hover:shadow-md transition-all">
          <div className="space-y-0.5">
            <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">🦺 DSS</p>
            <h3 className="text-lg font-black text-blue-700 leading-tight">{indicators.dss}</h3>
          </div>
          <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50">
            <span className="text-[9px] text-gray-500 font-semibold truncate">Diálogos de Seg.</span>
            <span className="text-[10px]">🦺</span>
          </div>
        </div>

        {/* AR */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-gray-600 p-3 flex flex-col justify-between hover:shadow-md transition-all">
          <div className="space-y-0.5">
            <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">📋 AR</p>
            <h3 className="text-lg font-black text-gray-700 leading-tight">{indicators.ar}</h3>
          </div>
          <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50">
            <span className="text-[9px] text-gray-500 font-semibold truncate">Análise de Risco</span>
            <span className="text-[10px]">📋</span>
          </div>
        </div>

        {/* LVCC */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-green-600 p-3 flex flex-col justify-between hover:shadow-md transition-all">
          <div className="space-y-0.5">
            <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">🔍 LVCC</p>
            <h3 className="text-lg font-black text-green-700 leading-tight">{indicators.lvcc}</h3>
          </div>
          <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50">
            <span className="text-[9px] text-gray-500 font-semibold truncate">Levantamentos</span>
            <span className="text-[10px]">🔍</span>
          </div>
        </div>

        {/* Presença em Campo */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-teal-600 p-3 flex flex-col justify-between hover:shadow-md transition-all">
          <div className="space-y-0.5">
            <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">🚶 PRESENÇA</p>
            <h3 className="text-lg font-black text-teal-700 leading-tight">{indicators.presenca}</h3>
          </div>
          <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50">
            <span className="text-[9px] text-gray-500 font-semibold truncate">Presença em Campo</span>
            <span className="text-[10px]">🚶</span>
          </div>
        </div>

        {/* DIAL */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-purple-600 p-3 flex flex-col justify-between hover:shadow-md transition-all">
          <div className="space-y-0.5">
            <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">👥 DIAL</p>
            <h3 className="text-lg font-black text-purple-700 leading-tight">{indicators.dial}</h3>
          </div>
          <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50">
            <span className="text-[9px] text-gray-500 font-semibold truncate">Diálogo Aberto</span>
            <span className="text-[10px]">👥</span>
          </div>
        </div>

        {/* Desvio Comportamental */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-amber-500 p-3 flex flex-col justify-between hover:shadow-md transition-all">
          <div className="space-y-0.5">
            <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">👤 COMPORTAMENTAL</p>
            <h3 className="text-lg font-black text-amber-700 leading-tight">{indicators.desviosComportamentais}</h3>
          </div>
          <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50">
            <span className="text-[9px] text-gray-500 font-semibold truncate">Comportamental</span>
            <span className="text-[10px]">👤</span>
          </div>
        </div>

        {/* Desvio Estrutural */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-orange-500 p-3 flex flex-col justify-between hover:shadow-md transition-all">
          <div className="space-y-0.5">
            <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">🏗️ ESTRUTURAL</p>
            <h3 className="text-lg font-black text-orange-600 leading-tight">{indicators.desviosEstruturais}</h3>
          </div>
          <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50">
            <span className="text-[9px] text-gray-500 font-semibold truncate">Desvios Estruturais</span>
            <span className="text-[10px]">🏗️</span>
          </div>
        </div>

        {/* Notificações */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-yellow-500 p-3 flex flex-col justify-between hover:shadow-md transition-all">
          <div className="space-y-0.5">
            <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">⚠️ NOTIFICAÇÃO</p>
            <h3 className="text-lg font-black text-yellow-600 leading-tight">{indicators.notificacoes}</h3>
          </div>
          <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50">
            <span className="text-[9px] text-gray-500 font-semibold truncate">Notificações Emitidas</span>
            <span className="text-[10px]">⚠️</span>
          </div>
        </div>

        {/* Interdições */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 border-l-4 border-l-red-500 p-3 flex flex-col justify-between hover:shadow-md transition-all">
          <div className="space-y-0.5">
            <p className="text-[9px] uppercase font-extrabold text-gray-400 tracking-wider">⛔ INTERDIÇÃO</p>
            <h3 className="text-lg font-black text-red-600 leading-tight">{indicators.interdicoes}</h3>
          </div>
          <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50">
            <span className="text-[9px] text-gray-500 font-semibold truncate">Interdições Aplicadas</span>
            <span className="text-[10px]">⛔</span>
          </div>
        </div>
      </div>
    </div>

      {/* GRAPHIC DASHBOARD BLOCK */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inspeções por Supervisor */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
          <h3 className="text-sm font-bold text-[#0B2E59] mb-4 uppercase tracking-wider flex items-center gap-1.5">
            <Users size={16} className="text-[#F58220]" /> Inspeções por Supervisor
          </h3>
          <div className="space-y-3">
            {chartSupervisors.slice(0, 6).map((item, idx) => {
              const maxVal = Math.max(...chartSupervisors.map((c) => c.count)) || 1;
              const pct = (item.count / maxVal) * 100;
              return (
                <div key={item.name} className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-gray-700 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-[10px]">
                        {idx + 1}
                      </span>
                      {item.name}
                    </span>
                    <span className="font-bold text-gray-900">{item.count}</span>
                  </div>
                  <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className="bg-gradient-to-r from-[#0B2E59] to-[#F58220] h-full rounded-full transition-all duration-500"
                    />
                  </div>
                </div>
              );
            })}
            {chartSupervisors.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-8">Nenhum dado cadastrado.</p>
            )}
          </div>
        </div>

        {/* Status das Tratativas (Circular / Ring Display) */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-[#0B2E59] mb-4 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle size={16} className="text-[#F58220]" /> Status das Tratativas
          </h3>
          <div className="flex flex-col items-center justify-center py-3">
            {/* Custom SVG Gauge Ring */}
            <div className="relative w-32 h-32 flex items-center justify-center mb-4">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle cx="50" cy="50" r="40" stroke="#f3f4f6" strokeWidth="10" fill="none" />
                {/* Active Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="#22c55e"
                  strokeWidth="10"
                  fill="none"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * chartStatus.percConcluido) / 100}
                  className="transition-all duration-1000 ease-out"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-2xl font-black text-gray-800">{chartStatus.percConcluido}%</span>
                <p className="text-[9px] text-gray-400 uppercase font-bold">Concluído</p>
              </div>
            </div>

            <div className="w-full grid grid-cols-3 gap-1.5 text-center mt-2 border-t border-gray-50 pt-4">
              <div className="p-1.5 rounded bg-red-50">
                <span className="block text-xs font-black text-red-600">{chartStatus.aberto}</span>
                <span className="text-[9px] text-red-500 font-bold uppercase">Abertos</span>
              </div>
              <div className="p-1.5 rounded bg-yellow-50">
                <span className="block text-xs font-black text-yellow-600">{chartStatus.andamento}</span>
                <span className="text-[9px] text-yellow-600 font-bold uppercase">Em And.</span>
              </div>
              <div className="p-1.5 rounded bg-green-50">
                <span className="block text-xs font-black text-green-600">{chartStatus.concluido}</span>
                <span className="text-[9px] text-green-500 font-bold uppercase">Concl.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inspeções por Área (Beautiful Horizontal Bar Card) */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-[#0B2E59] mb-4 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin size={16} className="text-[#F58220]" /> Distribuição por Área
          </h3>
          <div className="space-y-3.5">
            {chartAreas.slice(0, 5).map((item) => {
              const maxVal = Math.max(...chartAreas.map((c) => c.count)) || 1;
              const pct = (item.count / maxVal) * 100;
              return (
                <div key={item.name} className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-gray-700">{item.name}</span>
                    <span className="font-bold text-gray-900">{item.count}</span>
                  </div>
                  <div className="w-full bg-gray-50 h-2.5 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className="bg-[#0B2E59] h-full rounded-full"
                    />
                  </div>
                </div>
              );
            })}
            {chartAreas.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">Sem registros de áreas.</p>
            )}
          </div>
        </div>

        {/* Inspeções por Tipo (Segmented Donut or modern list blocks) */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col h-[280px]">
          <h3 className="text-sm font-bold text-[#0B2E59] mb-4 uppercase tracking-wider flex items-center gap-1.5">
            <Clock size={16} className="text-[#F58220]" /> EVOLUÇÃO DIÁRIA DO MÊS
          </h3>
          <div className="flex-1 min-h-0 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartEvolution}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F58220" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#F58220" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  dataKey="data" 
                  tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 600 }}
                  axisLine={{ stroke: '#E5E7EB' }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    borderRadius: '0.375rem',
                    color: '#fff',
                    fontSize: '11px',
                    border: 'none',
                    fontWeight: 600
                  }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#9CA3AF' }}
                />
                <RechartsArea 
                  type="monotone" 
                  dataKey="total" 
                  stroke="#F58220" 
                  strokeWidth={2.5}
                  fillOpacity={1} 
                  fill="url(#colorTotal)"
                  dot={{ r: 4, stroke: '#F58220', strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6, stroke: '#F58220', strokeWidth: 2, fill: '#F58220' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-gray-400 text-center border-t border-gray-50 pt-3 flex items-center justify-center gap-1 mt-2">
            <TrendingUp size={12} className="text-green-500" /> Variação quantitativa temporal de vistorias em campo
          </p>
        </div>
      </div>

      {/* PENDÊNCIAS E VENCIMENTOS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Painel de Pendências */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <div className="flex items-center justify-between border-b border-gray-50 pb-3 mb-4">
            <h3 className="text-sm font-bold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={16} className="text-[#F58220]" /> Painel de Pendências
            </h3>
            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[9px] font-black rounded-full uppercase tracking-wider">
              {pendingInspections.length} Pendentes
            </span>
          </div>

          <div className="overflow-y-auto max-h-[300px] space-y-3 pr-1 flex-1">
            {pendingInspections.map((insp) => {
              const supName = supervisors.find(s => supervisorMatchesId(s, insp.supervisorId))?.nome || dbService.getDeletedNames()[insp.supervisorId] || "Outros";
              
              // Remaining days calculation
              const deadline = new Date(insp.prazo + "T00:00:00");
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const diffTime = deadline.getTime() - today.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              const isPast = diffDays < 0;

              return (
                <div key={insp.id} className="p-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-100/80 rounded-lg transition text-xs space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-extrabold text-[#0B2E59] uppercase text-[10px]">{insp.id.toUpperCase()}</span>
                    <span className={`px-2 py-0.5 text-[8px] font-black rounded-full uppercase ${
                      insp.status === InspectionStatus.EM_ANDAMENTO ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                    }`}>
                      {insp.status}
                    </span>
                  </div>

                  <p className="text-gray-700 font-medium line-clamp-2 leading-relaxed">{insp.descricao}</p>

                  <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-100/50 text-[10px] text-gray-500 font-bold">
                    <div>
                      <span className="text-[8px] text-gray-400 block uppercase">Supervisor</span>
                      <span className="text-gray-700 truncate block">{supName}</span>
                    </div>
                    <div>
                      <span className="text-[8px] text-gray-400 block uppercase">Prazo / Restante</span>
                      <span className={`block font-black ${isPast ? "text-red-600" : "text-slate-700"}`}>
                        {insp.prazo.split("-").reverse().join("/")} ({isPast ? `${Math.abs(diffDays)}d em atraso` : `${diffDays}d restantes`})
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {pendingInspections.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-12 italic">Nenhuma pendência operacional ativa.</p>
            )}
          </div>
        </div>

        {/* Painel de Vencimentos */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <div className="flex items-center justify-between border-b border-gray-50 pb-3 mb-4">
            <h3 className="text-sm font-bold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert size={16} className="text-red-600" /> Painel de Vencimentos (Prazo Vencido)
            </h3>
            <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[9px] font-black rounded-full uppercase tracking-wider animate-pulse">
              {overdueInspections.length} Vencidos
            </span>
          </div>

          <div className="overflow-y-auto max-h-[300px] space-y-3 pr-1 flex-1">
            {overdueInspections.map((insp) => {
              const supName = supervisors.find(s => supervisorMatchesId(s, insp.supervisorId))?.nome || dbService.getDeletedNames()[insp.supervisorId] || "Outros";
              
              // Days in arrears calculation
              const deadline = new Date(insp.prazo + "T00:00:00");
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const diffTime = today.getTime() - deadline.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

              return (
                <div key={insp.id} className="p-3 bg-red-50/20 hover:bg-red-50/40 border border-red-100/50 rounded-lg transition text-xs space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-extrabold text-red-800 uppercase text-[10px]">{insp.id.toUpperCase()}</span>
                    <span className="px-2 py-0.5 text-[8px] font-black rounded bg-red-100 text-red-800 uppercase">
                      VENCIDO
                    </span>
                  </div>

                  <p className="text-gray-700 font-medium line-clamp-2 leading-relaxed">{insp.descricao}</p>

                  <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-red-100/30 text-[10px] text-gray-500 font-bold">
                    <div>
                      <span className="text-[8px] text-gray-400 block uppercase">Supervisor Responsável</span>
                      <span className="text-gray-700 truncate block">{supName}</span>
                    </div>
                    <div>
                      <span className="text-[8px] text-gray-400 block uppercase">Atraso</span>
                      <span className="text-red-700 font-black block">
                        ⚠️ Vencido há {diffDays} dias ({insp.prazo.split("-").reverse().join("/")})
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {overdueInspections.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 gap-2 h-full justify-center">
                <div className="p-3 bg-emerald-50 rounded-full text-emerald-600">
                  <CheckCircle size={24} />
                </div>
                <p className="text-xs font-black text-slate-700">Tudo em dia!</p>
                <p className="text-[10px] text-slate-400 font-semibold">Nenhum lançamento está com prazo vencido.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CALENDAR & DAILY DETAILS SECTION */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-50 pb-3">
          <div>
            <h3 className="text-sm font-bold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
              <PlusCircle size={16} className="text-[#F58220]" /> Calendário Operacional GEMBA
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Visualize as inspeções e desvios registrados por dia no calendário dinâmico.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Calendar Grid Selector */}
          <div className="lg:col-span-5 bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
            <div>
              {/* Header Month Navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={() => {
                    const prev = new Date(currentCalendarMonth);
                    prev.setMonth(prev.getMonth() - 1);
                    setCurrentCalendarMonth(prev);
                    const year = prev.getFullYear();
                    const monthStr = String(prev.getMonth() + 1).padStart(2, "0");
                    setSelectedCalendarDate(`${year}-${monthStr}-01`);
                  }}
                  className="p-1 hover:bg-gray-200 rounded text-gray-600 transition font-extrabold text-xs cursor-pointer"
                  title="Mês anterior"
                >
                  ◀
                </button>
                <span className="text-xs font-black text-[#0B2E59] uppercase tracking-widest">
                  {currentCalendarMonth.toLocaleString("pt-BR", { month: "long", year: "numeric" })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Date(currentCalendarMonth);
                    next.setMonth(next.getMonth() + 1);
                    setCurrentCalendarMonth(next);
                    const year = next.getFullYear();
                    const monthStr = String(next.getMonth() + 1).padStart(2, "0");
                    setSelectedCalendarDate(`${year}-${monthStr}-01`);
                  }}
                  className="p-1 hover:bg-gray-200 rounded text-gray-600 transition font-extrabold text-xs cursor-pointer"
                  title="Próximo mês"
                >
                  ▶
                </button>
              </div>

              {/* Weekdays Labels */}
              <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                  <span key={i} className="text-[9px] font-black text-gray-400 uppercase tracking-wider py-1">
                    {d}
                  </span>
                ))}
              </div>

              {/* Month Days Grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((dateStr, idx) => {
                  if (!dateStr) {
                    return <div key={`empty-${idx}`} className="h-9" />;
                  }

                  const dayNum = parseInt(dateStr.split("-")[2], 10);
                  const isSelected = selectedCalendarDate === dateStr;
                  const dayInspections = inspectionsByDate[dateStr] || [];
                  const hasInspections = dayInspections.length > 0;

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => setSelectedCalendarDate(dateStr)}
                      className={`h-9 flex flex-col items-center justify-between p-1 rounded-lg text-xs font-bold transition relative border cursor-pointer ${
                        isSelected
                          ? "bg-[#0B2E59] text-white border-[#0B2E59]"
                          : hasInspections
                          ? "bg-orange-50/50 hover:bg-orange-50 border-orange-200 text-gray-800"
                          : "bg-white hover:bg-gray-100 border-gray-100 text-gray-700"
                      }`}
                    >
                      <span>{dayNum}</span>
                      {hasInspections && (
                        <div className="flex gap-0.5 justify-center mt-auto">
                          {dayInspections.slice(0, 3).map((insp, i) => {
                            const conf = TIPO_LANCAMENTO_CONFIG[getTipoLancamento(insp.atividade, insp.tipo, insp.tipoLancamento)];
                            return (
                              <span
                                key={i}
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: conf?.color || "#f97316" }}
                                title={getTipoLancamento(insp.atividade, insp.tipo, insp.tipoLancamento)}
                              />
                            );
                          })}
                          {dayInspections.length > 3 && (
                            <span className="text-[7px] text-gray-400 font-extrabold leading-none">+</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap gap-2 text-[8px] font-bold uppercase text-gray-500">
              {Object.entries(TIPO_LANCAMENTO_CONFIG).map(([name, conf]) => (
                <span key={name} className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-100">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: conf.color }} />
                  {name === "Presença em Campo" ? "Presença Campo" : name}
                </span>
              ))}
            </div>
          </div>

          {/* Selected Date Deviation Details */}
          <div className="lg:col-span-7 bg-white p-4 rounded-xl border border-slate-100 flex flex-col min-h-[300px]">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-3">
              <span className="text-xs font-black text-[#0B2E59] uppercase tracking-wider">
                Lançamentos de{" "}
                {new Date(selectedCalendarDate + "T00:00:00").toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric"
                })}
              </span>
              <span className="px-2 py-0.5 bg-[#0B2E59] text-white text-[9px] font-extrabold rounded-full">
                {(inspectionsByDate[selectedCalendarDate] || []).length} Ocorrências
              </span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[350px] space-y-3 pr-1">
              {(inspectionsByDate[selectedCalendarDate] || []).map((insp) => {
                const sup = supervisors.find((s) => supervisorMatchesId(s, insp.supervisorId))?.nome || dbService.getDeletedNames()[insp.supervisorId] || "Desconhecido";
                const area = areas.find((a) => a.id === insp.areaId)?.nome || dbService.getDeletedNames()[insp.areaId] || "Desconhecido";
                const contract = contracts.find((c) => c.id === insp.contratoId) || (dbService.getDeletedNames()[insp.contratoId] ? { id: insp.contratoId, codigo: dbService.getDeletedNames()[insp.contratoId], nome: dbService.getDeletedNames()[insp.contratoId], ativo: false } : undefined);
                const typeName = getTipoLancamento(insp.atividade, insp.tipo, insp.tipoLancamento);
                const typeConf = TIPO_LANCAMENTO_CONFIG[typeName];

                return (
                  <div
                    key={insp.id}
                    className="p-3 bg-slate-50 hover:bg-slate-100/70 rounded-lg border border-slate-100/80 transition flex flex-col gap-2"
                  >
                    {/* Top Row: Type and Severity */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${
                          typeConf ? `${typeConf.bgClass} ${typeConf.textClass} border ${typeConf.borderClass}` : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        <span>{typeConf?.icon || "🔍"}</span>
                        <span>{typeName}</span>
                      </span>

                      <div className="flex gap-1.5 items-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                            insp.potencial === "CRÍTICO"
                              ? "bg-red-50 text-red-700 border border-red-100"
                              : insp.potencial === "ALTO"
                              ? "bg-orange-50 text-orange-700 border border-orange-100"
                              : insp.potencial === "MÉDIO"
                              ? "bg-yellow-50 text-yellow-700 border border-yellow-100"
                              : "bg-green-50 text-green-700 border border-green-100"
                          }`}
                        >
                          Severidade: {insp.potencial}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                            insp.status === "CONCLUÍDO"
                              ? "bg-green-100 text-green-800"
                              : insp.status === "EM ANDAMENTO"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {insp.status}
                        </span>
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[10px] text-gray-500 font-semibold bg-white p-2 rounded border border-slate-50">
                      <div>
                        <span className="block text-[8px] uppercase text-gray-400 font-black">Supervisor</span>
                        <span className="text-gray-700 font-bold">{sup}</span>
                      </div>
                      <div>
                        <span className="block text-[8px] uppercase text-gray-400 font-black">Contrato</span>
                        <span className="text-gray-700 font-bold">{contract ? `${contract.codigo} (${contract.nome})` : "N/A"}</span>
                      </div>
                      <div>
                        <span className="block text-[8px] uppercase text-gray-400 font-black">Área</span>
                        <span className="text-gray-700 font-bold">{area}</span>
                      </div>
                    </div>

                    {/* Descrição */}
                    <p className="text-xs text-gray-700 font-medium leading-relaxed mt-1">
                      {insp.descricao}
                    </p>

                    {/* Photos Preview */}
                    {((insp.fotosAntes && insp.fotosAntes.length > 0) || (insp.fotosDepois && insp.fotosDepois.length > 0)) && (
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {insp.fotosAntes && insp.fotosAntes.length > 0 && (
                          <div>
                            <span className="text-[8px] font-extrabold text-gray-400 uppercase tracking-wider block mb-1">Antes</span>
                            <div className="flex gap-1 flex-wrap">
                              {insp.fotosAntes.map((img, i) => (
                                <ResolvedImage
                                  key={i}
                                  src={img}
                                  rotation={insp.rotacoesFotosAntes ? insp.rotacoesFotosAntes[i] || 0 : 0}
                                  alt="Antes"
                                  referrerPolicy="no-referrer"
                                  className="w-12 h-12 rounded object-cover border border-gray-100 shadow-2xs hover:scale-150 transition-transform cursor-zoom-in"
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        {insp.fotosDepois && insp.fotosDepois.length > 0 && (
                          <div>
                            <span className="text-[8px] font-extrabold text-gray-400 uppercase tracking-wider block mb-1">Depois (Tratativa)</span>
                            <div className="flex gap-1 flex-wrap">
                              {insp.fotosDepois.map((img, i) => (
                                <ResolvedImage
                                  key={i}
                                  src={img}
                                  rotation={insp.rotacoesFotosDepois ? insp.rotacoesFotosDepois[i] || 0 : 0}
                                  alt="Depois"
                                  referrerPolicy="no-referrer"
                                  className="w-12 h-12 rounded object-cover border border-gray-100 shadow-2xs hover:scale-150 transition-transform cursor-zoom-in"
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {(inspectionsByDate[selectedCalendarDate] || []).length === 0 && (
                <div className="h-full flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                  <span className="text-3xl">🗓️</span>
                  <span className="text-xs font-bold">Nenhum lançamento registrado nesta data.</span>
                  <span className="text-[10px] text-gray-400 font-semibold max-w-[250px] text-center">
                    Selecione outro dia com indicação de cor no calendário ao lado.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      {/* FAROL GEMBA SECTION */}
      <div id="farol-gemba-dashboard-panel" className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between border-b border-gray-50 pb-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle size={16} className="text-[#F58220]" />
              {grupoContrato === "vale" ? "Farol GEMBA Vale" : grupoContrato === "vli" ? "Farol GEMBA VLI" : "Farol GEMBA (Vale & VLI)"}
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Painel operacional integrado por supervisor e indicadores automáticos de conformidade.
            </p>
          </div>
          <span className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-md uppercase tracking-wider">
            Farol Automático
          </span>
        </div>

        <FarolGembaView
          inspections={inspections}
          supervisors={supervisors}
          areas={areas}
          selectedSupervisorId={selectedSupervisorId}
          isDashboardFiltered={false}
          selectedMonth={activeMonth}
          onSelectMonth={handleMonthChange}
          grupoContrato={grupoContrato}
          onSelectGrupoContrato={onSelectGrupoContrato}
          permittedGruposContrato={permittedGruposContrato}
          contracts={contracts}
        />
      </div>
    </div>
  );
}
