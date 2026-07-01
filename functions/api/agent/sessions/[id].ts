import { corsHeaders, resolveCreatorUser, type SessionEnv } from "../../_auth";

interface Env extends SessionEnv {
  DB: D1Database;
}

interface SessionRow {
  session_id: string;
  name: string;
  app_id: string | null;
  app_url: string | null;
  deployed: number;
  messages: string | null;
  deploy_state: string | null;
  deploy_log: string | null;
  errors: string | null;
  created_at: number;
  updated_at: number;
}

function json(request: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const onRequestOptions: PagesFunction<Env> = async (ctx) =>
  new Response(null, { status: 204, headers: corsHeaders(ctx.request) });

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const user = await resolveCreatorUser(ctx.request, ctx.env);
  if (!user) return json(ctx.request, { error: "Unauthorized" }, 401);

  const sessionId = ctx.params.id as string;
  const userId = user.sub ?? user.github;
  const row = await ctx.env.DB.prepare("SELECT * FROM agent_sessions WHERE session_id = ? AND user_id = ?")
    .bind(sessionId, userId)
    .first<SessionRow>();

  if (!row) return json(ctx.request, { session: null });

  return json(ctx.request, {
    session: {
      id: row.session_id,
      name: row.name,
      appId: row.app_id ?? undefined,
      appUrl: row.app_url ?? undefined,
      deployed: row.deployed === 1,
      messages: safeJson(row.messages, []),
      deployState: safeJson(row.deploy_state, null),
      deployLog: safeJson(row.deploy_log, []),
      errors: safeJson(row.errors, []),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
};

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  const user = await resolveCreatorUser(ctx.request, ctx.env);
  if (!user) return json(ctx.request, { error: "Unauthorized" }, 401);

  const sessionId = ctx.params.id as string;
  const body = await ctx.request
    .json<{ name?: string; appId?: string; appUrl?: string; deployed?: boolean; messages?: unknown[]; deployState?: unknown }>()
    .catch(() => null);
  if (!body) return json(ctx.request, { error: "invalid body" }, 400);

  const existing = await ctx.env.DB.prepare("SELECT user_id FROM agent_sessions WHERE session_id = ?")
    .bind(sessionId)
    .first<{ user_id: string }>();

  const userId = user.sub ?? user.github;
  if (existing && existing.user_id !== userId) {
    return json(ctx.request, { error: "session belongs to another user" }, 403);
  }

  const now = Date.now();
  const name = body.name ?? null;
  const appId = body.appId ?? null;
  const appUrl = body.appUrl ?? null;
  const deployed = body.deployed === undefined ? null : body.deployed ? 1 : 0;
  const messages = body.messages ? JSON.stringify(body.messages) : null;
  const deployState = body.deployState ? JSON.stringify(body.deployState) : null;

  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      `INSERT INTO agent_sessions
        (session_id, user_id, user_login, name, app_id, app_url, deployed, messages, deploy_state, created_at, updated_at)
       VALUES (?, ?, ?, COALESCE(?, 'New Game'), ?, ?, COALESCE(?, 0), ?, ?, ?, ?)
       ON CONFLICT(session_id) DO NOTHING`,
    ).bind(sessionId, userId, user.github, name, appId, appUrl, deployed, messages, deployState, now, now),
    ctx.env.DB.prepare(
      `UPDATE agent_sessions SET
         user_login = COALESCE(?, user_login),
         name = COALESCE(?, name),
         app_id = COALESCE(?, app_id),
         app_url = COALESCE(?, app_url),
         deployed = COALESCE(?, deployed),
         messages = COALESCE(?, messages),
         deploy_state = COALESCE(?, deploy_state),
         updated_at = ?
       WHERE session_id = ? AND user_id = ?`,
    ).bind(user.github, name, appId, appUrl, deployed, messages, deployState, now, sessionId, userId),
  ]);

  return json(ctx.request, { ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const user = await resolveCreatorUser(ctx.request, ctx.env);
  if (!user) return json(ctx.request, { error: "Unauthorized" }, 401);

  const userId = user.sub ?? user.github;
  await ctx.env.DB.prepare("DELETE FROM agent_sessions WHERE session_id = ? AND user_id = ?")
    .bind(ctx.params.id as string, userId)
    .run();

  return json(ctx.request, { ok: true });
};
