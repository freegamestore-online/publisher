interface Env {
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  GITHUB_TOKEN: string;
  MAX_APPS_PER_USER: string;
  CREATORS: KVNamespace;
  SESSIONS: KVNamespace;
}

const CONFIG = {
  org: "freegamestore-online",
  domain: "freegamestore.online",
};

const TEMPLATES: Record<string, string> = {
  canvas: "template-game-canvas",
  grid: "template-game-grid",
  cards: "template-game-cards",
  "3d": "template-game-3d",
};

const COOKIE_NAME = "fgs_pub_session";

function parseCookie(request: Request): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}

function validateId(id: string): string | null {
  if (!id) return "ID is required";
  if (id.length > 58) return "ID must be 58 characters or less";
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(id)) return "Lowercase letters, numbers, dashes only. No start/end dash.";
  if (id.startsWith("free") || id.startsWith("pro")) return "Cannot start with 'free' or 'pro'";
  return null;
}

/**
 * POST /api/create — creates repo + CF Pages project (preview only).
 * Does NOT add custom domain, DNS, or registry entry.
 * The game is available at free<id>app.pages.dev for preview.
 * Use POST /api/publish to make it live on the store.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const token = parseCookie(context.request);
  let user: string | null = null;
  if (token) {
    const raw = await context.env.SESSIONS.get(`sessions:${token}`);
    if (raw) {
      const session = JSON.parse(raw) as { github: string };
      user = session.github;
    }
  }
  const json = (v: unknown, status = 200) =>
    new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });

  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await context.request.json() as Record<string, string>;
  const idErr = validateId(body.id);
  if (idErr) return json({ error: idErr }, 400);
  if (!body.name) return json({ error: "name required" }, 400);

  const id = body.id;
  const name = body.name;
  const description = body.description || name;
  const template = body.template || "canvas";
  const templateRepo = TEMPLATES[template] || TEMPLATES["canvas"]!;
  const cfProject = `free${id}app`;
  const steps: { name: string; status: string; detail: string }[] = [];

  // 1. Create GitHub repo from template
  const repoCheck = await fetch(`https://api.github.com/repos/${CONFIG.org}/${id}`, {
    headers: { Authorization: `Bearer ${context.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "freegamestore-publisher" },
  });
  if ((await repoCheck.json() as Record<string, unknown>).id) {
    steps.push({ name: "GitHub repo", status: "skip", detail: "Already exists" });
  } else {
    const createRes = await fetch(`https://api.github.com/repos/${CONFIG.org}/${templateRepo}/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${context.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "freegamestore-publisher", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ owner: CONFIG.org, name: id, private: false, description }),
    });
    const createData = await createRes.json() as Record<string, unknown>;
    steps.push({ name: "GitHub repo", status: createData.id ? "ok" : "fail", detail: createData.id ? `${CONFIG.org}/${id}` : ((createData.message as string) || "Failed") });
    if (!createData.id) return json({ steps, success: false }, 400);
  }

  // 2. CF Pages project (for preview — no custom domain yet)
  const projRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${context.env.CF_ACCOUNT_ID}/pages/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${context.env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: cfProject,
      source: { type: "github", config: { owner: CONFIG.org, repo_name: id, production_branch: "main", deployments_enabled: true, production_deployments_enabled: true } },
      build_config: { build_command: "npx pnpm@10 install && npx pnpm@10 build", destination_dir: "web/dist" },
      deployment_configs: { production: { env_vars: { NODE_VERSION: { value: "22" } } } },
    }),
  });
  const projData = await projRes.json() as { success: boolean; errors?: { message: string }[] };
  steps.push({ name: "CF Pages", status: projData.success ? "ok" : "skip", detail: projData.success ? cfProject : (projData.errors?.[0]?.message || "Exists") });

  // 3. Give creator push access
  await fetch(`https://api.github.com/repos/${CONFIG.org}/${id}/collaborators/${user}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${context.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "freegamestore-publisher" },
    body: JSON.stringify({ permission: "push" }),
  });
  steps.push({ name: "Access", status: "ok", detail: `@${user} has push access` });

  // 4. Add to creators team
  await fetch(`https://api.github.com/orgs/${CONFIG.org}/teams/creators/memberships/${user}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${context.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "freegamestore-publisher" },
    body: JSON.stringify({ role: "member" }),
  });

  const previewUrl = `https://${cfProject}.pages.dev`;
  return json({ steps, success: true, previewUrl, repoUrl: `https://github.com/${CONFIG.org}/${id}` });
};
