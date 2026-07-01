import { resolveCreatorUser, type SessionEnv } from "./_auth";

interface Env extends SessionEnv {
  GITHUB_TOKEN: string;
  CREATORS: KVNamespace;
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

// A published/provisioned game as it appears in the registry — the single
// source of truth for "what is a game." Infra repos (platform, publisher, mcp,
// agent, leaderboard, host, auth, templates, …) never have a registry entry, so
// listing from the registry instead of "all org repos minus a name denylist"
// means new infra repos can never leak into a creator's game list.
interface RegistryGame {
  id: string;
  name?: string;
  appUrl?: string;
  repo?: string;
  creatorGithub?: string;
  developer?: string;
  firstPublished?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  // Accept both the legacy publisher KV session and the canonical fgs_token JWT
  // (auth consolidation). The old code only read the KV session, so a user who
  // signed in through the auth worker (the normal path now) had a valid identity
  // for /auth/me but got 401 here — surfacing as "Sign in to publish" on the
  // dashboard despite being signed in.
  const cu = await resolveCreatorUser(context.request, context.env);
  if (!cu) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const user = cu.github;

  // Registry is the source of truth for games.
  let games: RegistryGame[] = [];
  try {
    const regRes = await fetch(
      `https://raw.githubusercontent.com/${ORG}/freegamestore/main/registry.json`,
      { headers: { "User-Agent": "freegamestore-publisher" } },
    );
    if (regRes.ok) {
      const reg = (await regRes.json()) as { games?: RegistryGame[] };
      games = reg.games ?? [];
    }
  } catch {
    /* registry unreachable — return an empty game list rather than 500 */
  }

  // Org members/owners see every game (admin view); everyone else sees only the
  // games they created. Ownership is by registry `creatorGithub` (fallback:
  // `developer`), matched case-insensitively against the signed-in login.
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
  const lc = user.toLowerCase();
  const owned = games.filter(
    (g) =>
      isOrgMember ||
      g.creatorGithub?.toLowerCase() === lc ||
      g.developer?.toLowerCase() === lc,
  );

  const userGames: GameRepo[] = owned.map((g) => ({
    id: g.id,
    name: g.name || g.id.charAt(0).toUpperCase() + g.id.slice(1),
    previewUrl: g.appUrl || `https://${g.id}.freegamestore.online`,
    liveUrl: g.appUrl || `https://${g.id}.freegamestore.online`,
    repoUrl: g.repo ? `https://github.com/${g.repo}` : `https://github.com/${ORG}/${g.id}`,
    createdAt: g.firstPublished || "",
    published: true,
  }));

  // KV for ban status.
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

  return new Response(JSON.stringify({ user, creator }), {
    headers: { "Content-Type": "application/json" },
  });
};
