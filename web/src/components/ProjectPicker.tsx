import { useState, useEffect } from "react";
import type { Project } from "../hooks/useProjects";

interface ProjectPickerProps {
  projects: Project[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string, appId?: string) => void;
  onClose: () => void;
}

interface OrgRepo {
  id: string;
  name: string;
  description: string;
  url: string;
  updatedAt: string;
}

interface CreatorGame {
  id: string;
  name: string;
  liveUrl?: string;
  createdAt?: string;
}

export function ProjectPicker({ projects, currentId, onSelect, onCreate, onClose }: ProjectPickerProps) {
  const [orgRepos, setOrgRepos] = useState<OrgRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "new">("all");

  useEffect(() => {
    // The signed-in creator's games, from the same registry-backed, ownership-
    // scoped endpoint the dashboard uses. This replaces an anonymous "list ALL
    // org repos minus a name denylist" fetch, which (a) leaked infra repos
    // (platform, publisher, mcp, agent, leaderboard, host, auth…) whenever a new
    // one was added and the denylist wasn't updated, and (b) showed every
    // creator's games to everyone. The registry has no entry for infra repos, so
    // they can never appear here.
    fetch("/api/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { creator?: { games?: CreatorGame[] } } | null) => {
        const games = data?.creator?.games;
        if (!Array.isArray(games)) return;
        setOrgRepos(
          games.map((g) => ({
            id: g.id,
            name: g.name || g.id,
            description: "",
            url: g.liveUrl || `https://${g.id}.freegamestore.online`,
            updatedAt: g.createdAt || "",
          })),
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Merge + filter by search
  const q = search.toLowerCase();
  const localIds = new Set(projects.map((p) => p.appId).filter(Boolean));
  const filteredLocal = projects.filter((p) => !q || p.name.toLowerCase().includes(q) || p.appId?.toLowerCase().includes(q));
  const orgOnly = orgRepos.filter((r) => !localIds.has(r.id) && (!q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)));

  function handleSelectOrg(repo: OrgRepo) {
    // Create a new VibeCode session for this org repo
    const existingProject = projects.find((p) => p.appId === repo.id);
    if (existingProject) {
      onSelect(existingProject.id);
    } else {
      // Create a VibeCode session linked to this repo
      onCreate(repo.name, repo.id);
      // The newly created project will be selected automatically
    }
    onClose();
  }

  function handleSelectLocal(project: Project) {
    onSelect(project.id);
    onClose();
  }

  function handleCreateNew() {
    if (!newName.trim()) return;
    onCreate(newName.trim());
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-label="Project picker" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div role="document" className="rounded-2xl shadow-xl w-full max-w-md mx-4" style={{ background: "var(--panel)", border: "1px solid var(--line)", maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2 className="text-lg font-bold">Projects</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: "1.2rem", cursor: "pointer" }}>✕</button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <button onClick={() => setTab("all")} className="flex-1 py-2 text-sm font-semibold" style={{ background: "none", border: "none", cursor: "pointer", color: tab === "all" ? "var(--ink)" : "var(--muted)", borderBottom: tab === "all" ? "2px solid var(--accent)" : "2px solid transparent" }}>
            All Games
          </button>
          <button onClick={() => setTab("new")} className="flex-1 py-2 text-sm font-semibold" style={{ background: "none", border: "none", cursor: "pointer", color: tab === "new" ? "var(--ink)" : "var(--muted)", borderBottom: tab === "new" ? "2px solid var(--accent)" : "2px solid transparent" }}>
            New
          </button>
        </div>

        {/* Search */}
        {tab === "all" && (
          <div className="px-3 pt-3 shrink-0">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search games..."
              aria-label="Search games"
              className="w-full p-2 rounded-lg border text-sm"
              style={{ background: "var(--paper)", borderColor: "var(--line)", color: "var(--ink)" }}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3" style={{ minHeight: 0 }}>
          {tab === "all" ? (
            <>
              {/* Local projects (have VibeCode sessions) */}
              {filteredLocal.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold uppercase mb-1 px-1" style={{ color: "var(--muted)", letterSpacing: "0.05em" }}>VibeCode projects</div>
                  {filteredLocal.map((p) => (
                    <button key={p.id} onClick={() => handleSelectLocal(p)} className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left mb-1" style={{ background: p.id === currentId ? "color-mix(in srgb, var(--accent) 10%, var(--panel))" : "transparent", border: "none", cursor: "pointer", color: "var(--ink)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.deployed ? "#16a34a" : "var(--line-strong)", flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{p.name}</div>
                        {p.appId && <div className="text-xs truncate" style={{ color: "var(--muted)" }}>{p.appId}</div>}
                      </div>
                      {p.id === currentId && <span className="text-xs" style={{ color: "var(--accent)" }}>current</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* Org repos (not in local) */}
              {loading ? (
                <div className="text-center py-4 text-sm" style={{ color: "var(--muted)" }}>Loading games...</div>
              ) : orgOnly.length > 0 ? (
                <div>
                  <div className="text-xs font-semibold uppercase mb-1 px-1" style={{ color: "var(--muted)", letterSpacing: "0.05em" }}>GitHub repos</div>
                  {orgOnly.map((r) => (
                    <button key={r.id} onClick={() => handleSelectOrg(r)} className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left mb-1" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ink)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{r.name}</div>
                        <div className="text-xs truncate" style={{ color: "var(--muted)" }}>{r.description || r.id}</div>
                      </div>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>open</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            /* New project */
            <div className="py-4">
              <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>Start a new game from scratch.</p>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Game name..."
                aria-label="New game name"
                className="w-full p-2.5 rounded-lg border mb-3 text-sm"
                style={{ background: "var(--paper)", borderColor: "var(--line)", color: "var(--ink)" }}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateNew(); }}
              />
              <button onClick={handleCreateNew} disabled={!newName.trim()} className="w-full p-2.5 rounded-lg font-semibold text-sm text-white" style={{ background: "var(--accent)", border: "none", cursor: "pointer", opacity: newName.trim() ? 1 : 0.5 }}>
                Create Game
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
