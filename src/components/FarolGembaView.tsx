import React, { useState, useMemo } from "react";
import { CalendarDays, Radio, Trophy, Filter, HelpCircle, Building2, CheckCircle2 } from "lucide-react";
import { Area, Contract, GrupoContrato, GrupoContratoFiltro, Inspection, Supervisor, isDialInspection, isDesvioComportamentalInspection } from "../types";
import { getUniqueMonthlyInspections, getEffectiveMonthKey, getMonthOptions } from "../utils/inspectionUtils";
import { calculateInspectionScore } from "../utils/scoring";
import {
  deveParticiparFarolGemba,
  isFarolVli,
  isSupervisorFromGrupoContrato,
  normalizeName,
  getSupervisorMetaMensal,
  getInspectionGrupoContrato,
  isGestorRole
} from "../utils/operational";
import { getTipoLancamento } from "../types";

const normalizarTipo = (valor = "") =>
  String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

const isPresencaEmCampo = (inspecao: Inspection) => {
  const insp = inspecao as any;
  const tipo = normalizarTipo(
    insp.tipoLancamento ??
    insp.tipo ??
    insp.atividade ??
    insp.categoria ??
    ""
  );

  return tipo === "presenca em campo";
};

interface FarolGembaViewProps {
  inspections: Inspection[];
  supervisors: Supervisor[];
  areas: Area[];
  selectedSupervisorId?: string;
  isDashboardFiltered?: boolean;
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
  grupoContrato?: GrupoContratoFiltro;
  onSelectGrupoContrato?: (grupo: GrupoContratoFiltro) => void;
  permittedGruposContrato?: GrupoContrato[];
  contracts?: Contract[];
}

interface SupervisorRowData {
  supervisor: Supervisor;
  role: string;
  contractGroup: "Vale" | "VLI";
  metaMensal: number;
  lvcc: number;
  dial: number;
  dss: number;
  presencaEmCampo: number;
  estrutural: number;
  comportamental: number;
  notificacao: number;
  interdicao: number;
  totalInspecoes: number;
  percentual: number;
  pontuacao: number;
  lastTimestamp: number;
}

export default function FarolGembaView({
  inspections,
  supervisors,
  areas,
  selectedSupervisorId = "all",
  isDashboardFiltered = false,
  selectedMonth: propSelectedMonth,
  onSelectMonth,
  grupoContrato = "todos",
  onSelectGrupoContrato,
  permittedGruposContrato = ["vale", "vli"],
  contracts = []
}: FarolGembaViewProps) {
  const [localMonth, setLocalMonth] = useState<string>("auto");
  const activeMonth = propSelectedMonth !== undefined ? propSelectedMonth : localMonth;

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
    const isVli = isSupervisorFromGrupoContrato(sup, "vli");
    
    const isGestor = sup.tipoMeta === "gestor" || isGestorRole(sup.cargo, sup.perfil);

    if (isGestor) return "Gestor";
    if (isVli) return "Supervisor VLI";
    return "Supervisor Vale";
  };

  // Process rows for a specific supervisor list and monthly inspections
  const processSupervisorRows = (supList: Supervisor[], monthInspections: Inspection[]): SupervisorRowData[] => {
    return supList
      .map((sup) => {
        const ownInsps = monthInspections.filter((i) => i.supervisorId === sup.id);

        const lvcc = ownInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "LVCC").length;
        const dial = ownInsps.filter(isDialInspection).length;
        const dss = ownInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "DSS").length;
        const estrutural = ownInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Desvio Estrutural").length;
        const comportamental = ownInsps.filter(isDesvioComportamentalInspection).length;
        const notificacao = ownInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Notificação").length;
        const interdicao = ownInsps.filter((i) => getTipoLancamento(i.atividade, i.tipo, i.tipoLancamento) === "Interdição").length;
        const presencaEmCampo = ownInsps.filter(isPresencaEmCampo).length;

        const totalInspecoes = ownInsps.length;
        const metaMensal = getSupervisorMetaMensal(sup);
        const percentual = metaMensal > 0 ? (totalInspecoes / metaMensal) * 100 : 0;
        const pontuacao = calculateInspectionScore(ownInsps);

        const lastTimestamp = ownInsps.reduce((latest, i) => {
          const timestamp = i.createdAt ? new Date(i.createdAt).getTime() : new Date(`${i.data}T00:00:00`).getTime();
          return Math.max(latest, timestamp);
        }, 0);

        const isVli = isSupervisorFromGrupoContrato(sup, "vli");

        return {
          supervisor: sup,
          role: getSupervisorRole(sup),
          contractGroup: (isVli ? "VLI" : "Vale") as "VLI" | "Vale",
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
        if (b.pontuacao !== a.pontuacao) return b.pontuacao - a.pontuacao;
        if (b.percentual !== a.percentual) return b.percentual - a.percentual;
        if (b.totalInspecoes !== a.totalInspecoes) return b.totalInspecoes - a.totalInspecoes;
        return b.lastTimestamp - a.lastTimestamp;
      });
  };

  const monthInspections = useMemo(() => {
    return getUniqueMonthlyInspections(inspections, activeMonth);
  }, [inspections, activeMonth]);

  // Contract isolation must happen before any Farol calculation. This prevents
  // a supervisor linked to both groups from having Vale and VLI results mixed.
  const valeMonthInspections = useMemo(() => (
    monthInspections.filter((inspection) =>
      getInspectionGrupoContrato(inspection, areas, contracts, supervisors) === "vale"
    )
  ), [monthInspections, areas, contracts, supervisors]);

  const vliMonthInspections = useMemo(() => (
    monthInspections.filter((inspection) =>
      getInspectionGrupoContrato(inspection, areas, contracts, supervisors) === "vli"
    )
  ), [monthInspections, areas, contracts, supervisors]);

  // Filter supervisors who participate in Farol GEMBA
  const eligibleSupervisors = useMemo(() => {
    return supervisors.filter(
      (sup) => sup.ativo !== false && deveParticiparFarolGemba(sup)
    );
  }, [supervisors]);

  // Vale supervisors
  const valeRows = useMemo(() => {
    const list = eligibleSupervisors.filter((s) => isSupervisorFromGrupoContrato(s, "vale"));
    const filteredList = selectedSupervisorId && selectedSupervisorId !== "all"
      ? list.filter((s) => s.id === selectedSupervisorId)
      : list;
    return processSupervisorRows(filteredList, valeMonthInspections);
  }, [eligibleSupervisors, valeMonthInspections, selectedSupervisorId]);

  // VLI supervisors
  const vliRows = useMemo(() => {
    const list = eligibleSupervisors.filter((s) => isSupervisorFromGrupoContrato(s, "vli"));
    const filteredList = selectedSupervisorId && selectedSupervisorId !== "all"
      ? list.filter((s) => s.id === selectedSupervisorId)
      : list;
    return processSupervisorRows(filteredList, vliMonthInspections);
  }, [eligibleSupervisors, vliMonthInspections, selectedSupervisorId]);

  const renderTable = (rows: SupervisorRowData[], title: string, metaDescription: string, badgeColor: string) => {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${badgeColor}`}></span>
            <h4 className="text-xs font-black uppercase tracking-wider text-[#0B2E59]">{title}</h4>
            <span className="text-[10px] text-gray-400 font-bold">({metaDescription})</span>
          </div>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
            {rows.length} {rows.length === 1 ? "supervisor" : "supervisores"}
          </span>
        </div>

        <div className="w-full overflow-x-auto rounded-xl border border-gray-100 shadow-xs bg-white">
          <table className="w-full min-w-[950px] text-left border-collapse bg-white">
            <thead>
              <tr className="bg-[#0B2E59] text-white text-[10px] font-extrabold uppercase tracking-wider">
                <th className="py-3 px-4">Supervisor/Gestor</th>
                <th className="py-3 px-3 text-center">Meta Mensal</th>
                <th className="py-3 px-3 text-center">LVCC</th>
                <th className="py-3 px-3 text-center">DIAL</th>
                <th className="py-3 px-3 text-center">DSS</th>
                <th className="py-3 px-3 text-center">Presença em Campo</th>
                <th className="py-3 px-3 text-center">Desvio Estrutural</th>
                <th className="py-3 px-3 text-center">Desvio Comportamental</th>
                <th className="py-3 px-3 text-center">Notificação</th>
                <th className="py-3 px-3 text-center">Interdição</th>
                <th className="py-3 px-3 text-center bg-blue-950">Total de Inspeções</th>
                <th className="py-3 px-3 text-center">Percentual</th>
                <th className="py-3 px-4 text-center">Pontuação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {rows.map((row, index) => {
                const hasMetGoal = row.totalInspecoes >= row.metaMensal;
                return (
                  <tr key={row.supervisor.id} className="hover:bg-slate-50 transition-colors">
                    {/* Supervisor Name & Role Badge */}
                    <td className="py-3 px-4 font-extrabold text-[#0B2E59]">
                      <div className="flex items-center gap-2">
                        {index === 0 && row.totalInspecoes > 0 && (
                          <Trophy size={14} className="text-amber-500 shrink-0" />
                        )}
                        <div className="flex flex-col">
                          <span>{row.supervisor.nome}</span>
                          <span className={`text-[8px] font-black uppercase tracking-wider w-max mt-0.5 px-1.5 py-0.5 rounded ${
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
                    <td className="py-3 px-3 text-center font-black text-slate-500">{row.metaMensal}</td>
                    
                    {/* LVCC */}
                    <td className="py-3 px-3 text-center font-bold text-slate-600">{row.lvcc}</td>
                    
                    {/* DIAL */}
                    <td className="py-3 px-3 text-center font-bold text-slate-600">{row.dial}</td>
                    
                    {/* DSS */}
                    <td className="py-3 px-3 text-center font-bold text-slate-600">{row.dss}</td>
                    
                    {/* Presença em Campo */}
                    <td className="py-3 px-3 text-center font-bold text-slate-600 bg-purple-50/20">{row.presencaEmCampo}</td>
                    
                    {/* Desvio Estrutural */}
                    <td className="py-3 px-3 text-center font-bold text-slate-600">{row.estrutural}</td>

                    {/* Desvio Comportamental */}
                    <td className="py-3 px-3 text-center font-bold text-slate-600">{row.comportamental}</td>

                    {/* Notificação */}
                    <td className="py-3 px-3 text-center font-bold text-slate-600">{row.notificacao}</td>

                    {/* Interdição */}
                    <td className="py-3 px-3 text-center font-bold text-slate-600">{row.interdicao}</td>
                    
                    {/* Total de Inspeções */}
                    <td className="py-3 px-3 text-center font-black text-[#0B2E59] bg-blue-50/30">{row.totalInspecoes}</td>
                    
                    {/* Percentual */}
                    <td className="py-3 px-3 text-center font-black">
                      <span className={hasMetGoal ? "text-emerald-600" : row.percentual >= 50 ? "text-[#F58220]" : "text-red-500"}>
                        {Math.round(row.percentual)}%
                      </span>
                    </td>
                    
                    {/* Pontuação */}
                    <td className="py-3 px-4 text-center font-black text-[#0B2E59] bg-orange-50/10">
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
                    Nenhum supervisor ativo cadastrado para este contrato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-5">
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

          {/* Contract group selector if handler is provided */}
          {onSelectGrupoContrato && (
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 sm:ml-2">
              {permittedGruposContrato.length > 1 && (
                <button
                  type="button"
                  onClick={() => onSelectGrupoContrato("todos")}
                  className={`px-2 py-1 text-[10px] font-extrabold uppercase rounded-md transition-colors ${
                    grupoContrato === "todos"
                      ? "bg-[#0B2E59] text-white"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Todos os Contratos
                </button>
              )}
              {permittedGruposContrato.includes("vale") && (
                <button
                  type="button"
                  onClick={() => onSelectGrupoContrato("vale")}
                  className={`px-2 py-1 text-[10px] font-extrabold uppercase rounded-md transition-colors ${
                    grupoContrato === "vale"
                      ? "bg-emerald-700 text-white"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Vale
                </button>
              )}
              {permittedGruposContrato.includes("vli") && (
                <button
                  type="button"
                  onClick={() => onSelectGrupoContrato("vli")}
                  className={`px-2 py-1 text-[10px] font-extrabold uppercase rounded-md transition-colors ${
                    grupoContrato === "vli"
                      ? "bg-[#F58220] text-white"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  VLI
                </button>
              )}
            </div>
          )}
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

      {/* Render Tables based on selected contract group */}
      {grupoContrato === "vale" && (
        renderTable(valeRows, "Farol GEMBA Vale", "Meta Padrão: 16 inspeções/mês", "bg-emerald-500")
      )}

      {grupoContrato === "vli" && (
        renderTable(vliRows, "Farol GEMBA VLI", "Meta Padrão: 28 inspeções/mês", "bg-[#F58220]")
      )}

      {grupoContrato === "todos" && (
        <div className="space-y-6">
          {renderTable(valeRows, "Farol GEMBA Vale", "Meta Padrão: 16 inspeções/mês", "bg-emerald-500")}
          {renderTable(vliRows, "Farol GEMBA VLI", "Meta Padrão: 28 inspeções/mês", "bg-[#F58220]")}
        </div>
      )}

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
              <li>Interdição: 4 pontos</li>
              <li>Notificação: 3 pontos</li>
              <li>LVCC: 2 pontos</li>
              <li>DIAL: 2 pontos</li>
              <li>Desvio Comportamental: 2 pontos</li>
              <li>Desvio Estrutural: 2 pontos</li>
              <li>DSS: 1 ponto</li>
              <li>Presença em Campo: 1 ponto</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
