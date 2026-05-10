import { useState, useEffect } from "react";
import { Nav } from "../components/Nav";
import { useAuth } from "../hooks/useAuth";

interface ProvisionStep {
  name: string;
  status: string;
  detail: string;
}

const CATEGORIES = [
  { value: "strategy", label: "Strategy" },
  { value: "brain-training", label: "Brain Training" },
  { value: "arcade", label: "Arcade" },
  { value: "racing", label: "Racing" },
  { value: "sports", label: "Sports" },
  { value: "cards", label: "Cards" },
  { value: "casual", label: "Casual" },
];

const TEMPLATES = [
  { value: "canvas", label: "Canvas", desc: "HTML5 Canvas for 2D arcade, platformers, and action games" },
  { value: "grid", label: "Grid", desc: "Tile-based grid for puzzles, board games, and strategy" },
  { value: "cards", label: "Cards", desc: "Card layout for solitaire, memory, and card games" },
  { value: "3d", label: "3D", desc: "Three.js for 3D racing, flying, and 3D worlds" },
];

const ID_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function validateId(id: string): string | null {
  if (!id) return null;
  if (id.length > 58) return "58 chars max";
  if (!/^[a-z0-9-]*$/.test(id)) return "Lowercase letters, numbers, dashes only";
  if (!ID_RE.test(id)) return "Cannot start or end with a dash";
  if (id.startsWith("free") || id.startsWith("pro")) return "Cannot start with 'free' or 'pro'";
  return null;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "ok" ? "bg-emerald-500" :
    status === "skip" ? "bg-yellow-500" :
    "bg-red-500";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />;
}

export function Dashboard() {
  const { user, creator, loading, error, refetch, fetchCreator, signIn } = useAuth();
  useEffect(() => { fetchCreator(); }, [fetchCreator]);
  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [gameId, setGameId] = useState("");
  const [gameName, setGameName] = useState("");
  const [category, setCategory] = useState("casual");
  const [icon, setIcon] = useState("\uD83C\uDFAE");
  const [iconBg, setIconBg] = useState("#1a2e26");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("canvas");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ steps: ProvisionStep[]; success: boolean } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    setSubmitError(null);

    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: gameId, name: gameName, category, icon, iconBg, description, template }),
      });
      const data = await res.json() as { steps?: ProvisionStep[]; success?: boolean; error?: string };
      if (data.error) {
        setSubmitError(data.error);
      } else if (data.steps) {
        setResult({ steps: data.steps, success: data.success ?? false });
        if (data.success) {
          await refetch();
        }
      }
    } catch {
      setSubmitError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setGameId("");
    setGameName("");
    setCategory("casual");
    setIcon("\uD83C\uDFAE");
    setIconBg("#1a2e26");
    setDescription("");
    setTemplate("canvas");
    setResult(null);
    setSubmitError(null);
  };

  const idError = validateId(gameId);

  // Loading
  if (loading) {
    return (
      <>
        <Nav />
        <div className="flex items-center justify-center" style={{ minHeight: "calc(100dvh - 60px)" }}>
          <div className="w-8 h-8 border-3 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      </>
    );
  }

  // Error
  if (error) {
    return (
      <>
        <Nav />
        <div className="flex items-center justify-center px-4" style={{ minHeight: "calc(100dvh - 60px)" }}>
          <div className="text-center">
            <p className="text-lg font-semibold" style={{ color: "var(--error)" }}>{error}</p>
          </div>
        </div>
      </>
    );
  }

  // Not signed in
  if (!user || !creator) {
    return (
      <>
        <Nav />
        <div className="flex items-center justify-center px-4" style={{ minHeight: "calc(100dvh - 60px)" }}>
          <div className="text-center max-w-md">
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "Fraunces, serif" }}>
              FreeGameStore Publisher
            </h1>
            <p style={{ color: "var(--muted)" }} className="mb-6">
              Sign in with GitHub to publish games on FreeGameStore.
            </p>
            <button
              onClick={signIn}
              className="px-6 font-semibold rounded-xl"
              style={{
                minHeight: 44,
                background: "var(--accent)",
                color: "#000",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Sign in with GitHub
            </button>
          </div>
        </div>
      </>
    );
  }

  // Banned
  if (creator.banned) {
    return (
      <>
        <Nav />
        <div className="flex items-center justify-center px-4" style={{ minHeight: "calc(100dvh - 60px)" }}>
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--error)" }}>Account Suspended</h1>
            <p style={{ color: "var(--muted)" }}>
              Your publisher account has been suspended. Contact support if you believe this is an error.
            </p>
          </div>
        </div>
      </>
    );
  }

  // Dashboard
  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Welcome + Slots */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
          <div>
            <h2 className="text-2xl font-bold">Signed in as @{user.github}</h2>
            <p style={{ color: "var(--muted)" }} className="text-sm mt-1">Publish and manage your games</p>
          </div>
          <span
            className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium shrink-0"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {creator.remaining} of {creator.maxGames} slots
          </span>
        </div>

        {/* Published games */}
        {creator.games.length > 0 && (
          <section className="mb-8">
            <h3 className="text-lg font-semibold mb-3">Your Games</h3>
            <div className="flex flex-col gap-2">
              {creator.games.map((game) => (
                <div
                  key={game.id}
                  className="flex items-center justify-between p-4 rounded-xl gap-3"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{game.name}</p>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                        style={{
                          background: game.published ? "var(--accent-soft, #1a2e26)" : "var(--surface)",
                          color: game.published ? "var(--accent)" : "var(--muted)",
                          border: game.published ? "none" : "1px solid var(--border)",
                        }}
                      >
                        {game.published ? "Live" : "Draft"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mt-1" style={{ color: "var(--muted)" }}>
                      <a
                        href={game.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        Preview
                      </a>
                      {game.published && (
                        <a
                          href={game.liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                          style={{ color: "var(--accent)" }}
                        >
                          Live
                        </a>
                      )}
                      <a
                        href={game.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        Code
                      </a>
                      <span>{game.createdAt}</span>
                    </div>
                  </div>
                  {!game.published && (
                    <button
                      onClick={async () => {
                        const res = await fetch("/api/publish", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: game.id, name: game.name }),
                        });
                        if (res.ok) window.location.reload();
                      }}
                      className="shrink-0 px-4 font-semibold rounded-lg text-sm"
                      style={{ minHeight: 44, background: "var(--accent)", color: "#000" }}
                    >
                      Publish
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Create game */}
        {!showForm && !result && (
          <button
            onClick={() => setShowForm(true)}
            disabled={creator.remaining <= 0}
            className="w-full sm:w-auto px-6 font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              minHeight: 44,
              background: "var(--accent)",
              color: "#000",
            }}
            onMouseEnter={(e) => { if (creator.remaining > 0) e.currentTarget.style.background = "var(--accent-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
          >
            Create Game
          </button>
        )}

        {creator.remaining <= 0 && !showForm && (
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
            You've used all your slots. Request more by opening an issue on GitHub.
          </p>
        )}

        {/* Create form */}
        {showForm && !result && (
          <form onSubmit={handleSubmit} className="rounded-xl p-6 space-y-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <h3 className="text-lg font-semibold">Create a New Game</h3>

            {/* Game ID */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Game ID</label>
              <input
                type="text"
                value={gameId}
                onChange={(e) => setGameId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="my-game"
                required
                className="w-full px-3 rounded-lg outline-none focus:ring-2"
                style={{
                  minHeight: 44,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--ink)",
                  ...(idError ? { borderColor: "var(--error)" } : {}),
                }}
              />
              {idError && <p className="text-sm mt-1" style={{ color: "var(--error)" }}>{idError}</p>}
              {gameId && !idError && (
                <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                  {gameId}.freegamestore.online
                </p>
              )}
            </div>

            {/* Display name */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Display Name</label>
              <input
                type="text"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                placeholder="My Game"
                required
                className="w-full px-3 rounded-lg outline-none focus:ring-2"
                style={{ minHeight: 44, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink)" }}
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 rounded-lg outline-none focus:ring-2 appearance-none"
                style={{ minHeight: 44, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink)" }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Icon + Icon BG */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1.5">Icon (emoji)</label>
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="w-full px-3 rounded-lg outline-none focus:ring-2 text-center text-2xl"
                  style={{ minHeight: 44, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink)" }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1.5">Icon Background</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={iconBg}
                    onChange={(e) => setIconBg(e.target.value)}
                    className="w-11 h-11 rounded-lg border-0 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={iconBg}
                    onChange={(e) => setIconBg(e.target.value)}
                    className="flex-1 px-3 rounded-lg outline-none focus:ring-2 font-mono text-sm"
                    style={{ minHeight: 44, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink)" }}
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1.5">One-line Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A fun and addictive puzzle game"
                className="w-full px-3 rounded-lg outline-none focus:ring-2"
                style={{ minHeight: 44, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink)" }}
              />
            </div>

            {/* Template */}
            <div>
              <label className="block text-sm font-medium mb-2">Template</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TEMPLATES.map((t) => (
                  <label
                    key={t.value}
                    className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                    style={{
                      background: template === t.value ? "var(--accent-soft)" : "var(--bg)",
                      border: `1px solid ${template === t.value ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={t.value}
                      checked={template === t.value}
                      onChange={(e) => setTemplate(e.target.value)}
                      className="mt-1 accent-emerald-500"
                    />
                    <div>
                      <p className="font-medium text-sm">{t.label}</p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>{t.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {submitError && (
              <p className="text-sm font-medium" style={{ color: "var(--error)" }}>{submitError}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting || !gameId || !gameName || !!idError}
                className="px-6 font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ minHeight: 44, background: "var(--accent)", color: "#000" }}
              >
                {submitting ? "Creating..." : "Create Game"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={submitting}
                className="px-6 font-semibold rounded-xl transition-colors cursor-pointer"
                style={{ minHeight: 44, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink)" }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-xl p-6 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <h3 className="text-lg font-semibold">
              {result.success ? "Game Created" : "Provisioning Failed"}
            </h3>
            <div className="space-y-2">
              {result.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <StatusDot status={step.status} />
                  <span className="font-medium w-28 shrink-0">{step.name}</span>
                  <span style={{ color: "var(--muted)" }}>{step.detail}</span>
                </div>
              ))}
            </div>
            {result.success && (
              <div className="pt-2 text-sm space-y-1" style={{ color: "var(--muted)" }}>
                <p>Your game is live at <a href={`https://${gameId}.freegamestore.online`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }} className="hover:underline">{gameId}.freegamestore.online</a></p>
                <p>Edit your code at <a href={`https://github.com/freegamestore-online/${gameId}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }} className="hover:underline">github.com/freegamestore-online/{gameId}</a></p>
              </div>
            )}
            <button
              onClick={resetForm}
              className="px-6 font-semibold rounded-xl transition-colors cursor-pointer"
              style={{ minHeight: 44, background: "var(--accent)", color: "#000" }}
            >
              Done
            </button>
          </div>
        )}
      </main>
    </>
  );
}
