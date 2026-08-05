import React, { useMemo, useState } from "react";
import { Award, CalendarDays, CheckCircle, Clock, Radio, ShieldAlert, Trophy } from "lucide-react";
import { Inspection, InspectionStatus, Potential, Supervisor, getTipoLancamento } from "../types";
import { getUniqueMonthlyInspections, getEffectiveMonthKey, getMonthOptions } from "../utils/inspectionUtils";
import { SCORING_RULES, calculateInspectionScore, getSupervisorMetaMensal } from "../utils/scoring";
import {
  isFarolVli,
  inspectionDate
} from "../utils/operational";
import {
  getOperationalWeek,
  formatOperationalWeekLabel
} from "../utils/operationalWeek";

interface RankingViewProps {
  inspections: Inspection[];
  supervisors: Supervisor[];
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
}

export default function RankingView({
  inspections,
  supervisors,
  selectedMonth: propSelectedMonth,
  onSelectMonth
}: RankingViewProps) {
  const { start, end } = getOperationalWeek(new Date());

  const [localMonth, setLocalMonth] = useState<string>("auto");
  const activeMonth = propSelectedMonth !== undefined ? propSelectedMonth : localMonth;

  const handleMonthChange = (val: string) => {
    if (onSelectMonth) {
      onSelectMonth(val);
    } else {
      setLocalMonth(val);
    }
  };

  // Compute exclusively monthly ranking data
  const monthlyInspections = useMemo(() => {
    return getUniqueMonthlyInspections(inspections, activeMonth);
  }, [inspections, activeMonth]);

  const rankingData = useMemo(() => supervisors
    .filter((supervisor) => supervisor.ativo !== false && isFarolVli(supervisor))
    .map((supervisor) => {
      // Filter inspections belonging exclusively to the selected month and supervisor
      const month = monthlyInspections.filter((item) => item.supervisorId === supervisor.id);

      const metaMensal = getSupervisorMetaMensal(supervisor);
      const targets = {
        weekly: supervisor.metaSemanal ?? (supervisor.unidade === "VLI" ? 7 : Math.round(metaMensal / 4)),
        monthly: metaMensal
      };
      
      // Percentage calculated by: quantity monthly / meta monthly * 100
      const monthlyPercent = metaMensal > 0 ? (month.length / metaMensal) * 100 : 0;
      
      // Calculate score of the month's inspections using central function
      const score = calculateInspectionScore(month);
      
      // Get the most recent inspection of this selected month
      const last = [...month].sort((a, b) => inspectionDate(b).getTime() - inspectionDate(a).getTime())[0];
      const lastTimestamp = month.reduce((latest, i) => {
        const timestamp = i.createdAt ? new Date(i.createdAt).getTime() : new Date(`${i.data}T00:00:00`).getTime();
        return Math.max(latest, timestamp);
      }, 0);

      return {
        supervisor,
        month: month.length,
        targets,
        monthlyPercent: Math.round(monthlyPercent),
        rawPercent: monthlyPercent,
        score,
        total: month.length,
        treated: month.filter((item) => item.status === InspectionStatus.CONCLUIDO).length,
        critical: month.filter((item) => item.potencial === Potential.CRITICO).length,
        last,
        lastTimestamp
      };
    })
    .sort((a, b) => {
      // 1. Maior pontuação mensal
      if (b.score !== a.score) return b.score - a.score;
      // 2. Maior percentual da meta mensal
      if (b.rawPercent !== a.rawPercent) return b.rawPercent - a.rawPercent;
      // 3. Maior quantidade de inspeções no mês
      if (b.total !== a.total) return b.total - a.total;
      // 4. Data da última inspeção mais recente
      return b.lastTimestamp - a.lastTimestamp;
    }),
  [monthlyInspections, supervisors]);

  // Leader of the month is the first place in our sorted list
  const monthLeader = rankingData[0];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#0B2E59]">Leaderboard de Conformidade Operacional</h1>
          <p className="text-xs text-gray-500 mt-1">Pontuação e metas individuais de supervisores e gestores baseadas no desempenho mensal.</p>
        </div>
        <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-2.5">
          <span className="text-[9px] uppercase tracking-widest font-black text-[#F58220]">Semana Operacional Atual</span>
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#0B2E59]">
            <CalendarDays size={14} /> {formatOperationalWeekLabel({ start, end })}
          </div>
        </div>
      </div>

      {/* Filter Selector Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 uppercase">Filtrar por Mês:</span>
          <select
            value={activeMonth}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="text-xs font-extrabold text-[#0B2E59] bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#F58220] cursor-pointer"
          >
            {getMonthOptions(inspections).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="text-[10px] font-semibold text-gray-400">
          Mostrando {rankingData.length} participantes ativos
        </div>
      </div>

      {/* Quadro de Legenda de Pontuação */}
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
                <span className="font-extrabold text-[#F58220]">{rule.points} {rule.points === 1 ? 'pt' : 'pts'}</span>
              </span>
              {idx < SCORING_RULES.length - 1 && (
                <span className="text-gray-300 hidden sm:inline px-0.5">|</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* High-level Premium Cards - Structured in a 2-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Supervisor do Mês */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-4">
          <div className="bg-blue-100 text-blue-600 rounded-xl p-3 flex items-center justify-center">
            <Award size={24} />
          </div>
          <div>
            <span className="block text-[9px] uppercase font-black text-blue-700">
              Supervisor do Mês ({getEffectiveMonthKey(activeMonth)})
            </span>
            <strong className="text-base text-gray-800 block mt-0.5">
              {monthLeader?.supervisor.nome || "Sem dados"}
            </strong>
            {monthLeader && monthLeader.total > 0 && (
              <span className="block text-[11px] text-blue-600 font-bold mt-1">
                🏆 {monthLeader.score} pts • {monthLeader.monthlyPercent}% da meta ({monthLeader.total} vistorias)
              </span>
            )}
          </div>
        </div>

        {/* Sincronização */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-start gap-4">
          <div className="bg-emerald-100 text-emerald-600 rounded-xl p-3 flex items-center justify-center">
            <Radio className="animate-pulse" size={24} />
          </div>
          <div>
            <span className="block text-[9px] uppercase font-black text-emerald-700">Sincronização</span>
            <strong className="text-base text-gray-800 block mt-0.5">Firestore em tempo real</strong>
            <span className="block text-[11px] text-emerald-600 font-bold mt-1">
              Banco de dados ativo • Conexão segura
            </span>
          </div>
        </div>
      </div>

      {/* Leaderboard List */}
      <div className="space-y-3">
        {rankingData.map((row, index) => (
          <article key={row.supervisor.id} className="bg-white border border-gray-100 shadow-sm rounded-xl p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              {/* Position and Supervisor details */}
              <div className="flex items-center gap-3 lg:w-72">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${index < 3 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                  #{index + 1}
                </div>
                <div className="min-w-0">
                  <strong className="block text-sm text-[#0B2E59] truncate">{row.supervisor.nome}</strong>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">{row.supervisor.unidade || "Operacional"}</span>
                </div>
              </div>

              {/* Monthly stats columns: Meta Mensal, Pontuação, Inspeções */}
              <div className="grid grid-cols-3 gap-3 flex-1 text-center">
                <div>
                  <span className="block text-[9px] uppercase font-bold text-gray-400">Meta Mensal</span>
                  <strong className="text-sm text-gray-700">{row.month} / {row.targets.monthly}</strong>
                  <span className="block text-[10px] text-blue-600 font-black">{row.monthlyPercent}%</span>
                </div>
                <div>
                  <span className="block text-[9px] uppercase font-bold text-gray-400">Pontuação</span>
                  <strong className="text-lg text-[#F58220]">{row.score}</strong>
                </div>
                <div>
                  <span className="block text-[9px] uppercase font-bold text-gray-400">Inspeções</span>
                  <strong className="text-lg text-[#0B2E59]">{row.total}</strong>
                </div>
              </div>

              {/* Checklist & Last inspection summary */}
              <div className="lg:w-56 text-[10px] text-gray-500 space-y-1">
                <span className="flex items-center gap-1"><CheckCircle size={11} className="text-green-500" /> {row.treated} concluídas</span>
                <span className="flex items-center gap-1"><ShieldAlert size={11} className="text-red-500" /> {row.critical} críticas</span>
                <span className="flex items-center gap-1"><Clock size={11} /> {row.last ? `${getTipoLancamento(row.last.atividade, row.last.tipo)} em ${row.last.data.split("-").reverse().join("/")}` : "Sem inspeções"}</span>
              </div>
            </div>
          </article>
        ))}
      </div>

      <p className="text-[10px] text-gray-400">
        Ordenação: maior pontuação mensal, maior percentual da meta mensal, maior quantidade de inspeções no mês e última inspeção mais recente.
      </p>
    </div>
  );
}
