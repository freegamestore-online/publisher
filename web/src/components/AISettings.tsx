import { useState } from "react";
import { PROVIDERS, getSavedKeys, saveKey, type ProviderConfig } from "../lib/ai-keys";

/** Reusable AI provider settings panel.
 *  Shows all providers with API key inputs.
 *  Keys are saved to localStorage — never sent to our servers. */
export function AISettings() {
  const [keys, setKeys] = useState<Record<string, string>>(() => getSavedKeys());
  const [editing, setEditing] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");

  function startEdit(provider: string) {
    setEditing(provider);
    setInputValue(keys[provider] || "");
  }

  function handleSave(provider: string) {
    saveKey(provider, inputValue.trim());
    setKeys(getSavedKeys());
    setEditing(null);
    setInputValue("");
  }

  function handleRemove(provider: string) {
    saveKey(provider, "");
    setKeys(getSavedKeys());
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">AI Providers</h3>
        <p className="text-xs" style={{ color: "var(--muted)" }}>Keys stored locally — never sent to our servers</p>
      </div>

      {PROVIDERS.map((p) => (
        <ProviderRow
          key={p.type}
          provider={p}
          savedKey={keys[p.type] || ""}
          isEditing={editing === p.type}
          inputValue={inputValue}
          onStartEdit={() => startEdit(p.type)}
          onInputChange={setInputValue}
          onSave={() => handleSave(p.type)}
          onRemove={() => handleRemove(p.type)}
          onCancel={() => setEditing(null)}
        />
      ))}
    </div>
  );
}

function ProviderRow({
  provider: p, savedKey, isEditing, inputValue,
  onStartEdit, onInputChange, onSave, onRemove, onCancel,
}: {
  provider: ProviderConfig;
  savedKey: string;
  isEditing: boolean;
  inputValue: string;
  onStartEdit: () => void;
  onInputChange: (v: string) => void;
  onSave: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const hasKey = !!savedKey;
  const maskedKey = savedKey
    ? savedKey.length > 12 ? `${savedKey.slice(0, 8)}...${savedKey.slice(-4)}` : "••••••••"
    : "";

  return (
    <div className="p-4 rounded-xl border" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <strong className="text-sm">{p.name}</strong>
            {p.free && (
              <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "color-mix(in srgb, var(--success) 15%, var(--panel))", color: "var(--success)" }}>
                Free
              </span>
            )}
            {hasKey && !p.free && (
              <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "color-mix(in srgb, var(--accent) 15%, var(--panel))", color: "var(--accent)" }}>
                Connected
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{p.description}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {p.models.slice(0, 4).map((m) => (
              <span key={m.id} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--muted)" }}>
                {m.name}
              </span>
            ))}
            {p.models.length > 4 && <span className="text-xs py-0.5" style={{ color: "var(--muted)" }}>+{p.models.length - 4} more</span>}
          </div>
        </div>

        {!p.free && (
          <div className="shrink-0">
            {hasKey && !isEditing ? (
              <div className="flex items-center gap-2">
                <code className="text-xs" style={{ color: "var(--muted)" }}>{maskedKey}</code>
                <button onClick={onStartEdit} className="text-xs font-semibold" style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>Edit</button>
                <button onClick={onRemove} className="text-xs font-semibold" style={{ color: "var(--error)", background: "none", border: "none", cursor: "pointer" }}>Remove</button>
              </div>
            ) : !isEditing ? (
              <button onClick={onStartEdit} className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: "var(--accent)", color: "white", border: "none", cursor: "pointer" }}>
                Add Key
              </button>
            ) : null}
          </div>
        )}
      </div>

      {isEditing && (
        <div className="flex gap-2 mt-3">
          <input
            type="password"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={p.keyPlaceholder}
            aria-label={`API key for ${p.name}`}
            className="flex-1 p-2 rounded-lg border text-sm"
            style={{ background: "var(--paper)", borderColor: "var(--line)", color: "var(--ink)", fontFamily: "monospace" }}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
          />
          <button onClick={onSave} className="px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: "var(--accent)", border: "none", cursor: "pointer" }}>Save</button>
          <button onClick={onCancel} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "var(--panel)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--ink)" }}>Cancel</button>
        </div>
      )}

      {!p.free && (
        <a href={p.docsUrl} target="_blank" rel="noopener" className="text-xs mt-2 inline-block" style={{ color: "var(--accent)" }}>
          Get API key →
        </a>
      )}
    </div>
  );
}
