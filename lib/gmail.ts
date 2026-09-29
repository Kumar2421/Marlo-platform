import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/admin";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function createGmailState() {
  return randomBytes(32).toString("hex");
}

export function buildGmailAuthUrl(redirectUri: string, state: string) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  if (!clientId) throw new Error("GMAIL_CLIENT_ID is not configured.");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(params: Record<string, string>) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET is not configured.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Gmail token request failed: HTTP ${response.status}`);
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

export async function exchangeGmailCode(code: string, redirectUri: string) {
  const data = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function getGmailEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = await response.json() as { email?: string };
  return data.email ?? null;
}

async function readVaultSecret(db: ReturnType<typeof createAdminClient>, secretId: string) {
  const { data, error } = await db.rpc("vault_get_secret", { p_secret_id: secretId });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) throw new Error("Gmail secret is unavailable.");
  return data;
}

export async function getValidGmailAccessToken(adminUserId: string) {
  const db = createAdminClient();
  const { data: connection, error } = await db.from("integration_connections")
    .select("access_token_secret_id,refresh_token_secret_id,token_expiry,external_email")
    .eq("user_id", adminUserId)
    .is("project_id", null)
    .eq("provider", "gmail")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!connection?.access_token_secret_id || !connection.refresh_token_secret_id) {
    throw new Error("Connect Gmail in Settings before sending outreach.");
  }

  const expiry = connection.token_expiry ? new Date(connection.token_expiry).getTime() : 0;
  if (expiry > Date.now() + 60_000) {
    return { accessToken: await readVaultSecret(db, connection.access_token_secret_id), fromEmail: connection.external_email ?? "" };
  }

  const refreshToken = await readVaultSecret(db, connection.refresh_token_secret_id);
  const data = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  const accessName = `marlo:gmail:${adminUserId}:access`;
  const { data: accessSecretId, error: accessError } = await db.rpc("vault_set_secret", { p_secret: data.access_token, p_name: accessName });
  if (accessError) throw new Error(accessError.message);

  const { error: updateError } = await db.from("integration_connections").update({
    access_token_secret_id: accessSecretId,
    token_expiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", adminUserId).is("project_id", null).eq("provider", "gmail");
  if (updateError) throw new Error(updateError.message);

  return { accessToken: data.access_token, fromEmail: connection.external_email ?? "" };
}

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendGmail(
  adminUserId: string,
  to: string,
  subject: string,
  body: string,
): Promise<{ threadId: string; messageId: string }> {
  const { accessToken, fromEmail } = await getValidGmailAccessToken(adminUserId);
  if (!fromEmail) throw new Error("Connected Gmail account has no sender address.");

  const message = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64UrlEncode(message) }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gmail send failed: HTTP ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }

  const data = await response.json() as { threadId?: string; id?: string };
  if (!data.threadId || !data.id) throw new Error("Gmail returned no message identifiers.");
  return { threadId: data.threadId, messageId: data.id };
}


export async function getGmailThreadReplies(
  adminUserId: string,
  threadId: string,
  ourMessageId: string,
): Promise<{ id: string; from: string; snippet: string; internalDate: string | null }[]> {
  const { accessToken } = await getValidGmailAccessToken(adminUserId);
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gmail thread lookup failed: HTTP ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }

  const data = await response.json() as {
    messages?: Array<{
      id?: string;
      internalDate?: string;
      snippet?: string;
      payload?: { headers?: Array<{ name?: string; value?: string }> };
    }>;
  };

  return (data.messages ?? [])
    .filter((message) => message.id && message.id !== ourMessageId)
    .map((message) => {
      const from = message.payload?.headers?.find((header) => header.name?.toLowerCase() === "from")?.value ?? "";
      return {
        id: message.id as string,
        from,
        snippet: message.snippet ?? "",
        internalDate: message.internalDate ?? null,
      };
    });
}

export function hashSecretLabel(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
