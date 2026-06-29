// Shared auth + CORS for publisher API functions.
//
// Accepts either the publisher's own session (fgs_pub_session -> KV) OR the
// creator console's auth JWT (fgs_token), so the console can call /api/create
// and /api/publish directly without a second sign-in. The fgs_token is a
// GitHub-OAuth JWT minted by the auth worker; its `login` claim is the GitHub
// username, which is exactly the creator identity these endpoints need.
//
// Requires JWT_SECRET (same value as the auth worker) to verify console tokens.
// Files prefixed with `_` are not routed by Pages, so this is import-only.

export interface SessionEnv {
  SESSIONS: KVNamespace;
  JWT_SECRET?: string;
}

const ALLOWED_ORIGIN = /^https:\/\/[\w-]+\.freegamestore\.online$/;

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGIN.test(origin) ? origin : "https://console.freegamestore.online";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
}

function getCookie(request: Request, name: string): string | null {
  const c = request.headers.get("Cookie");
  if (!c) return null;
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    if (header.alg !== "HS256") return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))) as Record<string, unknown>;
    if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** GitHub login of the signed-in creator, from either session source, or null. */
export async function resolveCreator(request: Request, env: SessionEnv): Promise<string | null> {
  const pub = getCookie(request, "fgs_pub_session");
  if (pub) {
    const raw = await env.SESSIONS.get(`sessions:${pub}`);
    if (raw) {
      try {
        return (JSON.parse(raw) as { github: string }).github;
      } catch {
        // fall through to JWT
      }
    }
  }
  const tok = getCookie(request, "fgs_token");
  if (tok && env.JWT_SECRET) {
    const p = await verifyJWT(tok, env.JWT_SECRET);
    if (p && typeof p.login === "string") return p.login;
  }
  return null;
}
