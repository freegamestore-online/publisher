/** AI API key management — stored in localStorage, never sent to our servers.
 *  Keys are used client-side only, piped directly to the provider APIs via the agent worker. */

export interface ProviderConfig {
  type: string;
  name: string;
  description: string;
  keyPlaceholder: string;
  keyPrefix: string;
  free: boolean;
  models: { id: string; name: string }[];
  docsUrl: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    type: "github",
    name: "GitHub Models",
    description: "Free AI models via your GitHub account. No API key needed.",
    keyPlaceholder: "",
    keyPrefix: "",
    free: true,
    models: [
      { id: "openai/gpt-4.1", name: "GPT-4.1" },
      { id: "openai/gpt-4.1-mini", name: "GPT-4.1 Mini" },
      { id: "openai/gpt-4o", name: "GPT-4o" },
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "DeepSeek-V3-0324", name: "DeepSeek V3" },
      { id: "meta/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout" },
    ],
    docsUrl: "https://github.com/marketplace/models",
  },
  {
    type: "openrouter",
    name: "OpenRouter",
    description: "367+ models with one API key. Claude, GPT, Gemini, Llama, Grok, and more.",
    keyPlaceholder: "sk-or-v1-...",
    keyPrefix: "sk-or-",
    free: false,
    models: [
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "anthropic/claude-opus-4", name: "Claude Opus 4" },
      { id: "openai/gpt-4.1", name: "GPT-4.1" },
      { id: "openai/gpt-4o", name: "GPT-4o" },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3" },
      { id: "x-ai/grok-3-mini", name: "Grok 3 Mini" },
    ],
    docsUrl: "https://openrouter.ai/keys",
  },
  {
    type: "anthropic",
    name: "Anthropic",
    description: "Claude models directly. Lowest latency for Claude.",
    keyPlaceholder: "sk-ant-api03-...",
    keyPrefix: "sk-ant-",
    free: false,
    models: [
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    ],
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    type: "openai",
    name: "OpenAI",
    description: "GPT and o-series models directly.",
    keyPlaceholder: "sk-proj-...",
    keyPrefix: "sk-",
    free: false,
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "o3", name: "o3" },
      { id: "o4-mini", name: "o4 Mini" },
    ],
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    type: "google",
    name: "Google AI",
    description: "Gemini models directly. 1M+ context window.",
    keyPlaceholder: "AIza...",
    keyPrefix: "AIza",
    free: false,
    models: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    ],
    docsUrl: "https://aistudio.google.com/apikey",
  },
];

const STORAGE_KEY = "fgs_ai_keys";

export function getSavedKeys(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}

export function saveKey(provider: string, key: string) {
  const keys = getSavedKeys();
  if (key) keys[provider] = key;
  else delete keys[provider];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function getKey(provider: string): string {
  return getSavedKeys()[provider] || "";
}

export function deleteAllKeys() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Whether a provider needs no API key (free tier — e.g. GitHub Models). */
export function isFreeProvider(provider: string): boolean {
  return PROVIDERS.find((p) => p.type === provider)?.free ?? false;
}

/** A provider is usable right now if it's free or the user has saved a key for it. */
export function providerUsable(provider: string): boolean {
  return isFreeProvider(provider) || !!getKey(provider);
}

/**
 * Which provider to start with. Prefers the user's stored choice when it's
 * actually usable, otherwise the first provider they have a key for, otherwise
 * the free default (GitHub Models). This is what stops the composer defaulting
 * to a provider (OpenRouter) the user has no key for while a usable key — say
 * Anthropic or OpenAI — sits unused.
 */
export function resolveInitialProvider(): string {
  const stored = localStorage.getItem("fgs_provider");
  if (stored && providerUsable(stored)) return stored;
  const withKey = PROVIDERS.find((p) => !p.free && getKey(p.type));
  if (withKey) return withKey.type;
  return "github";
}

export function getDefaultProvider(): string {
  return resolveInitialProvider();
}

export function getDefaultModel(): string {
  return localStorage.getItem("fgs_model") || "openai/gpt-4.1";
}
