import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/admin";

export const SUPPORTED_SCOPES = ["marlo:read", "marlo:write", "marlo:send", "marlo:admin"] as const;
export type McpScope = (typeof SUPPORTED_SCOPES)[number];
export const DEFAULT_SCOPE = "marlo:read marlo:write marlo:send";
// Kept for older imports.
export const MCP_SCOPE = DEFAULT_SCOPE;

const ACCESS_TTL_MS = 60 * 60_000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
const CODE_TTL_MS = 5 * 60_000;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function parseScope(requested: string | null | undefined) {
  const wanted = (requested ?? "").split(/[\s,]+/).filter(Boolean);
  const granted = wanted.filter((s): s is McpScope => (SUPPORTED_SCOPES as readonly string[]).includes(s));
  return (granted.length ? [...new Set(granted)] : DEFAULT_SCOPE.split(" ")).join(" ");
}

/** write implies read; admin implies everything. */
export function effectiveScopes(scope: string) {
  const set = new Set(scope.split(/\s+/).filter(Boolean));
  if (set.has("marlo:admin")) SUPPORTED_SCOPES.forEach((s) => set.add(s));
  if (set.has("marlo:write") || set.has("marlo:send")) set.add("marlo:read");
  return set;
}

function adminIds() {
  return new Set((process.env.MARLO_ADMIN_USER_IDS ?? "").split(",").map((v) => v.trim()).filter(Boolean));
}

// ------------------------------------------------------------------ client registry
function validRedirectUri(value: string) {
  try {
    const url = new URL(value);
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  } catch {
    return false;
  }
}

export async function registerClient(input: { clientName?: string; redirectUris: string[] }) {
  const uris = [...new Set(input.redirectUris)].slice(0, 10);
  if (!uris.length || !uris.every(validRedirectUri)) throw new Error("redirect_uris must be https (or http loopback) URLs.");
  const clientId = "mcp_" + randomBytes(16).toString("hex");
  const name = (input.clientName ?? "MCP client").trim().slice(0, 80) || "MCP client";
  const db = createAdminClient();
  const { error } = await db.from("platform_mcp_clients").insert({ client_id: clientId, client_name: name, redirect_uris: uris });
  if (error) throw new Error(error.message);
  return { clientId, clientName: name, redirectUris: uris };
}

export async function getClient(clientId: string) {
  const db = createAdminClient();
  const { data } = await db.from("platform_mcp_clients").select("client_id,client_name,redirect_uris,revoked_at").eq("client_id", clientId).maybeSingle();
  if (!data || data.revoked_at) return null;
  return data as { client_id: string; client_name: string; redirect_uris: string[]; revoked_at: string | null };
}

// ------------------------------------------------------------------ authorization codes
export async function issueAuthorizationCode(input: {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}) {
  const code = randomToken();
  const db = createAdminClient();
  const { error } = await db.from("platform_mcp_authorization_codes").insert({
    code_hash: hash(code),
    user_id: input.userId,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    scope: input.scope,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(error.message);
  return code;
}

async function issueTokens(db: ReturnType<typeof createAdminClient>, base: { userId: string; clientId: string; scope: string; familyId: string }) {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  const common = { user_id: base.userId, client_id: base.clientId, scope: base.scope, family_id: base.familyId };
  const { error } = await db.from("platform_mcp_tokens").insert([
    { ...common, token_hash: hash(accessToken), token_type: "access", expires_at: new Date(Date.now() + ACCESS_TTL_MS).toISOString() },
    { ...common, token_hash: hash(refreshToken), token_type: "refresh", expires_at: new Date(Date.now() + REFRESH_TTL_MS).toISOString() },
  ]);
  if (error) throw new Error(error.message);
  return { access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TTL_MS / 1000, refresh_token: refreshToken, scope: base.scope };
}

export async function exchangeAuthorizationCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string }) {
  const db = createAdminClient();
  // Single-use: the delete is the claim. A replayed code finds nothing.
  const { data: record, error } = await db.from("platform_mcp_authorization_codes")
    .delete().eq("code_hash", hash(input.code))
    .select("user_id,client_id,redirect_uri,code_challenge,scope,expires_at,family_id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!record || record.client_id !== input.clientId || record.redirect_uri !== input.redirectUri) throw new Error("Invalid authorization code.");
  if (new Date(record.expires_at).getTime() <= Date.now()) throw new Error("Authorization code expired.");
  if (!input.codeVerifier || !safeEqual(pkceChallenge(input.codeVerifier), record.code_challenge)) throw new Error("PKCE verification failed.");
  return issueTokens(db, { userId: record.user_id, clientId: record.client_id, scope: record.scope, familyId: record.family_id });
}

/** Refresh-token rotation: each refresh token is single use. Reuse of a spent token revokes the whole family. */
export async function refreshAccessToken(refreshToken: string, clientId: string) {
  const db = createAdminClient();
  const { data: record, error } = await db.from("platform_mcp_tokens")
    .select("id,user_id,client_id,scope,expires_at,revoked_at,family_id")
    .eq("token_hash", hash(refreshToken)).eq("token_type", "refresh").maybeSingle();
  if (error) throw new Error(error.message);
  if (!record || record.client_id !== clientId) throw new Error("Invalid refresh token.");
  if (record.revoked_at) {
    await revokeFamily(record.family_id);
    throw new Error("Refresh token reuse detected; session revoked.");
  }
  if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) throw new Error("Refresh token expired.");
  if (!adminIds().has(record.user_id)) throw new Error("Administrator access revoked.");

  const { data: claimed } = await db.from("platform_mcp_tokens")
    .update({ revoked_at: new Date().toISOString() }).eq("id", record.id).is("revoked_at", null).select("id");
  if (!claimed?.length) throw new Error("Invalid refresh token.");
  // Old access tokens of this family stay valid until expiry; revoke them so only the new pair works.
  await db.from("platform_mcp_tokens").update({ revoked_at: new Date().toISOString() }).eq("family_id", record.family_id).eq("token_type", "access").is("revoked_at", null);
  return issueTokens(db, { userId: record.user_id, clientId: record.client_id, scope: record.scope, familyId: record.family_id });
}

// ------------------------------------------------------------------ request auth
export type McpAuth = { token_id: string; user_id: string; client_id: string; scope: string; scopes: Set<string> };

export async function authenticateMcpRequest(request: Request): Promise<McpAuth | null> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const db = createAdminClient();
  const { data: record, error } = await db.from("platform_mcp_tokens")
    .select("id,user_id,client_id,scope,expires_at,revoked_at,last_used_at")
    .eq("token_hash", hash(token)).eq("token_type", "access").maybeSingle();
  if (error || !record || record.revoked_at) return null;
  if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) return null;
  // Removing someone from MARLO_ADMIN_USER_IDS cuts off their MCP access immediately.
  if (!adminIds().has(record.user_id)) return null;

  if (!record.last_used_at || Date.now() - new Date(record.last_used_at).getTime() > 5 * 60_000) {
    await db.from("platform_mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", record.id);
  }
  return { token_id: record.id, user_id: record.user_id, client_id: record.client_id, scope: record.scope, scopes: effectiveScopes(record.scope) };
}

// ------------------------------------------------------------------ management
export async function revokeFamily(familyId: string) {
  const db = createAdminClient();
  const { data } = await db.from("platform_mcp_tokens").update({ revoked_at: new Date().toISOString() }).eq("family_id", familyId).is("revoked_at", null).select("id");
  return data?.length ?? 0;
}

export async function revokeToken(rawToken: string) {
  const db = createAdminClient();
  const { data } = await db.from("platform_mcp_tokens").select("family_id").eq("token_hash", hash(rawToken)).maybeSingle();
  if (data) await revokeFamily(data.family_id);
}

export async function revokeClient(clientId: string) {
  const db = createAdminClient();
  await db.from("platform_mcp_clients").update({ revoked_at: new Date().toISOString() }).eq("client_id", clientId);
  const { data } = await db.from("platform_mcp_tokens").update({ revoked_at: new Date().toISOString() }).eq("client_id", clientId).is("revoked_at", null).select("id");
  return data?.length ?? 0;
}

/** Active sessions (one row per token family) for the admin UI and the list tool. */
export async function listMcpSessions() {
  const db = createAdminClient();
  const [{ data: tokens, error }, { data: clients }] = await Promise.all([
    db.from("platform_mcp_tokens").select("family_id,client_id,user_id,scope,token_type,created_at,expires_at,last_used_at,revoked_at").is("revoked_at", null).order("created_at", { ascending: false }).limit(500),
    db.from("platform_mcp_clients").select("client_id,client_name,redirect_uris,created_at,revoked_at").order("created_at", { ascending: false }).limit(100),
  ]);
  if (error) throw new Error(error.message);
  const names = new Map((clients ?? []).map((c) => [c.client_id, c.client_name]));
  const families = new Map<string, { family_id: string; client_id: string; client_name: string; user_id: string; scope: string; created_at: string; last_used_at: string | null; expires_at: string | null }>();
  for (const t of tokens ?? []) {
    if (t.token_type !== "refresh" || (t.expires_at && new Date(t.expires_at).getTime() <= Date.now())) continue;
    const existing = families.get(t.family_id);
    const lastUsed = (tokens ?? []).filter((x) => x.family_id === t.family_id && x.last_used_at).map((x) => x.last_used_at as string).sort().pop() ?? null;
    if (!existing) families.set(t.family_id, { family_id: t.family_id, client_id: t.client_id, client_name: names.get(t.client_id) ?? "Unknown client", user_id: t.user_id, scope: t.scope, created_at: t.created_at, last_used_at: lastUsed, expires_at: t.expires_at });
  }
  return { sessions: [...families.values()], clients: clients ?? [] };
}

