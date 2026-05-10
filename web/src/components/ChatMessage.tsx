/** Chat message bubble — user, assistant, tool, or system */

import { Markdown } from "./Markdown";

const STYLES: Record<string, React.CSSProperties> = {
  user: { alignSelf: "flex-end", background: "var(--accent)", color: "#000", borderBottomRightRadius: "0.15rem" },
  assistant: { alignSelf: "flex-start", background: "var(--surface)", border: "1px solid var(--border)", borderBottomLeftRadius: "0.15rem" },
  tool: { alignSelf: "flex-start", fontSize: "0.72rem", fontFamily: "monospace", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)", padding: "0.25rem 0.5rem", borderRadius: "0.35rem" },
  system: { alignSelf: "center", fontSize: "0.78rem", color: "var(--muted)", background: "none" },
};

export function ChatMessage({ role, content }: { role: string; content: string }) {
  const useMarkdown = role === "assistant";

  return (
    <div style={{ maxWidth: "88%", padding: "0.55rem 0.75rem", borderRadius: "0.75rem", fontSize: "0.86rem", lineHeight: 1.5, wordBreak: "break-word", ...(!useMarkdown ? { whiteSpace: "pre-wrap" } : {}), ...STYLES[role] }}>
      {useMarkdown ? <Markdown text={content} /> : content}
    </div>
  );
}
