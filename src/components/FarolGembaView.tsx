import React, { useState, useMemo } from "react";
import { CalendarDays, Radio, Trophy, Filter, HelpCircle } from "lucide-react";
import { Area, Inspection, Supervisor, isDialInspection, isDesvioComportamentalInspection } from "../types";
import { getUniqueMonthlyInspections, getEffectiveMonthKey, getMonthOptions } from "../utils/inspectionUtils";
import { calculateInspectionScore, getSupervisorMetaMensal } from "../utils/scoring";
import {
  isFarolVli,
  normalizeName,
  FAROL_VLI_NAMES
} from "../utils/operational";
import { getTipoLancamento } from "../types";

const normalizarTipo = (valor = '') =>
  String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const isPresencaEmCampo = (inspecao: Inspection) => {
  const insp = inspecao as any;
  const tipo = normalizarTipo(
    insp.tipoLancamento ??
    insp.tipo ??
    insp.atividade ??
    insp.categoria ??
    ''
  );

  return tipo === 'presenca em campo';
};

interface FarolGembaViewProps {
  inspections: Inspection[];
  supervisors: Supervisor[];
  areas: Area[];
  selectedSupervisorId?: string;
  isDashboardFiltered?: boolean;
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
}

export default function FarolGembaView({
  inspections,
  supervisors,
  selectedSupervisorId = "all",
  isDashboardFiltered = false,
  selectedMonth: propSelectedMonth,
  onSelectMonth
}: FarolGembaViewProps) {
  const [localMonth, setLocalMonth] = useState<string>("auto");
  const activeMonth = propSelectedMonth !== undefined ? propSelectedMonth : localMonth;
  const effectiveMonth = getEffectiveMonthKey(activeMonth);

  const handleMonthChange = (val: string) => {
    if (onSelectMonth) {
      onSelectMonth(val);
    } else {
      setLocalMonth(val);
    }
  };

  const getMonthLabel = (yearMonth: string) => {
    if (!yearMonth) return "";
    const eff = getEffectiveMonthKey(yearMonth);
    const [year, month] = eff.split("-");
    const monthNames = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    const monthIndex = parseInt(month, 10) - 1;
    return `${monthNames[monthIndex] || month} de ${year}`;
  };

  const getSupervisorRole = (sup: Supervisor) => {
    const isVli = isFarolVli(sup) || sup.unidade === "VLI" || (sup.nome && (
      sup.nome.toLowerCase().includes("vli") ||
      FAROL_VLI_NAMES.some(n => normalizeName(sup.nome) === normalizeName(n))
    ));
    
    const isGestor = sup.tipoMeta === "gestor" || (sup.nome && (
      sup.nome.toLowerCase().includes("gestor") ||
      sup.nome.toLowerCase().includes("gerente")
    ));

    if (isGestor) return "Gestor";
    if (isVli) return "Supervisor VLI";
    return "Supervisor Vale";
  };

  const isJhonata = (sup?: Supervisor) => {
    if (!sup) return false;
    const email = String(sup.email || "").trim().toLowerCase();
    const nome = String(sup.nome || "").toLowerCase();
    const id = String(sup.id || "").toLowerCase();
    return (
      email === "j.santos@grupofta.com.br" ||
      email === "jhonata.santos@grupofta.com.br" ||
      email.startsWith("jhonata") ||
      id.includes("j_santos") ||
      id.includes("jhonata") ||
      (nome.includes("jhonata") && (nome.includes("santos") || nome.includes("gonçalves") || nome.includes("goncalves")))
    );
  };

  const getMetaMensal = (sup: Supervisor) => {
    if (isJhonata(sup)) return 8;
    if (sup.metaMensal !== undefined) return sup.metaMensal;
    const role = getSupervisorRole(sup);
    if (role === "Supervisor VLI") return 28;
    return 16; // Supervisor Vale & Gestor
  };

  const rows = useMemo(() => {
    const monthInspections = getUniqueMonthlyInspections(inspections, activeMonth);

    const activeSupervisors = supervisors.filter((sup) => sup.ativo !== false && isFarolVli(sup));
    const displayedSupervisors = selectedSupervisorId && selectedSupervisorId !== "all"
      ? activeSupervisors.filter((s) => s.id === selectedSupervisorId)
      : activeSupervisors;

    return displayedSupervisors
      .map((sup) => {
        // Find inspections owned by this supervisor
        const ownInsps = monthInspections.filter((i) => i.supervisorId === sup.id);

        // Individual type counts
        const lvcc = ownInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo) === "LVCC").length;
        const dial = ownInsps.filter(isDialInspection).length;
        const dss = ownInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo) === "DSS").length;
        const estrutural = ownInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo) === "Desvio Estrutural").length;
        const directPresenca = ownInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo) === "Presença em Campo").length;
        const comportamental = ownInsps.filter(isDesvioComportamentalInspection).length;
        const notificacao = ownInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo) === "Notificação").length;
        const interdicao = ownInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo) === "Interdição").length;

        // Presenca em campo column only counts actual "Presença em Campo" inspections
        const presencaEmCampo = ownInsps.filter(isPresencaEmCampo).length;

        // Total registered inspections
        const totalInspecoes = ownInsps.length;

        // Meta Mensal
        const metaMensal = getSupervisorMetaMensal(sup);

        // Percentual calculation
        const percentual = metaMensal > 0 ? (totalInspecoes / metaMensal) * 100 : 0;

        // Pontuacao calculation using central function
        const pontuacao = calculateInspectionScore(ownInsps);

        // Last timestamp for sorting tie-breaker
        const lastTimestamp = ownInsps.reduce((latest, i) => {
          const timestamp = i.createdAt ? new Date(i.createdAt).getTime() : new Date(`${i.data}T00:00:00`).getTime();
          return Math.max(latest, timestamp);
        }, 0);

        return {
          supervisor: sup,
          role: getSupervisorRole(sup),
          metaMensal,
          lvcc,
          dial,
          dss,
          presencaEmCampo,
          estrutural,
          comportamental,
          notificacao,
          interdicao,
          totalInspecoes,
          percentual,
          pontuacao,
          lastTimestamp
        };
      })
      .sort((a, b) => {
        // Sorting criteria:
        // 1. Higher pontuacao
        // 2. Higher percentual
        // 3. Higher total inspections
        // 4. Most recent inspection
        if (b.pontuacao !== a.pontuacao) return b.pontuacao - a.pontuacao;
        if (b.percentual !== a.percentual) return b.percentual - a.percentual;
        if (b.totalInspecoes !== a.totalInspecoes) return b.totalInspecoes - a.totalInspecoes;
        return b.lastTimestamp - a.lastTimestamp;
      });
  }, [inspections, supervisors, activeMonth, selectedSupervisorId]);

  return (
    <section className="space-y-4">
      {/* Filters & Information Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#F58220]">Mês de Análise</span>
            <div className="flex items-center gap-2 text-sm font-extrabold text-[#0B2E59] mt-0.5">
              <CalendarDays size={16} /> {getMonthLabel(activeMonth)}
            </div>
          </div>
          <div className="sm:ml-4">
            <select
              value={activeMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] font-bold cursor-pointer"
            >
              {getMonthOptions(inspections).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-1.5">
          <span className="flex items-center gap-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5">
            <Radio size={12} className="animate-pulse" /> Sincronização em tempo real (Firestore)
          </span>
          {isDashboardFiltered && (
            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[#F58220] bg-orange-50 border border-orange-100 rounded-md px-2 py-1">
              <Filter size={10} /> Resultado considerando os filtros aplicados
            </span>
          )}
        </div>
      </div>

      {/* Main Farol Table */}
      <div className="w-full overflow-x-auto rounded-xl border border-gray-100 shadow-sm bg-white">
        <table className="w-full min-w-[950px] text-left border-collapse bg-white">
          <thead>
            <tr className="bg-[#0B2E59] text-white text-[10px] font-extrabold uppercase tracking-wider">
              <th className="py-3.5 px-4">Supervisor/Gestor</th>
              <th className="py-3.5 px-3 text-center">Meta Mensal</th>
              <th className="py-3.5 px-3 text-center">LVCC</th>
              <th className="py-3.5 px-3 text-center">DIAL</th>
              <th className="py-3.5 px-3 text-center">DSS</th>
              <th className="py-3.5 px-3 text-center">Presença em Campo</th>
              <th className="py-3.5 px-3 text-center">Desvio Estrutural</th>
              <th className="py-3.5 px-3 text-center">Desvio Comportamental</th>
              <th className="py-3.5 px-3 text-center">Notificação</th>
              <th className="py-3.5 px-3 text-center">Interdição</th>
              <th className="py-3.5 px-3 text-center bg-blue-950">Total de Inspeções</th>
              <th className="py-3.5 px-3 text-center">Percentual</th>
              <th className="py-3.5 px-4 text-center">Pontuação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-xs">
            {rows.map((row, index) => {
              const hasMetGoal = row.totalInspecoes >= row.metaMensal;
              return (
                <tr key={row.supervisor.id} className="hover:bg-slate-50 transition-colors">
                  {/* Supervisor Name & Role Badge */}
                  <td className="py-3.5 px-4 font-extrabold text-[#0B2E59]">
                    <div className="flex items-center gap-2">
                      {index === 0 && row.totalInspecoes > 0 && (
                        <Trophy size={14} className="text-amber-500 shrink-0" />
                      )}
                      <div className="flex flex-col">
                        <span>{row.supervisor.nome}</span>
                        <span className={`text-[8px] font-black uppercase tracking-wider w-max mt-0.5 px-1 py-0.5 rounded ${
                          row.role === "Supervisor VLI"
                            ? "bg-orange-50 text-[#F58220] border border-orange-100"
                            : row.role === "Gestor"
                            ? "bg-blue-50 text-[#0B2E59] border border-blue-100"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        }`}>
                          {row.role}
                        </span>
                      </div>
                    </div>
                  </td>
                  
                  {/* Meta Mensal */}
                  <td className="py-3.5 px-3 text-center font-black text-slate-500">{row.metaMensal}</td>
                  
                  {/* LVCC */}
                  <td className="py-3.5 px-3 text-center font-bold text-slate-600">{row.lvcc}</td>
                  
                  {/* DIAL */}
                  <td className="py-3.5 px-3 text-center font-bold text-slate-600">{row.dial}</td>
                  
                  {/* DSS */}
                  <td className="py-3.5 px-3 text-center font-bold text-slate-600">{row.dss}</td>
                  
                  {/* Presença em Campo */}
                  <td className="py-3.5 px-3 text-center font-bold text-slate-600 bg-purple-50/20">{row.presencaEmCampo}</td>
                  
                  {/* Desvio Estrutural */}
                  <td className="py-3.5 px-3 text-center font-bold text-slate-600">{row.estrutural}</td>

                  {/* Desvio Comportamental */}
                  <td className="py-3.5 px-3 text-center font-bold text-slate-600">{row.comportamental}</td>

                  {/* Notificação */}
                  <td className="py-3.5 px-3 text-center font-bold text-slate-600">{row.notificacao}</td>

                  {/* Interdição */}
                  <td className="py-3.5 px-3 text-center font-bold text-slate-600">{row.interdicao}</td>
                  
                  {/* Total de Inspeções */}
                  <td className="py-3.5 px-3 text-center font-black text-[#0B2E59] bg-blue-50/30">{row.totalInspecoes}</td>
                  
                  {/* Percentual */}
                  <td className="py-3.5 px-3 text-center font-black">
                    <span className={hasMetGoal ? "text-emerald-600" : row.percentual >= 50 ? "text-[#F58220]" : "text-red-500"}>
                      {Math.round(row.percentual)}%
                    </span>
                  </td>
                  
                  {/* Pontuação */}
                  <td className="py-3.5 px-4 text-center font-black text-[#0B2E59] bg-orange-50/10">
                    <span className="text-sm px-2.5 py-1 bg-[#0B2E59]/5 rounded-md text-[#0B2E59]">
                      {row.pontuacao}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="py-8 text-center text-gray-400 font-bold">
                  Nenhum supervisor cadastrado ou ativo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Helper Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 px-4 py-2.5 rounded-lg border border-slate-100 text-[10px] text-gray-400">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>• <strong>VLI:</strong> Meta 28/mês</span>
          <span>• <strong>Vale:</strong> Meta 16/mês</span>
          <span>• <strong>Gestor:</strong> Meta 16/mês</span>
        </div>
        <div className="flex items-center gap-1 cursor-help group relative">
          <HelpCircle size={12} className="text-gray-400" />
          <span className="font-semibold underline">Regra de Pontos</span>
          <div className="absolute right-0 bottom-6 hidden group-hover:block bg-slate-900 text-white p-3 rounded-lg shadow-xl w-64 leading-relaxed font-normal normal-case text-left z-10">
            <strong>Cálculo dos Pontos:</strong>
            <ul className="list-disc pl-3.5 mt-1 space-y-1 text-[9px]">
              <li>Cada inspeção registrada: 1 ponto</li>
              <li>Cada Presença em Campo derivada de DIAL: +1 ponto</li>
              <li>Cada Presença em Campo derivada de Desvio Estrutural: +1 ponto</li>
              <li>Presença em Campo lançada diretamente: 1 ponto (já incluso nas inspeções)</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
