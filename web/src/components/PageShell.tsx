import { Nav } from "./Nav";

const centerStyle = { minHeight: "calc(100dvh - 60px)" };

export function LoadingShell() {
  return (
    <>
      <Nav />
      <div className="flex items-center justify-center" style={centerStyle}>
        <div className="w-8 h-8 border-3 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    </>
  );
}

export function SignInShell({ onSignIn, message }: { onSignIn: () => void; message: string }) {
  return (
    <>
      <Nav />
      <div className="flex items-center justify-center px-4" style={centerStyle}>
        <div className="text-center max-w-md">
          <p className="mb-4" style={{ color: "var(--muted)" }}>{message}</p>
          <button
            onClick={onSignIn}
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

export function ErrorShell({ message }: { message: string }) {
  return (
    <>
      <Nav />
      <div className="flex items-center justify-center px-4" style={centerStyle}>
        <div className="text-center">
          <p className="text-lg font-semibold" style={{ color: "var(--error)" }}>{message}</p>
        </div>
      </div>
    </>
  );
}
