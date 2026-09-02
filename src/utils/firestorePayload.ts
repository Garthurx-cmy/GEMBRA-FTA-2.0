/**
 * Remove valores `undefined` antes de enviar dados ao Firestore.
 * Objetos especiais do SDK (Timestamp, FieldValue etc.) são preservados.
 */
export function sanitizeFirestorePayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestorePayload(item)) as T;
  }

  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    const isPlainObject = prototype === Object.prototype || prototype === null;
    if (!isPlainObject) return value;

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, sanitizeFirestorePayload(item)])
    ) as T;
  }

  return value;
}

export class FirestoreConfirmationTimeoutError extends Error {
  code = "save-confirmation-timeout";

  constructor() {
    super("A conexão demorou para confirmar o salvamento. O rascunho foi mantido; verifique a internet e tente novamente.");
    this.name = "FirestoreConfirmationTimeoutError";
  }
}

export function waitForFirestoreConfirmation<T>(
  operation: Promise<T>,
  timeoutMs = 12_000
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new FirestoreConfirmationTimeoutError()), timeoutMs);
  });

  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

export function getFriendlyInspectionSaveError(error: any): Error {
  if (error instanceof FirestoreConfirmationTimeoutError) return error;

  const code = String(error?.code || "").toLowerCase();
  if (code.includes("permission-denied")) {
    return new Error("Seu perfil não tem permissão para gravar esta inspeção. O rascunho foi mantido; procure o administrador.");
  }
  if (code.includes("unavailable") || code.includes("deadline-exceeded") || code.includes("network")) {
    return new Error("Não foi possível confirmar o salvamento agora. O rascunho foi mantido; verifique a conexão e tente novamente.");
  }
  if (code.includes("invalid-argument")) {
    return new Error("A inspeção contém um campo inválido e não foi gravada. O rascunho foi mantido para correção.");
  }

  return error instanceof Error
    ? error
    : new Error("Não foi possível salvar a inspeção. O rascunho foi mantido.");
}
