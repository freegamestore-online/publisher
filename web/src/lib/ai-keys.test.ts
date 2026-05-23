import { describe, it, expect, beforeEach } from "vitest";
import { PROVIDERS, getSavedKeys, saveKey, getKey, deleteAllKeys } from "./ai-keys";

describe("PROVIDERS", () => {
  it("has at least one provider", () => {
    expect(PROVIDERS.length).toBeGreaterThan(0);
  });

  it("each provider has required fields", () => {
    for (const p of PROVIDERS) {
      expect(typeof p.type).toBe("string");
      expect(typeof p.name).toBe("string");
      expect(Array.isArray(p.models)).toBe(true);
      expect(p.models.length).toBeGreaterThan(0);
    }
  });

  it("github provider is free", () => {
    const github = PROVIDERS.find((p) => p.type === "github");
    expect(github).toBeDefined();
    expect(github!.free).toBe(true);
  });
});

describe("key storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty object when no keys saved", () => {
    expect(getSavedKeys()).toEqual({});
  });

  it("saves and retrieves a key", () => {
    saveKey("openrouter", "sk-or-v1-test");
    expect(getKey("openrouter")).toBe("sk-or-v1-test");
  });

  it("deletes a key when empty string passed", () => {
    saveKey("openrouter", "sk-or-v1-test");
    saveKey("openrouter", "");
    expect(getKey("openrouter")).toBe("");
  });

  it("deleteAllKeys clears storage", () => {
    saveKey("openrouter", "sk-or-v1-test");
    deleteAllKeys();
    expect(getSavedKeys()).toEqual({});
  });
});
