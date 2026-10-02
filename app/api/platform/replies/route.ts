import { adminRoute, param, readJson } from "@/lib/api";
import { listReplies, markReply, syncReplies, type ReplyClass } from "@/lib/services/replies";
import { ServiceError } from "@/lib/services/types";

export const GET = adminRoute(async (_actor, req) => ({
  replies: await listReplies({ classification: param(req, "classification"), limit: Number(param(req, "limit")) || undefined }),
}));

export const POST = adminRoute(async (actor, req) => {
  const body = await readJson(req);
  if (body.action === "sync") return syncReplies(actor, { limit: body.limit as number | undefined });
  if (body.action === "mark") return markReply(String(body.leadId), body.classification as ReplyClass);
  throw new ServiceError("Unknown action.");
}, async (req) => {
  const body = await req.clone().json().catch(() => null) as { action?: string } | null;
  return body?.action ? `replies.${body.action}` : null;
});

export const maxDuration = 60;
