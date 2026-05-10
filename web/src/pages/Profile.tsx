import { useState } from "react";
import { Nav } from "../components/Nav";
import { AISettings } from "../components/AISettings";
import { useAuth } from "../hooks/useAuth";

export function Profile() {
  const { user, creator, loading, signIn, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (!confirm("Are you sure you want to delete your account? This cannot be undone.")) return;
    if (!confirm("This will permanently remove all your data. Last chance -- continue?")) return;
    setDeleting(true);
    try {
      await fetch("/auth/delete", { method: "POST" });
    } finally {
      window.location.href = "/";
    }
  }

  function handleSignOut() {
    signOut();
  }

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

  if (!user) {
    return (
      <>
        <Nav />
        <div className="flex items-center justify-center px-4" style={{ minHeight: "calc(100dvh - 60px)" }}>
          <div className="text-center">
            <p className="mb-4" style={{ color: "var(--muted)" }}>
              Sign in to view your profile.
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

  const gamesCount = creator?.games.length ?? 0;

  return (
    <>
      <Nav />
      <div className="max-w-xl mx-auto px-4 py-12">
        {/* Avatar + name card */}
        <div
          className="flex items-center gap-6 p-8 rounded-2xl border mb-8"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <img
            src={user.avatarUrl}
            alt={user.github}
            className="rounded-full border-2 shrink-0"
            style={{ width: 72, height: 72, borderColor: "var(--border)" }}
          />
          <div>
            <h2 className="text-xl font-bold mb-0.5">@{user.github}</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              GitHub publisher account
            </p>
          </div>
        </div>

        {/* Account details */}
        <div className="mb-8">
          <h3
            className="text-base font-bold mb-3 pb-2 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            Account Details
          </h3>
          <DetailRow label="Provider" value="GitHub" />
          <DetailRow label="Username" value={`@${user.github}`} />
          <DetailRow
            label="Published games"
            value={String(gamesCount)}
            valueStyle={{ color: gamesCount > 0 ? "var(--accent)" : "var(--muted)" }}
          />
          {creator && (
            <DetailRow
              label="Slots remaining"
              value={`${creator.remaining} of ${creator.maxGames}`}
            />
          )}
        </div>

        {/* AI Providers */}
        <div className="mb-8">
          <AISettings />
        </div>

        {/* Session */}
        <div className="mb-8">
          <h3
            className="text-base font-bold mb-3 pb-2 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            Session
          </h3>
          <button
            onClick={handleSignOut}
            className="px-5 py-2 rounded-xl text-sm font-semibold border"
            style={{
              minHeight: 44,
              background: "transparent",
              color: "var(--ink)",
              borderColor: "var(--border)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Sign out
          </button>
        </div>

        {/* Danger zone */}
        <div
          className="rounded-2xl border p-6"
          style={{
            background: "color-mix(in srgb, var(--error) 6%, var(--surface))",
            borderColor: "color-mix(in srgb, var(--error) 25%, var(--border))",
          }}
        >
          <h3 className="text-base font-bold mb-1" style={{ color: "var(--error)" }}>
            Danger Zone
          </h3>
          <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
            Permanently delete your account and all stored data. Your published games will remain live but you will lose publisher access.
          </p>
          <button
            onClick={handleDeleteAccount}
            disabled={deleting}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white"
            style={{
              minHeight: 44,
              background: "var(--error)",
              border: "none",
              cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.6 : 1,
              fontFamily: "inherit",
            }}
          >
            {deleting ? "Deleting..." : "Delete my account"}
          </button>
        </div>
      </div>
    </>
  );
}

function DetailRow({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div
      className="flex justify-between items-center py-2.5 border-b text-sm"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="font-medium" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <span className="font-semibold" style={valueStyle}>
        {value}
      </span>
    </div>
  );
}
