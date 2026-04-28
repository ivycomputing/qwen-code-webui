import { useEffect, useCallback, useState, useMemo, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeftIcon, ServerIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type {
  ChatRequest,
  ChatMessage,
  ProjectInfo,
  PermissionMode,
} from "../types";
import { useClaudeStreaming } from "../hooks/useClaudeStreaming";
import { useChatState } from "../hooks/chat/useChatState";
import { usePermissions, type CommandLoopRequest } from "../hooks/chat/usePermissions";
import { usePermissionMode } from "../hooks/chat/usePermissionMode";
import { useAbortController } from "../hooks/chat/useAbortController";
import { useAutoHistoryLoader } from "../hooks/useHistoryLoader";
import { useSettings } from "../hooks/useSettings";
import { useExpandThinking } from "../hooks/useSettings";
import { useModel } from "../hooks/useModel";
import { useOpenAceSessionTracker } from "../hooks/useOpenAceSessionTracker";
import { useTabNotification } from "../hooks/useTabNotification";
import { generateId } from "../utils/id";
import { calculateTokenUsage, calculateContextBreakdown } from "../utils/tokenUsage";
import type { ContextUsageData } from "../utils/tokenUsage";
import { ContextUsagePanel } from "./chat/ContextUsagePanel";
import { SettingsButton } from "./SettingsButton";
import { SettingsModal } from "./SettingsModal";
import { ConfirmModal } from "./ConfirmModal";
import { HistoryButton } from "./chat/HistoryButton";
import { ProjectSwitchButton } from "./chat/ProjectSwitchButton";
import { ExpandThinkingButton } from "./chat/ExpandThinkingButton";
import { ToggleWebUIComponentsButton } from "./chat/ToggleWebUIComponentsButton";
import { ModelSelector } from "./chat/ModelSelector";
import { ChatInput } from "./chat/ChatInput";
import { ChatMessages } from "./chat/ChatMessages";
import { WebUIChatMessages } from "./chat/WebUIChatMessages";
import { HistoryView } from "./HistoryView";
import { getChatUrl, getProjectsUrl } from "../config/api";
import { KEYBOARD_SHORTCUTS } from "../utils/constants";
import { normalizeWindowsPath } from "../utils/pathUtils";
import { isIntegratedMode, fetchOpenAceProjects } from "../api/openace";
import { useRemoteChat } from "../hooks/useRemoteChat";
import type { StreamingContext } from "../hooks/streaming/useMessageProcessor";

// Types for quota status
interface QuotaUsage {
  used: number;
  limit: number | null;
}

interface QuotaPeriodStatus {
  tokens?: QuotaUsage;
  requests?: QuotaUsage;
}

interface QuotaStatus {
  daily?: QuotaPeriodStatus;
}

export function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const { experimental, updateSettings } = useSettings();
  const { expandThinking, toggleExpandThinking } = useExpandThinking();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [quotaErrorStatus, setQuotaErrorStatus] = useState<QuotaStatus | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(false);

  // Get settings from URL parameters (for workspace restoration)
  const urlModel = searchParams.get("model");
  const urlUseWebUI = searchParams.get("useWebUI");
  const urlPermissionMode = searchParams.get("permissionMode");

  // Remote workspace parameters
  const isRemoteWorkspace = searchParams.get("workspaceType") === "remote";
  const remoteMachineId = searchParams.get("machineId") || "";
  const remoteMachineName = searchParams.get("machineName") || "";

  // Model selection
  const {
    models,
    selectedModel,
    setSelectedModel,
    loading: modelsLoading,
  } = useModel();

  // Apply URL settings on mount (Issue #70: Workspace restoration)
  useEffect(() => {
    // Apply model from URL if specified and valid
    if (urlModel && models.some(m => m.id === urlModel)) {
      setSelectedModel(urlModel);
    }
  }, [urlModel, models, setSelectedModel]);

  // Apply experimental settings from URL
  useEffect(() => {
    if (urlUseWebUI !== null) {
      const useWebUI = urlUseWebUI === "true";
      if (experimental.useWebUIComponents !== useWebUI) {
        updateSettings({
          experimental: {
            ...experimental,
            useWebUIComponents: useWebUI,
          },
        });
      }
    }
  }, [urlUseWebUI, experimental, updateSettings]);

  // Calculate model name for display (remove [Bailian Coding Plan] prefix)
  const selectedModelConfig = useMemo(() => {
    return models.find((m) => m.id === selectedModel);
  }, [models, selectedModel]);

  const selectedModelName = useMemo(() => {
    if (!selectedModelConfig) return undefined;
    // Remove [Bailian Coding Plan] prefix from model name for display
    return selectedModelConfig.name.replace(/^\[Bailian Coding Plan\]\s*/, "");
  }, [selectedModelConfig]);

  const contextWindowSize = useMemo(() => {
    return selectedModelConfig?.generationConfig?.contextWindowSize;
  }, [selectedModelConfig]);

  // Extract and normalize working directory from URL
  // Priority: 1) URL parameter encodedProjectName, 2) URL path
  const urlEncodedProjectName = searchParams.get("encodedProjectName");
  
  const workingDirectory = (() => {
    // If encodedProjectName is provided via URL parameter, resolve the actual path
    if (urlEncodedProjectName) {
      // Strategy 1: Look up from projects list (handles hyphens in paths correctly)
      // The backend's /api/projects already decodes paths accurately using mapping files
      if (projects.length > 0) {
        const project = projects.find(
          (p) => p.encodedName === urlEncodedProjectName,
        );
        if (project) {
          return project.path;
        }
      }

      // Strategy 2: Decode based on path format
      if (urlEncodedProjectName.startsWith("/")) {
        return urlEncodedProjectName;
      }
      if (urlEncodedProjectName.startsWith("-")) {
        const decoded = urlEncodedProjectName.slice(1).replace(/-/g, "/");
        return "/" + decoded;
      }
      // Strategy 3: Return as-is for remote workspace paths (e.g., ~/workspace,
      // C:\workspace) and other formats that don't match above patterns
      return urlEncodedProjectName;
    }

    // Otherwise derive from URL path
    const rawPath = location.pathname.replace("/projects", "");
    if (!rawPath) return undefined;

    // URL decode the path
    const decodedPath = decodeURIComponent(rawPath);

    // Normalize Windows paths (remove leading slash from /C:/... format)
    return normalizeWindowsPath(decodedPath);
  })();

  // Get current view, sessionId, and toolName from query parameters
  const currentView = searchParams.get("view");
  const sessionId = searchParams.get("sessionId");
  const toolName = searchParams.get("toolName");
  const isHistoryView = currentView === "history";
  const isLoadedConversation = !!sessionId && !isHistoryView;

  const { processStreamLine } = useClaudeStreaming();
  const { abortRequest, createAbortHandler } = useAbortController();

  // Permission mode state management
  const { permissionMode, setPermissionMode } = usePermissionMode();

  // Apply permission mode from URL parameter (Issue #70: Workspace restoration)
  useEffect(() => {
    if (urlPermissionMode) {
      const validModes = ["default", "plan", "auto-edit", "yolo"];
      if (validModes.includes(urlPermissionMode)) {
        setPermissionMode(urlPermissionMode as PermissionMode);
      }
    }
  }, [urlPermissionMode, setPermissionMode]);

  // Get encoded name for current working directory
  // For URL parameter mode, use the encoded name directly
  const getEncodedName = useCallback(() => {
    // If encodedProjectName is provided via URL parameter, use it directly
    if (urlEncodedProjectName) {
      return urlEncodedProjectName;
    }
    
    // Otherwise derive from workingDirectory
    if (!workingDirectory || !projects.length) {
      return null;
    }

    const project = projects.find((p) => p.path === workingDirectory);

    // Normalize paths for comparison (handle Windows path issues)
    const normalizedWorking = normalizeWindowsPath(workingDirectory);
    const normalizedProject = projects.find(
      (p) => normalizeWindowsPath(p.path) === normalizedWorking,
    );

    // Use normalized result if exact match fails
    const finalProject = project || normalizedProject;

    return finalProject?.encodedName || null;
  }, [workingDirectory, projects, urlEncodedProjectName]);

  // Load conversation history if sessionId is provided
  const {
    messages: historyMessages,
    loading: historyLoading,
    error: historyError,
    sessionId: loadedSessionId,
  } = useAutoHistoryLoader(
    getEncodedName() || undefined,
    isRemoteWorkspace ? undefined : (sessionId || undefined),
    toolName || undefined,
  );

  // Initialize chat state with loaded history
  const {
    messages,
    input,
    isLoading,
    currentSessionId,
    currentRequestId,
    hasShownInitMessage,
    hasReceivedInit,
    currentAssistantMessage,
    currentThinkingMessage,
    setInput,
    setMessages,
    setCurrentSessionId,
    setHasShownInitMessage,
    setHasReceivedInit,
    setCurrentAssistantMessage,
    setCurrentThinkingMessage,
    addMessage,
    updateLastMessage,
    updateThinkingMessage,
    clearInput,
    generateRequestId,
    resetRequestState,
    startRequest,
  } = useChatState({
    initialMessages: historyMessages,
    initialSessionId: loadedSessionId || undefined,
  });

  // Refs for command loop detection — declared early so remote streamingContext
  // can reference them. Wired to actual functions after usePermissions is called.
  const commandLoopCheckRef = useRef<
    ((toolName: string, input: Record<string, unknown>, result: { exitCode?: number; output: string }) => CommandLoopRequest | null) | null
  >(null);
  const commandLoopShowRef = useRef<((request: CommandLoopRequest) => void) | null>(null);

  // Remote chat hook — placed after processStreamLine and useChatState so we
  // can pass both into the options.  Only meaningful when isRemoteWorkspace.
  const remoteChat = useRemoteChat(
    isRemoteWorkspace
      ? {
          onStreamLine: (line, ctx) => processStreamLine(line, ctx),
          streamingContext: {
            currentAssistantMessage,
            setCurrentAssistantMessage,
            currentThinkingMessage,
            setCurrentThinkingMessage,
            updateThinkingMessage,
            addMessage,
            updateLastMessage,
            onSessionId: setCurrentSessionId,
            hasReceivedInit,
            setHasReceivedInit,
            shouldShowInitMessage: () => !hasShownInitMessage,
            onInitMessageShown: () => setHasShownInitMessage(true),
            onPermissionError: (toolName, patterns, toolUseId) =>
              permissionErrorRef.current?.(toolName, patterns, toolUseId),
            onCommandResultLoop: (...args) => commandLoopCheckRef.current?.(...args) ?? null,
            onShowCommandLoopRequest: (request) => {
              notificationTriggeredRef.current = true;
              commandLoopShowRef.current?.(request);
              // Auto-abort the remote request
              remoteChat.abortCurrentRequest();
            },
            onAutoRejection: (toolName, content) => {
              return recordAutoRejection(toolName, content);
            },
            // Thinking timeout
            thinkingTimeout: {
              onThinkingTimeout: (content) => thinkingTimeoutRef.current?.(content),
            },
          },
          onPermissionRequest: (event) => {
            // Forward remote CLI permission request to the existing permission panel
            const req = event.request;
            if (req?.tool_name) {
              const patterns = req.permission_suggestions?.map(s => s.rule) || [];
              permissionErrorRef.current?.(req.tool_name, patterns, req.tool_use_id || "", event.request_id);
            }
          },
          onQuotaExceeded: (quotaStatus) => {
            setIsQuotaExceeded(true);
            setQuotaErrorStatus(quotaStatus as QuotaStatus);
          },
        }
      : undefined,
  );

  // Remote workspace supports all permission modes (default triggers control_request via stream-json)
  const remotePermissionMode = permissionMode;

  // Guard against React StrictMode double-mounting
  const startSessionCalledRef = useRef(false);

  // Auto-start or connect to remote session
  useEffect(() => {
    if (!isRemoteWorkspace || !remoteMachineId || remoteChat.session) return;
    if (startSessionCalledRef.current) return;

    if (isLoadedConversation && sessionId) {
      startSessionCalledRef.current = true;
      remoteChat.connectSession(sessionId);
    } else if (workingDirectory) {
      startSessionCalledRef.current = true;
      remoteChat.startSession(remoteMachineId, workingDirectory, selectedModel || undefined, undefined, remotePermissionMode);
    }
  }, [isRemoteWorkspace, remoteMachineId, workingDirectory, selectedModel, isLoadedConversation, sessionId, remotePermissionMode, remoteChat.session]);

  // Track the model used when the remote session was created
  const remoteSessionModelRef = useRef<string | null>(null);

  // Handle model change in remote mode — switch model without restarting session
  useEffect(() => {
    if (!isRemoteWorkspace || !remoteChat.session || remoteChat.session.status !== "active") return;

    if (remoteSessionModelRef.current === null) {
      remoteSessionModelRef.current = selectedModel;
      return;
    }
    if (remoteSessionModelRef.current === selectedModel) return;

    remoteSessionModelRef.current = selectedModel;
    remoteChat.switchModel(selectedModel || "");
  }, [selectedModel, isRemoteWorkspace, remoteChat]);

  // Calculate token usage from messages
  const tokenUsage = useMemo(() => {
    return calculateTokenUsage(messages);
  }, [messages]);

  // Calculate context breakdown data for the /context panel
  const contextPanelData = useMemo((): ContextUsageData | null => {
    if (!tokenUsage.promptTokens || !contextWindowSize || !selectedModelName) {
      return null;
    }
    // Extract cache_read_input_tokens from the latest result message
    let cacheReadInputTokens: number | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (
        msg.type === "result" &&
        "usage" in msg &&
        typeof msg.usage === "object" &&
        msg.usage !== null
      ) {
        const usage = msg.usage as unknown as Record<string, unknown>;
        cacheReadInputTokens = usage.cache_read_input_tokens as number | undefined;
        break;
      }
    }
    return calculateContextBreakdown(
      messages,
      tokenUsage.promptTokens,
      contextWindowSize,
      selectedModelName,
      cacheReadInputTokens,
    );
  }, [messages, tokenUsage, contextWindowSize, selectedModelName]);

  // Unified messages for display — remote sessions now go through processStreamLine
  // which populates the same messages array, so no conversion is needed.
  const displayMessages = useMemo(() => {
    return messages;
  }, [messages]);

  // Combined loading state: local streaming OR remote chat loading
  const effectiveIsLoading = isLoading || (isRemoteWorkspace && remoteChat.isLoading);

  const {
    allowedTools,
    permissionRequest,
    showPermissionRequest,
    closePermissionRequest,
    allowToolTemporary,
    allowToolPermanent,
    isPermissionMode,
    planModeRequest,
    showPlanModeRequest,
    closePlanModeRequest,
    updatePermissionMode,
    recordDenial,
    resetDenialCounter,
    // Command result loop detection
    commandLoopRequest,
    checkCommandResultLoop,
    showCommandLoopRequest,
    closeCommandLoopRequest,
    // Auto-rejection loop detection
    recordAutoRejection,
  } = usePermissions({
    onPermissionModeChange: setPermissionMode,
  });

  // Wire refs to actual functions after they are defined
  commandLoopCheckRef.current = checkCommandResultLoop;
  commandLoopShowRef.current = showCommandLoopRequest;

  // Track session with Open-ACE for work duration statistics
  useOpenAceSessionTracker(
    currentSessionId || null,
    workingDirectory || null,
    !isHistoryView
  );

  // Tab notification for multi-session awareness
  const {
    showPermissionNotification,
    showPlanNotification,
    showInputNotification,
    clearNotification,
  } = useTabNotification();

  // Ref to track whether a permission/plan/command-loop notification was triggered
  // during the current streaming session (used to decide if input notification should fire)
  const notificationTriggeredRef = useRef(false);

  // Ref for permission error handler — used by remote streamingContext to
  // avoid declaration-order issues (handlePermissionError is defined below).
  const permissionErrorRef = useRef<
    ((toolName: string, patterns: string[], toolUseId: string, requestId?: string) => void) | null
  >(null);

  // Ref for thinking timeout handler — same pattern as permissionErrorRef
  const thinkingTimeoutRef = useRef<
    ((accumulatedContent: string) => void) | null
  >(null);

  // Ref to track previous isLoading state for detecting when AI finishes responding
  const wasLoadingRef = useRef(false);

  // Show input notification when AI finishes responding (isLoading changes from true to false)
  useEffect(() => {
    // Update the ref to track previous state
    if (effectiveIsLoading) {
      wasLoadingRef.current = true;
    }

    // When isLoading changes from true to false, show input notification
    // Only if no permission/plan notification was triggered
    if (wasLoadingRef.current && !effectiveIsLoading) {
      wasLoadingRef.current = false;

      // Show input notification if no permission/plan notification was triggered
      if (!notificationTriggeredRef.current) {
        showInputNotification();
      }

      // Reset the flag for the next request
      notificationTriggeredRef.current = false;
    }
  }, [effectiveIsLoading, showInputNotification]);

  const handlePermissionError = useCallback(
    (toolName: string, patterns: string[], toolUseId: string, requestId?: string) => {
      notificationTriggeredRef.current = true;
      // Check if this is an ExitPlanMode permission error
      if (patterns.includes("ExitPlanMode")) {
        // For ExitPlanMode, show plan permission interface instead of regular permission
        showPlanModeRequest(""); // Empty plan content since it was already displayed
        // Show tab notification for plan approval
        showPlanNotification();
      } else {
        showPermissionRequest(toolName, patterns, toolUseId, requestId);
        // Show tab notification for permission request
        showPermissionNotification();
      }
    },
    [showPermissionRequest, showPlanModeRequest, showPermissionNotification, showPlanNotification],
  );
  permissionErrorRef.current = handlePermissionError;

  const sendMessage = useCallback(
    async (
      messageContent?: string,
      tools?: string[],
      hideUserMessage = false,
      overridePermissionMode?: PermissionMode,
    ) => {
      const content = messageContent || input.trim();
      if (!content || isLoading) return;

      // Intercept /clear before sending to backend
      if (content === "/clear") {
        setShowClearConfirm(true);
        if (!messageContent) clearInput();
        return;
      }

      // Intercept /context before sending to backend
      if (content === "/context") {
        setShowContextPanel(true);
        if (!messageContent) clearInput();
        return;
      }

      // Remote mode: delegate to useRemoteChat
      // Note: don't call startRequest() here — remoteChat.isLoading tracks
      // the SSE lifecycle via effectiveIsLoading, and startRequest() has no
      // matching resetRequestState() in this path, which would permanently
      // block the user from sending further messages.
      if (isRemoteWorkspace) {
        if (!hideUserMessage) {
          addMessage({
            type: "chat",
            role: "user",
            content,
            timestamp: Date.now(),
          });
        }
        if (!messageContent) clearInput();
        await remoteChat.sendMessage(content, remotePermissionMode);
        return;
      }

      const requestId = generateRequestId();

      // Only add user message to chat if not hidden
      if (!hideUserMessage) {
        const userMessage: ChatMessage = {
          type: "chat",
          role: "user",
          content: content,
          timestamp: Date.now(),
        };
        addMessage(userMessage);
      }

      if (!messageContent) clearInput();
      startRequest();

      // Local state for this streaming session
      let localHasReceivedInit = false;
      let shouldAbort = false;

      try {
        const response = await fetch(getChatUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            requestId,
            ...(currentSessionId ? { sessionId: currentSessionId } : {}),
            allowedTools: tools || allowedTools,
            ...(workingDirectory ? { workingDirectory } : {}),
            permissionMode: overridePermissionMode || permissionMode,
            ...(selectedModel ? { model: selectedModel } : {}),
          } as ChatRequest),
        });

        // Check for quota exceeded (403)
        if (response.status === 403) {
          try {
            const errorData = await response.json();
            if (errorData.error === "quota_exceeded") {
              setIsQuotaExceeded(true);
              setQuotaErrorStatus(errorData.quota_status);
              resetRequestState();
              return;
            }
          } catch { /* ignore parse error */ }
        }

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const streamingContext: StreamingContext = {
          currentAssistantMessage,
          setCurrentAssistantMessage,
          currentThinkingMessage,
          setCurrentThinkingMessage,
          updateThinkingMessage,
          addMessage,
          updateLastMessage,
          onSessionId: setCurrentSessionId,
          shouldShowInitMessage: () => !hasShownInitMessage,
          onInitMessageShown: () => setHasShownInitMessage(true),
          get hasReceivedInit() {
            return localHasReceivedInit;
          },
          setHasReceivedInit: (received: boolean) => {
            localHasReceivedInit = received;
            setHasReceivedInit(received);
          },
          onPermissionError: handlePermissionError,
          onAbortRequest: async () => {
            shouldAbort = true;
            await createAbortHandler(requestId)();
          },
          // Auto-rejection loop detection
          onAutoRejection: (toolName, content) => {
            return recordAutoRejection(toolName, content);
          },
          // Command result loop detection — auto-abort on loop
          onCommandResultLoop: checkCommandResultLoop,
          onShowCommandLoopRequest: (request) => {
            notificationTriggeredRef.current = true;
            shouldAbort = true;
            showCommandLoopRequest(request);
            // Auto-abort the request
            createAbortHandler(requestId)();
          },
          // Thinking timeout
          thinkingTimeout: {
            onThinkingTimeout: handleThinkingTimeout,
          },
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done || shouldAbort) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n").filter((line) => line.trim());

          for (const line of lines) {
            if (shouldAbort) break;
            processStreamLine(line, streamingContext);
          }

          if (shouldAbort) break;
        }
      } catch (error) {
        console.error("Failed to send message:", error);
        addMessage({
          type: "chat",
          role: "assistant",
          content: "Error: Failed to get response",
          timestamp: Date.now(),
        });
      } finally {
        // Note: Input notification will be shown via useEffect when isLoading becomes false.
        // Don't reset notificationTriggeredRef here - it's needed by useEffect to determine
        // whether a permission/plan notification was triggered during this session.
        resetRequestState();
      }
    },
    [
      input,
      isLoading,
      currentSessionId,
      allowedTools,
      hasShownInitMessage,
      currentAssistantMessage,
      workingDirectory,
      permissionMode,
      selectedModel,
      generateRequestId,
      clearInput,
      startRequest,
      addMessage,
      updateLastMessage,
      setCurrentSessionId,
      setHasShownInitMessage,
      setHasReceivedInit,
      setCurrentAssistantMessage,
      resetRequestState,
      processStreamLine,
      handlePermissionError,
      createAbortHandler,
      showInputNotification,
      isRemoteWorkspace,
      remoteChat.sendMessage,
    ],
  );

  const handleAbort = useCallback(() => {
    if (isRemoteWorkspace && remoteChat.session) {
      remoteChat.abortCurrentRequest();
      return;
    }
    abortRequest(currentRequestId, isLoading, resetRequestState);
  }, [abortRequest, currentRequestId, isLoading, resetRequestState, isRemoteWorkspace, remoteChat.abortCurrentRequest, remoteChat.session]);

  // Slash command execution handler
  const handleExecuteSlashCommand = useCallback(
    (commandName: string) => {
      if (commandName === "/clear") {
        setShowClearConfirm(true);
      } else if (commandName === "/context") {
        setShowContextPanel(true);
      }
    },
    [],
  );

  // Clear conversation handler
  const handleClearConversation = useCallback(() => {
    // Clear messages and generate a new session ID to start fresh
    // The old history files remain on server but won't be loaded
    setMessages([]);
    setCurrentSessionId(generateId());
    setHasShownInitMessage(false);
    setHasReceivedInit(false);
    setShowClearConfirm(false);
    navigate({ search: "" });
    // Add a system message to indicate context was cleared
    addMessage({
      type: "chat",
      role: "assistant",
      content: t("slashCommands.contextCleared"),
      timestamp: Date.now(),
    });
  }, [setMessages, setCurrentSessionId, setHasShownInitMessage, setHasReceivedInit, addMessage, t, navigate, generateId]);

  // Permission request handlers
  const handlePermissionAllow = useCallback(() => {
    if (!permissionRequest) return;

    // Reset denial counter when user allows
    resetDenialCounter();

    // Clear tab notification
    clearNotification();

    // In remote mode, send permission response to the remote agent
    if (isRemoteWorkspace) {
      remoteChat.sendPermissionResponse(
        permissionRequest.requestId || "",
        "allow",
        undefined,
        permissionRequest.toolName
      );
      closePermissionRequest();
      return;
    }

    // Add all patterns temporarily
    let updatedAllowedTools = allowedTools;
    permissionRequest.patterns.forEach((pattern) => {
      updatedAllowedTools = allowToolTemporary(pattern, updatedAllowedTools);
    });

    closePermissionRequest();

    if (currentSessionId) {
      sendMessage("continue", updatedAllowedTools, true);
    }
  }, [
    permissionRequest,
    currentSessionId,
    sendMessage,
    allowedTools,
    allowToolTemporary,
    closePermissionRequest,
    resetDenialCounter,
    clearNotification,
    isRemoteWorkspace,
    remoteChat,
  ]);

  const handlePermissionAllowPermanent = useCallback(() => {
    if (!permissionRequest) return;

    // Reset denial counter when user allows
    resetDenialCounter();

    // Clear tab notification
    clearNotification();

    // In remote mode, send permission response to the remote agent
    if (isRemoteWorkspace) {
      remoteChat.sendPermissionResponse(
        permissionRequest.requestId || "",
        "allow-permanent",
        undefined,
        permissionRequest.toolName
      );
      closePermissionRequest();
      return;
    }

    // Add all patterns permanently
    let updatedAllowedTools = allowedTools;
    permissionRequest.patterns.forEach((pattern) => {
      updatedAllowedTools = allowToolPermanent(pattern, updatedAllowedTools);
    });

    closePermissionRequest();

    if (currentSessionId) {
      sendMessage("continue", updatedAllowedTools, true);
    }
  }, [
    permissionRequest,
    currentSessionId,
    sendMessage,
    allowedTools,
    allowToolPermanent,
    closePermissionRequest,
    resetDenialCounter,
    clearNotification,
    isRemoteWorkspace,
    remoteChat,
  ]);

  const handlePermissionDeny = useCallback(() => {
    if (!permissionRequest) return;

    const toolName = permissionRequest.toolName;

    // Record denial and check for loop
    const loopMessage = recordDenial(toolName);

    // Clear tab notification
    clearNotification();

    // In remote mode, send permission response to the remote agent
    if (isRemoteWorkspace) {
      const denyMessage = loopMessage ||
        `The user denied the permission request for ${toolName}. Please stop retrying and ask the user what they would like to do instead.`;
      remoteChat.sendPermissionResponse(
        permissionRequest.requestId || "",
        "deny",
        denyMessage,
        toolName
      );
      closePermissionRequest();
      return;
    }

    closePermissionRequest();

    if (currentSessionId) {
      if (loopMessage) {
        // Loop detected - send interrupt message to stop AI from retrying
        sendMessage(loopMessage, allowedTools, true);
      } else {
        // Normal denial - send a message to inform AI that user denied
        sendMessage(
          `The user denied the permission request for ${toolName}. Please stop retrying and ask the user what they would like to do instead.`,
          allowedTools,
          true
        );
      }
    }
  }, [
    permissionRequest,
    currentSessionId,
    sendMessage,
    allowedTools,
    closePermissionRequest,
    recordDenial,
    clearNotification,
    isRemoteWorkspace,
    remoteChat,
  ]);

  // Plan mode request handlers
  const handlePlanAcceptWithEdits = useCallback(() => {
    updatePermissionMode("auto-edit");
    clearNotification();
    closePlanModeRequest();
    if (currentSessionId) {
      sendMessage("accept", allowedTools, true, "auto-edit");
    }
  }, [
    updatePermissionMode,
    closePlanModeRequest,
    currentSessionId,
    sendMessage,
    allowedTools,
    clearNotification,
  ]);

  const handlePlanAcceptDefault = useCallback(() => {
    updatePermissionMode("default");
    clearNotification();
    closePlanModeRequest();
    if (currentSessionId) {
      sendMessage("accept", allowedTools, true, "default");
    }
  }, [
    updatePermissionMode,
    closePlanModeRequest,
    currentSessionId,
    sendMessage,
    allowedTools,
    clearNotification,
  ]);

  const handlePlanKeepPlanning = useCallback(() => {
    updatePermissionMode("plan");
    clearNotification();
    closePlanModeRequest();
  }, [updatePermissionMode, closePlanModeRequest, clearNotification]);

  // Command loop detection handlers — auto-abort, no dialog
  const handleCommandLoopAbort = useCallback(() => {
    closeCommandLoopRequest();
    // Abort current request if loading
    if (isLoading && currentRequestId) {
      abortRequest(currentRequestId, isLoading, resetRequestState);
    }
  }, [
    closeCommandLoopRequest,
    isLoading,
    currentRequestId,
    abortRequest,
    resetRequestState,
  ]);

  // Thinking timeout handler — abort and show notification
  const [thinkingTimeoutInfo, setThinkingTimeoutInfo] = useState<{
    content: string;
    elapsed: number;
  } | null>(null);

  const handleThinkingTimeout = useCallback(
    (accumulatedContent: string) => {
      // Abort the request
      if (isLoading && currentRequestId) {
        abortRequest(currentRequestId, isLoading, resetRequestState);
      } else if (isRemoteWorkspace && remoteChat.session) {
        remoteChat.abortCurrentRequest();
      }

      // Show timeout notification with thinking content
      setThinkingTimeoutInfo({
        content: accumulatedContent,
        elapsed: 5 * 60, // 5 minutes
      });
    },
    [isLoading, currentRequestId, abortRequest, resetRequestState, isRemoteWorkspace, remoteChat],
  );
  thinkingTimeoutRef.current = handleThinkingTimeout;

  // Create permission data for inline permission interface
  const permissionData = permissionRequest
    ? {
        patterns: permissionRequest.patterns,
        toolName: permissionRequest.toolName,
        onAllow: handlePermissionAllow,
        onAllowPermanent: handlePermissionAllowPermanent,
        onDeny: handlePermissionDeny,
      }
    : undefined;

  // Create plan permission data for plan mode interface
  const planPermissionData = planModeRequest
    ? {
        onAcceptWithEdits: handlePlanAcceptWithEdits,
        onAcceptDefault: handlePlanAcceptDefault,
        onKeepPlanning: handlePlanKeepPlanning,
      }
    : undefined;

  const handleHistoryClick = useCallback(() => {
    const searchParams = new URLSearchParams();
    searchParams.set("view", "history");
    navigate({ search: searchParams.toString() });
  }, [navigate]);

  const handleSettingsClick = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const handleSettingsClose = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  // Notify Open-ACE parent to enter fullscreen when user enters chat page
  useEffect(() => {
    if (isIntegratedMode() && window.parent !== window) {
      window.parent.postMessage({ type: "openace-enter-chat" }, "*");
    }
  }, []);

  // Notify Open-ACE parent about session ID for workspace state persistence (Issue #65)
  // Use getEncodedName() to get the correct encodedProjectName, which may come from
  // URL parameter or be derived from workingDirectory after projects are loaded
  // Also depend on projects.length to trigger when projects are loaded (Issue #70)
  // Include settings for tab restoration (Issue #70)
  useEffect(() => {
    if (isIntegratedMode() && window.parent !== window && currentSessionId) {
      const encodedName = getEncodedName();
      // Only send update if we have the encodedProjectName
      // This ensures tab state is properly saved for workspace restoration
      if (encodedName) {
        window.parent.postMessage({
          type: "qwen-code-session-update",
          sessionId: currentSessionId,
          encodedProjectName: encodedName,
          toolName: toolName || undefined,
          title: undefined, // Title can be set later if needed
          // Include settings for workspace restoration
          settings: {
            model: selectedModel || undefined,
            useWebUI: experimental.useWebUIComponents,
            permissionMode: permissionMode,
          },
          timestamp: Date.now(),
        }, "*");
      }
    }
  }, [currentSessionId, getEncodedName, toolName, projects.length, selectedModel, experimental.useWebUIComponents, permissionMode]);

  // Load projects to get encodedName mapping
  useEffect(() => {
    const loadProjects = async () => {
      try {
        if (isIntegratedMode()) {
          // In integrated mode, fetch from Open-ACE API
          const response = await fetchOpenAceProjects();
          const aceProjects = response.projects || [];
          // Convert Open-ACE projects to local format
          const localProjects = aceProjects.map((p) => ({
            path: p.path,
            encodedName: "-" + p.path
              .replace(/^[A-Za-z]:/, "") // Remove Windows drive letter
              .replace(/^\/+/, "") // Remove leading slashes
              .replace(/[^a-zA-Z0-9]/g, "-"), // Replace non-alphanumeric with dash
          }));
          setProjects(localProjects);
        } else {
          // In standalone mode, fetch from local API
          const response = await fetch(getProjectsUrl());
          if (response.ok) {
            const data = await response.json();
            setProjects(data.projects || []);
          }
        }
      } catch (error) {
        console.error("Failed to load projects:", error);
      }
    };
    loadProjects();
  }, []);

  const handleBackToChat = useCallback(() => {
    navigate({ search: "" });
  }, [navigate]);

  const handleBackToHistory = useCallback(() => {
    const searchParams = new URLSearchParams();
    searchParams.set("view", "history");
    navigate({ search: searchParams.toString() });
  }, [navigate]);

  const handleBackToProjects = useCallback(() => {
    navigate("/");
  }, [navigate]);

  // Handle global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === KEYBOARD_SHORTCUTS.ABORT && effectiveIsLoading && currentRequestId) {
        e.preventDefault();
        handleAbort();
      }
      // Permission mode toggle: Ctrl+Shift+Y (Windows/Linux) or Cmd+Shift+Y (macOS)
      if (
        e.key.toLowerCase() === KEYBOARD_SHORTCUTS.PERMISSION_MODE_TOGGLE.toLowerCase() &&
        e.shiftKey &&
        (e.ctrlKey || e.metaKey)
      ) {
        e.preventDefault();
        const modes: PermissionMode[] = ["default", "plan", "auto-edit", "yolo"];
        const currentIndex = modes.indexOf(permissionMode);
        setPermissionMode(modes[(currentIndex + 1) % modes.length]);
      }

      // Tab switching shortcut: Cmd/Ctrl+Shift+,/. (Issue #68)
      // Send message to parent window (Open ACE) to switch workspace tabs
      // Use e.code instead of e.key to support non-English input methods
      // Comma key = previous tab, Period key = next tab
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifierPressed = isMac ? (e.metaKey && e.shiftKey) : (e.ctrlKey && e.shiftKey);

      if (modifierPressed && (e.code === "Comma" || e.code === "Period")) {
        // Check if embedded in iframe (window.parent !== window)
        // Send message to parent window (Open ACE) to switch workspace tabs
        if (window.parent !== window) {
          e.preventDefault();
          const direction = e.code === "Comma" ? "prev" : "next";
          console.log('[qwen-code-webui] Sending tab-switch request to parent:', direction);
          window.parent.postMessage(
            {
              type: "qwen-code-tab-switch-request",
              direction,
              shortcut: `${e.ctrlKey ? "Ctrl" : "Cmd"}+Shift+${e.code}`,
            },
            "*"
          );
        }
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [effectiveIsLoading, currentRequestId, handleAbort, permissionMode, setPermissionMode]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      <div className="max-w-6xl mx-auto p-3 sm:p-6 h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            {!isIntegratedMode() && (isHistoryView || isLoadedConversation) && (
              <button
                onClick={isHistoryView ? handleBackToChat : handleBackToHistory}
                className="p-1.5 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 backdrop-blur-sm shadow-sm hover:shadow-md"
                aria-label={isHistoryView ? "Back to chat" : "Back to history"}
              >
                <ChevronLeftIcon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </button>
            )}
            <div>
              <nav aria-label="Breadcrumb">
                <div className="flex items-center">
                  {isHistoryView ? (
                    <h1 className="text-slate-800 dark:text-slate-100 text-lg sm:text-xl font-bold tracking-tight">
                      Conversation History
                    </h1>
                  ) : isRemoteWorkspace ? (
                    <button
                      onClick={handleBackToProjects}
                      className="text-slate-800 dark:text-slate-100 text-lg sm:text-xl font-bold tracking-tight hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 rounded-md px-1 -mx-1"
                      aria-label={t("chat.backToProjects")}
                      title={t("chat.backToProjects")}
                    >
                      {workingDirectory || "Chat"}
                    </button>
                  ) : sessionId ? (
                    <>
                      <h1 className="text-slate-800 dark:text-slate-100 text-lg sm:text-xl font-bold tracking-tight">
                        Conversation
                      </h1>
                      {sessionId && (
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                          ({sessionId.substring(0, 8)}...)
                        </span>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={handleBackToProjects}
                      className="text-slate-800 dark:text-slate-100 text-lg sm:text-xl font-bold tracking-tight hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 rounded-md px-1 -mx-1"
                      aria-label={t("chat.backToProjects")}
                      title={t("chat.backToProjects")}
                    >
                      {workingDirectory || "Chat"}
                    </button>
                  )}
                </div>
              </nav>
              {/* Remote workspace indicator */}
              {isRemoteWorkspace && remoteChat.session && (
                <div className="flex items-center gap-2 mt-1 text-sm text-purple-600 dark:text-purple-400">
                  <ServerIcon className="h-4 w-4" />
                  <span className="font-medium">{remoteMachineName}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      remoteChat.session.status === "active"
                        ? "bg-green-500"
                        : remoteChat.session.status === "error"
                          ? "bg-red-500"
                          : "bg-slate-400"
                    }`}
                    title={`Status: ${remoteChat.session.status}`}
                  />
                </div>
              )}
              {/* Remote session error */}
              {isRemoteWorkspace && remoteChat.error && (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-red-500 dark:text-red-400">
                    {remoteChat.error}
                  </p>
                  {remoteMachineId && (
                    <button
                      onClick={() => remoteChat.reconnect(remoteMachineId, workingDirectory || "", selectedModel || undefined)}
                      className="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                    >
                      {t("chat.reconnect")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isHistoryView && (
              <ModelSelector
                models={models}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                loading={modelsLoading}
              />
            )}
            <ProjectSwitchButton onClick={handleBackToProjects} />
            {!isHistoryView && (
              <ToggleWebUIComponentsButton />
            )}
            {!isHistoryView && (
              <ExpandThinkingButton
                isExpanded={expandThinking}
                onClick={toggleExpandThinking}
              />
            )}
            {!isHistoryView && <HistoryButton onClick={handleHistoryClick} />}
            <SettingsButton onClick={handleSettingsClick} />
          </div>
        </div>

        {/* Main Content */}
        {isHistoryView ? (
          <HistoryView
            workingDirectory={workingDirectory || ""}
            encodedName={getEncodedName()}
            onBack={handleBackToChat}
          />
        ) : historyLoading ? (
          /* Loading conversation history */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 dark:text-slate-400">
                Loading conversation history...
              </p>
            </div>
          </div>
        ) : historyError ? (
          /* Error loading conversation history */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="text-slate-800 dark:text-slate-100 text-xl font-semibold mb-2">
                Error Loading Conversation
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
                {historyError}
              </p>
              <button
                onClick={() => navigate({ search: "" })}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Start New Conversation
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Quota Exceeded Banner */}
            {isQuotaExceeded && (
              <div className="flex-shrink-0 mx-auto max-w-2xl w-full p-4">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-red-800 dark:text-red-300 font-semibold">{t("quota.exceeded")}</h3>
                  </div>
                  <p className="text-red-600 dark:text-red-400 text-sm mb-3">
                    {t("quota.exceededMessage")}
                  </p>
                  {quotaErrorStatus && (
                    <div className="text-xs text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded p-2 mb-3">
                      <p>{t("quota.dailyTokens")}: {quotaErrorStatus.daily?.tokens?.used ?? 0} / {quotaErrorStatus.daily?.tokens?.limit ?? '∞'}</p>
                      <p>{t("quota.dailyRequests")}: {quotaErrorStatus.daily?.requests?.used ?? 0} / {quotaErrorStatus.daily?.requests?.limit ?? '∞'}</p>
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        const resp = await fetch(getChatUrl().replace('/api/chat', '/api/quota/status'));
                        if (resp.ok) {
                          const data = await resp.json();
                          if (data.can_use) {
                            setIsQuotaExceeded(false);
                            setQuotaErrorStatus(null);
                          }
                        }
                      } catch {
                        // Ignore close errors
                      }
                    }}
                    className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                  >
                    {t("common.retry")}
                  </button>
                </div>
              </div>
            )}

            {/* Chat Messages */}
            {experimental.useWebUIComponents ? (
              <WebUIChatMessages
                messages={displayMessages}
                expandThinking={expandThinking}
              />
            ) : (
              <ChatMessages
                messages={displayMessages}
                isLoading={effectiveIsLoading}
                expandThinking={expandThinking}
              />
            )}

            {/* Context Usage Panel */}
            {showContextPanel && contextPanelData && (
              <ContextUsagePanel
                data={contextPanelData}
                onClose={() => setShowContextPanel(false)}
              />
            )}
            {showContextPanel && !contextPanelData && (
              <div className="border border-slate-300 dark:border-slate-600 rounded-lg p-4 my-2 bg-white dark:bg-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {t("contextPanel.title")}
                  </span>
                  <button
                    onClick={() => setShowContextPanel(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
                  >
                    &times;
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("contextPanel.noApiData")}
                </p>
              </div>
            )}

            {/* Input */}
            <ChatInput
              input={input}
              isLoading={effectiveIsLoading}
              currentRequestId={currentRequestId}
              onInputChange={setInput}
              onSubmit={() => sendMessage()}
              onAbort={handleAbort}
              disabled={isQuotaExceeded}
              permissionMode={permissionMode}
              onPermissionModeChange={setPermissionMode}
              showPermissions={isPermissionMode}
              permissionData={permissionData}
              planPermissionData={planPermissionData}
              onExecuteCommand={handleExecuteSlashCommand}
              selectedModelName={selectedModelName}
              contextWindowSize={contextWindowSize}
              tokenUsage={tokenUsage}
            />
          </>
        )}

        {/* Settings Modal */}
        <SettingsModal isOpen={isSettingsOpen} onClose={handleSettingsClose} />

        {/* Clear Conversation Confirmation Modal */}
        <ConfirmModal
          isOpen={showClearConfirm}
          onClose={() => setShowClearConfirm(false)}
          onConfirm={handleClearConversation}
          title={t("slashCommands.clearConfirmTitle")}
          message={t("slashCommands.clearConfirmMessage")}
          confirmText={t("slashCommands.clearConfirmButton")}
          cancelText={t("common.cancel")}
          variant="warning"
        />

        {/* Command Loop Detection — auto-abort notification */}
        {commandLoopRequest && (
          <div className="fixed bottom-4 right-4 z-50 max-w-md">
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4 shadow-lg">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    {t("commandLoop.autoAbortTitle", "Loop detected — auto-aborted")}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    {t("commandLoop.autoAbortDescription", "Tool {{tool}} was repeating the same error. Request aborted.", { tool: commandLoopRequest.toolName })}
                  </p>
                  <div className="mt-2 text-xs text-amber-600 dark:text-amber-500 font-mono bg-amber-100 dark:bg-amber-900/40 rounded p-2 max-h-20 overflow-auto">
                    {commandLoopRequest.errorOutput}
                  </div>
                </div>
                <button
                  onClick={handleCommandLoopAbort}
                  className="text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200 flex-shrink-0"
                  aria-label="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Thinking Timeout — auto-abort notification */}
        {thinkingTimeoutInfo && (
          <div className="fixed bottom-4 left-4 z-50 max-w-md">
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 shadow-lg">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    {t("thinkingTimeout.title", "Thinking timeout — auto-aborted")}
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                    {t("thinkingTimeout.description", "AI thinking exceeded {{minutes}} minutes and was auto-aborted. Here's what the AI was thinking about:", { minutes: thinkingTimeoutInfo.elapsed / 60 })}
                  </p>
                  {thinkingTimeoutInfo.content && (
                    <details className="mt-2">
                      <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer hover:text-blue-800 dark:hover:text-blue-200">
                        {t("thinkingTimeout.showContent", "Show thinking content")}
                      </summary>
                      <div className="mt-1 text-xs text-blue-700 dark:text-blue-300 font-mono bg-blue-100 dark:bg-blue-900/40 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
                        {thinkingTimeoutInfo.content}
                      </div>
                    </details>
                  )}
                </div>
                <button
                  onClick={() => setThinkingTimeoutInfo(null)}
                  className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200 flex-shrink-0"
                  aria-label="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
