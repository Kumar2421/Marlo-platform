import { listReplies, markReply, REPLY_CLASSES, syncReplies, type ReplyClass } from "@/lib/services/replies";
import { int, obj, str, type ToolDef } from "../registry";

export const replyTools: ToolDef[] = [
  {
    name: "marlo.sync_replies", title: "Sync Gmail replies", scope: "send",
    description:
      "Check Gmail threads of contacted leads for new replies. Replies are classified (interested, negative, unsubscribe, bounce, auto_reply, neutral); " +
      "unsubscribes and bounces are added to the suppression list automatically.",
    inputSchema: obj({ limit: int("How many recent threads to check (default 50)", 1, 100) }),
    handler: async ({ actor }, args) => syncReplies(actor, { limit: args.limit as number | undefined }),
  },
  {
    name: "marlo.list_replies", title: "List replies", scope: "read",
    description: "Leads that replied, newest first, with the reply snippet and classification.",
    inputSchema: obj({ classification: str("Filter by classification", { enum: REPLY_CLASSES }), limit: int("Page size", 1, 200) }),
    handler: async (_ctx, args) => ({ replies: await listReplies({ classification: args.classification as string | undefined, limit: args.limit as number | undefined }) }),
  },
  {
    name: "marlo.mark_reply", title: "Classify a reply", scope: "write",
    description: "Override the classification of a lead's reply. Marking unsubscribe or bounce suppresses the address.",
    inputSchema: obj({ lead_id: str("Lead id"), classification: str("Classification", { enum: REPLY_CLASSES }) }, ["lead_id", "classification"]),
    handler: async (_ctx, args) => markReply(String(args.lead_id), args.classification as ReplyClass),
  },
];
