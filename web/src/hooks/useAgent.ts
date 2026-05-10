import { useState, useCallback, useRef } from "react";
import { useProjects, type Project } from "./useProjects";

export type { Project };

const AGENT_URL = "https://agent.freegamestore.online";

export interface ChatMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
}

export interface DeployState {
  phase: string;
  steps?: { name: string; status: string }[];
  appUrl?: string;
  error?: string;
}

export interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

export function useAgent() {
  const projectsMgr = useProjects();
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "system", content: "Describe the game you want to build." }]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [tokensIn, setTokensIn] = useState(0);
  const [tokensOut, setTokensOut] = useState(0);
  const [deployState, setDeployState] = useState<DeployState | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const sessionId = projectsMgr.currentId;

  const resetUI = useCallback(() => {
    setMessages([{ role: "system", content: "Describe the game you want to build." }]);
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
    if (!sessionId) return;
    try {
      const res = await fetch(`${AGENT_URL}/session/${sessionId}/history`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.messages?.length) return;
      const restored = restoreMessages(data.messages);
      if (restored.length > 0) setMessages(restored);
      if (data.deployStatus?.phase === "live") {
        setDeployState(data.deployStatus);
        if (data.appId) projectsMgr.markDeployed(sessionId, data.appId, data.deployStatus.appUrl || "");
      }
      if (data.appName) projectsMgr.rename(sessionId, data.appName);
    } catch { /* ignore */ }
  }, [sessionId, projectsMgr]);

  const sendMessage = useCallback(async (message: string, aiConfig: AIConfig) => {
    if (!sessionId || isStreaming) return;
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: "" }]);
    let assistantText = "";

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

    try {
      const res = await fetch(`${AGENT_URL}/session/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, aiConfig }),
      });
      if (!res.ok) { updateAssistant(`Error: ${await res.text()}`); return; }

      const reader = res.body!.getReader();
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

          switch (evt.type) {
            case "text":
              assistantText += evt.data;
              updateAssistant(assistantText);
              break;
            case "tool_call": {
              const tc = JSON.parse(evt.data);
              setMessages((prev) => [...prev, { role: "tool", content: toolLabel(tc) }]);
              break;
            }
            case "tool_result": {
              const tr = JSON.parse(evt.data);
              if (tr.tool === "deploy") setDeployState({ phase: "provisioning", steps: [] });
              else if (!["write_file", "read_file", "list_files", "delete_file"].includes(tr.tool) && tr.result) {
                setMessages((prev) => [...prev, { role: "tool", content: `${tr.tool}:\n${tr.result.slice(0, 400)}` }]);
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
              setDeployState(ds);
              if (ds.phase === "live" && ds.appUrl && sessionId) {
                const host = ds.appUrl.replace("https://", "").split("/")[0].split(".")[0];
                projectsMgr.markDeployed(sessionId, host, ds.appUrl);
              }
              break;
            }
            case "error":
              assistantText += `\nError: ${evt.data}`;
              updateAssistant(assistantText);
              break;
          }
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
    }
  }, [sessionId, isStreaming, projectsMgr]);

  return {
    messages, isStreaming, tokensIn, tokensOut, deployState,
    projects: projectsMgr.projects, currentProjectId: projectsMgr.currentId,
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

function restoreMessages(serverMessages: any[]): ChatMessage[] {
  const restored: ChatMessage[] = [];
  for (const m of serverMessages) {
    if (m.role === "assistant") {
      if (m.content) restored.push({ role: "assistant", content: m.content });
      for (const tc of m.toolCalls || []) restored.push({ role: "tool", content: toolLabel(tc) });
    } else if (m.role === "tool_result") {
      for (const tr of m.toolResults || []) {
        if (tr.content?.length > 20) restored.push({ role: "tool", content: tr.content.slice(0, 400) });
      }
    } else if (m.role === "user") {
      restored.push({ role: "user", content: m.content });
    }
  }
  return restored;
}
