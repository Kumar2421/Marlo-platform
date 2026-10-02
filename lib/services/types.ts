export type Actor = { userId: string; via: "ui" | "mcp"; clientId?: string | null };

export class ServiceError extends Error {
  constructor(message: string, public code: "invalid" | "not_found" | "conflict" | "limit" | "config" | "upstream" = "invalid") {
    super(message);
  }
}

export function clean(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
