import { createAdminClient } from "@/lib/admin";
import { adminRoute, readJson } from "@/lib/api";
import { LEAD_COLUMNS } from "@/lib/services/leads";
import { sendOne } from "@/lib/services/outreach";
import { ServiceError } from "@/lib/services/types";

// Legacy single-send endpoint. New UI uses /api/platform/outreach; both share lib/services/outreach.
export const GET = adminRoute(async (actor) => {
  const db = createAdminClient();
  const [{ data: leads, error }, { data: connection }] = await Promise.all([
    db.from("leads").select(LEAD_COLUMNS + ",gmail_thread_id").eq("scope", "platform").order("created_at", { ascending: false }).limit(100),
    db.from("integration_connections").select("external_email").eq("user_id", actor.userId).is("project_id", null).eq("provider", "gmail").maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  return { leads: leads ?? [], gmail: connection?.external_email ?? null };
});

export const POST = adminRoute(async (actor, req) => {
  const body = await readJson(req);
  const leadId = String(body.leadId ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const message = String(body.message ?? "").trim();
  if (!leadId || !subject || !message) throw new ServiceError("leadId, subject and message are required.");
  if (subject.length > 180 || message.length > 10000) throw new ServiceError("Subject or message is too long.");
  return sendOne(actor, leadId, subject, message);
}, "outreach.send_one");
