import { createContext, useContext, useState, useEffect, useCallback } from "react";

interface GameRepo {
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

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthProvider(): AuthContextValue {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [creator, setCreator] = useState<CreatorRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const t0 = performance.now();
    try {
      console.log("[auth] fetching /auth/me...");
      const meRes = await fetch("/auth/me");
      const meData = (await meRes.json()) as { user: { github: string; avatarUrl: string } | null };
      console.log(`[auth] /auth/me done in ${Math.round(performance.now() - t0)}ms`, meData.user ? `@${meData.user.github}` : "not signed in");

      if (!meData.user) {
        setUser(null);
        setCreator(null);
        return;
      }

      setUser({
        github: meData.user.github,
        avatarUrl: meData.user.avatarUrl,
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
    if (creator) return; // already loaded
    try {
      console.log("[auth] fetching /api/me (game list)...");
      const t0 = performance.now();
      const res = await fetch("/api/me");
      console.log(`[auth] /api/me done in ${Math.round(performance.now() - t0)}ms`);
      if (res.ok) {
        const data = (await res.json()) as { creator: CreatorRecord };
        setCreator(data.creator);
        console.log(`[auth] ${data.creator.games.length} games loaded`);
      }
    } catch (e) {
      console.error("[auth] error fetching creator:", e);
    }
  }, [creator]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const signIn = useCallback(async () => {
    const redirect = window.location.pathname + window.location.search;
    const res = await fetch(`/auth/github/url?redirect=${encodeURIComponent(redirect)}`);
    const data = (await res.json()) as { url: string };
    window.location.href = data.url;
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/auth/signout", { method: "POST" });
    setUser(null);
    setCreator(null);
    window.location.href = "/";
  }, []);

  return { user, creator, loading, error, refetch, fetchCreator, signIn, signOut };
}
