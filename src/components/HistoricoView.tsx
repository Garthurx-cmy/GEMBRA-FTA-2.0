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
  InspectionStatus,
  InspectionType,
  Potential,
  getTipoLancamento,
  TIPO_LANCAMENTO_CONFIG,
  UserProfile
} from "../types";
import {
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  FileText,
  Image as ImageIcon,
  Calendar,
  MapPin,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Flame,
  User,
  X,
  Printer
} from "lucide-react";
import ResolvedImage from "./ResolvedImage";


import {
  getEffectiveMonthKey,
  getInspectionMonthKey,
  getMonthOptions
} from "../utils/inspectionUtils";

interface HistoricoViewProps {
  inspections: Inspection[];
  supervisors: Supervisor[];
  areas: Area[];
  contracts: Contract[];
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
  onEdit: (inspection: Inspection) => void;
  onDelete: (id: string) => void;
  onMarkAsDone: (id: string) => void;
  onGeneratePDF: (inspection: Inspection) => void;
  currentUser?: UserProfile | null;
}

export default function HistoricoView({
  inspections,
  supervisors,
  areas,
  contracts,
  selectedMonth: propSelectedMonth,
  onSelectMonth,
  onEdit,
  onDelete,
  onMarkAsDone,
  onGeneratePDF,
  currentUser
}: HistoricoViewProps) {
  const [localMonth, setLocalMonth] = useState("auto");
  const activeMonth = propSelectedMonth !== undefined ? propSelectedMonth : localMonth;
  const effectiveMonthKey = getEffectiveMonthKey(activeMonth);

  const handleMonthChange = (val: string) => {
    if (onSelectMonth) {
      onSelectMonth(val);
    } else {
      setLocalMonth(val);
    }
  };
  // --- FILTER & SEARCH STATES ---
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSupervisor, setSelectedSupervisor] = useState("all");
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedContract, setSelectedContract] = useState("all");
  const [selectedTipo, setSelectedTipo] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedPotencial, setSelectedPotencial] = useState("all");
  const [filterDate, setFilterDate] = useState("");

  // --- DETAIL MODALS ---
  const [viewingInspection, setViewingInspection] = useState<Inspection | null>(null);
  const [galleryInspection, setGalleryInspection] = useState<Inspection | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // --- PHOTO ROTATION STATE & HANDLER ---
  const [savingRotationId, setSavingRotationId] = useState<string | null>(null);

  const handleRotatePhoto = async (
    inspection: Inspection,
    type: "before" | "after",
    index: number,
    direction: "left" | "right"
  ) => {
    const id = `${inspection.id}-${type}-${index}`;
    setSavingRotationId(id);

    try {
      // Get current rotation arrays
      const currentAntes = inspection.rotacoesFotosAntes || [];
      const currentDepois = inspection.rotacoesFotosDepois || [];

      // Make sure the arrays have the same length as the photos array (initialized with 0 if missing)
      const numAntes = inspection.fotosAntes?.length || 0;
      const numDepois = inspection.fotosDepois?.length || 0;

      const antesRot = Array.from({ length: numAntes }, (_, i) => currentAntes[i] || 0);
      const depoisRot = Array.from({ length: numDepois }, (_, i) => currentDepois[i] || 0);

      if (type === "before") {
        const currentAngle = antesRot[index] || 0;
        const diff = direction === "left" ? -90 : 90;
        const newAngle = ((currentAngle + diff) % 360 + 360) % 360;
        antesRot[index] = newAngle;
      } else {
        const currentAngle = depoisRot[index] || 0;
        const diff = direction === "left" ? -90 : 90;
        const newAngle = ((currentAngle + diff) % 360 + 360) % 360;
        depoisRot[index] = newAngle;
      }

      const updatedInspection: Inspection = {
        ...inspection,
        rotacoesFotosAntes: antesRot,
        rotacoesFotosDepois: depoisRot,
        updatedAt: new Date().toISOString()
      };

      await dbService.saveInspection(updatedInspection);

      // Also update the local state if it's currently open in any of the modals
      if (viewingInspection && viewingInspection.id === inspection.id) {
        setViewingInspection(updatedInspection);
      }
      if (galleryInspection && galleryInspection.id === inspection.id) {
        setGalleryInspection(updatedInspection);
      }
    } catch (err) {
      console.error("Erro ao salvar rotação:", err);
    } finally {
      setSavingRotationId(null);
    }
  };

  // --- PAGINATION STATES ---
  const [localInspections, setLocalInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [docHistory, setDocHistory] = useState<(string | null)[]>([null]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Sync / Listen to DB updates to auto-refresh current page
  useEffect(() => {
    const handleDbUpdate = (e: any) => {
      if (e.detail?.key === "inspections") {
        setRefreshTrigger(prev => prev + 1);
      }
    };
    window.addEventListener("gemba_fta_db_update", handleDbUpdate);
    return () => window.removeEventListener("gemba_fta_db_update", handleDbUpdate);
  }, []);

  // Reset to first page when search terms or filter configurations change
  useEffect(() => {
    setCurrentPage(1);
    setDocHistory([null]);
  }, [
    searchTerm,
    selectedSupervisor,
    selectedArea,
    selectedContract,
    selectedTipo,
    selectedStatus,
    selectedPotencial,
    filterDate
  ]);

  // Load paginated data from Firestore on-demand
  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      if (document.visibilityState !== "visible") return;
      setLoading(true);
      try {
        const startAfterId = docHistory[currentPage - 1] || null;
        const result = await dbService.getPaginatedInspections({
          limit: 25,
          startAfterDocId: startAfterId,
          filters: {
            searchTerm: searchTerm.trim() || undefined,
            supervisorId: selectedSupervisor,
            areaId: selectedArea,
            contratoId: selectedContract,
            status: selectedStatus,
            potencial: selectedPotencial,
            data: filterDate || undefined,
            tipo: selectedTipo
          }
        });
        
        if (active) {
          setLocalInspections(result.items);
          setHasMore(result.hasMore);
          if (result.lastDocId) {
            setDocHistory(prev => {
              const copy = [...prev];
              copy[currentPage] = result.lastDocId;
              return copy;
            });
          }
        }
      } catch (err) {
        console.error("Erro ao carregar histórico paginado:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    // Debounce to prevent multiple queries during typing
    const timer = setTimeout(fetchData, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    currentPage,
    searchTerm,
    selectedSupervisor,
    selectedArea,
    selectedContract,
    selectedTipo,
    selectedStatus,
    selectedPotencial,
    filterDate,
    refreshTrigger
  ]);

  const isTeamLeader = currentUser?.perfil === "Líder de Equipe" || currentUser?.perfil === "Lider de Equipe";
  const isOwnInspection = (item: Inspection) => {
    if (!currentUser) return false;
    if (item.criadoPorUid && item.criadoPorUid === currentUser.id) return true;
    if (item.criadoPorEmail && currentUser.email && item.criadoPorEmail.toLowerCase() === currentUser.email.toLowerCase()) return true;
    return false;
  };
  const canEditInspection = (item: Inspection) => {
    if (!currentUser || currentUser.perfil === "visitante") return false;
    if (isTeamLeader) return isOwnInspection(item);
    return true;
  };

  // Map filteredInspections to memoized list filtered by active month and criteria
  const filteredInspections = useMemo(() => {
    const list = inspections && inspections.length > 0 ? inspections : localInspections;
    return list.filter((item) => {
      // Líder de Equipe: visualiza apenas os próprios lançamentos
      if (isTeamLeader && !isOwnInspection(item)) return false;

      // Month filter
      if (activeMonth !== "all_months") {
        const monthKey = getInspectionMonthKey(item);
        if (monthKey !== effectiveMonthKey) return false;
      }
      // Supervisor filter
      if (selectedSupervisor !== "all" && item.supervisorId !== selectedSupervisor) return false;
      // Area filter
      if (selectedArea !== "all" && item.areaId !== selectedArea) return false;
      // Contract filter
      if (selectedContract !== "all" && item.contratoId !== selectedContract) return false;
      // Tipo filter
      if (selectedTipo !== "all" && getTipoLancamento(item.atividade, item.tipo) !== selectedTipo) return false;
      // Status filter
      if (selectedStatus !== "all" && item.status !== selectedStatus) return false;
      // Potencial filter
      if (selectedPotencial !== "all" && item.potencial !== selectedPotencial) return false;
      // Date filter
      if (filterDate && item.data !== filterDate) return false;
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const supName = getSupervisorName(item.supervisorId).toLowerCase();
        const areaName = getAreaName(item.areaId).toLowerCase();
        const contractCode = getContractCode(item.contratoId).toLowerCase();
        const desc = (item.descricao || "").toLowerCase();
        const id = (item.id || "").toLowerCase();
        const acao = (item.acaoCorretiva || "").toLowerCase();
        if (
          !supName.includes(term) &&
          !areaName.includes(term) &&
          !contractCode.includes(term) &&
          !desc.includes(term) &&
          !id.includes(term) &&
          !acao.includes(term)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    inspections,
    localInspections,
    activeMonth,
    effectiveMonthKey,
    selectedSupervisor,
    selectedArea,
    selectedContract,
    selectedTipo,
    selectedStatus,
    selectedPotencial,
    filterDate,
    searchTerm,
    supervisors,
    areas,
    contracts
  ]);

  // Helper resolvers
  const getSupervisorName = (id: string) => supervisors.find((s) => s.id === id)?.nome || (currentUser?.id === id ? currentUser.nome : "") || dbService.getDeletedNames()[id] || "Outros";
  const getAreaName = (id: string) => areas.find((a) => a.id === id)?.nome || dbService.getDeletedNames()[id] || "Outros";
  const getContractCode = (id: string) => contracts.find((c) => c.id === id)?.codigo || dbService.getDeletedNames()[id] || "Contrato Geral";

  const getPotentialBadge = (potencial: Potential) => {
    switch (potencial) {
      case Potential.LEVE:
        return "bg-green-50 text-green-700 border border-green-200";
      case Potential.MEDIO:
        return "bg-yellow-50 text-yellow-700 border border-yellow-200";
      case Potential.GRAVE:
        return "bg-orange-50 text-orange-700 border border-orange-200";
      case Potential.CRITICO:
        return "bg-red-50 text-red-700 border border-red-200 font-bold animate-pulse";
    }
  };

  const getStatusBadge = (status: InspectionStatus) => {
    switch (status) {
      case InspectionStatus.ABERTO:
        return "bg-red-50 text-red-700 border border-red-100";
      case InspectionStatus.EM_ANDAMENTO:
        return "bg-yellow-50 text-yellow-700 border border-yellow-100";
      case InspectionStatus.CONCLUIDO:
        return "bg-green-50 text-green-700 border border-green-100";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* View Header */}
      <div>
        <h1 className="text-xl font-extrabold text-[#0B2E59] tracking-tight">
          Histórico Geral de Inspeções
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Auditoria, edição, rastreabilidade e tratativa em tempo real de todas as inspeções registradas.
        </p>
      </div>

      {/* FILTER CONTROLS GRID */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Text Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Pesquisar por descrição, ação corretiva, responsável, ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-4 py-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-colors"
            />
          </div>

          {/* Date Picker Filter */}
          <div className="relative w-full lg:w-48">
            <Calendar className="absolute left-3 top-3 text-gray-400" size={14} />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] transition-colors"
            />
          </div>
        </div>

        {/* Categories filters */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-gray-50">
          {/* Mês de Referência */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Mês de Referência</span>
            <select
              value={activeMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="text-xs bg-gray-50 border border-gray-150 rounded-lg p-2 text-gray-800 font-extrabold"
            >
              {getMonthOptions(inspections).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Supervisor */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Supervisor</span>
            <select
              value={selectedSupervisor}
              onChange={(e) => setSelectedSupervisor(e.target.value)}
              className="text-xs bg-gray-50 border border-gray-150 rounded-lg p-2 text-gray-700"
            >
              <option value="all">Todos</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Area */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Área</span>
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="text-xs bg-gray-50 border border-gray-150 rounded-lg p-2 text-gray-700"
            >
              <option value="all">Todas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de Lançamento */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Tipo de Lançamento</span>
            <select
              value={selectedTipo}
              onChange={(e) => setSelectedTipo(e.target.value)}
              className="text-xs bg-gray-50 border border-gray-150 rounded-lg p-2 text-gray-700 font-semibold"
            >
              <option value="all">Todos os tipos</option>
              {Object.keys(TIPO_LANCAMENTO_CONFIG).map((t) => (
                <option key={t} value={t}>
                  {TIPO_LANCAMENTO_CONFIG[t].icon} {t}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Status</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs bg-gray-50 border border-gray-150 rounded-lg p-2 text-gray-700"
            >
              <option value="all">Todos os status</option>
              {Object.values(InspectionStatus).map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Potencial */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Severidade</span>
            <select
              value={selectedPotencial}
              onChange={(e) => setSelectedPotencial(e.target.value)}
              className="text-xs bg-gray-50 border border-gray-150 rounded-lg p-2 text-gray-700"
            >
              <option value="all">Todos os potenciais</option>
              {Object.values(Potential).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left border-collapse">
            <thead>
              <tr className="bg-[#0B2E59] text-white text-[10px] font-extrabold uppercase tracking-wider border-b border-gray-100">
                <th className="py-3 px-4 font-bold">Data</th>
                <th className="py-3 px-3 font-bold">Supervisor</th>
                <th className="py-3 px-3 font-bold">Área</th>
                <th className="py-3 px-3 font-bold">Tipo de Lançamento</th>
                <th className="py-3 px-4 font-bold max-w-xs">Descrição do Desvio</th>
                <th className="py-3 px-3 font-bold">Severidade</th>
                <th className="py-3 px-3 font-bold">Status</th>
                <th className="py-3 px-3 font-bold">Responsável</th>
                <th className="py-3 px-4 text-center font-bold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs text-gray-700 font-medium">
              {filteredInspections.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                  {/* Data */}
                  <td className="py-3.5 px-4 font-semibold text-[#0B2E59] shrink-0">
                    {item.data.split("-").reverse().join("/")}
                  </td>
                  {/* Supervisor */}
                  <td className="py-3.5 px-3 font-bold text-gray-900">
                    {getSupervisorName(item.supervisorId)}
                  </td>
                  {/* Area */}
                  <td className="py-3.5 px-3 text-gray-500 max-w-[150px] truncate">
                    {getAreaName(item.areaId)}
                  </td>
                  {/* Tipo de Lançamento */}
                  <td className="py-3.5 px-3">
                    {(() => {
                      const typeName = getTipoLancamento(item.atividade, item.tipo);
                      const conf = TIPO_LANCAMENTO_CONFIG[typeName];
                      return (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-fit ${
                            conf ? `${conf.bgClass} ${conf.textClass} border ${conf.borderClass}` : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          <span>{conf?.icon || "🔍"}</span>
                          <span>{typeName}</span>
                        </span>
                      );
                    })()}
                  </td>
                  {/* Descricao */}
                  <td className="py-3.5 px-4 max-w-xs truncate text-gray-600 font-normal">
                    {item.descricao}
                  </td>
                  {/* Potencial */}
                  <td className="py-3.5 px-3">
                    {getTipoLancamento(item.atividade, item.tipo) === "Presença em Campo" ? (
                      <span className="text-gray-400 italic text-[11px]">N/A</span>
                    ) : (
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${getPotentialBadge(item.potencial)}`}>
                        {item.potencial}
                      </span>
                    )}
                  </td>
                  {/* Status */}
                  <td className="py-3.5 px-3">
                    {getTipoLancamento(item.atividade, item.tipo) === "Presença em Campo" ? (
                      <span className="text-gray-400 italic text-[11px]">N/A</span>
                    ) : (
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold ${getStatusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    )}
                  </td>
                  {/* Responsavel */}
                  <td className="py-3.5 px-3 text-gray-500 max-w-[120px] truncate">
                    {getTipoLancamento(item.atividade, item.tipo) === "Presença em Campo" ? "-" : item.responsavel}
                  </td>
                  {/* Actions column */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center justify-center gap-1.5">
                      {/* Visualizar */}
                      <button
                        onClick={() => setViewingInspection(item)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                        title="Visualizar Detalhes"
                      >
                        <Eye size={14} />
                      </button>

                      {/* Editar */}
                      {canEditInspection(item) && (
                        <button
                          onClick={() => onEdit(item)}
                          className="p-1.5 text-orange-600 hover:bg-orange-50 rounded transition cursor-pointer"
                          title="Editar Registro"
                        >
                          <Edit size={14} />
                        </button>
                      )}

                      {/* Marcar Concluido shortcut */}
                      {canEditInspection(item) && item.status !== InspectionStatus.CONCLUIDO && (
                        <button
                          onClick={() => onMarkAsDone(item.id)}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded transition cursor-pointer"
                          title="Marcar como Concluído"
                        >
                          <CheckCircle size={14} />
                        </button>
                      )}

                      {/* Duplicar */}
                      {/* Gallery Shortcut */}
                      <button
                          onClick={() => setGalleryInspection(item)}
                          className="p-1.5 text-[#0B2E59] hover:bg-blue-50 rounded transition cursor-pointer"
                          title="Ver Evidências Fotográficas"
                        >
                          <ImageIcon size={14} />
                      </button>

                      {/* PDF Report Generation */}
                      <button
                        onClick={() => onGeneratePDF(item)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                        title="Visualizar/Imprimir Relatório"
                      >
                        <Printer size={14} />
                      </button>

                      {/* Excluir */}
                      {(currentUser?.perfil === "Desenvolvedor/Admin" || currentUser?.perfil === "Administrador") && (
                        <button
                          onClick={() => setDeleteTargetId(item.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                          title="Excluir Inspeção"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredInspections.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-xs text-gray-400 font-semibold">
                    Nenhuma inspeção encontrada com os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination controls */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100">
          <div className="text-[10px] text-gray-500 font-extrabold tracking-wider uppercase flex items-center gap-2">
            <span>Página {currentPage}</span>
            {loading && (
              <span className="inline-block w-2.5 h-2.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || loading}
              className="px-3 py-1.5 bg-white border border-gray-200 text-[#0B2E59] text-xs font-bold rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Anterior
            </button>
            <button
              onClick={() => setCurrentPage(prev => prev + 1)}
              disabled={!hasMore || loading}
              className="px-3 py-1.5 bg-white border border-gray-200 text-[#0B2E59] text-xs font-bold rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Próximo
            </button>
          </div>
        </div>
      </div>

      {/* --- DETAIL MODAL --- */}
      {viewingInspection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 bg-[#0B2E59] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[#F58220]" />
                <h3 className="font-extrabold text-base tracking-wide">
                  Inspeção ID: {viewingInspection.id.toUpperCase()}
                </h3>
              </div>
              <button
                onClick={() => setViewingInspection(null)}
                className="p-1 hover:bg-white/10 rounded text-gray-200 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Top stats block */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-4 rounded-xl text-xs">
                <div>
                  <span className="block text-[10px] text-gray-400 font-bold uppercase">Data</span>
                  <span className="font-bold text-gray-800">{viewingInspection.data.split("-").reverse().join("/")}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400 font-bold uppercase">Supervisor</span>
                  <span className="font-bold text-gray-800">{getSupervisorName(viewingInspection.supervisorId)}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400 font-bold uppercase">Área</span>
                  <span className="font-bold text-gray-800">{getAreaName(viewingInspection.areaId)}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400 font-bold uppercase">Contrato</span>
                  <span className="font-bold text-gray-800">{getContractCode(viewingInspection.contratoId)}</span>
                </div>
              </div>

              {/* Categorization indicators */}
              <div className="flex flex-wrap gap-2 text-xs">
                {(() => {
                  const typeName = getTipoLancamento(viewingInspection.atividade, viewingInspection.tipo);
                  const conf = TIPO_LANCAMENTO_CONFIG[typeName];
                  return (
                    <span className={`px-2.5 py-1 rounded font-bold border flex items-center gap-1 ${conf ? `${conf.bgClass} ${conf.textClass} ${conf.borderClass}` : "bg-gray-100 text-gray-800 border-gray-200"}`}>
                      <span>{conf?.icon || "🔍"}</span>
                      <span>Tipo de Lançamento: {typeName}</span>
                    </span>
                  );
                })()}
                {getTipoLancamento(viewingInspection.atividade, viewingInspection.tipo) !== "Presença em Campo" && (
                  <>
                    <span className={`px-2.5 py-1 rounded font-bold ${getPotentialBadge(viewingInspection.potencial)}`}>
                      Risco: {viewingInspection.potencial}
                    </span>
                    <span className={`px-2.5 py-1 rounded font-bold ${getStatusBadge(viewingInspection.status)}`}>
                      Status: {viewingInspection.status}
                    </span>
                  </>
                )}
              </div>

              {/* Presença em Campo Stats */}
              {getTipoLancamento(viewingInspection.atividade, viewingInspection.tipo) === "Presença em Campo" && viewingInspection.quantidadeParticipantes !== undefined && (
                <div className="space-y-1 bg-teal-50 p-3 rounded-lg border border-teal-200 text-xs flex justify-between items-center">
                  <span className="font-bold text-teal-800 uppercase tracking-wider">Participantes Abordados</span>
                  <span className="font-black text-teal-900 bg-teal-100 px-2.5 py-1 rounded-md text-sm shrink-0">
                    {viewingInspection.quantidadeParticipantes} colaboradores
                  </span>
                </div>
              )}

              {/* Desvio Description */}
              <div className="space-y-1">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {getTipoLancamento(viewingInspection.atividade, viewingInspection.tipo) === "Presença em Campo" ? "Descrição da Presença em Campo" : "Descrição do Desvio"}
                </span>
                <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-lg leading-relaxed border-l-4 border-[#0B2E59]">
                  {viewingInspection.descricao}
                </p>
              </div>

              {/* Ação Corretiva */}
              {getTipoLancamento(viewingInspection.atividade, viewingInspection.tipo) !== "Presença em Campo" && (
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ação Corretiva Aplicada/Proposta</span>
                  <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-lg leading-relaxed border-l-4 border-green-500">
                    {viewingInspection.acaoCorretiva}
                  </p>
                </div>
              )}

              {/* Action meta */}
              {getTipoLancamento(viewingInspection.atividade, viewingInspection.tipo) !== "Presença em Campo" && (
                <div className="grid grid-cols-2 gap-4 text-xs border-t border-gray-50 pt-4">
                  <div>
                    <span className="block text-[10px] text-gray-400 font-bold uppercase">Responsável pela Ação</span>
                    <span className="font-bold text-gray-800">{viewingInspection.responsavel}</span>
                  </div>
                  <div>
                    {viewingInspection.status === InspectionStatus.CONCLUIDO ? (
                      <>
                        <span className="block text-[10px] text-gray-400 font-bold uppercase">Data de Conclusão</span>
                        <span className="font-bold text-gray-800">
                          {viewingInspection.dataConclusao 
                            ? viewingInspection.dataConclusao.split("-").reverse().join("/") 
                            : viewingInspection.data.split("-").reverse().join("/")}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="block text-[10px] text-gray-400 font-bold uppercase">Prazo de Conclusão</span>
                        <span className="font-bold text-gray-800">
                          {viewingInspection.prazo.split("-").reverse().join("/")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Observacoes */}
              {viewingInspection.observacoes && (
                <div className="space-y-1 pt-2 border-t border-gray-50">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Observações</span>
                  <p className="text-xs text-gray-600 bg-gray-50/50 p-2.5 rounded italic">
                    {viewingInspection.observacoes}
                  </p>
                </div>
              )}

              {/* Photo evidence preview if any */}
              {(viewingInspection.fotosAntes.length > 0 || viewingInspection.fotosDepois.length > 0) && (
                <div className="space-y-3 pt-3 border-t border-gray-50">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mídia anexada</span>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Antes */}
                    {viewingInspection.fotosAntes.length > 0 && (
                      <div className="space-y-1 text-center">
                        <span className="text-[9px] uppercase font-bold text-red-500 block">Antes</span>
                        <div className="flex flex-col items-center w-full">
                          <div className="aspect-video rounded overflow-hidden border border-gray-100 bg-gray-50 relative group w-full">
                            <ResolvedImage
                              src={viewingInspection.fotosAntes[0]}
                              rotation={viewingInspection.rotacoesFotosAntes ? viewingInspection.rotacoesFotosAntes[0] || 0 : 0}
                              alt="Antes"
                              className="w-full h-full object-cover"
                            />
                            {/* Desktop hover controls */}
                            {currentUser?.perfil !== "visitante" && (
                              <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 no-print p-2">
                                {savingRotationId === `${viewingInspection.id}-before-0` ? (
                                  <span className="text-[10px] text-white font-extrabold animate-pulse bg-black/50 px-2 py-1 rounded">
                                    Salvando rotação...
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleRotatePhoto(viewingInspection, "before", 0, "left")}
                                      className="p-1.5 bg-white/90 hover:bg-white text-gray-800 rounded-full shadow hover:scale-110 transition cursor-pointer flex items-center justify-center"
                                      title="Girar para esquerda"
                                    >
                                      <span className="text-sm font-bold">↺</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRotatePhoto(viewingInspection, "before", 0, "right")}
                                      className="p-1.5 bg-white/90 hover:bg-white text-gray-800 rounded-full shadow hover:scale-110 transition cursor-pointer flex items-center justify-center"
                                      title="Girar para direita"
                                    >
                                      <span className="text-sm font-bold">↻</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Mobile persistent controls */}
                          {currentUser?.perfil !== "visitante" && (
                            <div className="flex items-center gap-2 mt-1.5 no-print md:hidden">
                              {savingRotationId === `${viewingInspection.id}-before-0` ? (
                                <span className="text-[9px] text-orange-500 font-bold animate-pulse">
                                  Salvando rotação...
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRotatePhoto(viewingInspection, "before", 0, "left")}
                                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold rounded flex items-center gap-0.5"
                                  >
                                    ↺ Esq
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRotatePhoto(viewingInspection, "before", 0, "right")}
                                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold rounded flex items-center gap-0.5"
                                  >
                                    ↻ Dir
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Depois */}
                    {viewingInspection.fotosDepois.length > 0 && (
                      <div className="space-y-1 text-center">
                        <span className="text-[9px] uppercase font-bold text-green-500 block">Depois</span>
                        <div className="flex flex-col items-center w-full">
                          <div className="aspect-video rounded overflow-hidden border border-gray-100 bg-gray-50 relative group w-full">
                            <ResolvedImage
                              src={viewingInspection.fotosDepois[0]}
                              rotation={viewingInspection.rotacoesFotosDepois ? viewingInspection.rotacoesFotosDepois[0] || 0 : 0}
                              alt="Depois"
                              className="w-full h-full object-cover"
                            />
                            {/* Desktop hover controls */}
                            {currentUser?.perfil !== "visitante" && (
                              <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 no-print p-2">
                                {savingRotationId === `${viewingInspection.id}-after-0` ? (
                                  <span className="text-[10px] text-white font-extrabold animate-pulse bg-black/50 px-2 py-1 rounded">
                                    Salvando rotação...
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleRotatePhoto(viewingInspection, "after", 0, "left")}
                                      className="p-1.5 bg-white/90 hover:bg-white text-gray-800 rounded-full shadow hover:scale-110 transition cursor-pointer flex items-center justify-center"
                                      title="Girar para esquerda"
                                    >
                                      <span className="text-sm font-bold">↺</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRotatePhoto(viewingInspection, "after", 0, "right")}
                                      className="p-1.5 bg-white/90 hover:bg-white text-gray-800 rounded-full shadow hover:scale-110 transition cursor-pointer flex items-center justify-center"
                                      title="Girar para direita"
                                    >
                                      <span className="text-sm font-bold">↻</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Mobile persistent controls */}
                          {currentUser?.perfil !== "visitante" && (
                            <div className="flex items-center gap-2 mt-1.5 no-print md:hidden">
                              {savingRotationId === `${viewingInspection.id}-after-0` ? (
                                <span className="text-[9px] text-orange-500 font-bold animate-pulse">
                                  Salvando rotação...
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRotatePhoto(viewingInspection, "after", 0, "left")}
                                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold rounded flex items-center gap-0.5"
                                  >
                                    ↺ Esq
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRotatePhoto(viewingInspection, "after", 0, "right")}
                                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold rounded flex items-center gap-0.5"
                                  >
                                    ↻ Dir
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                onClick={() => onGeneratePDF(viewingInspection)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 text-xs font-bold rounded-lg hover:bg-red-100 cursor-pointer"
              >
                <Printer size={12} /> Relatório de Impressão
              </button>
              <button
                onClick={() => {
                  onEdit(viewingInspection);
                  setViewingInspection(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0B2E59] text-white text-xs font-bold rounded-lg hover:bg-[#133e72] cursor-pointer"
              >
                <Edit size={12} /> Editar
              </button>
              <button
                onClick={() => setViewingInspection(null)}
                className="px-4 py-1.5 bg-white text-gray-700 text-xs font-bold rounded-lg border border-gray-250 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- PHOTO GALLERY MODAL --- */}
      {galleryInspection && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-extrabold text-sm text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon size={16} className="text-[#F58220]" /> Galeria de Fotos - Inspeção
              </h3>
              <button
                onClick={() => setGalleryInspection(null)}
                className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto">
              {/* Antes Container */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-extrabold text-red-500 uppercase tracking-widest text-center">
                  Evidências - Antes da Tratativa
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {galleryInspection.fotosAntes.map((img, idx) => (
                    <div key={idx} className="flex flex-col items-center w-full">
                      <div className="aspect-video rounded border overflow-hidden bg-gray-50 relative group w-full">
                        <ResolvedImage
                          src={img}
                          rotation={galleryInspection.rotacoesFotosAntes ? galleryInspection.rotacoesFotosAntes[idx] || 0 : 0}
                          alt="Antes"
                          className="w-full h-full object-cover"
                        />
                        {/* Desktop hover controls */}
                        {currentUser?.perfil !== "visitante" && (
                          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 no-print p-2">
                            {savingRotationId === `${galleryInspection.id}-before-${idx}` ? (
                              <span className="text-[10px] text-white font-extrabold animate-pulse bg-black/50 px-2 py-1 rounded">
                                Salvando rotação...
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRotatePhoto(galleryInspection, "before", idx, "left")}
                                  className="p-1.5 bg-white/90 hover:bg-white text-gray-800 rounded-full shadow hover:scale-110 transition cursor-pointer flex items-center justify-center"
                                  title="Girar para esquerda"
                                >
                                  <span className="text-sm font-bold">↺</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRotatePhoto(galleryInspection, "before", idx, "right")}
                                  className="p-1.5 bg-white/90 hover:bg-white text-gray-800 rounded-full shadow hover:scale-110 transition cursor-pointer flex items-center justify-center"
                                  title="Girar para direita"
                                >
                                  <span className="text-sm font-bold">↻</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Mobile persistent controls */}
                      {currentUser?.perfil !== "visitante" && (
                        <div className="flex items-center gap-2 mt-1.5 no-print md:hidden">
                          {savingRotationId === `${galleryInspection.id}-before-${idx}` ? (
                            <span className="text-[9px] text-orange-500 font-bold animate-pulse">
                              Salvando rotação...
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleRotatePhoto(galleryInspection, "before", idx, "left")}
                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold rounded flex items-center gap-0.5"
                              >
                                ↺ Esq
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRotatePhoto(galleryInspection, "before", idx, "right")}
                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold rounded flex items-center gap-0.5"
                              >
                                ↻ Dir
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {galleryInspection.fotosAntes.length === 0 && (
                    <p className="text-[11px] text-gray-400 font-medium italic text-center py-6 col-span-2">
                      Sem registros fotográficos do desvio antes.
                    </p>
                  )}
                </div>
              </div>

              {/* Depois Container */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-extrabold text-green-600 uppercase tracking-widest text-center">
                  Evidências - Depois da Tratativa
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {galleryInspection.fotosDepois.map((img, idx) => (
                    <div key={idx} className="flex flex-col items-center w-full">
                      <div className="aspect-video rounded border overflow-hidden bg-gray-50 relative group w-full">
                        <ResolvedImage
                          src={img}
                          rotation={galleryInspection.rotacoesFotosDepois ? galleryInspection.rotacoesFotosDepois[idx] || 0 : 0}
                          alt="Depois"
                          className="w-full h-full object-cover"
                        />
                        {/* Desktop hover controls */}
                        {currentUser?.perfil !== "visitante" && (
                          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 no-print p-2">
                            {savingRotationId === `${galleryInspection.id}-after-${idx}` ? (
                              <span className="text-[10px] text-white font-extrabold animate-pulse bg-black/50 px-2 py-1 rounded">
                                Salvando rotação...
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRotatePhoto(galleryInspection, "after", idx, "left")}
                                  className="p-1.5 bg-white/90 hover:bg-white text-gray-800 rounded-full shadow hover:scale-110 transition cursor-pointer flex items-center justify-center"
                                  title="Girar para esquerda"
                                >
                                  <span className="text-sm font-bold">↺</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRotatePhoto(galleryInspection, "after", idx, "right")}
                                  className="p-1.5 bg-white/90 hover:bg-white text-gray-800 rounded-full shadow hover:scale-110 transition cursor-pointer flex items-center justify-center"
                                  title="Girar para direita"
                                >
                                  <span className="text-sm font-bold">↻</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Mobile persistent controls */}
                      {currentUser?.perfil !== "visitante" && (
                        <div className="flex items-center gap-2 mt-1.5 no-print md:hidden">
                          {savingRotationId === `${galleryInspection.id}-after-${idx}` ? (
                            <span className="text-[9px] text-orange-500 font-bold animate-pulse">
                              Salvando rotação...
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleRotatePhoto(galleryInspection, "after", idx, "left")}
                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold rounded flex items-center gap-0.5"
                              >
                                ↺ Esq
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRotatePhoto(galleryInspection, "after", idx, "right")}
                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold rounded flex items-center gap-0.5"
                              >
                                ↻ Dir
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {galleryInspection.fotosDepois.length === 0 && (
                    <p className="text-[11px] text-gray-400 font-medium italic text-center py-6 col-span-2">
                      Sem registros fotográficos pós tratativa (Ação Corretiva).
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-gray-100">
              <button
                onClick={() => setGalleryInspection(null)}
                className="px-5 py-2 bg-[#0B2E59] text-white text-xs font-black rounded-lg cursor-pointer"
              >
                Fechar Galeria
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRMAR EXCLUSÃO MODAL --- */}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-100 animate-scale-up">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <AlertTriangle className="text-red-500 shrink-0" size={20} />
              <h3 className="font-extrabold text-base text-[#0B2E59] tracking-tight">
                Confirmar exclusão
              </h3>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Tem certeza que deseja excluir esta inspeção? Esta ação não poderá ser desfeita.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-50">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  onDelete(deleteTargetId);
                  setDeleteTargetId(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-sm"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
