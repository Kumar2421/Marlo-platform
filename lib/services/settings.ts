import { createAdminClient } from "@/lib/admin";

export type SendSettings = {
  dailySendCap: number;
  sendDelaySeconds: number;
  maxPerBatch: number;
  signature: string;
  unsubscribeLine: string;
};

export const DEFAULT_SETTINGS: SendSettings = {
  dailySendCap: 40,
  sendDelaySeconds: 2,
  maxPerBatch: 10,
  signature: "",
  unsubscribeLine: "If you'd rather not hear from me, just reply \"unsubscribe\" and I won't contact you again.",
};

export async function getSendSettings(): Promise<SendSettings> {
  const db = createAdminClient();
  const { data } = await db.from("platform_settings").select("value").eq("key", "send").maybeSingle();
  const stored = (data?.value ?? {}) as Partial<SendSettings>;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSendSettings(patch: Partial<SendSettings>): Promise<SendSettings> {
  const current = await getSendSettings();
  const next: SendSettings = {
    dailySendCap: clampInt(patch.dailySendCap, 1, 500, current.dailySendCap),
    sendDelaySeconds: clampInt(patch.sendDelaySeconds, 0, 30, current.sendDelaySeconds),
    maxPerBatch: clampInt(patch.maxPerBatch, 1, 25, current.maxPerBatch),
    signature: typeof patch.signature === "string" ? patch.signature.slice(0, 1000) : current.signature,
    unsubscribeLine: typeof patch.unsubscribeLine === "string" ? patch.unsubscribeLine.slice(0, 500) : current.unsubscribeLine,
  };
  const db = createAdminClient();
  const { error } = await db.from("platform_settings").upsert({ key: "send", value: next, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return next;
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
}
