/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Supervisor, UserProfile } from "../types";

export const normalizeText = (value = ""): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export function isOperationalRole(role?: string): boolean {
  if (!role) return false;
  const r = role.trim().toLowerCase();
  return (
    r === "supervisor" ||
    r === "líder de equipe" ||
    r === "lider de equipe" ||
    r === "lider_equipe" ||
    r === "lider" ||
    r === "líder" ||
    r === "lider de equipe - mec" ||
    r === "líder de equipe - mecânica"
  );
}

/**
 * Cria a lista unificada de responsáveis operacionais combinando:
 * 1. Supervisores ativos da coleção `supervisors`
 * 2. Usuários ativos da coleção `users` com perfil operacional (supervisor, líder de equipe)
 * 3. O `currentUser` (se ativo e com perfil operacional)
 * 
 * Remove duplicidades por:
 * - UID / ID
 * - E-mail em minúsculas
 * - Nome normalizado
 */
export function buildUnifiedSupervisors(
  rawSupervisors: Supervisor[] = [],
  users: UserProfile[] = [],
  currentUser?: UserProfile | null
): Supervisor[] {
  const result: Supervisor[] = [];
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  const seenNames = new Set<string>();

  const addIfUnique = (item: Supervisor) => {
    if (!item || !item.id) return;
    const normId = item.id.trim();
    const normEmail = item.email ? item.email.trim().toLowerCase() : "";
    const normName = normalizeText(item.nome || "");

    if (!normId && !normName) return;

    if (seenIds.has(normId)) return;
    if (normEmail && seenEmails.has(normEmail)) return;
    if (normName && seenNames.has(normName)) return;

    seenIds.add(normId);
    if (normEmail) seenEmails.add(normEmail);
    if (normName) seenNames.add(normName);

    result.push(item);
  };

  // 1. Supervisores ativos da coleção supervisors
  for (const s of rawSupervisors) {
    if (s.ativo !== false) {
      const matchingUser = users.find(
        (u) =>
          u.id === s.id ||
          (u.email && s.email && u.email.trim().toLowerCase() === s.email.trim().toLowerCase()) ||
          (normalizeText(u.nome) === normalizeText(s.nome))
      );

      const isFarolDisabled = s.participaFarolGemba === false || matchingUser?.participaFarolGemba === false;

      addIfUnique({
        ...s,
        ativo: true,
        cargo: s.cargo || matchingUser?.cargo || matchingUser?.perfil || s.unidade || "Supervisor",
        perfil: s.perfil || matchingUser?.perfil || "Supervisor",
        participaFarolGemba: !isFarolDisabled,
        gruposContratoPermitidos: s.gruposContratoPermitidos || matchingUser?.gruposContratoPermitidos
      });
    }
  }

  // 2. Usuários ativos da coleção users com perfil operacional
  const allUsers = [...users];
  if (currentUser && !allUsers.some((u) => u.id === currentUser.id)) {
    allUsers.push(currentUser);
  }

  for (const u of allUsers) {
    if (Boolean(u.ativo) && isOperationalRole(u.perfil)) {
      addIfUnique({
        id: u.id,
        nome: u.nome,
        email: u.email,
        cargo: u.cargo || u.perfil || "Supervisor",
        perfil: u.perfil,
        ativo: Boolean(u.ativo),
        participaFarolGemba: u.participaFarolGemba,
        gruposContratoPermitidos: u.gruposContratoPermitidos
      });
    }
  }

  // Ordenar alfabeticamente por nome
  return result.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
}

/**
 * Busca o nome pelo supervisorId na seguinte ordem de prioridade:
 * 1. Coleção supervisors (ou lista unificada)
 * 2. Coleção users
 * 3. currentUser
 * 4. deletedNames
 * 5. Fallback padrão "Outros"
 */
export function resolveSupervisorName(
  supervisorId: string,
  supervisors: Supervisor[] = [],
  users: UserProfile[] = [],
  currentUser?: UserProfile | null,
  deletedNames: Record<string, string> = {}
): string {
  if (!supervisorId) return "Outros";

  // 1. Coleção supervisors / lista de supervisores
  const foundSup = supervisors.find((s) => s.id === supervisorId);
  if (foundSup && foundSup.nome) return foundSup.nome;

  // 2. Coleção users
  const foundUser = users.find((u) => u.id === supervisorId);
  if (foundUser && foundUser.nome) return foundUser.nome;

  // 3. Usuário autenticado atual
  if (currentUser && currentUser.id === supervisorId && currentUser.nome) {
    return currentUser.nome;
  }

  // 4. Nomes deletados
  if (deletedNames && deletedNames[supervisorId]) {
    return deletedNames[supervisorId];
  }

  return "Outros";
}
