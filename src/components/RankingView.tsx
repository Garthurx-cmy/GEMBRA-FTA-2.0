import { useOperationalDate } from "../utils/useOperationalDate";
import { inspectionBelongsToSupervisor, resolveInspectionSupervisor, supervisorMatchesId } from "../utils/supervisors";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
import {
  Award,
  CalendarDays,
  CheckCircle,
  Clock,
  Radio,
  ShieldAlert,
  Trophy,
  Users,
  AlertCircle,
  Building2,
  Sparkles
} from "lucide-react";
import {
  Inspection,
  InspectionStatus,
  Potential,
  Supervisor,
  UserProfile,
  Contract,
  Area,
  GrupoContrato,
  GrupoContratoFiltro,
  getTipoLancamento,
  isDialInspection,
  isDesvioComportamentalInspection
} from "../types";
import {
  getUniqueMonthlyInspections,
  getEffectiveMonthKey,
  getMonthOptions
} from "../utils/inspectionUtils";
import { SCORING_RULES, calculateInspectionScore } from "../utils/scoring";
import {
  inspectionDate,
  getContractGroup,
  ContractGroupFilter,
  getInspectionGrupoContrato,
  isSupervisorFromGrupoContrato
} from "../utils/operational";
import {
  getOperationalWeek,
  formatOperationalWeekLabel
} from "../utils/operationalWeek";
import { buildUnifiedSupervisors, resolveSupervisorName } from "../utils/supervisors";
import { dbService } from "../services/db";

interface RankingViewProps {
  inspections: Inspection[];
  supervisors: Supervisor[];
  contracts?: Contract[];
  areas?: Area[];
  users?: UserProfile[];
  currentUser?: UserProfile | null;
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
  grupoContrato?: GrupoContratoFiltro;
  onSelectGrupoContrato?: (grupo: GrupoContratoFiltro) => void;
  permittedGruposContrato?: GrupoContrato[];
}

export default function RankingView({
  inspections,
  supervisors,
  contracts = [],
  areas = [],
  users = [],
  currentUser,
  selectedMonth: propSelectedMonth,
  onSelectMonth,
  grupoContrato = "todos",
  onSelectGrupoContrato,
  permittedGruposContrato = ["vale", "vli"]
}: RankingViewProps) {
  const { start, end } = getOperationalWeek(new Date());

  const [localMonth, setLocalMonth] = useState<string>("auto");
  const activeMonth = propSelectedMonth !== undefined ? propSelectedMonth : localMonth;
  const operationalToday = useOperationalDate();

  // Local contract filter if onSelectGrupoContrato is not used
  const [localContractFilter, setLocalContractFilter] = useState<GrupoContratoFiltro>("todos");
  const effectiveContract = onSelectGrupoContrato ? grupoContrato : localContractFilter;

  const handleContractChange = (val: GrupoContratoFiltro) => {
    if (onSelectGrupoContrato) {
      onSelectGrupoContrato(val);
    } else {
      setLocalContractFilter(val);
    }
  };

  const handleMonthChange = (val: string) => {
    if (onSelectMonth) {
      onSelectMonth(val);
    } else {
      setLocalMonth(val);
    }
  };

  const deletedNames = dbService.getDeletedNames();

  // Lista unificada de responsáveis operacionais (supervisores ativos + usuários ativos com perfil operacional)
  const unifiedList = useMemo(() => {
    return buildUnifiedSupervisors(supervisors, users, currentUser).filter(
      (s) => s.ativo !== false
    );
  }, [supervisors, users, currentUser]);

  // Compute monthly inspections filtered by contract group
  const monthlyInspections = useMemo(() => {
    const rawMonthly = getUniqueMonthlyInspections(inspections, getEffectiveMonthKey(activeMonth, operationalToday));
    if (effectiveContract === "todos") {
      return rawMonthly;
    }
    return rawMonthly.filter((item) => {
      const group = getInspectionGrupoContrato(item, areas, contracts, unifiedList, deletedNames);
      return group === effectiveContract;
    });
  }, [inspections, operationalToday, activeMonth, effectiveContract, areas, contracts, unifiedList, deletedNames]);

  // Supervisors eligible for ranking based on selected contract group
  const filteredSupervisors = useMemo(() => {
    if (effectiveContract === "todos") {
      return unifiedList;
    }
    return unifiedList.filter((s) => {
      // Direct supervisor affinity
      if (isSupervisorFromGrupoContrato(s, effectiveContract)) return true;
      // Or supervisor has recorded inspections in this contract
      const hasInspectionsInGroup = monthlyInspections.some((i) => inspectionBelongsToSupervisor(i, s, supervisors));
      return hasInspectionsInGroup;
    });
  }, [unifiedList, effectiveContract, monthlyInspections]);

  // Cálculo das métricas para cada pessoa no Ranking
  const rankingData = useMemo(() => {
    return filteredSupervisors
      .map((supervisor) => {
        // Filtrar inspeções pertencentes ao período selecionado e ao ID/UID do responsável
        const month = monthlyInspections.filter(item => inspectionBelongsToSupervisor(item, supervisor, unifiedList, deletedNames));

        // Contagens específicas de cada tipo
        const dialCount = month.filter(isDialInspection).length;
        const desvioComportamentalCount = month.filter(isDesvioComportamentalInspection).length;
        const lvccCount = month.filter(
          (i) => getTipoLancamento(i.atividade, i.tipo, (i as any).tipoLancamento) === "LVCC"
        ).length;
        const dssCount = month.filter(
          (i) => getTipoLancamento(i.atividade, i.tipo, (i as any).tipoLancamento) === "DSS"
        ).length;
        const presencaCount = month.filter(
          (i) => getTipoLancamento(i.atividade, i.tipo, (i as any).tipoLancamento) === "Presença em Campo"
        ).length;
        const estruturalCount = month.filter(
          (i) => getTipoLancamento(i.atividade, i.tipo, (i as any).tipoLancamento) === "Desvio Estrutural"
        ).length;
        const notificacaoCount = month.filter(
          (i) => getTipoLancamento(i.atividade, i.tipo, (i as any).tipoLancamento) === "Notificação"
        ).length;
        const interdicaoCount = month.filter(
          (i) => getTipoLancamento(i.atividade, i.tipo, (i as any).tipoLancamento) === "Interdição"
        ).length;

        // Outros tipos registrados (tudo que não é DIAL nem Desvio Comportamental)
        const outrosCount = Math.max(0, month.length - dialCount - desvioComportamentalCount);

        // Lista de detalhamento dos outros tipos que possuem ao menos 1 registro
        const otherBreakdown: { label: string; count: number; colorClass: string }[] = [];
        if (lvccCount > 0) otherBreakdown.push({ label: "LVCC", count: lvccCount, colorClass: "bg-indigo-50 text-indigo-700 border-indigo-200" });
        if (dssCount > 0) otherBreakdown.push({ label: "DSS", count: dssCount, colorClass: "bg-blue-50 text-blue-700 border-blue-200" });
        if (presencaCount > 0) otherBreakdown.push({ label: "Presença", count: presencaCount, colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200" });
        if (estruturalCount > 0) otherBreakdown.push({ label: "Desvio Estrutural", count: estruturalCount, colorClass: "bg-red-50 text-red-700 border-red-200" });
        if (notificacaoCount > 0) otherBreakdown.push({ label: "Notificação", count: notificacaoCount, colorClass: "bg-amber-50 text-amber-700 border-amber-200" });
        if (interdicaoCount > 0) otherBreakdown.push({ label: "Interdição", count: interdicaoCount, colorClass: "bg-rose-50 text-rose-700 border-rose-200" });

        // Pontuação calculada através da função centralizada
        const score = calculateInspectionScore(month);

        // Identificação do cargo
        const cargo = supervisor.cargo || supervisor.perfil || supervisor.unidade || "Supervisor";

        // Última atividade realizada no mês selecionado
        const sortedMonth = [...month].sort((a, b) => inspectionDate(b).getTime() - inspectionDate(a).getTime());
        const last = sortedMonth[0];
        const lastTimestamp = month.reduce((latest, i) => {
          const timestamp = i.createdAt ? new Date(i.createdAt).getTime() : new Date(`${i.data}T00:00:00`).getTime();
          return Math.max(latest, timestamp);
        }, 0);

        return {
          supervisor,
          cargo,
          score,
          total: month.length,
          dial: dialCount,
          desvioComportamental: desvioComportamentalCount,
          outrosCount,
          otherBreakdown,
          treated: month.filter((item) => item.status === InspectionStatus.CONCLUIDO).length,
          critical: month.filter((item) => item.potencial === Potential.CRITICO).length,
          last,
          lastTimestamp,
          foraDoFarol: supervisor.participaFarolGemba === false
        };
      })
      .sort((a, b) => {
        // 1. Maior pontuação mensal
        if (b.score !== a.score) return b.score - a.score;
        // 2. Maior quantidade total de inspeções no mês
        if (b.total !== a.total) return b.total - a.total;
        // 3. Maior quantidade de DIAL + Desvio Comportamental
        const bDialDesv = b.dial + b.desvioComportamental;
        const aDialDesv = a.dial + a.desvioComportamental;
        if (bDialDesv !== aDialDesv) return bDialDesv - aDialDesv;
        // 4. Última atividade mais recente
        if (b.lastTimestamp !== a.lastTimestamp) return b.lastTimestamp - a.lastTimestamp;
        // 5. Ordem alfabética por nome
        return (a.supervisor.nome || "").localeCompare(b.supervisor.nome || "");
      });
  }, [monthlyInspections, unifiedList]);

  // Líder do Ranking Geral no Mês / Contrato selecionado
  const monthLeader = rankingData[0];

  const totalMonthlyInspectionsCount = useMemo(() => {
    return monthlyInspections.length;
  }, [monthlyInspections]);

  const activePerformersCount = useMemo(() => {
    return rankingData.filter((r) => r.total > 0).length;
  }, [rankingData]);

  return (
    <div className="space-y-5 animate-fade-in" id="ranking-view-container">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#0B2E59]">Ranking Geral de Desempenho Operacional</h1>
          <p className="text-xs text-gray-500 mt-1">
            Acompanhamento de pontuação e destaques mensais por grupo de contrato com sincronização em tempo real.
          </p>
        </div>
        <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-2.5">
          <span className="text-[9px] uppercase tracking-widest font-black text-[#F58220]">
            Semana Operacional Atual
          </span>
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#0B2E59]">
            <CalendarDays size={14} /> {formatOperationalWeekLabel({ start, end })}
          </div>
        </div>
      </div>

      {/* Barra de Filtro Duplo: Mês & Contrato */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 shadow-2xs">
        {/* Controles de Filtros */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Seletor de Mês */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-600 uppercase">Mês:</span>
            <select
              id="ranking-month-select"
              value={activeMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="text-xs font-extrabold text-[#0B2E59] bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#F58220] cursor-pointer shadow-2xs"
            >
              {getMonthOptions(inspections).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro de Contrato: Todos / Vale / VLI */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1">
              <Building2 size={13} className="text-gray-400" /> Contrato:
            </span>
            <div className="inline-flex rounded-lg p-0.5 bg-slate-200/80 border border-slate-300/70" role="group">
              {permittedGruposContrato.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleContractChange("todos")}
                  className={`px-3 py-1 text-xs font-extrabold rounded-md transition-all cursor-pointer ${
                    effectiveContract === "todos"
                      ? "bg-[#0B2E59] text-white shadow-xs"
                      : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  Todos
                </button>
              )}
              {permittedGruposContrato.includes("vale") && (
                <button
                  type="button"
                  onClick={() => handleContractChange("vale")}
                  className={`px-3 py-1 text-xs font-extrabold rounded-md transition-all cursor-pointer ${
                    effectiveContract === "vale"
                      ? "bg-emerald-700 text-white shadow-xs"
                      : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  Vale
                </button>
              )}
              {permittedGruposContrato.includes("vli") && (
                <button
                  type="button"
                  onClick={() => handleContractChange("vli")}
                  className={`px-3 py-1 text-xs font-extrabold rounded-md transition-all cursor-pointer ${
                    effectiveContract === "vli"
                      ? "bg-[#F58220] text-white shadow-xs"
                      : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  VLI
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Resumo Rápido */}
        <div className="flex items-center gap-3 text-[11px] font-semibold text-gray-500">
          <span className="flex items-center gap-1">
            <Users size={13} className="text-gray-400" /> {rankingData.length} cadastrados
          </span>
          <span className="text-gray-300">•</span>
          <span className="text-emerald-700 font-bold">
            {activePerformersCount} com vistorias
          </span>
          <span className="text-gray-300">•</span>
          <span className="text-slate-700 font-bold uppercase">
            {totalMonthlyInspectionsCount} vistorias ({effectiveContract})
          </span>
        </div>
      </div>

      {/* Quadro de Legenda e Regras de Pontuação */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center gap-1.5 mb-2">
          <Award size={14} className="text-[#F58220]" />
          <span className="text-[10px] font-black uppercase tracking-wider text-[#0B2E59]">
            Como Funciona a Pontuação
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
          {SCORING_RULES.map((rule, idx) => (
            <React.Fragment key={rule.key}>
              <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200/70 rounded-md px-2 py-0.5">
                <span className="font-semibold text-gray-700">{rule.label}:</span>
                <span className="font-extrabold text-[#F58220]">
                  {rule.points} {rule.points === 1 ? "pt" : "pts"}
                </span>
              </span>
              {idx < SCORING_RULES.length - 1 && (
                <span className="text-gray-300 hidden sm:inline px-0.5">|</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Cards de Destaque Superior */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Líder / Destaque do Mês */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 flex items-start gap-4 shadow-2xs">
          <div className="bg-blue-100 text-blue-600 rounded-xl p-3 flex items-center justify-center shadow-xs">
            <Trophy size={24} className="text-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="block text-[9px] uppercase font-black text-blue-700 tracking-wider">
                Destaque do Mês ({getEffectiveMonthKey(activeMonth)})
              </span>
              {effectiveContract !== "todos" && (
                <span className="px-1.5 py-0.2 text-[8px] font-black bg-blue-200 text-blue-900 rounded uppercase">
                  {effectiveContract}
                </span>
              )}
            </div>
            <strong className="text-base text-gray-800 block mt-0.5 truncate">
              {monthLeader?.supervisor.nome || "Sem dados"}
            </strong>
            {monthLeader && monthLeader.total > 0 ? (
              <div className="space-y-0.5 mt-1">
                <span className="block text-[11px] text-blue-700 font-extrabold">
                  🏆 #{1} Lugar • {monthLeader.score} pts • {monthLeader.total} inspeções
                </span>
                <span className="block text-[10px] text-gray-500 font-medium">
                  {monthLeader.dial} DIAL • {monthLeader.desvioComportamental} Desv. Comportamental • {monthLeader.outrosCount} outros tipos
                </span>
              </div>
            ) : (
              <span className="block text-[11px] text-gray-400 mt-1">Nenhum lançamento no período para o filtro selecionado</span>
            )}
          </div>
        </div>

        {/* Status da Sincronização em Tempo Real */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-start gap-4 shadow-2xs">
          <div className="bg-emerald-100 text-emerald-600 rounded-xl p-3 flex items-center justify-center">
            <Radio className="animate-pulse" size={24} />
          </div>
          <div>
            <span className="block text-[9px] uppercase font-black text-emerald-700">Sincronização em Tempo Real</span>
            <strong className="text-base text-gray-800 block mt-0.5">Firestore Conectado</strong>
            <span className="block text-[11px] text-emerald-600 font-bold mt-1">
              Recálculo instantâneo por mês e grupo de contrato ({effectiveContract})
            </span>
          </div>
        </div>
      </div>

      {/* Lista do Leaderboard */}
      <div className="space-y-3" id="ranking-list">
        {rankingData.map((row, index) => {
          const isTop3 = index < 3 && row.score > 0;
          let rankBadgeBg = "bg-slate-100 text-slate-500 border border-slate-200";
          if (index === 0 && row.score > 0) {
            rankBadgeBg = "bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs";
          } else if (index === 1 && row.score > 0) {
            rankBadgeBg = "bg-slate-200 text-slate-700 border border-slate-300";
          } else if (index === 2 && row.score > 0) {
            rankBadgeBg = "bg-amber-50 text-amber-700 border border-amber-200";
          }

          return (
            <article
              key={row.supervisor.id}
              id={`ranking-card-${row.supervisor.id}`}
              className={`bg-white border rounded-xl p-4 transition-shadow hover:shadow-md ${
                isTop3 ? "border-amber-200/80 shadow-xs" : "border-gray-100 shadow-xs"
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Posição, Nome, Cargo e Indicador */}
                <div className="flex items-center gap-3 lg:w-72 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${rankBadgeBg}`}
                  >
                    #{index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <strong className="text-sm text-[#0B2E59] truncate block" title={row.supervisor.nome}>
                        {row.supervisor.nome}
                      </strong>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className="text-[10px] font-bold text-gray-500 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider">
                        {row.cargo}
                      </span>
                      {row.foraDoFarol && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200"
                          title="Este responsável não participa das metas do Farol GEMBA"
                        >
                          <AlertCircle size={10} /> Fora do Farol GEMBA
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Grid de Métricas Principais: Pontuação, Total, DIAL, Desvio Comportamental, Outros */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 flex-1 text-center bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                  {/* Pontuação */}
                  <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-2xs">
                    <span className="block text-[9px] uppercase font-black text-gray-400">Pontuação</span>
                    <strong className="text-lg font-black text-[#F58220]">{row.score}</strong>
                    <span className="block text-[9px] text-gray-400 font-bold">pts</span>
                  </div>

                  {/* Total de Inspeções */}
                  <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-2xs">
                    <span className="block text-[9px] uppercase font-black text-gray-400">Total Vistorias</span>
                    <strong className="text-lg font-black text-[#0B2E59]">{row.total}</strong>
                    <span className="block text-[9px] text-gray-400 font-bold">no mês</span>
                  </div>

                  {/* DIAL */}
                  <div className="bg-white p-2 rounded-lg border border-purple-100 shadow-2xs">
                    <span className="block text-[9px] uppercase font-black text-purple-700">DIAL</span>
                    <strong className="text-lg font-black text-purple-900">{row.dial}</strong>
                    <span className="block text-[9px] text-purple-500 font-bold">2 pts cada</span>
                  </div>

                  {/* Desvio Comportamental */}
                  <div className="bg-white p-2 rounded-lg border border-amber-100 shadow-2xs">
                    <span className="block text-[9px] uppercase font-black text-amber-700">Desv. Comport.</span>
                    <strong className="text-lg font-black text-amber-900">{row.desvioComportamental}</strong>
                    <span className="block text-[9px] text-amber-600 font-bold">2 pts cada</span>
                  </div>

                  {/* Outros Tipos */}
                  <div className="col-span-2 sm:col-span-1 bg-white p-2 rounded-lg border border-slate-100 shadow-2xs flex flex-col justify-center">
                    <span className="block text-[9px] uppercase font-black text-gray-400">Outros Tipos</span>
                    <strong className="text-lg font-black text-gray-700">{row.outrosCount}</strong>
                    <span className="block text-[9px] text-gray-400 font-bold">registrados</span>
                  </div>
                </div>

                {/* Detalhamento de Outros Tipos & Última Atividade */}
                <div className="lg:w-64 text-[10px] text-gray-500 space-y-1.5 border-t lg:border-t-0 pt-2 lg:pt-0 border-slate-100">
                  {/* Chips dos outros tipos se houver */}
                  {row.otherBreakdown.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {row.otherBreakdown.map((b) => (
                        <span
                          key={b.label}
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-bold ${b.colorClass}`}
                        >
                          {b.count}x {b.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[10px] text-gray-400 block">Nenhum outro tipo registrado</span>
                  )}

                  <div className="pt-1 border-t border-slate-100 space-y-0.5">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Clock size={11} className="text-gray-400 shrink-0" />
                      <span className="truncate">
                        {row.last
                          ? `${getTipoLancamento(row.last.atividade, row.last.tipo, (row.last as any).tipoLancamento)} em ${row.last.data.split("-").reverse().join("/")}`
                          : "Sem vistorias no mês"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-gray-400">
                      <span className="flex items-center gap-0.5 text-green-600 font-semibold">
                        <CheckCircle size={10} /> {row.treated} concluídas
                      </span>
                      {row.critical > 0 && (
                        <span className="flex items-center gap-0.5 text-red-600 font-semibold">
                          <ShieldAlert size={10} /> {row.critical} críticas
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        {rankingData.length === 0 && (
          <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-gray-400">
            Nenhum responsável operacional encontrado para o período selecionado.
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-400">
        Critérios de ordenação: 1º Maior pontuação total no mês; 2º Maior total de inspeções registradas; 3º Maior quantidade de DIAL e Desvio Comportamental; 4º Inspeção mais recente. O indicador "Fora do Farol GEMBA" é exclusivamente informativo e não afeta a contagem de pontos no ranking geral.
      </p>
    </div>
  );
}
