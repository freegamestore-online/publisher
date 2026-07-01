import { useState, useCallback, useEffect, useRef } from "react";
import { useProjects, type Project } from "./useProjects";

export type { Project };

const AGENT_URL = "https://agent.freegamestore.online";
const DEFAULT_MESSAGES: AgentMessage[] = [{ role: "system", content: "Describe the game you want to build." }];

/** A single message in the agent conversation (user, assistant, tool, or system). */
export interface AgentMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
}

export type { DeployState } from "../types";
import type { DeployState } from "../types";

/** Configuration for the AI provider (provider, model, API key, temperature). */
export interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

/** Manages the VibeCode agent session — chat messages, streaming, deploy state, and project switching. */
export function useAgent() {
  const projectsMgr = useProjects();
  const sessionId = projectsMgr.currentId;
  const [messages, setMessages] = useState<AgentMessage[]>(DEFAULT_MESSAGES);
  const [isStreaming, setIsStreaming] = useState(false);
  const [tokensIn, setTokensIn] = useState(0);
  const [tokensOut, setTokensOut] = useState(0);
  const [deployState, setDeployState] = useState<DeployState | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const skipNextSyncRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    if (isStreaming || messages.length <= 1 || !sessionId) return;
    const timer = window.setTimeout(() => {
      fetch(`/api/agent/sessions/${sessionId}/messages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messages.slice(-300) }),
      }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(timer);
  }, [sessionId, messages, isStreaming]);

  useEffect(() => {
    const flush = () => {
      const sid = sessionIdRef.current;
      const current = messagesRef.current;
      if (!sid || current.length <= 1 || isStreamingRef.current) return;
      fetch(`/api/agent/sessions/${sid}/messages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: current.slice(-300) }),
        keepalive: true,
      }).catch(() => {});
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  const resetUI = useCallback(() => {
    setMessages(DEFAULT_MESSAGES);
    setDeployState(null);
    setTokensIn(0);
    setTokensOut(0);
  }, []);

  const createProject = useCallback((name: string, appId?: string) => {
    const id = projectsMgr.create(name, appId);
    resetUI();
    return id;
  }, [projectsMgr, resetUI]);

  const switchProject = useCallback((id: string) => {
    projectsMgr.switchTo(id);
    resetUI();
  }, [projectsMgr, resetUI]);

  const loadHistory = useCallback(async () => {
    if (!sessionId) {
      setMessages(DEFAULT_MESSAGES);
      setDeployState(null);
      return;
    }
    if (isStreamingRef.current) return;
    try {
      const historyRes = await fetch(`${AGENT_URL}/session/${sessionId}/history`, { credentials: "include" });
      // Bail if the user switched projects while this was in flight — otherwise
      // the old session's history overwrites the new one's, and the debounced
      // sync then PUTs it back, corrupting the new session's stored transcript.
      if (sessionIdRef.current !== sessionId) return;
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        if (sessionIdRef.current !== sessionId) return;
        const restored = restoreMessages(historyData.messages || []);
        if (restored.length > 0) {
          skipNextSyncRef.current = true;
          setMessages(restored);
          setDeployState(historyData.deployStatus ?? null);
          if (historyData.deployStatus?.phase === "live" && historyData.appId) {
            projectsMgr.markDeployed(sessionId, historyData.appId, historyData.deployStatus.appUrl || "");
          } else if (historyData.appName) {
            projectsMgr.rename(sessionId, historyData.appName);
          }
          return;
        }
      }

      const d1Res = await fetch(`/api/agent/sessions/${sessionId}`);
      if (sessionIdRef.current !== sessionId) return;
      if (d1Res.ok) {
        const data = (await d1Res.json()) as { session?: { messages?: AgentMessage[]; deployState?: DeployState | null; appId?: string; appUrl?: string; name?: string } | null };
        if (sessionIdRef.current !== sessionId) return;
        if (data.session?.messages?.length) {
          skipNextSyncRef.current = true;
          setMessages(data.session.messages);
        }
        setDeployState(data.session?.deployState ?? null);
        if (data.session?.deployState?.phase === "live" && data.session.appId) {
          projectsMgr.markDeployed(sessionId, data.session.appId, data.session.deployState.appUrl || data.session.appUrl || "");
        } else if (data.session?.name) {
          projectsMgr.rename(sessionId, data.session.name);
        }
      }
    } catch {
      // The composer remains usable; the next focus/reload can retry history.
    }
  }, [sessionId, projectsMgr.markDeployed, projectsMgr.rename]);

  const sendMessage = useCallback(async (message: string, aiConfig: AIConfig) => {
    if (!sessionId || isStreaming) return;
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: "" }]);
    let assistantText = "";
    // When a tool interrupts the assistant's prose, the next text delta must
    // open a NEW assistant bubble *below* the tool line. Otherwise post-tool
    // prose is glued onto the pre-tool bubble and renders above the tool
    // activity — wrong order on every multi-tool (i.e. every real build) turn.
    let pendingNewAssistant = false;

    // Update the LAST assistant message in the array
    const updateAssistant = (content: string) => {
      setMessages((prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i]?.role === "assistant") {
            updated[i] = { role: "assistant", content };
            break;
          }
        }
        return updated;
      });
    };

    // Append streamed assistant text, starting a fresh bubble after a tool.
    const appendAssistant = (delta: string) => {
      if (pendingNewAssistant) {
        pendingNewAssistant = false;
        assistantText = "";
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      }
      assistantText += delta;
      updateAssistant(assistantText);
    };

    try {
      const chatRes = await fetch(`${AGENT_URL}/session/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message, aiConfig }),
      });
      if (!chatRes.ok) { updateAssistant(`Error: ${await chatRes.text()}`); return; }

      const reader = chatRes.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let evt;
          try { evt = JSON.parse(line.slice(6).trim()); } catch { continue; }

          // A malformed nested payload on one event must not throw out of the
          // read loop (which would truncate the whole turn as a "connection
          // error"). Isolate each event.
          try {
            switch (evt.type) {
              case "text":
                appendAssistant(evt.data);
                break;
              case "tool_call": {
                const tc = JSON.parse(evt.data);
                setMessages((prev) => [...prev, { role: "tool", content: toolLabel(tc) }]);
                pendingNewAssistant = true;
                break;
              }
              case "tool_result": {
                const tr = JSON.parse(evt.data);
                if (tr.tool === "deploy") setDeployState({ phase: "provisioning", steps: [] });
                else if (!["write_file", "read_file", "list_files", "delete_file"].includes(tr.tool) && tr.result) {
                  setMessages((prev) => [...prev, { role: "tool", content: `${tr.tool}:\n${tr.result.slice(0, 400)}` }]);
                  pendingNewAssistant = true;
                }
                break;
              }
              case "usage": {
                const u = JSON.parse(evt.data);
                if (u.input) setTokensIn((p) => p + u.input);
                if (u.output) setTokensOut((p) => p + u.output);
                break;
              }
              case "deploy_status": {
                const ds = JSON.parse(evt.data);
                // The server's error event carries only { phase, error } — no
                // steps and no indication of which step failed. Preserve the
                // in-progress steps/phase so DeployLog can highlight the failure.
                setDeployState((prev) =>
                  ds.phase === "error" && prev
                    ? { ...ds, steps: ds.steps ?? prev.steps, failedPhase: prev.phase }
                    : ds,
                );
                if (ds.phase === "live" && ds.appUrl && sessionId) {
                  const host = ds.appUrl.replace("https://", "").split("/")[0].split(".")[0];
                  projectsMgr.markDeployed(sessionId, host, ds.appUrl);
                }
                break;
              }
              case "error":
                appendAssistant(`\nError: ${evt.data}`);
                break;
            }
          } catch { /* skip a single malformed event, keep the stream alive */ }
        }
      }
      if (!assistantText) updateAssistant("(No response)");
    } catch (err) {
      const errMsg = (err as Error).message || String(err);
      if (errMsg.includes("reset") || errMsg.includes("network") || errMsg.includes("Failed to fetch")) {
        updateAssistant(`${assistantText}\n\nConnection interrupted. Say "continue" or "deploy" to resume.`);
      } else {
        updateAssistant(`Connection error: ${errMsg}`);
      }
    } finally {
      setIsStreaming(false);
      // If the stream ended (cleanly or by a dropped connection) while a deploy
      // was still provisioning/pushing/building — with no terminal live/error
      // deploy_status — don't leave the spinner stuck forever. Resolve it to a
      // recoverable error state. Terminal phases (live/error) are left as-is.
      setDeployState((prev) =>
        prev && prev.phase !== "live" && prev.phase !== "error"
          ? { ...prev, phase: "error", failedPhase: prev.phase, error: "Deploy status unknown — the connection ended before the deploy finished. Reload to check whether it completed." }
          : prev,
      );
    }
  }, [sessionId, isStreaming, projectsMgr]);

  return {
    messages, isStreaming, tokensIn, tokensOut, deployState,
    projects: projectsMgr.projects, currentProjectId: projectsMgr.currentId,
    projectsError: projectsMgr.loadError, reloadProjects: projectsMgr.reload,
    sendMessage, createProject, switchProject, loadHistory,
  };
}

// -- Helpers --

function toolLabel(tc: { name: string; input?: Record<string, unknown> }): string {
  const i = tc.input || {};
  switch (tc.name) {
    case "deploy": return `Deploying: ${i.name || i.id || "game"}...`;
    case "push_update": return `Pushing update to ${i.id}...`;
    case "write_file": return `Writing ${i.path || "file"}`;
    case "read_file": return `Reading ${i.path || "file"}`;
    case "run_compliance_check": return "Running compliance checks...";
    case "search_files": return `Searching for "${i.pattern}"`;
    default: return tc.name;
  }
}

interface ServerMessage {
  role: string;
  content?: string;
  toolCalls?: Array<{ name: string; input?: Record<string, unknown> }>;
  toolResults?: Array<{ content: string }>;
}

function restoreMessages(serverMessages: ServerMessage[]): AgentMessage[] {
  const restored: AgentMessage[] = [];
  for (const m of serverMessages) {
    if (m.role === "assistant") {
      if (m.content) restored.push({ role: "assistant", content: m.content });
      for (const tc of m.toolCalls || []) restored.push({ role: "tool", content: toolLabel(tc) });
    } else if (m.role === "tool_result") {
      for (const tr of m.toolResults || []) {
        if (tr.content?.length > 20) restored.push({ role: "tool", content: tr.content.slice(0, 400) });
      }
    } else if (m.role === "user") {
      restored.push({ role: "user", content: m.content ?? "" });
    }
  }
  return restored;
}
