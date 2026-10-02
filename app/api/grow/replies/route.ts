import { adminRoute } from "@/lib/api";
import { syncReplies } from "@/lib/services/replies";

export const maxDuration = 60;

// Legacy endpoint kept for the old Grow panel; shares lib/services/replies with the MCP tool.
export const POST = adminRoute(async (actor) => {
  const result = await syncReplies(actor, { limit: 100 });
  return { ok: true, replies: result.new_replies, ...result };
}, "replies.sync");
