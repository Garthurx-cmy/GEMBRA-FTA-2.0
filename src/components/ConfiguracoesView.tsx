/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  Supervisor,
  Area,
  Contract,
  SystemConfig,
  UserProfile,
  ProcessoChecklist,
  GrupoContrato
} from "../types";
import {
  Settings,
  Users,
  MapPin,
  FileText,
  ShieldCheck,
  Building2,
  Database,
  Plus,
  Trash2,
  Save,
  CheckCircle,
  X,
  Upload,
  Download,
  RotateCcw,
  Sliders,
  Award,
  Pencil,
  PlusCircle,
  RefreshCw,
  AlertTriangle,
  Check,
  CheckSquare,
  Info,
  Sparkles,
  ShieldAlert,
  Eye,
  EyeOff
} from "lucide-react";
import { dbService } from "../services/db";
import { deveParticiparFarolGemba } from "../utils/operational";

interface ConfiguracoesViewProps {
  supervisors: Supervisor[];
  areas: Area[];
  contracts: Contract[];
  config: SystemConfig;
  users: UserProfile[];
  currentUser?: UserProfile | null;
  onRefreshDB: () => void;
}

export default function ConfiguracoesView({
  supervisors,
  areas,
  contracts,
  config,
  users,
  currentUser,
  onRefreshDB
}: ConfiguracoesViewProps) {
  // --- SUB TABS STATE ---
  const [activeSubTab, setActiveSubTab] = useState<"cadastros" | "seguranca" | "identidade" | "backup">("cadastros");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    type: "supervisor" | "area" | "contract" | "tipoInspecao" | "processo" | "user" | "authorizedEmail";
    displayLabel: string;
  } | null>(null);

  // --- STANDARDIZATION MODAL STATES ---
  const [standardizeLoading, setStandardizeLoading] = useState(false);
  const [standardizePreview, setStandardizePreview] = useState<{
    totalAnalyzed: number;
    toUpdate: Array<{
      id: string;
      email: string;
      nome: string;
      changes: string[];
      legacyFields: string[];
      canonicalValues: Record<string, any>;
    }>;
    alreadyStandard: number;
    missingNameOrEmail: Array<{ id: string; email: string; nome: string }>;
  } | null>(null);
  const [showStandardizeModal, setShowStandardizeModal] = useState(false);
  const [standardizeResult, setStandardizeResult] = useState<{
    totalAnalyzed: number;
    updatedCount: number;
    details: Array<{ id: string; email: string; nome: string; changes: string[] }>;
    errors: string[];
  } | null>(null);

  // --- CADASTROS STATES ---
  const [newSupNome, setNewSupNome] = useState("");
  const [newSupEmail, setNewSupEmail] = useState("");

  const [newAreaNome, setNewAreaNome] = useState("");
  const [newAreaCodigo, setNewAreaCodigo] = useState("");

  const [newContratoNome, setNewContratoNome] = useState("");
  const [newContratoCodigo, setNewContratoCodigo] = useState("");

  // --- AUTHORIZED EMAILS STATES ---
  const [newAuthEmail, setNewAuthEmail] = useState("");
  const [newAuthPerfil, setNewAuthPerfil] = useState<"Gestor" | "Supervisor" | "Administrador" | "Líder de Equipe">("Supervisor");
  const [authorizedEmails, setAuthorizedEmails] = useState(dbService.getAuthorizedEmails());

  // Listen to authorized emails updates from db custom events
  React.useEffect(() => {
    const handleDbUpdate = () => {
      setAuthorizedEmails(dbService.getAuthorizedEmails());
    };
    window.addEventListener("gemba_fta_db_update", handleDbUpdate);
    return () => {
      window.removeEventListener("gemba_fta_db_update", handleDbUpdate);
    };
  }, []);

  // Sync state values with incoming config prop changes
  React.useEffect(() => {
    if (config) {
      setNomeEmpresa(config.nomeEmpresa || "");
      setNomeSistema(config.nomeSistema || "");
      setLogoUrl(config.logoUrl || "");
      setResponsavelNome(config.responsavelAssinaturaNome || "");
      setResponsavelCargo(config.responsavelAssinaturaCargo || "");
      if (config.tiposInspecao) setTiposInspecao(config.tiposInspecao);
      if (config.processosChecklist) setProcessosChecklist(config.processosChecklist);
    }
  }, [config]);

  // --- EDIT MODAL STATES ---
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{
    id: string;
    type: "supervisor" | "area" | "contract" | "authorizedEmail";
    fields: Record<string, any>;
  } | null>(null);

  // --- IDENTIDADE STATES ---
  const [nomeEmpresa, setNomeEmpresa] = useState(config.nomeEmpresa || "");
  const [nomeSistema, setNomeSistema] = useState(config.nomeSistema || "");
  const [logoUrl, setLogoUrl] = useState(config.logoUrl || "");

  // --- SIGNATURE STATES ---
  const [responsavelNome, setResponsavelNome] = useState(config.responsavelAssinaturaNome || "Jhonata Santos");
  const [responsavelCargo, setResponsavelCargo] = useState(config.responsavelAssinaturaCargo || "Gerente Operacional dos Contratos");

  // --- DYNAMIC PROCESSES AND INSPECTION TYPES ---
  const [tiposInspecao, setTiposInspecao] = useState<string[]>(config.tiposInspecao || [
    "Desvio Estrutural",
    "Desvio Comportamental",
    "Notificação",
    "Interdição"
  ]);
  const [processosChecklist, setProcessosChecklist] = useState<ProcessoChecklist[]>(config.processosChecklist || [
    { id: "p1", nome: "DSS", classificacaoPadrao: "DSS" },
    { id: "p2", nome: "AR", classificacaoPadrao: "AR" },
    { id: "p3", nome: "LVCC", classificacaoPadrao: "LVCC" },
    { id: "p4", nome: "DIAL", classificacaoPadrao: "DIAL" }
  ]);

  // Temporary local inputs
  const [newTipo, setNewTipo] = useState("");
  const [newProcessoNome, setNewProcessoNome] = useState("");
  const [newProcessoClassificacao, setNewProcessoClassificacao] = useState("");

  // --- USER MODAL STATES ---
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userModalNome, setUserModalNome] = useState("");
  const [userModalEmail, setUserModalEmail] = useState("");
  const [userModalCargo, setUserModalCargo] = useState("");
  const [userModalPassword, setUserModalPassword] = useState("");
  const [showUserModalPassword, setShowUserModalPassword] = useState(false);
  const [userModalPerfil, setUserModalPerfil] = useState<"Desenvolvedor/Admin" | "Supervisor" | "Gestor" | "Líder de Equipe" | "Visitante">("Supervisor");
  const [userModalStatus, setUserModalStatus] = useState<"Ativo" | "Inativo">("Ativo");
  const [userModalParticipaFarolGemba, setUserModalParticipaFarolGemba] = useState<boolean>(true);
  const [userModalGruposContrato, setUserModalGruposContrato] = useState<GrupoContrato[]>(["vale"]);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userModalError, setUserModalError] = useState("");

  // --- SEED ENABLERS ---
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 4000);
  };

  // --- SUPERVISORS WORKFLOWS ---
  const handleAddSupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupNome.trim()) return;
    const nomeTrim = newSupNome.trim();
    const isExcluded = !deveParticiparFarolGemba({ nome: nomeTrim });
    const newSup: Supervisor = {
      id: "sup_" + Math.random().toString(36).substring(2, 9),
      nome: nomeTrim,
      email: newSupEmail.trim() || undefined,
      ativo: true,
      participaFarolGemba: !isExcluded
    };
    try {
      await dbService.saveSupervisor(newSup);
    } catch (error: any) {
      showError(error?.message || "Não foi possível cadastrar o supervisor.");
      return;
    }
    setNewSupNome("");
    setNewSupEmail("");
    onRefreshDB();
    showSuccess(`Supervisor ${newSup.nome} cadastrado com sucesso!`);
  };

  const handleDeleteSupervisor = (id: string) => {
    const s = supervisors.find((sup) => sup.id === id);
    if (!s) return;
    setDeleteTarget({
      id,
      type: "supervisor",
      displayLabel: s.nome
    });
  };

  // --- AREAS WORKFLOWS ---
  const handleAddArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaNome.trim()) return;
    const newArea: Area = {
      id: "area_" + Math.random().toString(36).substring(2, 9),
      nome: newAreaNome.trim(),
      codigo: newAreaCodigo.trim() || undefined,
      ativa: true
    };
    try {
      await dbService.saveArea(newArea);
    } catch (error: any) {
      showError(error?.message || "Não foi possível cadastrar a localidade.");
      return;
    }
    setNewAreaNome("");
    setNewAreaCodigo("");
    onRefreshDB();
    showSuccess(`Área ${newArea.nome} cadastrada com sucesso!`);
  };

  const handleDeleteArea = (id: string) => {
    const a = areas.find((ar) => ar.id === id);
    if (!a) return;
    setDeleteTarget({
      id,
      type: "area",
      displayLabel: a.nome
    });
  };

  // --- CONTRACTS WORKFLOWS ---
  const handleAddContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContratoNome.trim() || !newContratoCodigo.trim()) return;
    const newContract: Contract = {
      id: "ctr_" + Math.random().toString(36).substring(2, 9),
      codigo: newContratoCodigo.trim(),
      nome: newContratoNome.trim(),
      ativo: true
    };
    try {
      await dbService.saveContract(newContract);
    } catch (error: any) {
      showError(error?.message || "Não foi possível cadastrar o contrato.");
      return;
    }
    setNewContratoNome("");
    setNewContratoCodigo("");
    onRefreshDB();
    showSuccess(`Contrato ${newContract.codigo} cadastrado com sucesso!`);
  };

  const handleDeleteContract = (id: string) => {
    const c = contracts.find((ctr) => ctr.id === id);
    if (!c) return;
    setDeleteTarget({
      id,
      type: "contract",
      displayLabel: `${c.codigo} (${c.nome})`
    });
  };

  // --- OPERATIONAL CONFIG WORKFLOWS ---
  const handleAddTipoInspecao = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTipo.trim()) return;
    if (tiposInspecao.includes(newTipo.trim())) {
      alert("Este tipo de inspeção já está cadastrado.");
      return;
    }
    setTiposInspecao([...tiposInspecao, newTipo.trim()]);
    setNewTipo("");
    showSuccess("Tipo de inspeção adicionado temporariamente. Clique em 'Salvar Configurações' abaixo para gravar.");
  };

  const handleRemoveTipoInspecao = (tipoToRemove: string) => {
    setDeleteTarget({
      id: tipoToRemove,
      type: "tipoInspecao",
      displayLabel: tipoToRemove
    });
  };

  const handleAddProcesso = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProcessoNome.trim() || !newProcessoClassificacao) return;
    if (processosChecklist.some(p => p.nome.toLowerCase() === newProcessoNome.trim().toLowerCase())) {
      alert("Este processo/check-list já está cadastrado.");
      return;
    }
    const newItem: ProcessoChecklist = {
      id: "p_" + Math.random().toString(36).substring(2, 9),
      nome: newProcessoNome.trim().toUpperCase(),
      classificacaoPadrao: newProcessoClassificacao
    };
    setProcessosChecklist([...processosChecklist, newItem]);
    setNewProcessoNome("");
    setNewProcessoClassificacao("");
    showSuccess("Processo adicionado temporariamente. Salve para confirmar.");
  };

  const handleRemoveProcesso = (idToRemove: string) => {
    const p = processosChecklist.find((proc) => proc.id === idToRemove);
    if (!p) return;
    setDeleteTarget({
      id: idToRemove,
      type: "processo",
      displayLabel: p.nome
    });
  };

  // --- EDIT MODAL HANDLERS ---
  const handleOpenEditModal = (id: string, type: "supervisor" | "area" | "contract" | "authorizedEmail") => {
    let fields: Record<string, any> = {};
    if (type === "supervisor") {
      const sup = supervisors.find(s => s.id === id);
      if (sup) {
        fields = {
          nome: sup.nome,
          email: sup.email || "",
          participaFarolGemba: sup.participaFarolGemba !== false && deveParticiparFarolGemba(sup)
        };
      }
    } else if (type === "area") {
      const ar = areas.find(a => a.id === id);
      if (ar) {
        fields = { nome: ar.nome };
      }
    } else if (type === "contract") {
      const c = contracts.find(ctr => ctr.id === id);
      if (c) {
        fields = { codigo: c.codigo, nome: c.nome };
      }
    } else if (type === "authorizedEmail") {
      const ae = authorizedEmails.find(e => e.id === id);
      if (ae) {
        fields = { email: ae.email, perfilPadrao: ae.perfilPadrao, ativo: ae.ativo };
      }
    }
    setEditTarget({ id, type, fields });
    setEditModalOpen(true);
  };

  const handleSaveGeneralEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;

    const { id, type, fields } = editTarget;
    try {
      if (type === "supervisor") {
        await dbService.updateSupervisor(id, {
          nome: fields.nome,
          email: fields.email || "",
          participaFarolGemba: fields.participaFarolGemba === true
        });
        showSuccess("Supervisor atualizado com sucesso!");
      } else if (type === "area") {
        await dbService.updateArea(id, {
          nome: fields.nome
        });
        showSuccess("Área/Localidade atualizada com sucesso!");
      } else if (type === "contract") {
        await dbService.updateContract(id, {
          codigo: fields.codigo,
          nome: fields.nome
        });
        showSuccess("Contrato atualizado com sucesso!");
      } else if (type === "authorizedEmail") {
        await dbService.saveAuthorizedEmail({
          id,
          email: fields.email,
          perfilPadrao: fields.perfilPadrao,
          ativo: fields.ativo
        });
        showSuccess("E-mail autorizado atualizado com sucesso!");
      }
      setEditModalOpen(false);
      setEditTarget(null);
      onRefreshDB();
    } catch (err) {
      console.error("Error saving edit:", err);
      showError("Erro ao salvar alterações.");
    }
  };

  // --- AUTHORIZED EMAILS HANDLERS ---
  const handleAddAuthorizedEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailLower = newAuthEmail.trim().toLowerCase();
    if (!emailLower) return;

    if (authorizedEmails.some(ae => ae.email.toLowerCase() === emailLower)) {
      alert("Este e-mail já está autorizado.");
      return;
    }

    try {
      const newAuth = {
        id: "auth_" + Math.random().toString(36).substring(2, 9),
        email: emailLower,
        ativo: true,
        perfilPadrao: newAuthPerfil
      };
      await dbService.saveAuthorizedEmail(newAuth);
      setNewAuthEmail("");
      onRefreshDB();
      showSuccess(`E-mail ${newAuth.email} autorizado com sucesso!`);
    } catch (err) {
      console.error("Error adding authorized email:", err);
      showError("Erro ao autorizar e-mail.");
    }
  };

  const handleDeleteAuthorizedEmail = (id: string) => {
    const ae = authorizedEmails.find(e => e.id === id);
    if (!ae) return;
    setDeleteTarget({
      id,
      type: "authorizedEmail",
      displayLabel: ae.email
    });
  };

  const handleDeleteUser = (id: string) => {
    const u = users.find((usr) => usr.id === id);
    if (!u) return;

    // Safety checks for active admin
    if ((u.perfil === "Desenvolvedor/Admin" || u.perfil === "Administrador") && u.ativo) {
      const activeAdminsCount = users.filter(
        usr => usr.id !== id && 
        (usr.perfil === "Desenvolvedor/Admin" || usr.perfil === "Administrador") && 
        usr.ativo
      ).length;
      if (activeAdminsCount === 0) {
        alert("Não é permitido excluir ou inativar o único Administrador/Desenvolvedor ativo do sistema.");
        return;
      }
    }

    if (!confirm("Tem certeza que deseja alterar o acesso deste usuário?")) {
      return;
    }

    setDeleteTarget({
      id,
      type: "user",
      displayLabel: u.nome
    });
  };

  const handleCloseUserModal = () => {
    setUserModalOpen(false);
    setEditingUser(null);
    setUserModalNome("");
    setUserModalEmail("");
    setUserModalCargo("");
    setUserModalPassword("");
    setUserModalGruposContrato(["vale"]);
    setUserModalError("");
  };

  const handleOpenAddUserModal = () => {
    setEditingUser(null);
    setUserModalNome("");
    setUserModalEmail("");
    setUserModalCargo("");
    setUserModalPassword("");
    setUserModalPerfil("Supervisor");
    setUserModalStatus("Ativo");
    setUserModalParticipaFarolGemba(true);
    setUserModalGruposContrato(["vale"]);
    setUserModalError("");
    setUserModalOpen(true);
  };

  const handleOpenEditUserModal = (u: UserProfile) => {
    setEditingUser(u);
    setUserModalNome(u.nome || "");
    setUserModalEmail(u.email || "");
    setUserModalCargo(u.cargo || "");
    setUserModalPassword("");
    setUserModalError("");

    // Determine Perfil selection
    const pNorm = String(u.perfil || "").trim().toLowerCase();
    const cNorm = String(u.cargo || "").trim().toLowerCase();
    if (pNorm === "desenvolvedor/admin" || pNorm === "administrador" || pNorm === "admin" || pNorm === "dev") {
      setUserModalPerfil("Desenvolvedor/Admin");
    } else if (pNorm === "gestor") {
      setUserModalPerfil("Gestor");
    } else if (pNorm === "visitante") {
      setUserModalPerfil("Visitante");
    } else if (cNorm.includes("líder") || cNorm.includes("lider") || pNorm === "líder de equipe" || pNorm === "lider de equipe") {
      setUserModalPerfil("Líder de Equipe");
    } else {
      setUserModalPerfil("Supervisor");
    }

    setUserModalStatus(u.ativo ? "Ativo" : "Inativo");
    setUserModalParticipaFarolGemba(u.participaFarolGemba !== false);
    setUserModalGruposContrato(
      u.gruposContratoPermitidos?.length
        ? u.gruposContratoPermitidos
        : (["Desenvolvedor/Admin", "Administrador", "Gestor"].includes(u.perfil) ? ["vale", "vli"] : ["vale"])
    );
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserModalError("");
    
    const emailLower = userModalEmail.trim().toLowerCase();
    const nomeTrim = userModalNome.trim();
    const cargoTrim = userModalCargo.trim();

    if (!nomeTrim) {
      const err = "Por favor, preencha o Nome Completo.";
      setUserModalError(err);
      showError(err);
      return;
    }
    if (!emailLower) {
      const err = "Por favor, preencha o E-mail de Acesso.";
      setUserModalError(err);
      showError(err);
      return;
    }
    if (!cargoTrim) {
      const err = "Por favor, preencha o Cargo ou Função.";
      setUserModalError(err);
      showError(err);
      return;
    }
    if (!userModalPerfil) {
      const err = "Por favor, selecione o Perfil de Permissão.";
      setUserModalError(err);
      showError(err);
      return;
    }
    if (userModalGruposContrato.length === 0) {
      const err = "Selecione pelo menos um contrato permitido: Vale ou VLI.";
      setUserModalError(err);
      showError(err);
      return;
    }

    // Safety checks for active admin
    const isChangingToInactive = userModalStatus === "Inativo";
    const isChangingToNonAdmin = userModalPerfil !== "Desenvolvedor/Admin";
    
    // Count other active admins in system
    const activeAdminsCount = users.filter(
      u => u.id !== (editingUser?.id || "") && 
      (u.perfil === "Desenvolvedor/Admin" || u.perfil === "Administrador" || u.perfil === "admin") && 
      u.ativo
    ).length;

    // If we're editing the last active admin, and either inactivating them or demoting them:
    if (editingUser && 
        (editingUser.perfil === "Desenvolvedor/Admin" || editingUser.perfil === "Administrador" || editingUser.perfil === "admin") && 
        editingUser.ativo) {
      if ((isChangingToInactive || isChangingToNonAdmin) && activeAdminsCount === 0) {
        const err = "Não é permitido excluir ou inativar o único Administrador/Desenvolvedor ativo do sistema.";
        setUserModalError(err);
        showError(err);
        return;
      }
    }

    // Show change access confirmation if inactivating or altering status/profile
    if (editingUser) {
      const statusChanged = editingUser.ativo !== (userModalStatus === "Ativo");
      const perfilChanged = editingUser.perfil !== userModalPerfil;
      if (statusChanged || perfilChanged || isChangingToInactive) {
        if (!confirm("Tem certeza que deseja alterar o acesso deste usuário?")) {
          return;
        }
      }
    }

    setIsSavingUser(true);

    try {
      // Map Perfil and Farol participation according to rules:
      // If "Líder de Equipe (acesso Supervisor)":
      //   perfil -> "supervisor"
      //   cargo -> cargoTrim || "LÍDER DE EQUIPE"
      //   participaFarolGemba -> false (or user selection)
      let canonicalPerfil = "supervisor";
      let canonicalCargo = cargoTrim;
      let canonicalParticipaFarol = userModalParticipaFarolGemba;

      if (userModalPerfil === "Desenvolvedor/Admin") {
        canonicalPerfil = "Desenvolvedor/Admin";
      } else if (userModalPerfil === "Gestor") {
        canonicalPerfil = "Gestor";
      } else if (userModalPerfil === "Visitante") {
        canonicalPerfil = "visitante";
      } else if (userModalPerfil === "Líder de Equipe") {
        canonicalPerfil = "supervisor";
        if (!canonicalCargo) {
          canonicalCargo = "LÍDER DE EQUIPE";
        }
        // Líder de Equipe defaults to participaFarolGemba: false unless explicitly checked
        canonicalParticipaFarol = userModalParticipaFarolGemba === true ? true : false;
      } else {
        // "Supervisor"
        canonicalPerfil = "supervisor";
      }

      if (editingUser) {
        // UPDATE EXISTING USER: doc(db, "users", editingUser.id)
        await dbService.updateUser(editingUser.id, {
          nome: nomeTrim,
          email: emailLower,
          cargo: canonicalCargo,
          perfil: canonicalPerfil,
          ativo: userModalStatus === "Ativo",
          participaFarolGemba: canonicalParticipaFarol,
          gruposContratoPermitidos: userModalGruposContrato
        });
      } else {
        // CREATE NEW USER
        if (!userModalPassword || userModalPassword.length < 6) {
          const err = "Informe uma senha temporária com pelo menos 6 caracteres.";
          setUserModalError(err);
          showError(err);
          setIsSavingUser(false);
          return;
        }
        const userId = await dbService.registerUserInAuth(emailLower, userModalPassword);
        const newUser: UserProfile = {
          id: userId,
          nome: nomeTrim,
          email: emailLower,
          cargo: canonicalCargo,
          perfil: canonicalPerfil,
          ativo: userModalStatus === "Ativo",
          participaFarolGemba: canonicalParticipaFarol,
          gruposContratoPermitidos: userModalGruposContrato,
          primeiroAcesso: true,
          deveAlterarSenha: true
        };
        await dbService.saveUser(newUser);
      }

      // Keep supervisor record in sync if exists
      const matchingSup = supervisors.find(
        (s) => (s.email && s.email.toLowerCase() === emailLower) || s.nome.toLowerCase() === nomeTrim.toLowerCase()
      );
      if (matchingSup) {
        await dbService.updateSupervisor(matchingSup.id, {
          participaFarolGemba: canonicalParticipaFarol,
          grupoContrato: userModalGruposContrato[0],
          gruposContratoPermitidos: userModalGruposContrato
        });
      }

      setUserModalOpen(false);
      setEditingUser(null);
      setUserModalPassword("");
      setUserModalError("");
      onRefreshDB();
      showSuccess(editingUser ? "Usuário atualizado com sucesso." : "Usuário criado. A senha temporária deverá ser alterada no primeiro acesso.");
    } catch (error: any) {
      console.error("Erro ao salvar usuário:", error);
      const message = error?.code === "auth/email-already-in-use"
        ? "Este e-mail já possui uma conta no Firebase Authentication."
        : (error?.message || "Não foi possível salvar o usuário.");
      setUserModalError(message);
      showError(message);
    } finally {
      setIsSavingUser(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;

    try {
      const { id, type } = deleteTarget;

      switch (type) {
        case "supervisor": {
          const item = supervisors.find((s) => s.id === id);
          if (item) {
            await dbService.saveDeletedName(id, item.nome);
          }
          await dbService.deleteSupervisor(id);
          break;
        }
        case "area": {
          const item = areas.find((a) => a.id === id);
          if (item) {
            await dbService.saveDeletedName(id, item.nome);
          }
          await dbService.deleteArea(id);
          break;
        }
        case "contract": {
          const item = contracts.find((c) => c.id === id);
          if (item) {
            await dbService.saveDeletedName(id, item.codigo);
          }
          await dbService.deleteContract(id);
          break;
        }
        case "tipoInspecao": {
          const updated = tiposInspecao.filter((t) => t !== id);
          setTiposInspecao(updated);
          const currentConfig = dbService.getConfig();
          await dbService.saveConfig({
            ...currentConfig,
            tiposInspecao: updated
          });
          break;
        }
        case "processo": {
          const updated = processosChecklist.filter((p) => p.id !== id);
          setProcessosChecklist(updated);
          const currentConfig = dbService.getConfig();
          await dbService.saveConfig({
            ...currentConfig,
            processosChecklist: updated
          });
          break;
        }
        case "user": {
          await dbService.deleteUser(id);
          break;
        }
        case "authorizedEmail": {
          await dbService.deleteAuthorizedEmail(id);
          break;
        }
      }

      setDeleteTarget(null);
      onRefreshDB();
      showSuccess("🗑️ Registro excluído com sucesso.");
    } catch (error) {
      console.error("Error executing delete:", error);
      setDeleteTarget(null);
      showError("❌ Não foi possível excluir o registro. Tentar novamente.");
    }
  };

  // --- SAVE ALL BRAND & OPERATIONAL SETTINGS ---
  const handleSaveBrandSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: SystemConfig = {
      ...config,
      nomeEmpresa,
      nomeSistema,
      logoUrl,
      responsavelAssinaturaNome: responsavelNome,
      responsavelAssinaturaCargo: responsavelCargo,
      tiposInspecao,
      processosChecklist
    };
    dbService.saveConfig(updated);
    onRefreshDB();
    showSuccess("Configurações operacionais e de identidade visual salvas com sucesso!");
  };

  // --- BACKUP WORKFLOWS ---
  const handleDownloadBackup = () => {
    const backupStr = dbService.getBackupJSON();
    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(backupStr);
    const link = document.createElement("a");
    link.setAttribute("href", dataUri);
    link.setAttribute("download", `GEMBA_FTA_Backup_${new Date().toISOString().split("T")[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccess("Backup do banco de dados descarregado com sucesso!");
  };

  const handleRestoreBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result;
      if (typeof result === "string") {
        const success = await dbService.restoreBackup(result);
        if (success) {
          onRefreshDB();
          showSuccess("Banco de dados restaurado com sucesso do arquivo de backup!");
        } else {
          alert("Erro crítico: arquivo de backup inválido ou corrompido.");
        }
      }
    };
    reader.readAsText(file);
  };

  const handleDeduplicate = async () => {
    if (!confirm("Analisar e remover somente cadastros duplicados de supervisores, localidades, contratos e e-mails autorizados? Inspeções não serão apagadas.")) return;
    try {
      const result = await dbService.deduplicateConfiguration();
      onRefreshDB();
      showSuccess(`Limpeza concluída: ${Object.values(result).reduce((a, b) => a + b, 0)} duplicidade(s) removida(s).`);
    } catch (error: any) {
      showError(error?.message || "Não foi possível corrigir as duplicidades.");
    }
  };

  const handleOpenStandardizePreview = async () => {
    setStandardizeLoading(true);
    setStandardizeResult(null);
    try {
      const preview = await dbService.previewStandardizeUserProfiles();
      setStandardizePreview(preview);
      setShowStandardizeModal(true);
    } catch (error: any) {
      console.error("Erro ao analisar perfis:", error);
      showError("Erro ao analisar perfis de usuários no Firestore: " + (error?.message || error));
    } finally {
      setStandardizeLoading(false);
    }
  };

  const handleExecuteStandardize = async () => {
    setStandardizeLoading(true);
    try {
      const result = await dbService.standardizeUserProfiles();
      setStandardizeResult(result);
      onRefreshDB();
      showSuccess(`Padronização concluída com sucesso! ${result.updatedCount} perfil(is) corrigido(s).`);
    } catch (error: any) {
      console.error("Erro ao executar padronização:", error);
      showError("Erro ao executar padronização no Firestore: " + (error?.message || error));
    } finally {
      setStandardizeLoading(false);
    }
  };

  const handleInitialize13Users = async () => {
    if (!confirm("Deseja verificar e pré-autorizar os 13 usuários de liderança e segurança padrão com participaFarolGemba: false?")) return;
    setStandardizeLoading(true);
    try {
      const res = await dbService.initializeStandard13Users();
      onRefreshDB();
      showSuccess(`Operação concluída: ${res.updated} atualizado(s), ${res.created} pré-autorizado(s).`);
    } catch (error: any) {
      console.error("Erro ao inicializar usuários padrão:", error);
      showError("Erro ao processar usuários padrão: " + (error?.message || error));
    } finally {
      setStandardizeLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* View Header */}
      <div className="border-b border-gray-100 pb-5">
        <h1 className="text-xl font-extrabold text-[#0B2E59] tracking-tight">
          Configurações do Sistema
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Gerenciamento operacional, controle de acesso de pessoal, identidade da marca e utilitários de backup.
        </p>
      </div>

      {/* SUCCESS ALERTS */}
      {successMsg && (
        <div className="p-3 bg-green-50 border-l-4 border-green-500 rounded-r-lg text-green-700 text-xs font-semibold flex items-center gap-2">
          {successMsg.startsWith("🗑️") ? null : <CheckCircle size={14} className="shrink-0" />}
          <span>{successMsg}</span>
        </div>
      )}

      {/* ERROR ALERTS */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-700 text-xs font-semibold flex items-center gap-2">
          <span>{errorMsg}</span>
        </div>
      )}

      {/* SETTINGS MENU TABS SELECTOR */}
      <div className="flex flex-wrap gap-1.5 border-b border-gray-100 bg-white rounded-lg p-1.5 shadow-sm">
        <button
          onClick={() => setActiveSubTab("cadastros")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
            activeSubTab === "cadastros"
              ? "bg-[#0B2E59] text-white"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          <Users size={14} /> Cadastros Básicos
        </button>
        <button
          onClick={() => setActiveSubTab("seguranca")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
            activeSubTab === "seguranca"
              ? "bg-[#0B2E59] text-white"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          <ShieldCheck size={14} /> Usuários & Permissões
        </button>
        <button
          onClick={() => setActiveSubTab("identidade")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
            activeSubTab === "identidade"
              ? "bg-[#0B2E59] text-white"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          <Building2 size={14} /> Operações & Identidade
        </button>
        <button
          onClick={() => setActiveSubTab("backup")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
            activeSubTab === "backup"
              ? "bg-[#0B2E59] text-white"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          <Database size={14} /> Banco de Dados & Backup
        </button>
      </div>

      {/* --- SUB-TAB 1: CADASTROS BÁSICOS --- */}
      {activeSubTab === "cadastros" && (
        <div className="space-y-6">
          {/* Section 1.1: Supervisors Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-4 lg:col-span-2">
              <h3 className="text-xs font-extrabold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                <Users size={15} /> Supervisores Cadastrados
              </h3>

              <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
                {supervisors.map((s) => (
                  <div key={s.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-gray-800">{s.nome}</span>
                        {s.participaFarolGemba === false || !deveParticiparFarolGemba(s) ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Sem Farol
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-[#0B2E59] border border-blue-100">
                            Farol GEMBA
                          </span>
                        )}
                      </div>
                      <span className="text-gray-400 text-[10px]">{s.email || "Sem e-mail cadastrado"}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(s.id, "supervisor")}
                        className="p-1.5 text-[#0B2E59] hover:bg-blue-50 rounded cursor-pointer"
                        title="Editar Supervisor"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSupervisor(s.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer"
                        title="Excluir Supervisor"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add Supervisor Form */}
            <form onSubmit={handleAddSupervisor} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-3.5">
              <h3 className="text-xs font-extrabold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                <Plus size={16} /> Cadastrar Supervisor
              </h3>
              <div className="flex flex-col gap-1 text-xs">
                <label className="font-bold text-gray-600">Nome <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Nome do Supervisor"
                  value={newSupNome}
                  onChange={(e) => setNewSupNome(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-700 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <label className="font-bold text-gray-600">E-mail</label>
                <input
                  type="email"
                  placeholder="exemplo@ftaservicos.com.br"
                  value={newSupEmail}
                  onChange={(e) => setNewSupEmail(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-700 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-[#0B2E59] hover:bg-[#133e72] text-white font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Salvar Supervisor
              </button>
            </form>
          </div>

          {/* Section 1.2: Areas and Contracts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AREAS CADASTRO */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-4">
              <h3 className="text-xs font-extrabold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                <MapPin size={15} /> Áreas Operacionais / Localidades
              </h3>
              <form onSubmit={handleAddArea} className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Ex: Via Permanente / Ipatinga"
                  value={newAreaNome}
                  onChange={(e) => setNewAreaNome(e.target.value)}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs text-gray-700"
                />
                <button
                  type="submit"
                  className="px-3 bg-[#0B2E59] text-white font-bold rounded-lg text-xs cursor-pointer"
                >
                  <Plus size={16} />
                </button>
              </form>

              <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
                {areas.map((a) => (
                  <div key={a.id} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-700">{a.nome}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(a.id, "area")}
                        className="p-1.5 text-[#0B2E59] hover:bg-blue-50 rounded cursor-pointer"
                        title="Editar Área/Localidade"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteArea(a.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer"
                        title="Excluir Área/Localidade"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CONTRACTS CADASTRO */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-4">
              <h3 className="text-xs font-extrabold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={15} /> Cadastro de Contratos Associados
              </h3>
              <form onSubmit={handleAddContract} className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Número (Ex: 4600010268)"
                  value={newContratoCodigo}
                  onChange={(e) => setNewContratoCodigo(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs text-gray-700"
                />
                <input
                  type="text"
                  required
                  placeholder="Localidade (Ex: Ipatinga)"
                  value={newContratoNome}
                  onChange={(e) => setNewContratoNome(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs text-gray-700 col-span-2"
                />
                <button
                  type="submit"
                  className="col-span-3 py-1.5 bg-[#0B2E59] text-white font-bold rounded-lg text-xs cursor-pointer"
                >
                  Adicionar Contrato Associado
                </button>
              </form>

              <div className="divide-y divide-gray-50 max-h-40 overflow-y-auto">
                {contracts.map((c) => (
                  <div key={c.id} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-700">
                      {c.codigo} <span className="text-gray-400 font-normal">({c.nome})</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(c.id, "contract")}
                        className="p-1.5 text-[#0B2E59] hover:bg-blue-50 rounded cursor-pointer"
                        title="Editar Contrato"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteContract(c.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer"
                        title="Excluir Contrato"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- SUB-TAB 2: SEGURANÇA E USUÁRIOS --- */}
      {activeSubTab === "seguranca" && (
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 pb-3">
            <div className="space-y-1">
              <h3 className="text-xs font-extrabold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={16} /> Cadastro de Usuários & Níveis de Acesso
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Usuários habilitados e vinculados ao sistema GEMBA FTA para auditorias e lançamento de vistorias em pátio.
              </p>
            </div>
            <button
              onClick={handleOpenAddUserModal}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#F58220] hover:bg-[#d67016] text-white text-xs font-extrabold rounded-lg transition-colors cursor-pointer shrink-0 shadow-sm"
            >
              <PlusCircle size={14} /> Adicionar Usuário
            </button>
          </div>

          <div className="w-full overflow-x-auto border rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0B2E59] text-white uppercase text-[10px] font-extrabold">
                  <th className="p-3">Nome</th>
                  <th className="p-3">E-mail de Acesso</th>
                  <th className="p-3">Perfil de Permissão</th>
                  <th className="p-3 text-center">Farol GEMBA</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y font-medium text-gray-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-[#0B2E59]">{u.nome}</span>
                        {u.cargo && <span className="text-[10px] text-gray-400 font-semibold">{u.cargo}</span>}
                      </div>
                    </td>
                    <td className="p-3 text-gray-500">{u.email}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-blue-50 text-[#0B2E59] font-bold rounded">
                        {u.perfil}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded font-extrabold text-[10px] ${
                        u.participaFarolGemba === false || !deveParticiparFarolGemba(u)
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-blue-50 text-[#0B2E59] border border-blue-100"
                      }`}>
                        {u.participaFarolGemba === false || !deveParticiparFarolGemba(u) ? "Não Participa" : "Participa"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded-full font-extrabold text-[10px] ${
                        u.ativo 
                          ? "bg-green-50 text-green-700" 
                          : "bg-red-50 text-red-600"
                      }`}>
                        {u.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditUserModal(u)}
                          className="p-1.5 text-[#0B2E59] hover:bg-blue-50 rounded cursor-pointer inline-block"
                          title="Editar Usuário"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer inline-block"
                          title="Excluir Usuário"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* AUTHORIZED EMAILS SECTION */}
          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200/60 space-y-4 mt-6">
            <div className="space-y-1">
              <h4 className="text-xs font-extrabold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={15} /> E-mails Autorizados para Autocadastro / Pré-autorização
              </h4>
              <p className="text-[11px] text-gray-500">
                Pré-autorize e-mails corporativos definindo seu perfil padrão de permissão. Usuários criados com esses e-mails serão registrados com as permissões escolhidas.
              </p>
            </div>

            {/* Form to authorize a new email */}
            <form onSubmit={handleAddAuthorizedEmail} className="grid grid-cols-1 md:grid-cols-3 gap-2.5 bg-white p-3.5 rounded-lg border border-slate-150">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-600 uppercase">E-mail Corporativo</label>
                <input
                  type="email"
                  required
                  placeholder="Ex: gestor@ftaservicos.com.br"
                  value={newAuthEmail}
                  onChange={(e) => setNewAuthEmail(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59] focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-600 uppercase">Perfil de Acesso</label>
                <select
                  value={newAuthPerfil}
                  onChange={(e) => setNewAuthPerfil(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                >
                  <option value="Líder de Equipe">Líder de Equipe</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Gestor">Gestor</option>
                  <option value="Administrador">Administrador</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 bg-[#0B2E59] hover:bg-[#133e72] text-white font-extrabold rounded-lg text-xs transition cursor-pointer flex items-center justify-center gap-1.5 h-[34px]"
                >
                  <PlusCircle size={14} /> Autorizar E-mail
                </button>
              </div>
            </form>

            {/* List/Table of authorized emails */}
            <div className="w-full overflow-x-auto border bg-white rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0B2E59] text-white uppercase text-[10px] font-extrabold">
                    <th className="p-3">E-mail Autorizado</th>
                    <th className="p-3">Perfil de Permissão</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-medium text-gray-700">
                  {authorizedEmails.map((ae) => (
                    <tr key={ae.id} className="hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-800">{ae.email}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-orange-50 text-[#F58220] font-bold rounded">
                          {ae.perfilPadrao}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded-full font-extrabold text-[10px] ${
                          ae.ativo 
                            ? "bg-green-50 text-green-700" 
                            : "bg-red-50 text-red-600"
                        }`}>
                          {ae.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(ae.id, "authorizedEmail")}
                            className="p-1.5 text-[#0B2E59] hover:bg-blue-50 rounded cursor-pointer inline-block"
                            title="Editar E-mail Autorizado"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAuthorizedEmail(ae.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer inline-block"
                            title="Excluir E-mail Autorizado"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {authorizedEmails.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-gray-400 italic">
                        Nenhum e-mail pré-autorizado cadastrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- SUB-TAB 3: OPERAÇÕES & IDENTIDADE --- */}
      {activeSubTab === "identidade" && (
        <form onSubmit={handleSaveBrandSettings} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* COLUMN 1: BRAND IDENTIFICATION AND SIGNATURE */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-4">
              <h3 className="text-xs font-extrabold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-50 pb-2">
                <Building2 size={16} /> Identidade Visual & Marca
              </h3>

              <div className="flex flex-col gap-1 text-xs">
                <label className="font-bold text-gray-600">Nome da Empresa</label>
                <input
                  type="text"
                  required
                  value={nomeEmpresa}
                  onChange={(e) => setNomeEmpresa(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1 text-xs">
                <label className="font-bold text-gray-600">Nome do Sistema</label>
                <input
                  type="text"
                  required
                  value={nomeSistema}
                  onChange={(e) => setNomeSistema(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1 text-xs">
                <label className="font-bold text-gray-600">URL do Logotipo da Empresa (Web URL ou Base64)</label>
                <textarea
                  rows={2}
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 font-mono text-[10px] focus:outline-none"
                />
              </div>

              <h3 className="text-xs font-extrabold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5 pt-4 border-b border-gray-50 pb-2">
                <Award size={16} /> Assinatura do Relatório Técnico
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 text-xs">
                  <label className="font-bold text-gray-600">Nome do Responsável Técnico</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Jhonata Santos"
                    value={responsavelNome}
                    onChange={(e) => setResponsavelNome(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1 text-xs">
                  <label className="font-bold text-gray-600">Cargo / Função do Responsável</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Gerente Operacional"
                    value={responsavelCargo}
                    onChange={(e) => setResponsavelCargo(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* COLUMN 2: OPERATIONAL SCHEMES (CLASSIFICATIONS & PROCESSES) */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-5">
              
              {/* OPERATIONAL PARAMETER: INSPECTION TYPE (CLASSIFICATIONS) */}
              <div>
                <h3 className="text-xs font-extrabold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-50 pb-2">
                  <Sliders size={16} /> Classificações de Desvio (Tipos de Inspeção)
                </h3>
                
                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    placeholder="Ex: Alerta Crítico de SMS"
                    value={newTipo}
                    onChange={(e) => setNewTipo(e.target.value)}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs text-gray-700 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddTipoInspecao}
                    className="px-3 bg-[#0B2E59] hover:bg-[#133e72] text-white font-bold rounded-lg text-xs cursor-pointer flex items-center justify-center"
                  >
                    <Plus size={15} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3 max-h-32 overflow-y-auto p-1 bg-gray-50 rounded-lg">
                  {tiposInspecao.map((tipo) => (
                    <span key={tipo} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-150 rounded-full text-[11px] font-bold text-[#0B2E59] shadow-xs">
                      {tipo}
                      <button
                        type="button"
                        onClick={() => handleRemoveTipoInspecao(tipo)}
                        className="text-red-500 hover:text-red-700 font-bold ml-0.5 cursor-pointer"
                      >
                        <Trash2 size={11} />
                      </button>
                    </span>
                  ))}
                  {tiposInspecao.length === 0 && (
                    <span className="text-[10px] text-gray-400 italic p-1">Nenhum tipo cadastrado</span>
                  )}
                </div>
              </div>

              {/* OPERATIONAL PARAMETER: PROCESS / CHECK-LIST MAPPER */}
              <div>
                <h3 className="text-xs font-extrabold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-50 pb-2">
                  <FileText size={16} /> Processos / Check-lists & Classificações Associadas
                </h3>

                {/* Inline Addition */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                  <input
                    type="text"
                    placeholder="Ex: LVCC ou Diálogo Diário"
                    value={newProcessoNome}
                    onChange={(e) => setNewProcessoNome(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs text-gray-700 focus:outline-none"
                  />
                  <div className="flex gap-1.5">
                    <select
                      value={newProcessoClassificacao}
                      onChange={(e) => setNewProcessoClassificacao(e.target.value)}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs text-gray-700 focus:outline-none"
                    >
                      <option value="">Selecione a Classificação Padrão...</option>
                      {tiposInspecao.map((tipo) => (
                        <option key={tipo} value={tipo}>{tipo}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddProcesso}
                      className="px-3 bg-[#0B2E59] hover:bg-[#133e72] text-white font-bold rounded-lg text-xs cursor-pointer flex items-center justify-center"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>

                {/* Process List */}
                <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto mt-3 p-1 bg-gray-50 rounded-lg border">
                  {processosChecklist.map((proc) => (
                    <div key={proc.id} className="py-2 px-2 flex items-center justify-between text-xs hover:bg-white rounded transition-colors">
                      <div className="flex flex-col">
                        <span className="font-bold text-[#0B2E59]">{proc.nome}</span>
                        <span className="text-[10px] text-gray-500">Classificação Padrão: {proc.classificacaoPadrao}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveProcesso(proc.id)}
                        className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {processosChecklist.length === 0 && (
                    <p className="text-[10px] text-gray-400 italic p-3 text-center">Nenhum check-list cadastrado</p>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* MASTER SAVE BAR */}
          <div className="flex justify-end bg-white border border-gray-100 p-4 rounded-xl shadow-xs">
            <button
              type="submit"
              className="flex items-center gap-1.5 px-6 py-2.5 bg-[#F58220] hover:bg-orange-600 text-white font-black text-xs rounded-lg cursor-pointer transition-colors shadow-md"
            >
              <Save size={14} /> Salvar Todas as Configurações Operacionais
            </button>
          </div>
        </form>
      )}

      {/* --- SUB-TAB 4: DATABASE & BACKUP --- */}
      {activeSubTab === "backup" && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6 max-w-2xl">
          <h3 className="text-xs font-extrabold text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
            <Database size={16} /> Administração do Banco de Dados
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Backup Action */}
            <div className="p-4 bg-gray-50/70 border border-gray-200 rounded-xl space-y-2.5">
              <span className="font-extrabold text-xs text-[#0B2E59] block">Fazer Backup do Banco</span>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Descarrega toda a base de vistorias, supervisores, contratos e configurações do sistema em um único arquivo JSON seguro.
              </p>
              <button
                onClick={handleDownloadBackup}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#0B2E59] hover:bg-[#133e72] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                <Download size={12} /> Descarregar Backup JSON
              </button>
            </div>

            {/* Restore Action */}
            <div className="p-4 bg-gray-50/70 border border-gray-200 rounded-xl space-y-2.5">
              <span className="font-extrabold text-xs text-[#0B2E59] block">Restaurar Banco de Dados</span>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Substitui a base de dados local carregando um arquivo JSON de backup gerado anteriormente pelo sistema.
              </p>
              <div className="relative">
                <button className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg cursor-pointer">
                  <Upload size={12} /> Carregar Arquivo JSON
                </button>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestoreBackupFile}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Standardization of Firestore Profiles */}
          <div className="pt-6 border-t border-gray-100 space-y-3">
            <span className="font-extrabold text-xs text-[#0B2E59] uppercase flex items-center gap-1.5">
              <ShieldAlert size={14} className="text-[#F58220]" /> Padronização e Correção de Perfis (Firestore)
            </span>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Analisa a coleção <code className="bg-gray-100 px-1 py-0.5 rounded text-[#0B2E59]">users</code> do Firestore, converte campos em maiúsculas (ex: <code>ATIVO</code>, <code>CARGO</code>, <code>NOME</code>) para o padrão canônico em minúsculas (<code>ativo</code>, <code>cargo</code>, <code>nome</code>, <code>participaFarolGemba</code>) e remove campos legados, restaurando o login de usuários bloqueados.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleOpenStandardizePreview}
                disabled={standardizeLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#0B2E59] hover:bg-[#133e72] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {standardizeLoading ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} className="text-[#F58220]" />}
                Analisar e Padronizar Perfis
              </button>

              <button
                type="button"
                onClick={handleInitialize13Users}
                disabled={standardizeLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#0B2E59] text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <Users size={12} />
                Garantir 13 Usuários Padrão (Farol: false)
              </button>
            </div>
          </div>

          {/* Reset System to Defaults */}
          <div className="pt-6 border-t border-gray-100 space-y-2">
            <span className="font-extrabold text-xs text-red-600 uppercase block">Área de Risco Técnico</span>
            <p className="text-[11px] text-gray-500">
              Caso deseje apagar todas as modificações experimentais e re-inicializar o sistema com os dados de fábrica originais da FTA Serviços Industriais, acione o botão abaixo.
            </p>
            <button
              onClick={handleDeduplicate}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg cursor-pointer"
            >
              <RotateCcw size={12} /> Corrigir Cadastros Duplicados
            </button>
          </div>
        </div>
      )}

      {/* CUSTOM DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 animate-scale-up space-y-5">
            {/* Header / Title */}
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-50 text-red-600 mb-3">
                <Trash2 size={24} />
              </div>
              <h3 className="text-base font-extrabold text-gray-900">
                Confirmar Exclusão
              </h3>
            </div>

            {/* Message */}
            <p className="text-xs text-gray-500 text-center leading-relaxed">
              Tem certeza que deseja excluir este registro? Esta ação não poderá ser desfeita.
            </p>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeDelete}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GENERAL EDIT MODAL */}
      {editModalOpen && editTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
          <form
            onSubmit={handleSaveGeneralEdit}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 animate-scale-up space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-extrabold text-sm text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                <Pencil size={15} className="text-[#F58220]" />
                {editTarget.type === "supervisor" && "Editar Supervisor"}
                {editTarget.type === "area" && "Editar Área / Localidade"}
                {editTarget.type === "contract" && "Editar Contrato"}
                {editTarget.type === "authorizedEmail" && "Editar E-mail Autorizado"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditModalOpen(false);
                  setEditTarget(null);
                }}
                className="p-1 hover:bg-slate-100 rounded text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Inputs Body */}
            <div className="space-y-3.5 text-xs">
              {/* Supervisor Fields */}
              {editTarget.type === "supervisor" && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-gray-600">Nome do Supervisor</label>
                    <input
                      type="text"
                      required
                      value={editTarget.fields.nome || ""}
                      onChange={(e) =>
                        setEditTarget({
                          ...editTarget,
                          fields: { ...editTarget.fields, nome: e.target.value }
                        })
                      }
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-gray-600">E-mail</label>
                    <input
                      type="email"
                      value={editTarget.fields.email || ""}
                      onChange={(e) =>
                        setEditTarget({
                          ...editTarget,
                          fields: { ...editTarget.fields, email: e.target.value }
                        })
                      }
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-gray-600">Participação no Farol GEMBA</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <label className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer font-bold text-xs ${
                        editTarget.fields.participaFarolGemba !== false
                          ? "border-[#0B2E59] bg-blue-50/50 text-[#0B2E59]"
                          : "border-gray-200 text-gray-600"
                      }`}>
                        <input
                          type="radio"
                          name="editSupParticipaFarol"
                          checked={editTarget.fields.participaFarolGemba !== false}
                          onChange={() =>
                            setEditTarget({
                              ...editTarget,
                              fields: { ...editTarget.fields, participaFarolGemba: true }
                            })
                          }
                          className="sr-only"
                        />
                        Sim (Participa)
                      </label>
                      <label className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer font-bold text-xs ${
                        editTarget.fields.participaFarolGemba === false
                          ? "border-orange-500 bg-orange-50/50 text-orange-700"
                          : "border-gray-200 text-gray-600"
                      }`}>
                        <input
                          type="radio"
                          name="editSupParticipaFarol"
                          checked={editTarget.fields.participaFarolGemba === false}
                          onChange={() =>
                            setEditTarget({
                              ...editTarget,
                              fields: { ...editTarget.fields, participaFarolGemba: false }
                            })
                          }
                          className="sr-only"
                        />
                        Não (Não participa)
                      </label>
                    </div>
                  </div>
                </>
              )}

              {/* Area Fields */}
              {editTarget.type === "area" && (
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-gray-600">Nome da Área / Localidade</label>
                  <input
                    type="text"
                    required
                    value={editTarget.fields.nome || ""}
                    onChange={(e) =>
                      setEditTarget({
                        ...editTarget,
                        fields: { ...editTarget.fields, nome: e.target.value }
                      })
                    }
                    className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none"
                  />
                </div>
              )}

              {/* Contract Fields */}
              {editTarget.type === "contract" && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-gray-600">Código do Contrato</label>
                    <input
                      type="text"
                      required
                      value={editTarget.fields.codigo || ""}
                      onChange={(e) =>
                        setEditTarget({
                          ...editTarget,
                          fields: { ...editTarget.fields, codigo: e.target.value }
                        })
                      }
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-gray-600">Localidade / Identificação</label>
                    <input
                      type="text"
                      required
                      value={editTarget.fields.nome || ""}
                      onChange={(e) =>
                        setEditTarget({
                          ...editTarget,
                          fields: { ...editTarget.fields, nome: e.target.value }
                        })
                      }
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none"
                    />
                  </div>
                </>
              )}

              {/* Authorized Email Fields */}
              {editTarget.type === "authorizedEmail" && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-gray-600">E-mail</label>
                    <input
                      type="email"
                      required
                      value={editTarget.fields.email || ""}
                      onChange={(e) =>
                        setEditTarget({
                          ...editTarget,
                          fields: { ...editTarget.fields, email: e.target.value }
                        })
                      }
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-gray-600">Perfil Padrão</label>
                    <select
                      value={editTarget.fields.perfilPadrao || "Supervisor"}
                      onChange={(e) =>
                        setEditTarget({
                          ...editTarget,
                          fields: { ...editTarget.fields, perfilPadrao: e.target.value }
                        })
                      }
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none"
                    >
                      <option value="Líder de Equipe">Líder de Equipe</option>
                      <option value="Supervisor">Supervisor</option>
                      <option value="Gestor">Gestor</option>
                      <option value="Administrador">Administrador</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-gray-600">Status</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <label
                        className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer font-bold gap-1.5 transition-all ${
                          editTarget.fields.ativo === true
                            ? "border-green-600 bg-green-50/50 text-green-700"
                            : "border-gray-200 hover:border-gray-300 text-gray-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="editAuthStatus"
                          checked={editTarget.fields.ativo === true}
                          onChange={() =>
                            setEditTarget({
                              ...editTarget,
                              fields: { ...editTarget.fields, ativo: true }
                            })
                          }
                          className="sr-only"
                        />
                        Ativo
                      </label>
                      <label
                        className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer font-bold gap-1.5 transition-all ${
                          editTarget.fields.ativo === false
                            ? "border-red-600 bg-red-50/50 text-red-700"
                            : "border-gray-200 hover:border-gray-300 text-gray-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="editAuthStatus"
                          checked={editTarget.fields.ativo === false}
                          onChange={() =>
                            setEditTarget({
                              ...editTarget,
                              fields: { ...editTarget.fields, ativo: false }
                            })
                          }
                          className="sr-only"
                        />
                        Inativo
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setEditModalOpen(false);
                  setEditTarget(null);
                }}
                className="flex-1 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-[#0B2E59] hover:bg-[#071f3e] text-white font-bold rounded-lg text-xs transition cursor-pointer shadow-sm"
              >
                Salvar Alterações
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ADD / EDIT USER MODAL */}
      {userModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
          <form
            onSubmit={handleSaveUser}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 animate-scale-up space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-extrabold text-sm text-[#0B2E59] uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-[#F58220]" />
                {editingUser ? "Editar Usuário" : "Adicionar Novo Usuário"}
              </h3>
              <button
                type="button"
                onClick={handleCloseUserModal}
                className="p-1 hover:bg-slate-100 rounded text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Error Message inside modal */}
            {userModalError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-semibold">
                {userModalError}
              </div>
            )}

            {/* Inputs Body */}
            <div className="space-y-3.5 text-xs">
              {/* Nome */}
              <div className="flex flex-col gap-1">
                <label className="font-bold text-gray-600">Nome Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Arthur Santos"
                  value={userModalNome}
                  onChange={(e) => setUserModalNome(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                />
              </div>

              {/* E-mail */}
              <div className="flex flex-col gap-1">
                <label className="font-bold text-gray-600">E-mail de Acesso</label>
                <input
                  type="email"
                  required
                  placeholder="Ex: arthur@ftaservicos.com.br"
                  value={userModalEmail}
                  onChange={(e) => setUserModalEmail(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                />
              </div>

              {!editingUser && (
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-gray-600">Senha temporária</label>
                  <div className="relative flex items-center">
                    <input
                      type={showUserModalPassword ? "text" : "password"}
                      required
                      minLength={6}
                      placeholder="Será trocada no primeiro acesso"
                      value={userModalPassword}
                      onChange={(e) => setUserModalPassword(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 pr-10 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowUserModalPassword((prev) => !prev)}
                      aria-label={showUserModalPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute right-2.5 p-1 text-gray-400 hover:text-[#0B2E59] rounded cursor-pointer transition-colors focus:outline-none"
                    >
                      {showUserModalPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Cargo / Função */}
              <div className="flex flex-col gap-1">
                <label className="font-bold text-gray-600">Cargo ou Função</label>
                <input
                  type="text"
                  placeholder="Ex: Engenheiro de Segurança"
                  value={userModalCargo}
                  onChange={(e) => setUserModalCargo(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0B2E59]"
                />
              </div>

              {/* Perfil de Permissão */}
              <div className="flex flex-col gap-1">
                <label className="font-bold text-gray-600">Perfil de Permissão</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                  <label className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer font-bold gap-1 text-[11px] text-center transition-all ${
                    userModalPerfil === "Desenvolvedor/Admin"
                      ? "border-[#0B2E59] bg-blue-50/50 text-[#0B2E59]"
                      : "border-gray-200 hover:border-gray-300 text-gray-600"
                  }`}>
                    <input
                      type="radio"
                      name="modalPerfil"
                      value="Desenvolvedor/Admin"
                      checked={userModalPerfil === "Desenvolvedor/Admin"}
                      onChange={() => setUserModalPerfil("Desenvolvedor/Admin")}
                      className="sr-only"
                    />
                    Admin / Dev
                  </label>
                  <label className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer font-bold gap-1 text-[11px] text-center transition-all ${
                    userModalPerfil === "Gestor"
                      ? "border-[#0B2E59] bg-blue-50/50 text-[#0B2E59]"
                      : "border-gray-200 hover:border-gray-300 text-gray-600"
                  }`}>
                    <input
                      type="radio"
                      name="modalPerfil"
                      value="Gestor"
                      checked={userModalPerfil === "Gestor"}
                      onChange={() => setUserModalPerfil("Gestor")}
                      className="sr-only"
                    />
                    Gestor
                  </label>
                  <label className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer font-bold gap-1 text-[11px] text-center transition-all ${
                    userModalPerfil === "Supervisor"
                      ? "border-[#0B2E59] bg-blue-50/50 text-[#0B2E59]"
                      : "border-gray-200 hover:border-gray-300 text-gray-600"
                  }`}>
                    <input
                      type="radio"
                      name="modalPerfil"
                      value="Supervisor"
                      checked={userModalPerfil === "Supervisor"}
                      onChange={() => setUserModalPerfil("Supervisor")}
                      className="sr-only"
                    />
                    Supervisor
                  </label>
                  <label className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer font-bold gap-1 text-[10px] text-center leading-tight transition-all ${
                    userModalPerfil === "Líder de Equipe"
                      ? "border-[#0B2E59] bg-blue-50/50 text-[#0B2E59]"
                      : "border-gray-200 hover:border-gray-300 text-gray-600"
                  }`}>
                    <input
                      type="radio"
                      name="modalPerfil"
                      value="Líder de Equipe"
                      checked={userModalPerfil === "Líder de Equipe"}
                      onChange={() => {
                        setUserModalPerfil("Líder de Equipe");
                        if (!userModalCargo) {
                          setUserModalCargo("LÍDER DE EQUIPE");
                        }
                      }}
                      className="sr-only"
                    />
                    Líder de Equipe (acesso Supervisor)
                  </label>
                </div>
              </div>

              {/* Status */}
              <div className="flex flex-col gap-1">
                <label className="font-bold text-gray-600">Status da Conta</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <label className={`flex items-center justify-center p-2.5 rounded-lg border cursor-pointer font-bold gap-1.5 transition-all ${
                    userModalStatus === "Ativo"
                      ? "border-green-600 bg-green-50/50 text-green-700"
                      : "border-gray-200 hover:border-gray-300 text-gray-600"
                  }`}>
                    <input
                      type="radio"
                      name="modalStatus"
                      value="Ativo"
                      checked={userModalStatus === "Ativo"}
                      onChange={() => setUserModalStatus("Ativo")}
                      className="sr-only"
                    />
                    Ativo
                  </label>
                  <label className={`flex items-center justify-center p-2.5 rounded-lg border cursor-pointer font-bold gap-1.5 transition-all ${
                    userModalStatus === "Inativo"
                      ? "border-red-600 bg-red-50/50 text-red-700"
                      : "border-gray-200 hover:border-gray-300 text-gray-600"
                  }`}>
                    <input
                      type="radio"
                      name="modalStatus"
                      value="Inativo"
                      checked={userModalStatus === "Inativo"}
                      onChange={() => setUserModalStatus("Inativo")}
                      className="sr-only"
                    />
                    Inativo
                  </label>
                </div>
              </div>

              {/* Participação no Farol GEMBA */}
              <div className="flex flex-col gap-1">
                <label className="font-bold text-gray-600">Participação no Farol GEMBA</label>
                <p className="text-[10px] text-gray-400">
                  Define se este usuário participa e aparece nas metas e linhas do Farol GEMBA.
                </p>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <label className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer font-bold text-xs ${
                    userModalParticipaFarolGemba
                      ? "border-[#0B2E59] bg-blue-50/50 text-[#0B2E59]"
                      : "border-gray-200 text-gray-600"
                  }`}>
                    <input
                      type="radio"
                      name="modalParticipaFarol"
                      checked={userModalParticipaFarolGemba}
                      onChange={() => setUserModalParticipaFarolGemba(true)}
                      className="sr-only"
                    />
                    Sim (Participa)
                  </label>
                  <label className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer font-bold text-xs ${
                    !userModalParticipaFarolGemba
                      ? "border-orange-500 bg-orange-50/50 text-orange-700"
                      : "border-gray-200 text-gray-600"
                  }`}>
                    <input
                      type="radio"
                      name="modalParticipaFarol"
                      checked={!userModalParticipaFarolGemba}
                      onChange={() => setUserModalParticipaFarolGemba(false)}
                      className="sr-only"
                    />
                    Não (Não participa)
                  </label>
                </div>
              </div>

              {/* Contratos permitidos */}
              <div className="flex flex-col gap-1">
                <label className="font-bold text-gray-600">Contratos permitidos</label>
                <p className="text-[10px] text-gray-400">
                  O usuário verá somente informações dos contratos selecionados.
                </p>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {(["vale", "vli"] as GrupoContrato[]).map((grupo) => {
                    const checked = userModalGruposContrato.includes(grupo);
                    return (
                      <label key={grupo} className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer font-bold text-xs uppercase ${checked ? "border-[#0B2E59] bg-blue-50 text-[#0B2E59]" : "border-gray-200 text-gray-600"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setUserModalGruposContrato((current) =>
                            checked ? current.filter((item) => item !== grupo) : [...current, grupo]
                          )}
                          className="sr-only"
                        />
                        {grupo}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                disabled={isSavingUser}
                onClick={handleCloseUserModal}
                className="flex-1 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 font-bold rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingUser}
                className="flex-1 py-2.5 bg-[#0B2E59] hover:bg-[#071f3e] text-white font-bold rounded-lg text-xs transition cursor-pointer shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSavingUser ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Confirmar"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STANDARDIZE PROFILES PREVIEW & CONFIRMATION MODAL */}
      {showStandardizeModal && standardizePreview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 animate-scale-up space-y-5 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-[#0B2E59] rounded-lg">
                  <ShieldAlert size={20} className="text-[#F58220]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#0B2E59]">
                    Prévia de Padronização de Perfis (Firestore)
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Auditoria de nomenclatura e conversão para campos canônicos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStandardizeModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Metrics Bar */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                <span className="text-[10px] uppercase font-extrabold text-gray-500 block">Total Analisado</span>
                <span className="text-lg font-black text-[#0B2E59]">{standardizePreview.totalAnalyzed}</span>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-center">
                <span className="text-[10px] uppercase font-extrabold text-amber-700 block">A Corrigir</span>
                <span className="text-lg font-black text-amber-700">{standardizePreview.toUpdate.length}</span>
              </div>
              <div className="p-3 bg-green-50 rounded-xl border border-green-100 text-center">
                <span className="text-[10px] uppercase font-extrabold text-green-700 block">Já Canônicos</span>
                <span className="text-lg font-black text-green-700">{standardizePreview.alreadyStandard}</span>
              </div>
            </div>

            {/* Result Report if already executed */}
            {standardizeResult && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-green-800">
                  <CheckCircle size={14} /> Padronização executada com sucesso no Firestore!
                </div>
                <p className="text-[11px] text-green-700">
                  {standardizeResult.updatedCount} perfil(is) atualizado(s) e limpos.
                </p>
                {standardizeResult.errors.length > 0 && (
                  <div className="text-[10px] text-red-600 space-y-0.5 pt-1">
                    {standardizeResult.errors.map((err, i) => (
                      <div key={i}>⚠️ {err}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Missing Info Warning */}
            {standardizePreview.missingNameOrEmail.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <div>
                  <strong>Documentos com dados incompletos:</strong> {standardizePreview.missingNameOrEmail.length} documento(s) não possuem nome ou e-mail definidos.
                </div>
              </div>
            )}

            {/* Changes Detail List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-72">
              {standardizePreview.toUpdate.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-500 bg-gray-50 rounded-xl border border-gray-100">
                  <CheckCircle size={24} className="mx-auto text-green-600 mb-2" />
                  Todos os perfis de usuários na coleção <strong>users</strong> já estão 100% canônicos e compatíveis!
                </div>
              ) : (
                standardizePreview.toUpdate.map((item, idx) => (
                  <div key={item.id || idx} className="p-3 bg-gray-50/80 border border-gray-200 rounded-xl space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-[#0B2E59]">
                        {item.nome} <span className="text-gray-400 font-normal">({item.email})</span>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400 bg-white px-1.5 py-0.5 rounded border">
                        {item.id}
                      </span>
                    </div>

                    <div className="space-y-1 pt-1 border-t border-gray-100">
                      {item.changes.map((chg, cIdx) => (
                        <div key={cIdx} className="text-[11px] text-gray-600 flex items-start gap-1.5">
                          <span className="text-[#F58220] font-bold">•</span>
                          <span>{chg}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100 gap-3">
              <button
                type="button"
                onClick={() => setShowStandardizeModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Fechar
              </button>

              {standardizePreview.toUpdate.length > 0 && !standardizeResult && (
                <button
                  type="button"
                  onClick={handleExecuteStandardize}
                  disabled={standardizeLoading}
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#F58220] hover:bg-orange-600 text-white font-extrabold rounded-lg text-xs transition cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {standardizeLoading ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                  Confirmar e Executar Padronização
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
