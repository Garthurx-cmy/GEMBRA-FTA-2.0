import { getNormalizedInspectionDate, getOperationalDateKey } from "../utils/inspectionUtils";
import { supervisorMatchesId } from "../utils/supervisors";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { auth } from "../services/firebase";
import { isOperationalRole } from "../utils/supervisors";
import {
  Potential,
  InspectionStatus,
  Inspection,
  InspectionDraft,
  Supervisor,
  Area,
  Contract,
  SystemConfig,
  UserProfile,
  getTipoLancamento,
  TIPO_LANCAMENTO_CONFIG,
  GrupoContrato
} from "../types";
import { getGrupoContratoPorLocalidade } from "../utils/operational";
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
  UploadCloud,
  History,
  Trash2,
  RefreshCw
} from "lucide-react";
import { convertHeicFileToJpegDataUrl } from "../utils/heicHelper";
import {
  saveInspectionDraft,
  getInspectionDraft,
  deleteInspectionDraft
} from "../utils/draftStorage";
import { dbService } from "../services/db";
import { normalizeText } from "../utils/supervisors";


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

function getBase64Size(dataUrl: string): number {
  if (!dataUrl || !dataUrl.includes(",")) return 0;
  const commaIndex = dataUrl.indexOf(",");
  const base64Str = dataUrl.substring(commaIndex + 1);
  const padding = base64Str.endsWith("==") ? 2 : base64Str.endsWith("=") ? 1 : 0;
  return (base64Str.length * 3) / 4 - padding;
}

async function compressImage(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      const maxDim = 800;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.45;
      let compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
      const maxSizeBytes = 90 * 1024; // 90 KB

      while (getBase64Size(compressedDataUrl) > maxSizeBytes && quality > 0.05) {
        quality -= 0.05;
        compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
      }

      resolve(compressedDataUrl);
    };

    img.onerror = (err) => {
      reject(err);
    };

    img.src = dataUrl;
  });
}

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

  // Validation alerts and processing states
  type SubmitState = "idle" | "validating" | "saving" | "saved" | "error";
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [compressingStatus, setCompressingStatus] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [lastSavedDraftTime, setLastSavedDraftTime] = useState<string | null>(null);

  const draftRef = useRef<InspectionDraft | null>(null);
  const suppressed = useRef(false);
  const submissionSucceededRef = useRef(false);
  const submitLock = useRef(false);
  const recordId = useRef("");
  const mounted = useRef(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const [readyScope, setReadyScope] = useState("");
  const [resetVersion, setResetVersion] = useState(0);
  const [draftError, setDraftError] = useState("");
  const userId = currentUser?.id || "anon";
  const editId = editingInspection?.id;
  const scope = `${userId}:${editId || "new"}:${resetVersion}`;

  // Initialize only this user/record. Live directory snapshots must not reset fields.
  useEffect(() => {
    let cancelled = false;
    setReadyScope("");
    suppressed.current = false;
    submissionSucceededRef.current = false;
    getInspectionDraft(userId, editId).then(draft => {
      if (cancelled) return;
      const currentSupervisor = supervisors.find(s => supervisorMatchesId(s, currentUser?.id) ||
        (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email.toLowerCase()));
      const original = editingInspection;
      const source = draft || original;
      recordId.current = original?.id || draft?.pendingDocumentId || draft?.id || dbService.createPendingInspectionId();
      setData(getNormalizedInspectionDate(source?.data) || getOperationalDateKey());
      setSupervisorId(source?.supervisorId || currentSupervisor?.id || (isOperationalRole(currentUser?.perfil) ? userId : ""));
      setAreaId(source?.areaId || areas[0]?.id || "");
      setContratoId(source?.contratoId || contracts[0]?.id || "");
      const selectedType = source ? getTipoLancamento(source.atividade, source.tipo, source.tipoLancamento) : "DSS";
      setAtividade(selectedType); setTipo(selectedType);
      setPotencial(source?.potencial || Potential.LEVE);
      setDescricao(source?.descricao || ""); setAcaoCorretiva(source?.acaoCorretiva || "");
      setResponsavel(source?.responsavel || ""); setPrazo(getNormalizedInspectionDate(source?.prazo) || getOperationalDateKey());
      setStatus(source?.status || InspectionStatus.ABERTO); setObservacoes(source?.observacoes || "");
      setFotosAntes(source?.fotosAntes || []); setFotosDepois(source?.fotosDepois || []);
      setTemaDSS(source?.temaDSS || ""); setQuantidadeParticipantes(source?.quantidadeParticipantes ?? "");
      setDataConclusao(getNormalizedInspectionDate(source?.dataConclusao) || "");
      setDraftRestored(!!draft); setReadyScope(scope);
      if (draft?.scrollTop) requestAnimationFrame(() => {
        if (!cancelled) { const main = document.querySelector("main"); if (main) main.scrollTop = draft.scrollTop!; }
      });
    }).catch(() => { if (!cancelled) setDraftError("Não foi possível recuperar o rascunho. Não limpe o armazenamento do navegador."); });
    return () => { cancelled = true; };
  }, [scope]);

  if (readyScope === scope) {
    const currentSupName = supervisors.find(s => supervisorMatchesId(s, supervisorId))?.nome;
    const currentAreaName = areas.find(a => a.id === areaId)?.nome;
    const currentContrato = contracts.find(c => c.id === contratoId);
    const currentContratoNome = currentContrato?.nome || (currentContrato?.codigo ? `${currentContrato.codigo}` : undefined);
    draftRef.current = {
      id: recordId.current,
      pendingDocumentId: recordId.current,
      data,
      supervisorId,
      supervisorNome: currentSupName,
      areaId,
      areaNome: currentAreaName,
      contratoId,
      contratoNome: currentContratoNome,
      grupoContrato: getGrupoContratoPorLocalidade(areaId, areas, contracts),
      atividade,
      tipo,
      tipoLancamento: getTipoLancamento(atividade, tipo),
      potencial,
      descricao,
      acaoCorretiva,
      responsavel,
      prazo,
      status,
      observacoes,
      fotosAntes,
      fotosDepois,
      temaDSS,
      quantidadeParticipantes,
      dataConclusao,
      scrollTop: draftRef.current?.scrollTop || 0
    };
  }
  const persistDraft = () => {
    if (submissionSucceededRef.current || suppressed.current || readyScope !== scope || !draftRef.current) return;
    void saveInspectionDraft(userId, draftRef.current, editId).then(() => {
      if (mounted.current && !submissionSucceededRef.current) {
        setDraftError("");
        setLastSavedDraftTime(new Date().toLocaleTimeString("pt-BR"));
      }
    }).catch(() => {
      if (mounted.current && !submissionSucceededRef.current) {
        setDraftError("Não foi possível salvar o rascunho neste dispositivo. Mantenha esta tela aberta.");
      }
    });
  };
  const persistRef = useRef(persistDraft);
  persistRef.current = persistDraft;

  useEffect(() => {
    if (submissionSucceededRef.current || readyScope !== scope || suppressed.current) return;
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      if (!submissionSucceededRef.current && !suppressed.current) {
        persistRef.current();
      }
    }, 400);
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [
    readyScope, scope, data, supervisorId, areaId, contratoId, atividade, tipo, potencial,
    descricao, acaoCorretiva, responsavel, prazo, status, observacoes, fotosAntes, fotosDepois,
    temaDSS, quantidadeParticipantes, dataConclusao
  ]);

  useEffect(() => {
    mounted.current = true;
    submissionSucceededRef.current = false;
    const flush = () => {
      if (!submissionSucceededRef.current && !suppressed.current) {
        persistRef.current();
      }
    };
    const hide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const main = document.querySelector("main");
    const scroll = () => {
      if (draftRef.current) draftRef.current.scrollTop = main?.scrollTop || 0;
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hide);
    main?.addEventListener("scroll", scroll, { passive: true });
    return () => {
      mounted.current = false;
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hide);
      main?.removeEventListener("scroll", scroll);
    };
  }, []);

  const handleDiscardDraft = async () => {
    if (!window.confirm("Descartar o preenchimento deste formulário? A inspeção gravada no banco não será apagada.")) return;
    suppressed.current = true;
    try {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      await deleteInspectionDraft(userId, editId);
      draftRef.current = null;
      setLastSavedDraftTime(null);
      setDraftRestored(false);
      recordId.current = dbService.createPendingInspectionId();
      setResetVersion(value => value + 1);
    } catch {
      suppressed.current = false;
      setDraftError("Não foi possível descartar o rascunho.");
    }
  };

  // Resolve matching label for select element
  const getSelectedValue = () => {
    return getTipoLancamento(atividade, tipo);
  };

  // Handle Photo uploads (convert files to base64 strings with on-the-fly progressive compression)
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
    
    setCompressingStatus("Processando imagens...");
    setError("");

    let processedCount = 0;
    fileList.forEach(async (file) => {
      try {
        let originalDataUrl = "";
        const isHeicFile = file.type === "image/heic" || file.type === "image/heif" || file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif");

        if (isHeicFile) {
          setCompressingStatus("Convertendo HEIC para JPEG...");
          originalDataUrl = await convertHeicFileToJpegDataUrl(file);
        } else {
          originalDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === "string") {
                resolve(reader.result);
              } else {
                reject(new Error("Erro ao ler arquivo."));
              }
            };
            reader.onerror = () => reject(reader.error || new Error("Erro ao ler arquivo."));
            reader.readAsDataURL(file);
          });
        }

        setCompressingStatus("Comprimindo imagens...");
        const compressed = await compressImage(originalDataUrl);

        if (type === "before") {
          setFotosAntes((prev) => {
            const updated = [...prev, compressed];
            return updated.slice(0, 3);
          });
        } else {
          setFotosDepois((prev) => {
            const updated = [...prev, compressed];
            return updated.slice(0, 3);
          });
        }
      } catch (err) {
        console.error("Erro ao processar imagem:", err);
        setError("Não foi possível processar esta foto.");
      } finally {
        processedCount++;
        if (processedCount === fileList.length) {
          setCompressingStatus("");
        }
      }
    });
    e.target.value = "";
  };

  const removePhoto = (index: number, type: "before" | "after") => {
    if (type === "before") {
      setFotosAntes((prev) => prev.filter((_, idx) => idx !== index));
    } else {
      setFotosDepois((prev) => prev.filter((_, idx) => idx !== index));
    }
  };

  // Save/Submit Form handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current || submitState === "saving" || submitState === "validating" || readyScope !== scope) {
      console.warn("[Envio Inspeção] Tentativa ignorada: envio já em andamento.");
      return;
    }

    submitLock.current = true;
    setIsSaving(true);
    setSubmitState("validating");
    setError("");

    try {
      // 1. iniciarEnvio()
      const authUid = currentUser?.id || auth?.currentUser?.uid || "";
      const perfilNormalizado = currentUser?.perfil ? normalizeText(currentUser.perfil) : "desconhecido";
      const grupoPermitido = (currentUser?.gruposContratoPermitidos || ["vli"]).join(", ");

      console.log("[Envio Inspeção] Etapa: iniciarEnvio", {
        uid: authUid,
        perfilNormalizado,
        grupoContratoPermitido: grupoPermitido,
        banco: "ai-studio-gembafta-570b0537-aea6-4a55-ac2a-d81d9f8cc2d0",
        documentIdPlanejado: recordId.current
      });

      const currentLaunchType = getSelectedValue();
      const isDSS = currentLaunchType === "DSS";
      const isPresenca = currentLaunchType === "Presença em Campo";

      // 2. validarFormulario()
      if (!data) throw new Error("Por favor, preencha a data.");
      if (!supervisorId) throw new Error("Selecione o supervisor responsável.");
      if (!areaId) throw new Error("Selecione a área operacional.");
      if (!contratoId) throw new Error("Selecione o contrato associado.");

      if (isPresenca) {
        if (quantidadeParticipantes === "" || Number(quantidadeParticipantes) <= 0) {
          throw new Error("Por favor, insira a quantidade de participantes abordados (maior que zero).");
        }
        if (!descricao.trim()) throw new Error("Por favor, forneça uma descrição detalhada da Presença em Campo.");
      } else if (isDSS) {
        if (!temaDSS.trim()) throw new Error("Por favor, preencha o Tema do DSS.");
        if (quantidadeParticipantes === "" || Number(quantidadeParticipantes) <= 0) {
          throw new Error("Por favor, insira a quantidade de participantes (maior que zero).");
        }
        if (!descricao.trim()) throw new Error("Por favor, forneça uma descrição detalhada do DSS.");
      } else {
        if (!descricao.trim()) throw new Error("Por favor, forneça uma descrição detalhada do desvio.");
        if (!acaoCorretiva.trim()) throw new Error("Por favor, defina a ação corretiva recomendada/realizada.");
        if (!responsavel.trim()) throw new Error("Identifique o colaborador responsável pela ação.");
        if (status === InspectionStatus.CONCLUIDO) {
          if (!dataConclusao) throw new Error("A data de conclusão é obrigatória para concluir a inspeção.");
        } else {
          if (!prazo) throw new Error("Defina o prazo limite para a conclusão da tratativa.");
        }
      }

      // Validate total photo sizes (maximum of 650 KB)
      const totalPhotosSize = [...fotosAntes, ...fotosDepois].reduce((sum, img) => sum + getBase64Size(img), 0);
      const maxPhotosSizeBytes = 650 * 1024;
      if (totalPhotosSize > maxPhotosSizeBytes) {
        throw new Error(`O tamanho total das fotos (${(totalPhotosSize / 1024).toFixed(1)} KB) excede o limite máximo permitido de 650 KB por inspeção. Por favor, remova alguma foto.`);
      }

      const selectedSupervisor = supervisors.find(s => supervisorMatchesId(s, supervisorId));
      const selectedArea = areas.find((area) => area.id === areaId);
      const canonicalGroup = getGrupoContratoPorLocalidade(selectedArea || areaId, areas, contracts);
      if (!canonicalGroup) {
        throw new Error("Não foi possível identificar se a área selecionada pertence à Vale ou à VLI. Atualize o cadastro da localidade antes de salvar.");
      }
      const selectedContract = contracts.find((contract) => contract.id === contratoId);
      if (
        selectedContract?.grupoContrato &&
        selectedContract.grupoContrato !== canonicalGroup
      ) {
        throw new Error("A área e o contrato selecionados pertencem a grupos diferentes. Corrija a seleção antes de salvar.");
      }

      // 3. montarPayloadSeguro()
      const uid = editingInspection ? (editingInspection.criadoPorUid || editingInspection.createdBy) : authUid;
      const nome = editingInspection ? editingInspection.criadoPorNome : (currentUser?.nome || auth?.currentUser?.displayName || "Usuário");
      const email = editingInspection ? editingInspection.criadoPorEmail : (currentUser?.email || auth?.currentUser?.email || "");

      const finalInspection: Inspection = {
        ...editingInspection,
        id: editingInspection?.id || recordId.current,
        data: editingInspection && data === getNormalizedInspectionDate(editingInspection.data) ? editingInspection.data : data,
        supervisorNome: selectedSupervisor?.nome || editingInspection?.supervisorNome,
        supervisorEmail: selectedSupervisor?.email || editingInspection?.supervisorEmail,
        supervisorId,
        areaId,
        areaNome: selectedArea?.nome || (editingInspection as any)?.areaNome,
        contratoId,
        contratoNome: selectedContract?.nome || (selectedContract?.codigo ? `${selectedContract.codigo}` : (editingInspection as any)?.contratoNome),
        grupoContrato: canonicalGroup,
        tipoLancamento: currentLaunchType,
        tipo: currentLaunchType,
        atividade: currentLaunchType,
        createdBy: uid,
        criadoPorUid: uid,
        criadoPorNome: nome,
        criadoPorEmail: email,
        potencial: (isDSS || isPresenca) ? Potential.LEVE : potencial,
        descricao,
        acaoCorretiva: isPresenca ? "Presença em campo registrada" : (isDSS ? "Realizado DSS em campo" : acaoCorretiva),
        responsavel: (isDSS || isPresenca) ? (selectedSupervisor?.nome || editingInspection?.supervisorNome || "Supervisor") : responsavel,
        prazo: (isDSS || isPresenca) ? data : prazo,
        status: (isDSS || isPresenca) ? InspectionStatus.CONCLUIDO : status,
        observacoes: observacoes || null,
        fotosAntes,
        fotosDepois: (isDSS || isPresenca) ? [] : fotosDepois,
        rotacoesFotosAntes: editingInspection?.rotacoesFotosAntes || [],
        rotacoesFotosDepois: editingInspection?.rotacoesFotosDepois || [],
        armazenamentoFotos: "firestore-inline",
        temaDSS: isDSS ? temaDSS : null,
        quantidadeParticipantes: (isDSS || isPresenca) ? Number(quantidadeParticipantes) : null,
        dataConclusao: (!isDSS && !isPresenca && status === InspectionStatus.CONCLUIDO) ? dataConclusao : null,
        createdAt: editingInspection?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Validate Firestore 1 MiB limit
      const serializedDoc = JSON.stringify(finalInspection);
      const docSizeBytes = new TextEncoder().encode(serializedDoc).byteLength;
      const oneMiB = 1024 * 1024;
      if (docSizeBytes > oneMiB) {
        throw new Error("As fotos ultrapassaram o limite permitido. Remova uma foto ou escolha imagens menores.");
      }

      // 4. salvarInspecaoPrincipal() e 5. confirmarDocumento()
      setSubmitState("saving");
      console.log("[Envio Inspeção] Etapa: salvarInspecaoPrincipal", {
        documentId: finalInspection.id,
        grupoContrato: finalInspection.grupoContrato
      });

      await onSave(finalInspection);

      console.log("[Envio Inspeção] Etapa: confirmarDocumento - Sucesso", {
        documentId: finalInspection.id
      });

      // 6. concluirEnvio()
      setSubmitState("saved");
      submissionSucceededRef.current = true;

      // 7. cancelarAutosavePendente()
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      suppressed.current = true;

      // 8. removerRascunhoDoUsuario()
      try {
        await deleteInspectionDraft(userId, editId);
      } catch (delErr) {
        console.warn("[Envio Inspeção] Aviso: erro não impeditivo ao remover rascunho:", delErr);
      }

      // 9. resetarFormulario()
      setDraftRestored(false);
      setLastSavedDraftTime(null);
      draftRef.current = null;

      // 10. limparPendingDocumentId()
      recordId.current = dbService.createPendingInspectionId();

      // 11. Navegar sem erros
      if (mounted.current) {
        onCancel();
      }
    } catch (err: any) {
      setSubmitState("error");
      submissionSucceededRef.current = false;
      console.error("[Envio Inspeção] Falha no processo de envio:", {
        code: err?.code,
        message: err?.message,
        stack: err?.stack,
        uid: currentUser?.id,
        banco: "ai-studio-gembafta-570b0537-aea6-4a55-ac2a-d81d9f8cc2d0",
        documentIdPlanejado: recordId.current
      });
      setError(err?.message || "Erro ao salvar a inspeção. O rascunho foi mantido com segurança para nova tentativa.");
    } finally {
      submitLock.current = false;
      if (mounted.current && submitState !== "saved") {
        setIsSaving(false);
        setSubmitState("idle");
      }
    }
  };

  const currentLaunchType = getSelectedValue();
  const isDSS = currentLaunchType === "DSS";
  const isPresenca = currentLaunchType === "Presença em Campo";

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header Back Block */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            disabled={isSaving}
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

        {/* Auto-save status indicator */}
        {lastSavedDraftTime && (
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Rascunho salvo às {lastSavedDraftTime}
          </div>
        )}
      </div>

      {/* DRAFT RESTORED ALERT BANNER */}
      {draftRestored && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-semibold flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <History size={16} className="text-[#F58220] shrink-0" />
            <div>
              <span className="font-extrabold block">Rascunho recuperado automaticamente</span>
              <span className="text-[11px] text-amber-700">Seus dados preenchidos anteriormente foram restaurados no formulário.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDiscardDraft}
            disabled={isSaving}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-extrabold text-red-700 bg-white hover:bg-red-50 border border-red-200 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <Trash2 size={12} /> Descartar rascunho
          </button>
        </div>
      )}

      {/* ERROR BOX */}
      {error && (
        <div
          id="inspection-submit-error-banner"
          role="alert"
          className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium space-y-2 shadow-2xs animate-fade-in"
        >
          <div className="flex items-center gap-2 font-bold text-red-900">
            <AlertTriangle size={16} className="text-red-600 shrink-0" />
            <span>Não foi possível concluir o registro da inspeção</span>
          </div>
          <p className="pl-6 text-red-700 leading-relaxed">{error}</p>
          <div className="pl-6 flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setError("");
                handleSubmit({ preventDefault: () => {} } as any);
              }}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={12} />
              Tentar novamente
            </button>
            <span className="text-[11px] text-red-600">Seu preenchimento e rascunho foram mantidos com segurança.</span>
          </div>
        </div>
      )}

      {draftError && <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{draftError}</div>}
      {readyScope !== scope && <p role="status">Recuperando formulário…</p>}
      {/* MAIN FORM */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
        <fieldset disabled={readyScope !== scope || isSaving} className="space-y-6">
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
                disabled={
                  currentUser &&
                  isOperationalRole(currentUser.perfil) &&
                  currentUser.perfil !== "Administrador" &&
                  currentUser.perfil !== "Desenvolvedor/Admin" &&
                  currentUser.perfil !== "Gestor" &&
                  currentUser.perfil !== "ADMINISTRADOR" &&
                  currentUser.perfil !== "DESENVOLVEDOR/ADMIN" &&
                  currentUser.perfil !== "GESTOR" &&
                  !!supervisorId
                }
                className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">Selecione...</option>
                {supervisorId && !supervisors.some(s => s.id === supervisorId) && (
                  <option value={supervisorId}>{supervisors.find(s => supervisorMatchesId(s, supervisorId))?.nome || editingInspection?.supervisorNome || "Responsável histórico — vínculo preservado"}</option>
                )}
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
        <div className="inspection-actions border-t border-gray-100 pt-5 flex flex-col gap-3">
          {error && (
            <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-700 text-xs font-semibold flex items-center justify-between gap-3 self-end max-w-xl">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0 animate-pulse" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  handleSubmit({ preventDefault: () => {} } as any);
                }}
                disabled={isSaving}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold rounded cursor-pointer shrink-0"
              >
                <RefreshCw size={11} /> Tentar novamente
              </button>
            </div>
          )}
          {compressingStatus && (
            <div className="p-2 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg text-blue-700 text-xs font-semibold flex items-center gap-2 self-end">
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-700"></div>
              <span>{compressingStatus}</span>
            </div>
          )}
          <div className="flex items-center justify-end gap-3.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg border border-gray-200 shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || submitLock.current || !!compressingStatus}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-[#0B2E59] hover:bg-[#133e72] text-white text-xs font-black rounded-lg shadow shadow-blue-500/10 cursor-pointer disabled:opacity-50"
            >
              {submitState === "validating" ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                  Validando dados...
                </>
              ) : submitState === "saving" ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                  Registrando no banco...
                </>
              ) : submitState === "saved" ? (
                <>
                  <CheckCircle size={14} className="text-emerald-400" />
                  Salvo com sucesso!
                </>
              ) : (
                <>
                  <Save size={14} /> {editingInspection ? "Salvar Alterações" : "Registrar GEMBA"}
                </>
              )}
            </button>
          </div>
        </div>
        </fieldset>
      </form>
    </div>
  );
}
