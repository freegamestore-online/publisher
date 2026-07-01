import { corsHeaders, resolveCreatorUser, type SessionEnv } from "../../../_auth";

interface Env extends SessionEnv {
  DB: D1Database;
}

function json(request: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

export const onRequestOptions: PagesFunction<Env> = async (ctx) =>
  new Response(null, { status: 204, headers: corsHeaders(ctx.request) });

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  const user = await resolveCreatorUser(ctx.request, ctx.env);
  if (!user) return json(ctx.request, { error: "Unauthorized" }, 401);

  const body = await ctx.request.json<{ messages?: unknown[] }>().catch(() => null);
  if (!Array.isArray(body?.messages)) return json(ctx.request, { error: "messages required" }, 400);

  const messages = JSON.stringify(body.messages.slice(-300));
  if (messages.length > 2_000_000) return json(ctx.request, { error: "messages too large (max 2MB)" }, 413);

  const userId = user.sub ?? user.github;
  await ctx.env.DB.prepare(
    "UPDATE agent_sessions SET messages = ?, updated_at = ? WHERE session_id = ? AND user_id = ?",
  )
    .bind(messages, Date.now(), ctx.params.id as string, userId)
    .run();

  return json(ctx.request, { ok: true });
};
