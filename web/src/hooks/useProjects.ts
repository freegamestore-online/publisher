import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";

export interface Project {
  id: string;          // agent session UUID — this is the Durable Object key
  name: string;
  createdAt: string;
  updatedAt: number;
  appId?: string;      // set after deploy — the GitHub repo / game name
  appUrl?: string;     // preview URL (pages.dev)
  deployed: boolean;
}

interface ServerSession {
  id: string;
  name: string;
  appId?: string;
  appUrl?: string;
  deployed: boolean;
  createdAt: number;
  updatedAt: number;
}

const CURRENT_KEY = "fgs_current_project";

async function fetchSessions(signal: AbortSignal): Promise<Project[]> {
  const res = await fetch("/api/agent/sessions?limit=100", { signal });
  if (!res.ok) throw new Error(`fetch sessions failed: ${res.status}`);
  const data = (await res.json()) as { sessions: ServerSession[] };
  return data.sessions.map((session) => ({
    id: session.id,
    name: session.name,
    appId: session.appId,
    appUrl: session.appUrl,
    deployed: session.deployed,
    createdAt: new Date(session.createdAt).toISOString(),
    updatedAt: session.updatedAt ?? session.createdAt,
  }));
}

function putSession(project: Project): void {
  fetch(`/api/agent/sessions/${project.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: project.name,
      appId: project.appId,
      appUrl: project.appUrl,
      deployed: project.deployed,
    }),
  }).catch(() => {
    // The next reload will reconcile from the server.
  });
}

export function useProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [currentId, setCurrentIdState] = useState<string | null>(() => localStorage.getItem(CURRENT_KEY));

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  const setCurrentId = useCallback((id: string | null) => {
    setCurrentIdState(id);
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem("fgs_projects");
    } catch {
      // harmless
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setCurrentId(null);
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    setLoading(true);
    setLoadError(false);

    fetchSessions(ctrl.signal)
      .then((server) => {
        if (server.length === 0) {
          const initial: Project = {
            id: crypto.randomUUID(),
            name: "New Game",
            createdAt: new Date().toISOString(),
            updatedAt: Date.now(),
            deployed: false,
          };
          putSession(initial);
          setProjects([initial]);
          setCurrentId(initial.id);
          return;
        }

        setProjects(server);
        const stored = localStorage.getItem(CURRENT_KEY);
        const validStored = stored && server.some((project) => project.id === stored);
        setCurrentId(validStored ? stored : server[0]!.id);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          console.error("Failed to load projects:", err);
          setLoadError(true);
        }
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [user?.sub, reloadNonce, setCurrentId]);

  const create = useCallback((name: string, appId?: string) => {
    const id = crypto.randomUUID();
    const project: Project = {
      id,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: Date.now(),
      deployed: !!appId,
      appId,
      appUrl: appId ? `https://${appId}.freegamestore.online` : undefined,
    };
    setProjects((prev) => [project, ...prev]);
    setCurrentId(id);
    putSession(project);
    return id;
  }, [setCurrentId]);

  const switchTo = useCallback((id: string) => {
    setCurrentId(id);
  }, [setCurrentId]);

  const rename = useCallback((id: string, name: string) => {
    setProjects((prev) => {
      const existing = prev.find((project) => project.id === id);
      if (!existing || existing.name === name) return prev;
      const updated = prev.map((project) => (project.id === id ? { ...project, name, updatedAt: Date.now() } : project));
      const project = updated.find((candidate) => candidate.id === id);
      if (project) putSession(project);
      return updated;
    });
  }, []);

  const markDeployed = useCallback((sessionId: string, appId: string, appUrl: string) => {
    setProjects((prev) => {
      const existing = prev.find((project) => project.id === sessionId);
      if (existing?.deployed && existing.appId === appId && existing.appUrl === appUrl) {
        return prev;
      }
      // Keep the user's chosen project name — don't overwrite it with the repo id.
      const updated = prev.map((project) =>
        project.id === sessionId ? { ...project, appId, appUrl, deployed: true, updatedAt: Date.now() } : project,
      );
      const project = updated.find((candidate) => candidate.id === sessionId);
      if (project) putSession(project);
      return updated;
    });
  }, []);

  return { projects, currentId, loading, loadError, reload, create, switchTo, rename, markDeployed };
}
