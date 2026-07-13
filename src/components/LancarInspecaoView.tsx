/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Potential,
  InspectionStatus,
  Inspection,
  Supervisor,
  Area,
  Contract,
  SystemConfig,
  UserProfile,
  getTipoLancamento,
  TIPO_LANCAMENTO_CONFIG
} from "../types";
import {
  Save,
  Camera,
  Calendar,
  AlertTriangle,
  FileText,
  User,
  CheckCircle,
  ArrowLeft,
  X,
  UploadCloud
} from "lucide-react";

interface LancarInspecaoViewProps {
  supervisors: Supervisor[];
  areas: Area[];
  contracts: Contract[];
  config: SystemConfig;
  editingInspection: Inspection | null;
  onSave: (inspection: Inspection) => Promise<void> | void;
  onCancel: () => void;
  currentUser?: UserProfile | null;
}

const TIPO_LANCAMENTO_OPTIONS = Object.keys(TIPO_LANCAMENTO_CONFIG);

export default function LancarInspecaoView({
  supervisors,
  areas,
  contracts,
  config,
  editingInspection,
  onSave,
  onCancel,
  currentUser
}: LancarInspecaoViewProps) {
  // --- FORM STATES ---
  const [data, setData] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [contratoId, setContratoId] = useState("");
  const [atividade, setAtividade] = useState("");
  const [tipo, setTipo] = useState("");
  const [potencial, setPotencial] = useState<Potential>(Potential.LEVE);
  const [descricao, setDescricao] = useState("");
  const [acaoCorretiva, setAcaoCorretiva] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [prazo, setPrazo] = useState("");
  const [status, setStatus] = useState<InspectionStatus>(InspectionStatus.ABERTO);
  const [observacoes, setObservacoes] = useState("");
  const [temaDSS, setTemaDSS] = useState("");
  const [quantidadeParticipantes, setQuantidadeParticipantes] = useState<number | "">("");
  const [dataConclusao, setDataConclusao] = useState("");

  // Base64 lists for photo attachments
  const [fotosAntes, setFotosAntes] = useState<string[]>([]);
  const [fotosDepois, setFotosDepois] = useState<string[]>([]);

  // Validation alerts
  const [error, setError] = useState("");

  // Load editing inspection data if provided
  useEffect(() => {
    if (editingInspection) {
      setData(editingInspection.data);
      setSupervisorId(editingInspection.supervisorId);
      setAreaId(editingInspection.areaId);
      setContratoId(editingInspection.contratoId);
      setAtividade(editingInspection.atividade);
      setTipo(editingInspection.tipo);
      setPotencial(editingInspection.potencial);
      setDescricao(editingInspection.descricao);
      setAcaoCorretiva(editingInspection.acaoCorretiva);
      setResponsavel(editingInspection.responsavel);
      setPrazo(editingInspection.prazo);
      setStatus(editingInspection.status);
      setObservacoes(editingInspection.observacoes || "");
      setFotosAntes(editingInspection.fotosAntes || []);
      setFotosDepois(editingInspection.fotosDepois || []);
      setTemaDSS(editingInspection.temaDSS || "");
      setQuantidadeParticipantes(editingInspection.quantidadeParticipantes ?? "");
      setDataConclusao(editingInspection.dataConclusao || "");
    } else {
      // Set defaults for new inspection
      setData(new Date().toISOString().split("T")[0]);
      
      // If user is a Supervisor, try to pre-select them
      let initialSupId = supervisors[0]?.id || "";
      if (currentUser) {
        const matchedSup = supervisors.find(
          (s) => s.email?.trim().toLowerCase() === currentUser.email.trim().toLowerCase()
        );
        if (matchedSup) {
          initialSupId = matchedSup.id;
        }
      }
      setSupervisorId(initialSupId);
      
      setAreaId(areas[0]?.id || "");
      setContratoId(contracts[0]?.id || "");
      
      setAtividade("DSS");
      setTipo("DSS");
      
      setPotencial(Potential.LEVE);
      setDescricao("");
      setAcaoCorretiva("");
      setResponsavel("");
      setPrazo(new Date().toISOString().split("T")[0]);
      setStatus(InspectionStatus.ABERTO);
      setObservacoes("");
      setFotosAntes([]);
      setFotosDepois([]);
      setTemaDSS("");
      setQuantidadeParticipantes("");
      setDataConclusao("");
    }
  }, [editingInspection, supervisors, areas, contracts, config, currentUser]);

  // Resolve matching label for select element
  const getSelectedValue = () => {
    return getTipoLancamento(atividade, tipo);
  };

  // Handle Photo uploads (convert files to base64 strings)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "before" | "after") => {
    const files = e.target.files;
    if (!files) return;

    const existingCount = type === "before" ? fotosAntes.length : fotosDepois.length;
    const remaining = Math.max(0, 3 - existingCount);
    if (remaining === 0) {
      alert("O limite é de 3 fotos por seção.");
      e.target.value = "";
      return;
    }
    const fileList = (Array.from(files) as File[]).slice(0, remaining);
    if (files.length > remaining) alert(`Somente ${remaining} foto(s) adicional(is) serão anexadas.`);
    fileList.forEach((file) => {
      // Limit file size to 2MB for base64 storage limits safely
      if (file.size > 5 * 1024 * 1024) {
        alert(`O arquivo ${file.name} excede o limite de 5MB para upload.`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          const resultString = reader.result;
          if (type === "before") {
            setFotosAntes((prev) => [...prev, resultString]);
          } else {
            setFotosDepois((prev) => [...prev, resultString]);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number, type: "before" | "after") => {
    if (type === "before") {
      setFotosAntes((prev) => prev.filter((_, idx) => idx !== index));
    } else {
      setFotosDepois((prev) => prev.filter((_, idx) => idx !== index));
    }
  };

  // Save/Submit Form handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const currentLaunchType = getSelectedValue();
    const isDSS = currentLaunchType === "DSS";
    const isPresenca = currentLaunchType === "Presença em Campo";

    // Validations
    if (!data) return setError("Por favor, preencha a data.");
    if (!supervisorId) return setError("Selecione o supervisor responsável.");
    if (!areaId) return setError("Selecione a área operacional.");
    if (!contratoId) return setError("Selecione o contrato associado.");

    if (isPresenca) {
      if (quantidadeParticipantes === "" || Number(quantidadeParticipantes) <= 0) {
        return setError("Por favor, insira a quantidade de participantes abordados (maior que zero).");
      }
      if (!descricao.trim()) return setError("Por favor, forneça uma descrição detalhada da Presença em Campo.");
    } else if (isDSS) {
      if (!temaDSS.trim()) return setError("Por favor, preencha o Tema do DSS.");
      if (quantidadeParticipantes === "" || Number(quantidadeParticipantes) <= 0) {
        return setError("Por favor, insira a quantidade de participantes (maior que zero).");
      }
      if (!descricao.trim()) return setError("Por favor, forneça uma descrição detalhada do DSS.");
    } else {
      if (!descricao.trim()) return setError("Por favor, forneça uma descrição detalhada do desvio.");
      if (!acaoCorretiva.trim()) return setError("Por favor, defina a ação corretiva recomendada/realizada.");
      if (!responsavel.trim()) return setError("Identifique o colaborador responsável pela ação.");
      if (status === InspectionStatus.CONCLUIDO) {
        if (!dataConclusao) return setError("A data de conclusão é obrigatória para concluir a inspeção.");
      } else {
        if (!prazo) return setError("Defina o prazo limite para a conclusão da tratativa.");
      }
    }

    const finalInspection: Inspection = {
      id: editingInspection?.id || "insp_" + Math.random().toString(36).substring(2, 9),
      data,
      supervisorId,
      areaId,
      contratoId,
      atividade: isPresenca ? "Presença em Campo" : atividade,
      tipo: isPresenca ? "Presença em Campo" : tipo,
      potencial: (isDSS || isPresenca) ? Potential.LEVE : potencial,
      descricao,
      acaoCorretiva: isPresenca ? "Presença em campo registrada" : (isDSS ? "Realizado DSS em campo" : acaoCorretiva),
      responsavel: (isDSS || isPresenca) ? (supervisors.find(s => s.id === supervisorId)?.nome || "Supervisor") : responsavel,
      prazo: (isDSS || isPresenca) ? data : prazo,
      status: (isDSS || isPresenca) ? InspectionStatus.CONCLUIDO : status,
      observacoes,
      fotosAntes,
      fotosDepois: (isDSS || isPresenca) ? [] : fotosDepois,
      temaDSS: isDSS ? temaDSS : undefined,
      quantidadeParticipantes: (isDSS || isPresenca) ? Number(quantidadeParticipantes) : undefined,
      dataConclusao: (!isDSS && !isPresenca && status === InspectionStatus.CONCLUIDO) ? dataConclusao : undefined,
      createdAt: editingInspection?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSave(finalInspection);
  };

  const currentLaunchType = getSelectedValue();
  const isDSS = currentLaunchType === "DSS";
  const isPresenca = currentLaunchType === "Presença em Campo";

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header Back Block */}
      <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-[#0B2E59]">
            {editingInspection ? "Editar Registro de Inspeção" : "Lançar Nova Inspeção GEMBA"}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Preencha todos os dados abaixo para registrar auditorias e ocorrências de campo.
          </p>
        </div>
      </div>

      {/* ERROR BOX */}
      {error && (
        <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-700 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0" /> {error}
        </div>
      )}

      {/* MAIN FORM */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
        {/* Section 1: Dados Gerais */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
            <FileText size={16} className="text-[#F58220]" />
            <span className="text-xs font-bold text-[#0B2E59] uppercase tracking-wider">Dados Gerais</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Data */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-600 flex items-center gap-1">
                <Calendar size={12} /> Data da Inspeção <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
              />
            </div>

            {/* Supervisor */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-600">
                Supervisor Responsável <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                disabled={currentUser?.perfil === "Supervisor" && !!supervisorId}
                className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">Selecione...</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Área */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-600">
                Área de Atuação <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
              >
                <option value="">Selecione...</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Contrato */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-600">
                Contrato Associado <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={contratoId}
                onChange={(e) => setContratoId(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
              >
                <option value="">Selecione...</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} - {c.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* TIPO DE LANÇAMENTO dropdown */}
            <div className={`flex flex-col gap-1 ${(isDSS || isPresenca) ? "md:col-span-1" : "md:col-span-2"}`}>
              <label className="text-xs font-bold text-gray-600">
                TIPO DE LANÇAMENTO <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={getSelectedValue()}
                onChange={(e) => {
                  const val = e.target.value;
                  setAtividade(val);
                  setTipo(val);
                }}
                className={`text-xs font-bold border rounded-lg p-2.5 transition-colors focus:outline-none focus:ring-1 focus:ring-[#0B2E59] ${
                  getSelectedValue() && TIPO_LANCAMENTO_CONFIG[getSelectedValue()]
                    ? `${TIPO_LANCAMENTO_CONFIG[getSelectedValue()].bgClass} ${TIPO_LANCAMENTO_CONFIG[getSelectedValue()].textClass} ${TIPO_LANCAMENTO_CONFIG[getSelectedValue()].borderClass}`
                    : "bg-gray-50 border-gray-200 text-gray-700"
                }`}
              >
                <option value="" className="bg-white text-gray-700">Selecione...</option>
                {TIPO_LANCAMENTO_OPTIONS.map((opt) => (
                  <option key={opt} value={opt} className="bg-white text-gray-800 font-semibold">
                    {TIPO_LANCAMENTO_CONFIG[opt]?.icon} {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* If DSS, show Tema do DSS and Quantidade de participantes */}
            {isDSS && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-gray-600">
                    Tema do DSS <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Uso correto de EPIs"
                    value={temaDSS}
                    onChange={(e) => setTemaDSS(e.target.value)}
                    className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-gray-600">
                    Quantidade de Participantes <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="Ex: 10"
                    value={quantidadeParticipantes}
                    onChange={(e) => setQuantidadeParticipantes(e.target.value === "" ? "" : Number(e.target.value))}
                    className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                  />
                </div>
              </>
            )}

            {/* If Presença em Campo, show Quantidade de participantes abordados */}
            {isPresenca && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-600">
                  Participantes Abordados <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  placeholder="Ex: 5"
                  value={quantidadeParticipantes}
                  onChange={(e) => setQuantidadeParticipantes(e.target.value === "" ? "" : Number(e.target.value))}
                  className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Detalhes do Desvio / Diálogo / Presença */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
            <AlertTriangle size={16} className="text-[#F58220]" />
            <span className="text-xs font-bold text-[#0B2E59] uppercase tracking-wider">
              {isPresenca ? "Descrição da Presença em Campo" : (isDSS ? "Descrição do DSS" : "Descrição & Risco")}
            </span>
          </div>

          {!isDSS && !isPresenca && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Potencial */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-600">Potencial de Severidade</label>
                <select
                  value={potencial}
                  onChange={(e) => setPotencial(e.target.value as Potential)}
                  className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                >
                  {Object.values(Potential).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status da Tratativa */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-600">Status Inicial</label>
                <select
                  value={status}
                  onChange={(e) => {
                    const newStatus = e.target.value as InspectionStatus;
                    setStatus(newStatus);
                    if (newStatus === InspectionStatus.CONCLUIDO && !dataConclusao) {
                      setDataConclusao(new Date().toISOString().split("T")[0]);
                    }
                  }}
                  className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                >
                  {Object.values(InspectionStatus).map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Descricao */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-600">
              {isPresenca 
                ? "Descrição da Presença em Campo (Atividades observadas / alinhamentos)" 
                : (isDSS ? "Descrição Detalhada do DSS (Pautas e Alinhamentos)" : "Descrição do Desvio / Ocorrência Encontrada")
              } <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={isPresenca
                ? "Descreva detalhadamente o acompanhamento operacional feito em campo, orientações dadas aos colaboradores, etc..."
                : (isDSS ? "Insira o resumo do conteúdo abordado no diálogo de segurança, feedbacks, dúvidas levantadas pela equipe, etc..." : "Descreva detalhadamente o desvio físico, estrutural ou comportamento observado na auditoria GEMBA...")
              }
              className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] leading-relaxed"
            />
          </div>
        </div>

        {/* Section 3: Plano de Ação e Tratativa */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
            <CheckCircle size={16} className="text-[#F58220]" />
            <span className="text-xs font-bold text-[#0B2E59] uppercase tracking-wider">
              {isPresenca ? "Observações da Visita" : (isDSS ? "Observações" : "Ação Corretiva & Responsabilidades")}
            </span>
          </div>

          {!isDSS && !isPresenca ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-600">
                  Ação Corretiva Realizada ou Proposta <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={acaoCorretiva}
                  onChange={(e) => setAcaoCorretiva(e.target.value)}
                  placeholder="Descreva as medidas imediatas aplicadas ou o plano de ação detalhado para correção definitiva..."
                  className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Responsável */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-gray-600 flex items-center gap-1">
                    <User size={12} /> Responsável pela Tratativa <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Wagner / Equipe Elétrica"
                    value={responsavel}
                    onChange={(e) => setResponsavel(e.target.value)}
                    className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                  />
                </div>

                {/* Prazo ou Data de Conclusão */}
                {status === InspectionStatus.CONCLUIDO ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-600 flex items-center gap-1">
                      <Calendar size={12} /> Data de Conclusão <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={dataConclusao}
                      onChange={(e) => setDataConclusao(e.target.value)}
                      className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-600 flex items-center gap-1">
                      <Calendar size={12} /> Prazo de Conclusão <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={prazo}
                      onChange={(e) => setPrazo(e.target.value)}
                      className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                    />
                  </div>
                )}
              </div>
            </>
          ) : null}

          {/* Observacoes */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-600 flex items-center gap-1">
              Observações Gerais {(isDSS || isPresenca) ? "" : "(Opcional)"}
            </label>
            <textarea
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Outras informações complementares, notas adicionais..."
              className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
            />
          </div>
        </div>

        {/* Section 4: Fotos */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
            <Camera size={16} className="text-[#F58220]" />
            <span className="text-xs font-bold text-[#0B2E59] uppercase tracking-wider">
              {isPresenca ? "Registro Fotográfico" : (isDSS ? "Evidências do DSS" : "Evidências Fotográficas")}
            </span>
          </div>

          <div className={(isDSS || isPresenca) ? "max-w-xl mx-auto" : "grid grid-cols-1 md:grid-cols-2 gap-6"}>
            {/* Fotos ANTES */}
            <div className="space-y-3 p-4 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
              <div className="flex justify-between items-center">
                <span className="text-xs font-extrabold text-[#0B2E59]">
                  {isPresenca 
                    ? "FOTOS DA PRESENÇA EM CAMPO (OPCIONAL)" 
                    : (isDSS ? "EVIDÊNCIAS DO DSS (FOTOS DO DIÁLOGO)" : "FOTOS (ANTES DA TRATATIVA)")
                  }
                </span>
                <span className="text-[10px] text-gray-400 font-semibold">{fotosAntes.length} anexadas</span>
              </div>

              {/* Upload Input */}
              <div className="relative border-2 border-dashed border-gray-200 hover:border-[#0B2E59] transition-colors rounded-lg bg-white p-4 flex flex-col items-center justify-center cursor-pointer">
                <UploadCloud size={24} className="text-gray-400" />
                <span className="text-[10px] font-bold text-gray-500 mt-1">Clique para selecionar foto</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handlePhotoUpload(e, "before")}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>

              {/* Thumbnails list */}
              <div className="grid grid-cols-3 gap-2 mt-2">
                {fotosAntes.map((img, idx) => (
                  <div key={idx} className="relative aspect-video rounded border overflow-hidden group bg-gray-100">
                    <img src={img} alt="Antes" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx, "before")}
                      className="absolute top-1 right-1 p-1 bg-red-600 rounded-full text-white shadow hover:bg-red-700 transition"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Fotos DEPOIS */}
            {!isDSS && !isPresenca && (
              <div className="space-y-3 p-4 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-extrabold text-[#0B2E59]">FOTOS (DEPOIS DA TRATATIVA)</span>
                  <span className="text-[10px] text-gray-400 font-semibold">{fotosDepois.length} anexadas</span>
                </div>

                {/* Upload Input */}
                <div className="relative border-2 border-dashed border-gray-200 hover:border-[#0B2E59] transition-colors rounded-lg bg-white p-4 flex flex-col items-center justify-center cursor-pointer">
                  <UploadCloud size={24} className="text-gray-400" />
                  <span className="text-[10px] font-bold text-gray-500 mt-1">Clique para selecionar foto</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => handlePhotoUpload(e, "after")}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>

                {/* Thumbnails list */}
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {fotosDepois.map((img, idx) => (
                    <div key={idx} className="relative aspect-video rounded border overflow-hidden group bg-gray-100">
                      <img src={img} alt="Depois" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx, "after")}
                        className="absolute top-1 right-1 p-1 bg-red-600 rounded-full text-white shadow hover:bg-red-700 transition"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Buttons Action footer */}
        <div className="border-t border-gray-100 pt-5 flex items-center justify-end gap-3.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg border border-gray-200 shadow-sm transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex items-center gap-1.5 px-6 py-2.5 bg-[#0B2E59] hover:bg-[#133e72] text-white text-xs font-black rounded-lg shadow shadow-blue-500/10 cursor-pointer"
          >
            <Save size={14} /> Salvar Registro GEMBA
          </button>
        </div>
      </form>
    </div>
  );
}
