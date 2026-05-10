import { useState, useCallback } from "react";

export interface Project {
  id: string;          // agent session UUID — this is the Durable Object key
  name: string;
  createdAt: string;
  appId?: string;      // set after deploy — the GitHub repo / game name
  appUrl?: string;     // preview URL (pages.dev)
  deployed: boolean;
}

const LOCAL_KEY = "fgs_projects";

function getLocal(): Project[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; }
}

function saveLocal(projects: Project[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(projects));
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>(() => {
    const local = getLocal();
    if (local.length === 0) {
      const initial: Project = { id: crypto.randomUUID(), name: "New Game", createdAt: new Date().toISOString(), deployed: false };
      saveLocal([initial]);
      return [initial];
    }
    return local;
  });

  const [currentId, setCurrentId] = useState<string | null>(() => {
    return localStorage.getItem("fgs_current_project") || getLocal()[0]?.id || null;
  });

  const create = useCallback((name: string, appId?: string) => {
    const id = crypto.randomUUID();
    const project: Project = { id, name, createdAt: new Date().toISOString(), deployed: false, appId };
    setProjects((prev) => {
      const updated = [project, ...prev];
      saveLocal(updated);
      return updated;
    });
    setCurrentId(id);
    localStorage.setItem("fgs_current_project", id);
    return id;
  }, []);

  const switchTo = useCallback((id: string) => {
    setCurrentId(id);
    localStorage.setItem("fgs_current_project", id);
  }, []);

  const rename = useCallback((id: string, name: string) => {
    setProjects((prev) => {
      const updated = prev.map((p) => p.id === id ? { ...p, name } : p);
      saveLocal(updated);
      return updated;
    });
  }, []);

  const markDeployed = useCallback((sessionId: string, appId: string, appUrl: string) => {
    setProjects((prev) => {
      const updated = prev.map((p) =>
        p.id === sessionId ? { ...p, appId, appUrl, deployed: true, name: appId } : p
      );
      saveLocal(updated);
      return updated;
    });
  }, []);

  return { projects, currentId, create, switchTo, rename, markDeployed };
}
