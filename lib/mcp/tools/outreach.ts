import { addSuppression, cancelQueued, createCampaign, listCampaigns, listMessages, listSuppressions, outreachStats, queueOutreach, removeSuppression, sendQueued, setCampaignStatus, type QueueInput } from "@/lib/services/outreach";
import { int, leadStatusEnum, obj, str, strList, type ToolDef } from "../registry";

const queueProps = {
  lead_ids: strList("Specific lead ids (max 200). Omit to select by filter.", 200),
  filter: obj({
    status: str("Lead state (default new)", { enum: leadStatusEnum }),
    tag: str("Only leads with this tag"),
    query: str("Free-text match"),
    quality: str("email_quality value"),
  }),
  campaign_id: str("Use this campaign's subject and body (can be overridden)"),
  subject: str("Subject template. Supports {{first_name}} {{name}} {{company}} {{title}} {{location}}", { maxLength: 180 }),
  body: str("Body template, same merge fields. Signature and unsubscribe line are appended automatically.", { maxLength: 10000 }),
  limit: int("Max leads to pick when using a filter (default 100)", 1, 200),
};

function toQueue(args: Record<string, unknown>, dryRun: boolean): QueueInput {
  return {
    leadIds: args.lead_ids as string[] | undefined, filter: args.filter as QueueInput["filter"], campaignId: args.campaign_id as string | undefined,
    subject: args.subject as string | undefined, body: args.body as string | undefined, limit: args.limit as number | undefined, dryRun,
  };
}

export const outreachTools: ToolDef[] = [
  {
    name: "marlo.create_campaign", title: "Create campaign", scope: "write",
    description: "Save a reusable outreach template (subject + body with merge fields).",
    inputSchema: obj({ name: str("Campaign name", { maxLength: 120 }), subject: str("Subject template", { maxLength: 180 }), body: str("Body template", { maxLength: 10000 }) }, ["name", "subject", "body"]),
    handler: async ({ actor }, args) => createCampaign(actor, args as { name: string; subject: string; body: string }),
  },
  {
    name: "marlo.list_campaigns", title: "List campaigns", scope: "read",
    description: "Campaigns with per-status message counts.",
    inputSchema: obj({}),
    handler: async () => ({ campaigns: await listCampaigns() }),
  },
  {
    name: "marlo.set_campaign_status", title: "Pause or resume campaign", scope: "send",
    description: "Pause stops its queued messages from sending; active resumes; completed closes it.",
    inputSchema: obj({ campaign_id: str("Campaign id"), status: str("New status", { enum: ["active", "paused", "completed"] }) }, ["campaign_id", "status"]),
    handler: async (_ctx, args) => setCampaignStatus(String(args.campaign_id), args.status as "active" | "paused" | "completed"),
  },
  {
    name: "marlo.preview_outreach", title: "Preview outreach", scope: "read",
    description: "Render the emails that queue_outreach would create, and list who would be skipped (no email, suppressed, already contacted). Writes nothing.",
    inputSchema: obj(queueProps),
    handler: async ({ actor }, args) => queueOutreach(actor, toQueue(args, true)),
  },
  {
    name: "marlo.queue_outreach", title: "Queue outreach", scope: "send",
    description: "Render and queue emails for leads. Nothing is sent yet; call send_queued to send in safe batches. Leads that are suppressed, unsubscribed, email-less or already contacted are skipped automatically.",
    inputSchema: obj(queueProps),
    handler: async ({ actor }, args) => queueOutreach(actor, toQueue(args, false)),
  },
  {
    name: "marlo.send_queued", title: "Send queued outreach", scope: "send",
    description:
      "Send one batch of queued emails through the connected Gmail account. Enforces the daily cap and a per-send delay and stops on Gmail errors. " +
      "Call repeatedly until remaining_queued is 0 or stopped_reason is set. Returns sent_today / remaining_today.",
    inputSchema: obj({ campaign_id: str("Only send this campaign's messages"), limit: int("Max emails this call (also capped by the server batch size)", 1, 25) }),
    handler: async ({ actor }, args) => sendQueued(actor, { limit: args.limit as number | undefined, campaignId: args.campaign_id as string | undefined }),
  },
  {
    name: "marlo.cancel_queued", title: "Cancel queued outreach", scope: "send",
    description: "Cancel queued (unsent) messages by campaign or message ids.",
    inputSchema: obj({ campaign_id: str("Cancel all queued messages in this campaign"), message_ids: strList("Specific message ids", 500) }),
    handler: async (_ctx, args) => cancelQueued({ campaignId: args.campaign_id as string | undefined, messageIds: args.message_ids as string[] | undefined }),
  },
  {
    name: "marlo.list_outreach_messages", title: "List outreach messages", scope: "read",
    description: "Queued, sent and failed messages.",
    inputSchema: obj({ status: str("Message status", { enum: ["queued", "sending", "sent", "failed", "cancelled", "skipped"] }), campaign_id: str("Campaign id"), limit: int("Page size", 1, 200) }),
    handler: async (_ctx, args) => ({ messages: await listMessages({ status: args.status as string | undefined, campaignId: args.campaign_id as string | undefined, limit: args.limit as number | undefined }) }),
  },
  {
    name: "marlo.outreach_stats", title: "Outreach statistics", scope: "read",
    description: "Queued, failed, sent today and the remaining daily allowance.",
    inputSchema: obj({}),
    handler: async () => outreachStats(),
  },
  {
    name: "marlo.list_suppressions", title: "List suppressed emails", scope: "read",
    description: "Addresses that will never be emailed (unsubscribes, bounces, manual).",
    inputSchema: obj({ limit: int("Max rows", 1, 500) }),
    handler: async (_ctx, args) => ({ suppressions: await listSuppressions(args.limit as number | undefined) }),
  },
  {
    name: "marlo.add_suppression", title: "Suppress an email", scope: "send",
    description: "Never email this address again; cancels its queued messages.",
    inputSchema: obj({ email: str("Email address"), reason: str("Reason", { enum: ["unsubscribe", "bounce", "manual", "complaint"] }) }, ["email"]),
    handler: async (_ctx, args) => addSuppression(String(args.email), (args.reason as "manual" | undefined) ?? "manual"),
  },
  {
    name: "marlo.remove_suppression", title: "Remove suppression", scope: "admin", destructive: true,
    description: "Allow emailing an address again. Admin only because it re-enables contact with someone who opted out.",
    inputSchema: obj({ email: str("Email address") }, ["email"]),
    handler: async (_ctx, args) => removeSuppression(String(args.email)),
  },
];
