interface Env {
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  GITHUB_TOKEN: string;
  CREATORS: KVNamespace;
  SESSIONS: KVNamespace;
  MAX_APPS_PER_USER: string;
}

interface GameRepo {
  id: string;
  name: string;
  previewUrl: string;
  liveUrl: string;
  repoUrl: string;
  createdAt: string;
  published: boolean;
}

interface CreatorInfo {
  github: string;
  games: GameRepo[];
  banned: boolean;
  maxGames: number;
  remaining: number;
}

const ORG = "freegamestore-online";
const DOMAIN = "freegamestore.online";
const INFRA_REPOS = new Set([
  "freegamestore", "submissions", "template-game-canvas",
  "template-game-3d", "template-game-grid", "template-game-cards",
  "brand", "ops", "sdk",
]);

const COOKIE_NAME = "fgs_pub_session";

function parseCookie(request: Request): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const token = parseCookie(context.request);
  let user: string | null = null;
  let sessionData: { github: string } | null = null;
  if (token) {
    const raw = await context.env.SESSIONS.get(`sessions:${token}`);
    if (raw) {
      sessionData = JSON.parse(raw) as { github: string };
      user = sessionData.github;
    }
  }
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[me] fetching repos for @${user}`);
  const t0 = Date.now();

  // Use the user's membership to list repos they can access — ONE call instead of N
  // List all org repos (we use the admin PAT, but filter by checking the org teams/collaborators)
  // Faster approach: just list all org repos and check membership via teams API
  const ghRes = await fetch(
    `https://api.github.com/orgs/${ORG}/repos?per_page=100&sort=created&direction=desc`,
    {
      headers: {
        Authorization: `Bearer ${context.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "freegamestore-publisher",
      },
    },
  );

  const allRepos = (await ghRes.json()) as { name: string; created_at: string }[];
  console.log(`[me] fetched ${allRepos.length} repos in ${Date.now() - t0}ms`);

  // Check org membership — if user is an org member/owner, they see all repos
  const memberRes = await fetch(
    `https://api.github.com/orgs/${ORG}/members/${user}`,
    {
      headers: {
        Authorization: `Bearer ${context.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "freegamestore-publisher",
      },
    },
  );
  const isOrgMember = memberRes.status === 204;
  console.log(`[me] @${user} org member: ${isOrgMember} (${Date.now() - t0}ms)`);

  // For org members: show all game repos
  // For non-members: check collaborator on each (but batch with Promise.all)
  const gameRepos = allRepos.filter(r => !INFRA_REPOS.has(r.name));
  let userGameNames: Set<string>;

  if (isOrgMember) {
    // Org members see all games
    userGameNames = new Set(gameRepos.map(r => r.name));
  } else {
    // Non-members: check collaborator access in parallel (not sequential!)
    const checks = await Promise.all(
      gameRepos.map(async (repo) => {
        const res = await fetch(
          `https://api.github.com/repos/${ORG}/${repo.name}/collaborators/${user}`,
          {
            headers: {
              Authorization: `Bearer ${context.env.GITHUB_TOKEN}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "freegamestore-publisher",
            },
          },
        );
        return { name: repo.name, hasAccess: res.status === 204 };
      }),
    );
    userGameNames = new Set(checks.filter(c => c.hasAccess).map(c => c.name));
  }
  console.log(`[me] user has access to ${userGameNames.size} games (${Date.now() - t0}ms)`);

  // Build game list — skip CF Pages domain check (too slow), use registry instead
  // Check registry for published status
  let publishedIds = new Set<string>();
  try {
    const regRes = await fetch(
      `https://raw.githubusercontent.com/${ORG}/freegamestore/main/registry.json`,
      { headers: { "User-Agent": "freegamestore-publisher" } },
    );
    if (regRes.ok) {
      const reg = (await regRes.json()) as { games?: { id: string }[] };
      publishedIds = new Set((reg.games || []).map(g => g.id));
    }
  } catch { /* ignore */ }
  console.log(`[me] registry has ${publishedIds.size} published games (${Date.now() - t0}ms)`);

  const userGames: GameRepo[] = gameRepos
    .filter(r => userGameNames.has(r.name))
    .map(repo => ({
      id: repo.name,
      name: repo.name.charAt(0).toUpperCase() + repo.name.slice(1),
      previewUrl: `https://free${repo.name}app.pages.dev`,
      liveUrl: `https://${repo.name}.${DOMAIN}`,
      repoUrl: `https://github.com/${ORG}/${repo.name}`,
      createdAt: repo.created_at?.split("T")[0] || "",
      published: publishedIds.has(repo.name),
    }));

  // KV for ban status
  const raw = await context.env.CREATORS.get(user);
  const kvRecord = raw ? JSON.parse(raw) : null;
  const banned = kvRecord?.banned ?? false;
  const maxGames = parseInt(context.env.MAX_APPS_PER_USER || "5");

  const creator: CreatorInfo = {
    github: user,
    games: userGames,
    banned,
    maxGames,
    remaining: Math.max(0, maxGames - userGames.length),
  };

  console.log(`[me] done in ${Date.now() - t0}ms — ${userGames.length} games`);

  return new Response(JSON.stringify({ user: user, creator }), {
    headers: { "Content-Type": "application/json" },
  });
};
