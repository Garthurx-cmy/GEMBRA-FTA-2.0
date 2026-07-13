import React, { useMemo } from "react";
import { CalendarDays, Radio, Trophy } from "lucide-react";
import { Area, Inspection, Supervisor } from "../types";
import {
  formatOperationalDate,
  getInspectionScore,
  getOperationalWeek,
  getSupervisorTargets,
  inspectionDate,
  isFarolVli
} from "../utils/operational";

interface FarolGembaViewProps {
  inspections: Inspection[];
  supervisors: Supervisor[];
  areas: Area[];
}

export default function FarolGembaView({ inspections, supervisors }: FarolGembaViewProps) {
  const { start, end } = getOperationalWeek();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const rows = useMemo(() => supervisors
    .filter((supervisor) => supervisor.ativo && isFarolVli(supervisor))
    .map((supervisor) => {
      const own = inspections.filter((item) => item.supervisorId === supervisor.id);
      const weekly = own.filter((item) => {
        const date = inspectionDate(item);
        return date >= start && date <= end;
      });
      const monthly = own.filter((item) => {
        const date = inspectionDate(item);
        return date >= monthStart && date <= monthEnd;
      });
      const targets = getSupervisorTargets(supervisor);
      const score = weekly.reduce((sum, item) => sum + getInspectionScore(item), 0);
      const lastTimestamp = own.reduce((latest, item) => Math.max(latest, inspectionDate(item).getTime()), 0);
      const percent = targets.weekly > 0 ? Math.min(100, Math.round((weekly.length / targets.weekly) * 100)) : 0;
      return { supervisor, weekly: weekly.length, monthly: monthly.length, targets, score, percent, lastTimestamp };
    })
    .sort((a, b) => b.score - a.score || b.weekly - a.weekly || b.lastTimestamp - a.lastTimestamp),
  [inspections, supervisors, start.getTime(), end.getTime(), monthStart.getTime(), monthEnd.getTime()]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-[#F58220]">Semana Operacional</span>
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#0B2E59] mt-0.5">
            <CalendarDays size={16} /> {formatOperationalDate(start)} até {formatOperationalDate(end)}
          </div>
        </div>
        <span className="flex items-center gap-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5">
          <Radio size={12} className="animate-pulse" /> Atualização em tempo real pelo Firestore
        </span>
      </div>

      <div className="w-full overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
        <table className="w-full min-w-[850px] text-left border-collapse bg-white">
          <thead>
            <tr className="bg-[#0B2E59] text-white text-[10px] font-extrabold uppercase tracking-wider">
              <th className="py-3.5 px-4">Supervisor/ Gestor</th>
              <th className="py-3.5 px-3 text-center">Meta Semanal</th>
              <th className="py-3.5 px-3 text-center">Meta Mensal</th>
              <th className="py-3.5 px-3 text-center">Percentual</th>
              <th className="py-3.5 px-3 text-center">Pontuação</th>
              <th className="py-3.5 px-4">Progresso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-xs">
            {rows.map((row, index) => (
              <tr key={row.supervisor.id} className="hover:bg-slate-50 transition-colors">
                <td className="py-3.5 px-4 font-extrabold text-[#0B2E59]">
                  <span className="inline-flex items-center gap-2">
                    {index === 0 && <Trophy size={14} className="text-amber-500" />}
                    {row.supervisor.nome}
                  </span>
                </td>
                <td className="py-3.5 px-3 text-center font-black">{row.weekly} / {row.targets.weekly}</td>
                <td className="py-3.5 px-3 text-center font-black">{row.monthly} / {row.targets.monthly}</td>
                <td className="py-3.5 px-3 text-center font-black text-[#F58220]">{row.percent}%</td>
                <td className="py-3.5 px-3 text-center font-black text-[#0B2E59]">{row.score}</td>
                <td className="py-3.5 px-4">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#0B2E59] to-[#F58220] transition-all" style={{ width: `${row.percent}%` }} />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">Os cinco supervisores VLI do Farol ainda não estão disponíveis.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400">Ordenação automática: maior pontuação, maior quantidade de inspeções e inspeção mais recente.</p>
    </section>
  );
}
