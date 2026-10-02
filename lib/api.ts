import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/services/audit";
import { ServiceError, type Actor } from "@/lib/services/types";

const STATUS: Record<ServiceError["code"], number> = { invalid: 400, not_found: 404, conflict: 409, limit: 429, config: 503, upstream: 502 };

type Handler = (actor: Actor, req: NextRequest) => Promise<unknown>;

/**
 * Wrap an admin-only route: auth, uniform error mapping and (for mutations) an audit entry.
 * `action` names the audit entry; omit it for read-only handlers.
 */
export function adminRoute(handler: Handler, action?: string | ((req: NextRequest) => string | null | Promise<string | null>)) {
  return async (req: NextRequest) => {
    const { user, authorized } = await requireAdmin();
    if (!user || !authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const actor: Actor = { userId: user.id, via: "ui" };
    const name = typeof action === "function" ? await action(req) : action;
    try {
      const result = await handler(actor, req);
      if (name) await audit({ actor, action: name });
      return NextResponse.json(result ?? { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      if (name) await audit({ actor, action: name, status: "error", meta: { error: message.slice(0, 300) } });
      const status = error instanceof ServiceError ? STATUS[error.code] : 500;
      return NextResponse.json({ error: message }, { status });
    }
  };
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ServiceError("Invalid JSON body.");
  return body as Record<string, unknown>;
}

export function param(req: NextRequest, key: string) {
  return req.nextUrl.searchParams.get(key) ?? undefined;
}

export function intParam(req: NextRequest, key: string) {
  const value = Number(req.nextUrl.searchParams.get(key));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}
