/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { dbService } from "../services/db";
import { Inspection, Supervisor, Area } from "../types";
import { Download, FileSpreadsheet, FileText, Printer, CheckCircle, Search, Calendar } from "lucide-react";

interface ExportacoesViewProps {
  inspections: Inspection[];
  supervisors: Supervisor[];
  areas: Area[];
  onSelectInspectionReport: (id: string) => void;
}

export default function ExportacoesView({
  inspections,
  supervisors,
  areas,
  onSelectInspectionReport
}: ExportacoesViewProps) {
  const [selectedMonth, setSelectedMonth] = useState("2026-07");
  const [successMsg, setSuccessMsg] = useState("");

  const getSupervisorName = (id: string) => supervisors.find((s) => s.id === id)?.nome || dbService.getDeletedNames()[id] || "Outros";
  const getAreaName = (id: string) => areas.find((a) => a.id === id)?.nome || dbService.getDeletedNames()[id] || "Outros";

  // Export to Excel (CSV format)
  const handleExportCSV = () => {
    // CSV Header row
    const headers = [
      "ID",
      "Data",
      "Supervisor",
      "Area",
      "Atividade",
      "Classificação",
      "Risco/Potencial",
      "Descricao",
      "Acao Corretiva realizada",
      "Responsavel",
      "Prazo",
      "Status"
    ];

    const rows = inspections.map((item) => [
      item.id.toUpperCase(),
      item.data,
      getSupervisorName(item.supervisorId),
      getAreaName(item.areaId),
      item.atividade,
      item.tipo,
      item.potencial,
      `"${item.descricao.replace(/"/g, '""')}"`,
      `"${item.acaoCorretiva.replace(/"/g, '""')}"`,
      item.responsavel,
      item.prazo,
      item.status
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + // UTF-8 BOM for Excel support
      [headers.join(";"), ...rows.map((e) => e.join(";"))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `GEMBA_FTA_Export_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showSuccess("Banco de dados exportado com sucesso no formato compatível com Excel (.CSV)!");
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg("");
    }, 4000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* View Header */}
      <div className="border-b border-gray-100 pb-5">
        <h1 className="text-xl font-extrabold text-[#0B2E59] tracking-tight">
          Central de Exportações & Arquivo
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Efetue downloads estruturados de planilhas para Power BI, relatórios consolidados mensais e arquivos executivos.
        </p>
      </div>

      {/* SUCCESS ALERTS */}
      {successMsg && (
        <div className="p-3 bg-green-50 border-l-4 border-green-500 rounded-r-lg text-green-700 text-xs font-semibold flex items-center gap-2">
          <CheckCircle size={14} className="shrink-0" /> {successMsg}
        </div>
      )}

      {/* EXPORT WORKSPACE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Excel CSV Database */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="p-3 bg-green-50 text-green-700 rounded-lg w-fit">
              <FileSpreadsheet size={24} />
            </div>
            <h2 className="text-sm font-extrabold text-[#0B2E59] uppercase tracking-wider">
              Exportar para Excel / Power BI
            </h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Faz download imediato de toda a base de dados de vistorias em formato .CSV estruturado (delimitado por ponto e vírgula, codificação UTF-8) perfeitamente adaptado para carregar em painéis externos, relatórios corporativos ou planilhas Excel offline.
            </p>
          </div>

          <button
            onClick={handleExportCSV}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition shadow-sm cursor-pointer"
          >
            <Download size={14} /> Baixar Planilha Geral (.CSV)
          </button>
        </div>

        {/* Card 2: PDF Consolidation */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="p-3 bg-red-50 text-red-700 rounded-lg w-fit">
              <FileText size={24} />
            </div>
            <h2 className="text-sm font-extrabold text-[#0B2E59] uppercase tracking-wider">
              Exportar Relatório Mensal Consolidado
            </h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Consolida e prepara vistorias pertencentes ao mês de competência selecionado. Abre a visualização estruturada em lote permitindo salvar em PDF unificado ou enviar diretamente para canais físicos ou impressoras conectadas na rede.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-1 text-xs">
              <label className="font-bold text-gray-600 flex items-center gap-1">
                <Calendar size={12} /> Mês de Competência
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-700 focus:ring-1 focus:ring-[#0B2E59] focus:outline-none"
              />
            </div>

            <button
              onClick={() => {
                // Find first inspection in that month to show
                const monthMatches = inspections.filter((i) => i.data.startsWith(selectedMonth));
                if (monthMatches.length > 0) {
                  onSelectInspectionReport(monthMatches[0].id);
                } else {
                  alert("Nenhuma inspeção encontrada no mês selecionado.");
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0B2E59] hover:bg-[#133e72] text-white text-xs font-bold rounded-lg transition shadow-sm cursor-pointer"
            >
              <Printer size={14} /> Consolidar & Imprimir Lote Mensal
            </button>
          </div>
        </div>
      </div>

      {/* QUICK TABLE LIST OF ALL INDIVIDUAL INSPECTIONS TO DIRECTLY ACCESS REPORTS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="text-xs font-extrabold text-[#0B2E59] uppercase tracking-wider">
          Exportações de Relatórios de Inspeção Individuais
        </h2>
        <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
          {inspections.map((item) => (
            <div key={item.id} className="py-3 flex items-center justify-between text-xs hover:bg-gray-50/40 px-2 rounded-md">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-[#0B2E59]">{item.id.toUpperCase()}</span>
                <span className="text-gray-500 text-[10px]">
                  Supervisor: {getSupervisorName(item.supervisorId)} | Área: {getAreaName(item.areaId)}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[11px] text-gray-400 font-semibold">
                  {item.data.split("-").reverse().join("/")}
                </span>
                <button
                  onClick={() => onSelectInspectionReport(item.id)}
                  className="flex items-center gap-1 px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded transition text-[10px] cursor-pointer"
                >
                  <FileText size={10} /> Ver PDF
                </button>
              </div>
            </div>
          ))}
          {inspections.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">Sem registros de vistorias.</p>
          )}
        </div>
      </div>
    </div>
  );
}
