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
  created_at: number;
  updated_at: number;
}

function json(request: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

export const onRequestOptions: PagesFunction<Env> = async (ctx) =>
  new Response(null, { status: 204, headers: corsHeaders(ctx.request) });

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const user = await resolveCreatorUser(ctx.request, ctx.env);
  if (!user) return json(ctx.request, { error: "Unauthorized" }, 401);

  const userId = user.sub ?? user.github;
  const limit = Math.min(Number(new URL(ctx.request.url).searchParams.get("limit") || 50), 200);
  const result = await ctx.env.DB.prepare(
    `SELECT session_id, name, app_id, app_url, deployed, created_at, updated_at
     FROM agent_sessions
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT ?`,
  )
    .bind(userId, limit)
    .all<SessionRow>();

  return json(ctx.request, {
    sessions: (result.results ?? []).map((row) => ({
      id: row.session_id,
      name: row.name,
      appId: row.app_id ?? undefined,
      appUrl: row.app_url ?? undefined,
      deployed: row.deployed === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
};
