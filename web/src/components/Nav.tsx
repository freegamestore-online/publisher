import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const NAV_LINKS: { to: string; label: string; external: boolean }[] = [
  { to: "https://freegamestore.online", label: "Games", external: true },
  { to: "https://freeappstore.online", label: "Apps", external: true },
  { to: "https://freegamestore.online/contribute.html", label: "Build", external: true },
  { to: "/create", label: "VibeCode", external: false },
];

export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, signIn } = useAuth();
  const location = useLocation();

  return (
    <header className="border-b" style={{ borderColor: "var(--border)", padding: "0.75rem 0" }}>
      <div className="max-w-3xl mx-auto px-4 flex items-center justify-between">
        <Link
          to="/"
          className="text-xl font-extrabold tracking-tight no-underline"
          style={{ color: "var(--ink)", fontFamily: "Fraunces, serif" }}
        >
          Free <span style={{ color: "var(--accent)" }}>Games</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-5">
          {NAV_LINKS.map((link) =>
            link.external ? (
              <a
                key={link.to}
                href={link.to}
                className="text-sm font-semibold no-underline"
                style={{ color: "var(--muted)" }}
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm font-semibold no-underline"
                style={{ color: "var(--muted)" }}
              >
                {link.label}
              </Link>
            )
          )}
          {user ? (
            <Link to="/profile">
              <img
                src={user.avatarUrl}
                alt={user.github}
                className="rounded-full border-2"
                style={{ width: 28, height: 28, borderColor: "var(--border)", minWidth: 28, minHeight: 28 }}
              />
            </Link>
          ) : (
            <button
              onClick={signIn}
              className="text-sm font-semibold no-underline"
              style={{
                color: "var(--accent)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Sign in
            </button>
          )}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="sm:hidden"
          onClick={() => setMenuOpen(true)}
          style={{
            background: "none",
            border: "none",
            fontSize: "1.2rem",
            color: "var(--ink)",
            cursor: "pointer",
            minWidth: 44,
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Menu"
        >
          &#9776;
        </button>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setMenuOpen(false)}
          />
          <nav
            className="fixed top-0 right-0 z-50 flex flex-col gap-1 p-4"
            style={{
              width: 220,
              height: "100dvh",
              background: "var(--surface)",
              borderLeft: "1px solid var(--border)",
              boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
            }}
          >
            <button
              onClick={() => setMenuOpen(false)}
              className="self-end mb-2"
              style={{
                background: "none",
                border: "none",
                color: "var(--muted)",
                fontSize: "1rem",
                cursor: "pointer",
                minWidth: 44,
                minHeight: 44,
              }}
            >
              &#10005;
            </button>
            {NAV_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.to}
                  href={link.to}
                  className="block py-2 text-base font-semibold no-underline"
                  style={{
                    color: "var(--muted)",
                    minHeight: 44,
                    display: "flex",
                    alignItems: "center",
                  }}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.to}
                  to={link.to}
                  className="block py-2 text-base font-semibold no-underline"
                  style={{
                    color: "var(--muted)",
                    minHeight: 44,
                    display: "flex",
                    alignItems: "center",
                  }}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              )
            )}
            <Link
              to={location.pathname === "/profile" ? "/" : "/"}
              className="block py-2 text-base font-semibold no-underline"
              style={{ color: "var(--muted)", minHeight: 44, display: "flex", alignItems: "center" }}
              onClick={() => setMenuOpen(false)}
            >
              Dashboard
            </Link>
            {user ? (
              <Link
                to="/profile"
                className="flex items-center gap-2 mt-4 no-underline"
                style={{ minHeight: 44 }}
                onClick={() => setMenuOpen(false)}
              >
                <img
                  src={user.avatarUrl}
                  alt={user.github}
                  className="rounded-full"
                  style={{ width: 24, height: 24 }}
                />
                <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                  @{user.github}
                </span>
              </Link>
            ) : (
              <button
                onClick={() => { setMenuOpen(false); signIn(); }}
                className="mt-4 text-sm font-semibold"
                style={{
                  color: "var(--accent)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  padding: 0,
                  minHeight: 44,
                }}
              >
                Sign in with GitHub
              </button>
            )}
          </nav>
        </>
      )}
    </header>
  );
}
