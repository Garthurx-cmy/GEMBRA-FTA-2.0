import React, { useMemo } from "react";
import { Award, CalendarDays, CheckCircle, Clock, Radio, ShieldAlert, Trophy } from "lucide-react";
import { Inspection, InspectionStatus, Potential, Supervisor, getTipoLancamento } from "../types";
import {
  formatOperationalDate,
  getInspectionScore,
  getOperationalWeek,
  getSupervisorTargets,
  inspectionDate
} from "../utils/operational";

interface RankingViewProps {
  inspections: Inspection[];
  supervisors: Supervisor[];
}

export default function RankingView({ inspections, supervisors }: RankingViewProps) {
  const { start, end } = getOperationalWeek();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const rankingData = useMemo(() => supervisors
    .filter((supervisor) => supervisor.ativo)
    .map((supervisor) => {
      const own = inspections.filter((item) => item.supervisorId === supervisor.id);
      const week = own.filter((item) => {
        const date = inspectionDate(item);
        return date >= start && date <= end;
      });
      const month = own.filter((item) => {
        const date = inspectionDate(item);
        return date >= monthStart && date <= monthEnd;
      });
      const targets = getSupervisorTargets(supervisor);
      const weeklyPercent = targets.weekly ? Math.min(100, Math.round((week.length / targets.weekly) * 100)) : 0;
      const monthlyPercent = targets.monthly ? Math.min(100, Math.round((month.length / targets.monthly) * 100)) : 0;
      const score = week.reduce((sum, item) => sum + getInspectionScore(item), 0);
      const last = [...own].sort((a, b) => inspectionDate(b).getTime() - inspectionDate(a).getTime())[0];
      return {
        supervisor,
        week: week.length,
        month: month.length,
        targets,
        weeklyPercent,
        monthlyPercent,
        score,
        total: own.length,
        treated: own.filter((item) => item.status === InspectionStatus.CONCLUIDO).length,
        critical: own.filter((item) => item.potencial === Potential.CRITICO).length,
        last,
        lastTimestamp: last ? inspectionDate(last).getTime() : 0
      };
    })
    .sort((a, b) => b.score - a.score || b.weeklyPercent - a.weeklyPercent || b.week - a.week || b.lastTimestamp - a.lastTimestamp),
  [inspections, supervisors, start.getTime(), end.getTime(), monthStart.getTime(), monthEnd.getTime()]);

  const weekLeader = rankingData[0];
  const monthLeader = [...rankingData].sort((a, b) => b.monthlyPercent - a.monthlyPercent || b.month - a.month || b.score - a.score)[0];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#0B2E59]">Leaderboard de Conformidade Operacional</h1>
          <p className="text-xs text-gray-500 mt-1">Pontuação e metas individuais de supervisores e gestores.</p>
        </div>
        <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-2.5">
          <span className="text-[9px] uppercase tracking-widest font-black text-[#F58220]">Semana Operacional</span>
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#0B2E59]"><CalendarDays size={14} /> {formatOperationalDate(start)} até {formatOperationalDate(end)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4"><Trophy className="text-amber-500" size={20} /><span className="block text-[9px] uppercase font-black text-amber-700 mt-2">Supervisor da Semana</span><strong className="text-sm text-gray-800">{weekLeader?.supervisor.nome || "Sem dados"}</strong></div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4"><Award className="text-blue-600" size={20} /><span className="block text-[9px] uppercase font-black text-blue-700 mt-2">Supervisor do Mês</span><strong className="text-sm text-gray-800">{monthLeader?.supervisor.nome || "Sem dados"}</strong></div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4"><Radio className="text-emerald-600 animate-pulse" size={20} /><span className="block text-[9px] uppercase font-black text-emerald-700 mt-2">Sincronização</span><strong className="text-sm text-gray-800">Firestore em tempo real</strong></div>
      </div>

      <div className="space-y-3">
        {rankingData.map((row, index) => (
          <article key={row.supervisor.id} className="bg-white border border-gray-100 shadow-sm rounded-xl p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="flex items-center gap-3 lg:w-72">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${index < 3 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>#{index + 1}</div>
                <div className="min-w-0"><strong className="block text-sm text-[#0B2E59] truncate">{row.supervisor.nome}</strong><span className="text-[10px] font-bold text-gray-400 uppercase">{row.supervisor.unidade || "Operacional"}</span></div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 text-center">
                <div><span className="block text-[9px] uppercase font-bold text-gray-400">Meta Semanal</span><strong className="text-sm">{row.week} / {row.targets.weekly}</strong><span className="block text-[10px] text-[#F58220] font-black">{row.weeklyPercent}%</span></div>
                <div><span className="block text-[9px] uppercase font-bold text-gray-400">Meta Mensal</span><strong className="text-sm">{row.month} / {row.targets.monthly}</strong><span className="block text-[10px] text-blue-600 font-black">{row.monthlyPercent}%</span></div>
                <div><span className="block text-[9px] uppercase font-bold text-gray-400">Pontuação</span><strong className="text-lg text-[#F58220]">{row.score}</strong></div>
                <div><span className="block text-[9px] uppercase font-bold text-gray-400">Inspeções</span><strong className="text-lg text-[#0B2E59]">{row.total}</strong></div>
              </div>

              <div className="lg:w-56 text-[10px] text-gray-500 space-y-1">
                <span className="flex items-center gap-1"><CheckCircle size={11} className="text-green-500" /> {row.treated} concluídas</span>
                <span className="flex items-center gap-1"><ShieldAlert size={11} className="text-red-500" /> {row.critical} críticas</span>
                <span className="flex items-center gap-1"><Clock size={11} /> {row.last ? `${getTipoLancamento(row.last.atividade, row.last.tipo)} em ${row.last.data.split("-").reverse().join("/")}` : "Sem inspeções"}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="text-[10px] text-gray-400">Ordenação: maior pontuação, maior percentual da meta, maior quantidade semanal e inspeção mais recente.</p>
    </div>
  );
}
