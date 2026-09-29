import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/admin";
import { authenticateMcpRequest } from "@/lib/mcp-auth";

const PROTOCOL_VERSION = "2025-06-18";

function jsonRpc(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function errorRpc(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: 200 });
}

function dedupeKey(input: Record<string, unknown>) {
  const email = String(input.email ?? "").trim().toLowerCase();
  const source = String(input.source_url ?? "").trim().toLowerCase();
  const identity = [input.name, input.company, input.location].map((v) => String(v ?? "").trim().toLowerCase()).join("|");
  return createHash("sha256").update(email || source || identity).digest("hex");
}

async function toolCall(userId: string, clientId: string, name: string, args: Record<string, unknown>) {
  const db = createAdminClient();

  await db.from("platform_mcp_events").insert({
    user_id: userId,
    client_id: clientId,
    event_type: "tool_call",
    payload: { tool: name, arguments: args },
  });

  if (name === "marlo.create_lead") {
    const nameValue = String(args.name ?? "").trim();
    const company = String(args.company ?? "").trim();
    const email = String(args.email ?? "").trim() || null;
    if (!nameValue && !company) throw new Error("name or company is required.");

    const key = dedupeKey(args);
    const { data: existing } = await db.from("leads")
      .select("id,name,company,email")
      .eq("scope", "platform")
      .eq("dedupe_key", key)
      .maybeSingle();
    if (existing) return { created: false, lead: existing, reason: "duplicate" };

    const { data, error } = await db.from("leads").insert({
      scope: "platform",
      user_id: userId,
      project_id: null,
      name: nameValue || null,
      title: String(args.title ?? "").trim() || null,
      company: company || null,
      location: String(args.location ?? "").trim() || null,
      email,
      email_quality: email ? "source_found" : "unknown",
      source_url: String(args.source_url ?? "").trim() || null,
      query: String(args.query ?? "").trim() || "MCP",
      phone: String(args.phone ?? "").trim() || null,
      dedupe_key: key,
    }).select("id,name,title,company,location,email,email_quality,source_url,created_at").single();
    if (error) throw new Error(error.message);
    return { created: true, lead: data };
  }

  if (name === "marlo.create_note" || name === "marlo.create_activity") {
    const eventType = name === "marlo.create_note" ? "note" : "activity";
    const { data, error } = await db.from("platform_mcp_events").insert({
      user_id: userId,
      client_id: clientId,
      event_type: eventType,
      payload: {
        title: String(args.title ?? "").trim(),
        content: String(args.content ?? "").trim(),
        metadata: args.metadata ?? {},
      },
    }).select("id,event_type,payload,created_at").single();
    if (error) throw new Error(error.message);
    return data;
  }

  if (name === "marlo.get_leads") {
    const limit = Math.min(Math.max(Number(args.limit ?? 25), 1), 100);
    const { data, error } = await db.from("leads")
      .select("id,name,title,company,location,email,email_quality,email_status,emailed_at,last_reply_at,last_reply_snippet,source_url,created_at")
      .eq("scope", "platform")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return { leads: data ?? [] };
  }

  if (name === "marlo.get_platform_status") {
    const [leads, emailReady, sent, replies] = await Promise.all([
      db.from("leads").select("id", { count: "exact", head: true }).eq("scope", "platform"),
      db.from("leads").select("id", { count: "exact", head: true }).eq("scope", "platform").not("email", "is", null),
      db.from("leads").select("id", { count: "exact", head: true }).eq("scope", "platform").not("emailed_at", "is", null),
      db.from("leads").select("id", { count: "exact", head: true }).eq("scope", "platform").not("last_reply_at", "is", null),
    ]);
    const failure = [leads, emailReady, sent, replies].find((item) => item.error);
    if (failure?.error) throw new Error(failure.error.message);
    return {
      leads: leads.count ?? 0,
      email_ready: emailReady.count ?? 0,
      sent: sent.count ?? 0,
      replies: replies.count ?? 0,
    };
  }

  throw new Error("Unknown tool: " + name);
}

const tools = [
  {
    name: "marlo.create_lead",
    description: "Send a verified or externally supplied lead into the Marlo platform acquisition lead pool. Marlo does not invent missing lead data.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" }, title: { type: "string" }, company: { type: "string" },
        location: { type: "string" }, email: { type: "string" }, phone: { type: "string" },
        source_url: { type: "string" }, query: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "marlo.create_note",
    description: "Send arbitrary useful information into the Marlo admin activity stream as a note.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" }, content: { type: "string" }, metadata: { type: "object" } },
      required: ["content"],
    },
  },
  {
    name: "marlo.create_activity",
    description: "Send a structured activity or event into Marlo for admin review.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" }, content: { type: "string" }, metadata: { type: "object" } },
      required: ["content"],
    },
  },
  {
    name: "marlo.get_leads",
    description: "Read the current Marlo platform acquisition leads.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } },
  },
  {
    name: "marlo.get_platform_status",
    description: "Read current Marlo platform acquisition and outreach counters.",
    inputSchema: { type: "object", properties: {} },
  },
];

export async function POST(req: NextRequest) {
  const auth = await authenticateMcpRequest(req);
  if (!auth) {
    return new NextResponse(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer resource_metadata="/.well-known/oauth-protected-resource"',
      },
    });
  }

  const body = await req.json().catch(() => null) as { id?: unknown; method?: string; params?: Record<string, unknown> } | null;
  if (!body?.method) return errorRpc(body?.id ?? null, -32600, "Invalid MCP request.");

  if (body.method === "initialize") {
    return jsonRpc(body.id ?? null, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "marlo-platform", version: "0.1.0" },
    });
  }

  if (body.method === "notifications/initialized") return new NextResponse(null, { status: 202 });

  if (body.method === "tools/list") {
    return jsonRpc(body.id ?? null, { tools });
  }

  if (body.method === "tools/call") {
    const params = body.params ?? {};
    const name = String(params.name ?? "");
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    try {
      const result = await toolCall(auth.user_id, auth.client_id, name, args);
      return jsonRpc(body.id ?? null, {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      });
    } catch (error) {
      return errorRpc(body.id ?? null, -32000, error instanceof Error ? error.message : "Tool execution failed.");
    }
  }

  return errorRpc(body.id ?? null, -32601, "Method not found.");
}
