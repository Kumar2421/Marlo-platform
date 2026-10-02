import { NextRequest, NextResponse } from "next/server";
import { authenticateMcpRequest, type McpAuth } from "@/lib/mcp-auth";
import { validate, type Schema } from "@/lib/mcp/schema";
import { toolsByName, tools } from "@/lib/mcp/tools";
import type { ToolDef } from "@/lib/mcp/registry";
import { audit, claimIdempotency, finishIdempotency } from "@/lib/services/audit";
import { leadStats } from "@/lib/services/leads";
import { outreachStats } from "@/lib/services/outreach";
import { getSendSettings } from "@/lib/services/settings";
import { ServiceError, type Actor } from "@/lib/services/types";

export const maxDuration = 60;

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "marlo-platform", title: "Marlo Platform", version: "0.2.0" };
const INSTRUCTIONS =
  "Marlo platform control plane. Typical outreach flow: marlo.import_leads (dry_run first) -> marlo.preview_outreach -> marlo.queue_outreach -> " +
  "marlo.send_queued repeatedly until remaining_queued is 0 or stopped_reason is set -> marlo.sync_replies later. " +
  "Never invent lead data or emails. Sends are capped per day; unsubscribes and bounces are suppressed automatically. " +
  "Pass idempotency_key on write tools so a retried call cannot repeat its effect.";

type Rpc = { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };

const ok = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

// ------------------------------------------------------------------ tool listing
function publicSchema(tool: ToolDef): Schema {
  if (tool.scope === "read") return tool.inputSchema;
  return {
    ...tool.inputSchema,
    properties: {
      ...tool.inputSchema.properties,
      idempotency_key: { type: "string", maxLength: 100, description: "Optional. Repeating a call with the same key returns the first result instead of acting again." },
    },
  };
}

function visibleTools(auth: McpAuth) {
  return tools.filter((tool) => auth.scopes.has(`marlo:${tool.scope}`));
}

function describe(tool: ToolDef) {
  return {
    name: tool.name,
    title: tool.title,
    description: `${tool.description} [scope: marlo:${tool.scope}]`,
    inputSchema: publicSchema(tool),
    annotations: {
      readOnlyHint: tool.scope === "read",
      destructiveHint: Boolean(tool.destructive),
      idempotentHint: tool.scope === "read",
      openWorldHint: tool.scope === "send",
    },
  };
}

// ------------------------------------------------------------------ rate limiting (per instance, best effort)
const windows = new Map<string, number[]>();
function limited(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) { windows.set(key, hits); return true; }
  hits.push(now);
  windows.set(key, hits);
  return false;
}

// ------------------------------------------------------------------ tools/call
function toolResult(value: unknown, isError = false) {
  const text = JSON.stringify(value);
  return isError
    ? { isError: true, content: [{ type: "text", text: typeof value === "string" ? value : text }] }
    : { content: [{ type: "text", text }], structuredContent: value && typeof value === "object" && !Array.isArray(value) ? value : { result: value } };
}

async function callTool(auth: McpAuth, name: string, rawArgs: Record<string, unknown>) {
  const actor: Actor = { userId: auth.user_id, via: "mcp", clientId: auth.client_id };
  const tool = toolsByName.get(name);
  if (!tool) return toolResult(`Unknown tool: ${name}`, true);

  if (!auth.scopes.has(`marlo:${tool.scope}`)) {
    await audit({ actor, action: name, status: "denied", meta: { required_scope: `marlo:${tool.scope}` } });
    return toolResult(`Forbidden: this token lacks the marlo:${tool.scope} scope. Re-authorize the connector with that scope.`, true);
  }
  if (limited(`${auth.token_id}:all`, 120) || (tool.scope === "send" && limited(`${auth.token_id}:send`, 30))) {
    return toolResult("Rate limit exceeded. Slow down and retry in a minute.", true);
  }

  const { idempotency_key: rawKey, ...args } = rawArgs;
  const idempotencyKey = typeof rawKey === "string" && rawKey.trim() ? rawKey.trim().slice(0, 100) : null;
  const problems = validate(tool.inputSchema, args);
  if (problems.length) return toolResult(`Invalid arguments: ${problems.join("; ")}`, true);

  const mutating = tool.scope !== "read";
  let claimId: string | null = null;
  if (mutating && idempotencyKey) {
    const claim = await claimIdempotency(actor, name, idempotencyKey);
    if (claim.state === "replay") return toolResult({ ...((claim.result as object | null) ?? {}), idempotent_replay: true });
    if (claim.state === "busy") return toolResult("[conflict] A call with this idempotency_key is still running. Retry shortly.", true);
    claimId = claim.id;
  }

  try {
    const result = await tool.handler({ actor, scopes: auth.scopes }, args);
    const meta = { arg_keys: Object.keys(args) };
    if (claimId) await finishIdempotency(claimId, { ok: true, result, meta });
    else if (mutating) await audit({ actor, action: name, meta });
    return toolResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool execution failed.";
    const meta = { arg_keys: Object.keys(args), error: message.slice(0, 300) };
    if (claimId) await finishIdempotency(claimId, { ok: false, meta });
    if (!claimId && mutating) await audit({ actor, action: name, status: "error", meta });
    const prefix = error instanceof ServiceError ? `[${error.code}] ` : "";
    return toolResult(prefix + message, true);
  }
}

// ------------------------------------------------------------------ resources and prompts
const resources = [
  { uri: "marlo://status", name: "Platform status", description: "Lead, outreach and daily-allowance counters", mimeType: "application/json" },
  { uri: "marlo://settings/send", name: "Send settings", description: "Daily cap, delay, signature and unsubscribe footer", mimeType: "application/json" },
];

async function readResource(uri: string) {
  if (uri === "marlo://status") return { leads: await leadStats(), outreach: await outreachStats() };
  if (uri === "marlo://settings/send") return getSendSettings();
  throw new ServiceError(`Unknown resource: ${uri}`, "not_found");
}

const prompts = [
  {
    name: "run_outreach",
    description: "Find, import and email a batch of leads safely.",
    arguments: [{ name: "audience", description: "Who to reach, e.g. SaaS founders in Berlin", required: true }, { name: "goal", description: "What the email should achieve", required: false }],
  },
  { name: "weekly_report", description: "Summarize the last 7 days of growth, product usage and platform health.", arguments: [] },
];

function getPrompt(name: string, args: Record<string, string>) {
  if (name === "run_outreach") {
    return {
      description: "Safe outreach workflow",
      messages: [{
        role: "user",
        content: { type: "text", text:
          `Run outreach for: ${args.audience ?? "(audience not given)"}. Goal: ${args.goal ?? "start a conversation"}.\n` +
          "1. marlo.get_platform_status and marlo.get_send_settings to see capacity.\n" +
          "2. Source leads from real pages only (never invent emails). marlo.import_leads with dry_run=true, then for real, tagging the batch.\n" +
          "3. marlo.preview_outreach with a short plain-text template using {{first_name}} and {{company}}; review the previews.\n" +
          "4. marlo.queue_outreach, then marlo.send_queued repeatedly until remaining_queued is 0 or stopped_reason is set.\n" +
          "5. Report counts sent, skipped (and why), and remaining daily allowance." },
      }],
    };
  }
  if (name === "weekly_report") {
    return {
      description: "Weekly platform report",
      messages: [{ role: "user", content: { type: "text", text:
        "Write a weekly platform report. Use marlo.get_trends (days=7), marlo.get_platform_status, marlo.list_replies, marlo.get_health_history (hours=168), " +
        "marlo.list_findings (status failed) and marlo.get_build_status. Cover growth, outreach results, product usage, reliability and the 3 most important next actions." } }],
    };
  }
  throw new ServiceError(`Unknown prompt: ${name}`, "not_found");
}

// ------------------------------------------------------------------ dispatcher
async function dispatch(body: Rpc, auth: McpAuth) {
  const id = body.id ?? null;
  const params = body.params ?? {};
  switch (body.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: {}, prompts: {} },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: visibleTools(auth).map(describe) });
    case "tools/call":
      return ok(id, await callTool(auth, String(params.name ?? ""), (params.arguments ?? {}) as Record<string, unknown>));
    case "resources/list":
      return ok(id, { resources });
    case "resources/read": {
      const uri = String(params.uri ?? "");
      try {
        return ok(id, { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(await readResource(uri)) }] });
      } catch (error) {
        return fail(id, -32002, error instanceof Error ? error.message : "Resource read failed.");
      }
    }
    case "prompts/list":
      return ok(id, { prompts });
    case "prompts/get":
      try {
        return ok(id, getPrompt(String(params.name ?? ""), (params.arguments ?? {}) as Record<string, string>));
      } catch (error) {
        return fail(id, -32602, error instanceof Error ? error.message : "Prompt not found.");
      }
    default:
      return fail(id, -32601, "Method not found.");
  }
}

export async function GET(req: NextRequest) {
  const origin = new URL(process.env.MARLO_MCP_ISSUER ?? req.url).origin;
  return NextResponse.json({ service: "marlo-platform-mcp", status: "ok", endpoint: origin + "/mcp", transport: "streamable-http-jsonrpc", version: SERVER_INFO.version });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateMcpRequest(req);
  if (!auth) {
    return new NextResponse(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" } }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${new URL(process.env.MARLO_MCP_ISSUER ?? req.url).origin}/.well-known/oauth-protected-resource"`,
      },
    });
  }

  const body = await req.json().catch(() => null) as Rpc | Rpc[] | null;
  if (!body || typeof body !== "object") return NextResponse.json(fail(null, -32700, "Parse error."));

  // JSON-RPC batch support.
  if (Array.isArray(body)) {
    const results = await Promise.all(body.map(async (item) => {
      const response = await dispatch(item, auth);
      return item.method?.startsWith("notifications/") || item.id === undefined ? null : response;
    }));
    const responses = results.filter(Boolean);
    return responses.length ? NextResponse.json(responses) : new NextResponse(null, { status: 202 });
  }

  if (!body.method) return NextResponse.json(fail(body.id ?? null, -32600, "Invalid MCP request."));
  if (body.method.startsWith("notifications/")) return new NextResponse(null, { status: 202 });
  return NextResponse.json(await dispatch(body, auth));
}
