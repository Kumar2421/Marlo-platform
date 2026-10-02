export type SendSettings = { dailySendCap?: number; sendDelaySeconds?: number; maxPerBatch?: number; signature?: string; unsubscribeLine?: string };
export type McpTool = { name: string; title: string; scope: string; destructive: boolean };
export type ConfigResp = {
  admins: number;
  flags: Record<string, boolean>;
  gmail: { connected: boolean; email: string | null };
  send_settings: SendSettings;
  mcp: { endpoint: string; scopes: string[]; tools: McpTool[] };
};
export type Session = { family_id: string; client_id: string; client_name: string | null; user_id: string; scope: string | null; created_at: string; last_used_at: string | null; expires_at: string | null };
export type OAuthClient = { client_id: string; client_name: string | null; redirect_uris: string[]; created_at: string; revoked_at: string | null };
export type SettingsResp = { sessions?: Session[]; clients?: OAuthClient[] };
