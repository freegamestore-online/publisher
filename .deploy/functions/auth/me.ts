interface Env {
  SESSIONS: KVNamespace;
}

const COOKIE_NAME = "fgs_pub_session";

function parseCookie(request: Request): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const token = parseCookie(context.request);
  if (!token) {
    return new Response(JSON.stringify({ user: null }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const raw = await context.env.SESSIONS.get(`sessions:${token}`);
  if (!raw) {
    return new Response(JSON.stringify({ user: null }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const user = JSON.parse(raw);
  return new Response(JSON.stringify({ user }), {
    headers: { "Content-Type": "application/json" },
  });
};
