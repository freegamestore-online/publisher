import { createContext, useContext, useState, useEffect, useCallback } from "react";

/** A game published to FreeGameStore by this creator. */
export interface GameRepo {
  id: string;
  name: string;
  previewUrl: string;
  liveUrl: string;
  repoUrl: string;
  createdAt: string;
  published: boolean;
}

interface CreatorRecord {
  github: string;
  games: GameRepo[];
  banned: boolean;
  maxGames: number;
  remaining: number;
}

interface AuthUser {
  github: string;
  avatarUrl: string;
  /** Numeric GitHub user id — the canonical UID. */
  githubId: number | null;
  /** Stable subject identifier, e.g. "github:2824906". */
  sub: string | null;
  name: string | null;
  email: string | null;
  createdAt: string | null;
}

/** GitHub avatar URLs embed the numeric user id: .../u/<id>?v=4 */
function uidFromAvatar(avatarUrl: string): number | null {
  const m = avatarUrl.match(/\/u\/(\d+)/);
  return m ? Number(m[1]) : null;
}

interface AuthContextValue {
  user: AuthUser | null;
  creator: CreatorRecord | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  fetchCreator: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  creator: null,
  loading: true,
  error: null,
  refetch: async () => {},
  fetchCreator: async () => {},
  signIn: async () => {},
  signOut: async () => {},
});

/** Access the current auth state (user, creator, loading, signIn/signOut). */
export function useAuth() {
  return useContext(AuthContext);
}

/** Auth provider hook — manages session state, GitHub OAuth, and creator data. */
export function useAuthProvider(): AuthContextValue {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [creator, setCreator] = useState<CreatorRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const meRes = await fetch("/auth/me");
      const meData = (await meRes.json()) as {
        user: {
          github: string;
          avatarUrl: string;
          githubId?: number;
          sub?: string;
          name?: string | null;
          email?: string | null;
          createdAt?: string | null;
        } | null;
      };

      if (!meData.user) {
        setUser(null);
        setCreator(null);
        return;
      }

      // Older sessions predate id capture — derive the UID from the avatar URL.
      const githubId = meData.user.githubId ?? uidFromAvatar(meData.user.avatarUrl);

      setUser({
        github: meData.user.github,
        avatarUrl: meData.user.avatarUrl,
        githubId,
        sub: meData.user.sub ?? (githubId != null ? `github:${githubId}` : null),
        name: meData.user.name ?? null,
        email: meData.user.email ?? null,
        createdAt: meData.user.createdAt ?? null,
      });
    } catch (e) {
      console.error("[auth] error:", e);
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, []);

  // Lazy fetch creator/game list — only called by pages that need it (Dashboard)
  const fetchCreator = useCallback(async () => {
    if (creator) return;
    try {
      const creatorRes = await fetch("/api/me");
      if (creatorRes.ok) {
        const creatorData = (await creatorRes.json()) as { creator: CreatorRecord };
        setCreator(creatorData.creator);
      }
    } catch {
      // silently ignore — creator data is non-critical
    }
  }, [creator]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const signIn = useCallback(async () => {
    const redirect = window.location.pathname + window.location.search;
    const authRes = await fetch(`/auth/github/url?redirect=${encodeURIComponent(redirect)}`);
    const authData = (await authRes.json()) as { url: string };
    window.location.href = authData.url;
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/auth/signout", { method: "POST" });
    setUser(null);
    setCreator(null);
    window.location.href = "/";
  }, []);

  return { user, creator, loading, error, refetch, fetchCreator, signIn, signOut };
}
