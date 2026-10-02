import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getClient, issueAuthorizationCode, parseScope } from "@/lib/mcp-auth";

const SCOPE_LABELS: Record<string, string> = {
  "marlo:read": "Read leads, outreach, users, projects, builds and activity",
  "marlo:write": "Create and edit leads, campaigns, notes and settings data",
  "marlo:send": "Send email from your connected Gmail account, within daily limits",
  "marlo:admin": "Manage MCP sessions, CI reruns, suppression removal and the audit log",
};

function issuer(req: NextRequest) {
  return new URL(process.env.MARLO_MCP_ISSUER ?? req.url).origin;
}

function esc(value: string) {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (c) => map[c]);
}

function oauthError(message: string, status = 400) {
  return new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

type Params = { clientId: string; redirectUri: string; codeChallenge: string; state: string; scope: string };

async function validate(p: Params, method: string | null) {
  if (method && method !== "S256") return { error: "Only PKCE method S256 is supported." } as const;
  if (!p.clientId || !p.redirectUri || !p.codeChallenge) return { error: "Invalid OAuth authorization request." } as const;
  const client = await getClient(p.clientId);
  if (!client) return { error: "Unknown or revoked client. Register the client first." } as const;
  // Exact match against the registered list. This is what stops code theft via a crafted link.
  if (!client.redirect_uris.includes(p.redirectUri)) return { error: "redirect_uri is not registered for this client." } as const;
  return { client } as const;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (q.get("response_type") !== "code") return oauthError("Invalid OAuth authorization request.");
  const params: Params = {
    clientId: q.get("client_id") ?? "", redirectUri: q.get("redirect_uri") ?? "",
    codeChallenge: q.get("code_challenge") ?? "", state: q.get("state") ?? "", scope: parseScope(q.get("scope")),
  };
  const checked = await validate(params, q.get("code_challenge_method"));
  if ("error" in checked) return oauthError(checked.error ?? "Invalid request");

  const { user, authorized } = await requireAdmin();
  if (!user) {
    const next = req.nextUrl.pathname + req.nextUrl.search;
    return NextResponse.redirect(new URL("/login?next=" + encodeURIComponent(next), issuer(req)));
  }
  if (!authorized) return oauthError("Marlo administrator access required.", 403);

  const host = new URL(params.redirectUri).host;
  const scopes = params.scope.split(" ").map((s) => `<li><code>${esc(s)}</code><span>${esc(SCOPE_LABELS[s] ?? s)}</span></li>`).join("");
  const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${esc(value)}">`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize MCP client</title>
<style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d10;color:#e8eaed;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.card{width:min(520px,92vw);border:1px solid #23272e;border-radius:10px;padding:28px;background:#111419}h1{font-size:16px;margin:0 0 4px}p{color:#9aa0a6;margin:4px 0 16px}
ul{list-style:none;padding:0;margin:0 0 20px;display:grid;gap:8px}li{display:grid;gap:2px;border:1px solid #23272e;border-radius:6px;padding:10px}li span{color:#9aa0a6;font-size:12px}
.row{display:flex;gap:10px}button{flex:1;padding:10px;border-radius:6px;border:1px solid #2f353d;background:#181c22;color:inherit;font:inherit;cursor:pointer}button.go{background:#e8eaed;color:#0b0d10;border-color:#e8eaed}</style></head>
<body><form class="card" method="post" action="/oauth/authorize"><h1>Authorize <strong>${esc(checked.client.client_name)}</strong>?</h1>
<p>Redirects to <code>${esc(host)}</code>. Signed in as ${esc(user.email ?? user.id)}. This client will act as you inside the Marlo platform:</p><ul>${scopes}</ul>
${hidden("client_id", params.clientId)}${hidden("redirect_uri", params.redirectUri)}${hidden("code_challenge", params.codeChallenge)}${hidden("state", params.state)}${hidden("scope", params.scope)}
<div class="row"><button type="submit" name="decision" value="deny">Deny</button><button class="go" type="submit" name="decision" value="approve">Approve</button></div></form></body></html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'" },
  });
}

export async function POST(req: NextRequest) {
  // Consent submissions must come from our own consent page.
  const origin = req.headers.get("origin");
  if (origin && origin !== issuer(req)) return oauthError("Cross-origin consent rejected.", 403);

  const form = await req.formData();
  const params: Params = {
    clientId: String(form.get("client_id") ?? ""), redirectUri: String(form.get("redirect_uri") ?? ""),
    codeChallenge: String(form.get("code_challenge") ?? ""), state: String(form.get("state") ?? ""), scope: parseScope(String(form.get("scope") ?? "")),
  };
  const checked = await validate(params, null);
  if ("error" in checked) return oauthError(checked.error ?? "Invalid request");

  const { user, authorized } = await requireAdmin();
  if (!user || !authorized) return oauthError("Marlo administrator access required.", 403);

  const target = new URL(params.redirectUri);
  if (params.state) target.searchParams.set("state", params.state);
  if (form.get("decision") !== "approve") {
    target.searchParams.set("error", "access_denied");
    return NextResponse.redirect(target, 303);
  }
  const code = await issueAuthorizationCode({ userId: user.id, clientId: params.clientId, redirectUri: params.redirectUri, codeChallenge: params.codeChallenge, scope: params.scope });
  target.searchParams.set("code", code);
  return NextResponse.redirect(target, 303);
}
