import { adminRoute, readJson } from "@/lib/api";
import { createAdminClient } from "@/lib/admin";
import { addSuppression, cancelQueued, createCampaign, listCampaigns, listMessages, listSuppressions, outreachStats, queueOutreach, removeSuppression, sendOne, sendQueued, setCampaignStatus, type QueueInput } from "@/lib/services/outreach";
import { getSendSettings, updateSendSettings } from "@/lib/services/settings";
import { ServiceError } from "@/lib/services/types";

export const GET = adminRoute(async (actor) => {
  const db = createAdminClient();
  const [campaigns, messages, stats, settings, suppressions, { data: gmail }] = await Promise.all([
    listCampaigns(),
    listMessages({ limit: 100 }),
    outreachStats(),
    getSendSettings(),
    listSuppressions(100),
    db.from("integration_connections").select("external_email").eq("user_id", actor.userId).is("project_id", null).eq("provider", "gmail").maybeSingle(),
  ]);
  return { campaigns, messages, stats, settings, suppressions, gmail: gmail?.external_email ?? null };
});

export const POST = adminRoute(async (actor, req) => {
  const body = await readJson(req);
  const queueInput = (): QueueInput => ({
    leadIds: body.leadIds as string[] | undefined, filter: body.filter as QueueInput["filter"], campaignId: body.campaignId as string | undefined,
    subject: body.subject as string | undefined, body: body.body as string | undefined, limit: body.limit as number | undefined,
  });
  switch (body.action) {
    case "create_campaign": return createCampaign(actor, body as { name: string; subject: string; body: string });
    case "set_campaign_status": return setCampaignStatus(String(body.campaignId), body.status as "active" | "paused" | "completed");
    case "preview": return queueOutreach(actor, { ...queueInput(), dryRun: true });
    case "queue": return queueOutreach(actor, queueInput());
    case "send": return sendQueued(actor, { limit: body.limit as number | undefined, campaignId: body.campaignId as string | undefined });
    case "send_one": return sendOne(actor, String(body.leadId), String(body.subject ?? ""), String(body.message ?? ""));
    case "cancel": return cancelQueued({ campaignId: body.campaignId as string | undefined, messageIds: body.messageIds as string[] | undefined });
    case "add_suppression": return addSuppression(String(body.email ?? ""), (body.reason as "manual" | undefined) ?? "manual");
    case "remove_suppression": return removeSuppression(String(body.email ?? ""));
    case "update_settings": return updateSendSettings((body.settings ?? {}) as Parameters<typeof updateSendSettings>[0]);
    default: throw new ServiceError("Unknown action.");
  }
}, async (req) => {
  const body = await req.clone().json().catch(() => null) as { action?: string } | null;
  return body?.action && body.action !== "preview" ? `outreach.${body.action}` : null;
});
