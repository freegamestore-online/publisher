import { resolveCreator, corsHeaders } from "./_auth";

interface Env {
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  CF_GLOBAL_KEY: string;
  CF_EMAIL: string;
  GITHUB_TOKEN: string;
  SESSIONS: KVNamespace;
  JWT_SECRET?: string;
}

const CONFIG = {
  org: "freegamestore-online",
  domain: "freegamestore.online",
  zoneId: "fd33f88109b97569f2c5d6f1e5bb62ae",
  storeRepo: "freegamestore",
  registryKey: "games",
};

export const onRequestOptions: PagesFunction<Env> = async (ctx) =>
  new Response(null, { status: 204, headers: corsHeaders(ctx.request) });

/**
 * POST /api/publish — makes a draft game live on the store.
 * Adds custom domain, DNS CNAME, and registry entry.
 * The game must already exist (created via /api/create).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const user = await resolveCreator(context.request, context.env);
  const json = (v: unknown, status = 200) =>
    new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json", ...corsHeaders(context.request) } });

  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await context.request.json() as Record<string, string>;
  const id = body.id;
  const name = body.name || id;
  const category = body.category || "arcade";
  const icon = body.icon || "";
  const iconBg = body.iconBg || "#1a2e26";
  const description = body.description || name;

  if (!id) return json({ error: "id required" }, 400);

  // Verify the repo exists and user has access
  const collabRes = await fetch(`https://api.github.com/repos/${CONFIG.org}/${id}/collaborators/${user}`, {
    headers: { Authorization: `Bearer ${context.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "freegamestore-publisher" },
  });
  if (collabRes.status !== 204) return json({ error: "You don't have access to this game" }, 403);

  const cfProject = `free${id}app`;
  const subdomain = `${id}.${CONFIG.domain}`;
  const steps: { name: string; status: string; detail: string }[] = [];

  // 1. Custom domain on CF Pages
  const domRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${context.env.CF_ACCOUNT_ID}/pages/projects/${cfProject}/domains`, {
    method: "POST",
    headers: { Authorization: `Bearer ${context.env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: subdomain }),
  });
  const domData = await domRes.json() as { success: boolean };
  steps.push({ name: "Domain", status: domData.success ? "ok" : "skip", detail: domData.success ? subdomain : "Already configured" });

  // 2. DNS CNAME
  if (context.env.CF_GLOBAL_KEY) {
    const dnsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${CONFIG.zoneId}/dns_records`, {
      method: "POST",
      headers: { "X-Auth-Email": context.env.CF_EMAIL, "X-Auth-Key": context.env.CF_GLOBAL_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "CNAME", name: id, content: `${cfProject}.pages.dev`, proxied: true }),
    });
    const dnsData = await dnsRes.json() as { success: boolean };
    steps.push({ name: "DNS", status: dnsData.success ? "ok" : "skip", detail: dnsData.success ? `${id} -> ${cfProject}.pages.dev` : "Already exists" });
  } else {
    steps.push({ name: "DNS", status: "skip", detail: "CF_GLOBAL_KEY not set — add CNAME manually" });
  }

  // 3. Add to store registry
  const regPath = `/repos/${CONFIG.org}/${CONFIG.storeRepo}/contents/registry.json`;
  const regRes = await fetch(`https://api.github.com${regPath}`, {
    headers: { Authorization: `Bearer ${context.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "freegamestore-publisher" },
  });
  const regFile = await regRes.json() as { content?: string; sha?: string };
  if (regFile.content) {
    const raw = new TextDecoder().decode(Uint8Array.from(atob(regFile.content.replace(/\n/g, "")), c => c.charCodeAt(0)));
    const content = JSON.parse(raw) as Record<string, { id: string }[]>;
    const items = content[CONFIG.registryKey] || [];
    if (!items.some((a) => a.id === id)) {
      items.push({ id, name, category, icon, iconBg, description, appUrl: `https://${subdomain}`, repo: `${CONFIG.org}/${id}`, cfProject, type: "standalone", developer: user } as never);
      content[CONFIG.registryKey] = items;
      const encoded = btoa(Array.from(new TextEncoder().encode(JSON.stringify(content, null, 2))).map(b => String.fromCharCode(b)).join(""));
      await fetch(`https://api.github.com${regPath}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${context.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "freegamestore-publisher", "X-GitHub-Api-Version": "2022-11-28" },
        body: JSON.stringify({ message: `Publish ${name} by @${user}`, content: encoded, sha: regFile.sha }),
      });
      steps.push({ name: "Registry", status: "ok", detail: `Added ${name} to store` });
    } else {
      steps.push({ name: "Registry", status: "skip", detail: "Already in store" });
    }
  }

  // 4. Notify admin
  await fetch(`https://api.github.com/repos/${CONFIG.org}/submissions/issues`, {
    method: "POST",
    headers: { Authorization: `Bearer ${context.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "freegamestore-publisher", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({
      title: `[Published] ${name} by @${user}`,
      body: `**${name}** (\`${id}\`) published by @${user}\n\n- URL: https://${subdomain}\n- Repo: https://github.com/${CONFIG.org}/${id}\n\nReview and approve or remove.`,
      labels: ["published", "needs-review"],
    }),
  });

  return json({ steps, success: true, liveUrl: `https://${subdomain}` });
};
