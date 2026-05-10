interface Env {
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  SESSIONS: KVNamespace;
}

const COOKIE_NAME = "fgs_pub_session";
const COOKIE_DOMAIN = ".freegamestore.online";
const SESSION_DAYS = 30;

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sessionCookie(token: string, maxAge: number): string {
  return `${COOKIE_NAME}=${token}; Domain=${COOKIE_DOMAIN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "/";

  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: context.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: context.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/auth/github/callback`,
    }),
  });
  const tokens = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokens.access_token) {
    return new Response("Token exchange failed", { status: 400 });
  }

  // Fetch user info
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "freegamestore-publisher",
    },
  });
  const ghUser = (await userRes.json()) as {
    login: string; name: string | null; avatar_url: string; email: string | null;
  };

  // If email not public, fetch from emails endpoint
  let email = ghUser.email;
  if (!email) {
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "freegamestore-publisher",
      },
    });
    const emails = (await emailRes.json()) as { email: string; primary: boolean }[];
    email = emails.find((e) => e.primary)?.email || emails[0]?.email || null;
  }

  // Create session in KV
  const token = generateToken();
  const session = {
    github: ghUser.login,
    name: ghUser.name || ghUser.login,
    avatarUrl: ghUser.avatar_url,
    email,
    createdAt: new Date().toISOString(),
  };
  await context.env.SESSIONS.put(`sessions:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_DAYS * 24 * 60 * 60,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: state,
      "Set-Cookie": sessionCookie(token, SESSION_DAYS * 24 * 60 * 60),
    },
  });
};
