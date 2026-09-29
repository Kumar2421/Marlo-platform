import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/admin";

export const MCP_SCOPE = "marlo:read marlo:write";

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

export async function issueAuthorizationCode(input: {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}) {
  const code = randomToken();
  const db = createAdminClient();
  const { error } = await db.from("platform_mcp_authorization_codes").insert({
    code_hash: hash(code),
    user_id: input.userId,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    scope: MCP_SCOPE,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return code;
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const db = createAdminClient();
  const { data: record, error } = await db.from("platform_mcp_authorization_codes")
    .select("id,user_id,client_id,redirect_uri,code_challenge,scope,expires_at")
    .eq("code_hash", hash(input.code))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!record || record.client_id !== input.clientId || record.redirect_uri !== input.redirectUri) throw new Error("Invalid authorization code.");
  if (new Date(record.expires_at).getTime() <= Date.now()) throw new Error("Authorization code expired.");
  if (!safeEqual(pkceChallenge(input.codeVerifier), record.code_challenge)) throw new Error("PKCE verification failed.");

  await db.from("platform_mcp_authorization_codes").delete().eq("id", record.id);

  const accessToken = randomToken();
  const refreshToken = randomToken();
  const { error: tokenError } = await db.from("platform_mcp_tokens").insert([
    { token_hash: hash(accessToken), token_type: "access", user_id: record.user_id, client_id: record.client_id, scope: record.scope, expires_at: new Date(Date.now() + 60 * 60_000).toISOString() },
    { token_hash: hash(refreshToken), token_type: "refresh", user_id: record.user_id, client_id: record.client_id, scope: record.scope, expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString() },
  ]);
  if (tokenError) throw new Error(tokenError.message);

  return { access_token: accessToken, token_type: "Bearer", expires_in: 3600, refresh_token: refreshToken, scope: record.scope };
}

export async function refreshAccessToken(refreshToken: string, clientId: string) {
  const db = createAdminClient();
  const { data: record, error } = await db.from("platform_mcp_tokens")
    .select("id,user_id,client_id,scope,expires_at")
    .eq("token_hash", hash(refreshToken))
    .eq("token_type", "refresh")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!record || record.client_id !== clientId) throw new Error("Invalid refresh token.");
  if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) throw new Error("Refresh token expired.");

  const accessToken = randomToken();
  const { error: insertError } = await db.from("platform_mcp_tokens").insert({
    token_hash: hash(accessToken), token_type: "access", user_id: record.user_id, client_id: record.client_id,
    scope: record.scope, expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
  if (insertError) throw new Error(insertError.message);
  return { access_token: accessToken, token_type: "Bearer", expires_in: 3600, scope: record.scope };
}

export async function authenticateMcpRequest(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const db = createAdminClient();
  const { data: record, error } = await db.from("platform_mcp_tokens")
    .select("user_id,client_id,scope,expires_at")
    .eq("token_hash", hash(token))
    .eq("token_type", "access")
    .maybeSingle();
  if (error || !record) return null;
  if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) return null;
  return record;
}
