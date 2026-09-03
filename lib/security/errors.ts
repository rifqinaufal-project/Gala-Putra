export class AuthorizationError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN";

  constructor(message: string, code: "UNAUTHENTICATED" | "FORBIDDEN" = "FORBIDDEN") {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
  }
}

interface StructuredActionError {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
}

function textField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function explainDatabaseError(message: string, code: string) {
  if (code === "42883") {
    return "Fungsi database belum tersedia. Terapkan migration terbaru ke Supabase.";
  }
  if (code === "42501") {
    return "Akun ini tidak memiliki izin untuk melakukan operasi tersebut.";
  }
  if (code === "23505") {
    return "Data sudah ada sehingga tidak dapat dibuat ulang.";
  }
  if (code === "23503") {
    return "Data terkait tidak ditemukan atau masih dipakai oleh data lain.";
  }
  if (code === "23514") {
    return "Data tidak memenuhi aturan validasi database.";
  }
  return message;
}

export function normalizeActionError(error: unknown, fallback: string) {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof Error && error.message) return error.message;

  if (typeof error === "string" && error.trim()) return error.trim();

  if (error && typeof error === "object") {
    const value = error as StructuredActionError;
    const message = textField(value.message);
    if (message) {
      const code = textField(value.code);
      const details = textField(value.details);
      const hint = textField(value.hint);
      const explanation = explainDatabaseError(message, code);
      const context = [
        code ? `Kode: ${code}` : "",
        details ? `Detail: ${details}` : "",
        hint ? `Petunjuk: ${hint}` : "",
      ].filter(Boolean);
      return [explanation, ...context].join(" ");
    }
  }

  return fallback;
}
