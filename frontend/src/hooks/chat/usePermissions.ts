import { useState, useCallback, useRef, useEffect } from "react";
import type { PermissionMode } from "../../types";
import { STORAGE_KEYS, getStorageItem, setStorageItem, removeStorageItem } from "../../utils/storage";

interface PermissionRequest {
  isOpen: boolean;
  toolName: string;
  patterns: string[];
  toolUseId: string;
  requestId?: string; // For remote mode: the control_request request_id
  permissionId?: string; // For proactive canUseTool flow
  toolInput?: Record<string, unknown>;
  suggestions?: Array<{ type: string; label: string; description?: string }>;
  autoApproveMs?: number; // Countdown before auto-approve (local mode, issue #139)
  // For ask_user_question tool
  confirmationType?: "default" | "ask_user_question";
  questions?: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description?: string }>;
    multiSelect: boolean;
  }>;
}

interface PlanModeRequest {
  isOpen: boolean;
  planContent: string;
}

interface UsePermissionsOptions {
  onPermissionModeChange?: (mode: PermissionMode) => void;
  /** Current permission mode - used to skip loop detection in YOLO mode */
  permissionMode?: PermissionMode;
}

/**
 * Configuration for permission denial loop detection
 */
interface LoopDetectionConfig {
  /** Maximum consecutive denials before triggering protection */
  maxConsecutiveDenials: number;
  /** Time window in ms to reset the counter (5 minutes) */
  resetWindowMs: number;
  /** Tools to exclude from loop detection (always allowed to retry) */
  excludedTools: Set<string>;
}

const DEFAULT_LOOP_DETECTION_CONFIG: LoopDetectionConfig = {
  maxConsecutiveDenials: 3,
  resetWindowMs: 5 * 60 * 1000, // 5 minutes
  excludedTools: new Set(["exit_plan_mode"]),
};

/**
 * Configuration for command result loop detection
 */
interface CommandResultLoopConfig {
  /** Maximum same command results before triggering protection */
  maxSameCommandResults: number;
  /** Time window in ms to reset the counter (5 minutes) */
  resetWindowMs: number;
  /** Tools to exclude from loop detection */
  excludedTools: Set<string>;
}

const DEFAULT_COMMAND_RESULT_LOOP_CONFIG: CommandResultLoopConfig = {
  maxSameCommandResults: 3,
  resetWindowMs: 5 * 60 * 1000, // 5 minutes
  excludedTools: new Set(["read_file", "glob", "grep_search"]),
};

/**
 * Command result loop detection request
 */
export interface CommandLoopRequest {
  isOpen: boolean;
  toolName: string;
  command: string;
  errorOutput: string;
}

/**
 * Build a message to break the AI out of a thinking loop
 */
function buildLoopDetectedMessage(): string {
  return `[SYSTEM: Loop Detection Triggered]

The system has detected that you are in a potential infinite loop of tool permission denials.

**IMPORTANT: Stop retrying the same action.**

Instead, please:
1. Explain to the user what you were trying to do
2. Ask the user if they want to try a different approach

Do not attempt to call the same tool again without user confirmation.`;
}

export function usePermissions(options: UsePermissionsOptions = {}) {
  const { onPermissionModeChange, permissionMode } = options;
  const [allowedTools, setAllowedTools] = useState<string[]>(() =>
    getStorageItem<string[]>(STORAGE_KEYS.ALLOWED_TOOLS, []),
  );

  // Track permission mode in a ref for loop detection logic
  // In YOLO mode, loop detection is skipped to allow autonomous iterative workflows
  const permissionModeRef = useRef<PermissionMode>(permissionMode ?? "default");

  // Sync permissionMode ref when it changes
  useEffect(() => {
    if (permissionMode) {
      permissionModeRef.current = permissionMode;
    }
  }, [permissionMode]);

  // Sync allowedTools from localStorage when another tab modifies it
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.ALLOWED_TOOLS) {
        try {
          setAllowedTools(e.newValue ? JSON.parse(e.newValue) : []);
        } catch {
          setAllowedTools([]);
        }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const [permissionRequest, setPermissionRequest] =
    useState<PermissionRequest | null>(null);
  const permissionRequestRef = useRef<PermissionRequest | null>(null);
  const [planModeRequest, setPlanModeRequest] =
    useState<PlanModeRequest | null>(null);

  // New state for inline permission system
  const [isPermissionMode, setIsPermissionMode] = useState(false);

  // Permission denial loop detection state (using refs to avoid re-renders)
  const consecutiveDenialsRef = useRef(0);
  const lastDenialTimeRef = useRef(0);
  const lastDeniedToolRef = useRef<string>("");
  const loopDetectionConfigRef = useRef(DEFAULT_LOOP_DETECTION_CONFIG);

  // Auto-rejection loop detection state (SDK-level rejections, e.g. stdin closed)
  // Track the most recent rejected tool per agent so switching tools resets the loop counter.
  const autoRejectionStatesRef = useRef<
    Map<string, { toolName: string; count: number; lastTime: number }>
  >(new Map());

  // Command result loop detection state
  const commandResultLoopConfigRef = useRef(DEFAULT_COMMAND_RESULT_LOOP_CONFIG);
  const commandResultsRef = useRef<
    Map<
      string,
      {
        count: number;
        lastErrorFingerprint: string;
        lastTime: number;
      }
    >
  >(new Map());
  const [commandLoopRequest, setCommandLoopRequest] =
    useState<CommandLoopRequest | null>(null);
  // Flag to permanently disable loop detection for current session
  const loopDetectionDisabledRef = useRef(false);

  const showPermissionRequest = useCallback(
    (
      toolName: string, patterns: string[], toolUseId: string, requestId?: string,
      permissionId?: string, toolInput?: Record<string, unknown>,
      suggestions?: Array<{ type: string; label: string; description?: string }>,
      autoApproveMs?: number,
      // For ask_user_question tool
      confirmationType?: "default" | "ask_user_question",
      questions?: Array<{
        question: string;
        header: string;
        options: Array<{ label: string; description?: string }>;
        multiSelect: boolean;
      }>,
    ) => {
      const req: PermissionRequest = {
        isOpen: true, toolName, patterns, toolUseId, requestId,
        permissionId, toolInput, suggestions, autoApproveMs,
        confirmationType, questions,
      };
      permissionRequestRef.current = req;
      setPermissionRequest(req);
      // Enable inline permission mode
      setIsPermissionMode(true);
    },
    [],
  );

  const closePermissionRequest = useCallback(() => {
    permissionRequestRef.current = null;
    setPermissionRequest(null);
    // Disable inline permission mode
    setIsPermissionMode(false);
  }, []);

  const showPlanModeRequest = useCallback((planContent: string) => {
    setPlanModeRequest({
      isOpen: true,
      planContent,
    });
    setIsPermissionMode(true);
  }, []);

  const closePlanModeRequest = useCallback(() => {
    setPlanModeRequest(null);
    setIsPermissionMode(false);
  }, []);

  const allowToolTemporary = useCallback(
    (pattern: string, baseTools?: string[]) => {
      const currentAllowedTools = baseTools || allowedTools;
      return [...currentAllowedTools, pattern];
    },
    [allowedTools],
  );

  const allowToolPermanent = useCallback(
    (pattern: string, baseTools?: string[]) => {
      const currentAllowedTools = baseTools || allowedTools;
      if (currentAllowedTools.includes(pattern)) return currentAllowedTools;
      const updatedAllowedTools = [...currentAllowedTools, pattern];
      setAllowedTools(updatedAllowedTools);
      setStorageItem(STORAGE_KEYS.ALLOWED_TOOLS, updatedAllowedTools);
      return updatedAllowedTools;
    },
    [allowedTools],
  );

  const resetPermissions = useCallback(() => {
    setAllowedTools([]);
    removeStorageItem(STORAGE_KEYS.ALLOWED_TOOLS);
  }, []);

  // Helper function to update permission mode based on user action
  const updatePermissionMode = useCallback(
    (mode: PermissionMode) => {
      onPermissionModeChange?.(mode);
    },
    [onPermissionModeChange],
  );

  /**
   * Record a tool denial for loop detection
   */
  const recordDenial = useCallback((toolName: string): string | null => {
    const now = Date.now();
    const config = loopDetectionConfigRef.current;

    // Reset counter if outside the time window
    if (now - lastDenialTimeRef.current > config.resetWindowMs) {
      consecutiveDenialsRef.current = 0;
    }

    // Skip loop detection for excluded tools
    if (config.excludedTools.has(toolName)) {
      return null;
    }

    // Check if same tool as last denial
    if (lastDeniedToolRef.current === toolName) {
      consecutiveDenialsRef.current++;
    } else {
      consecutiveDenialsRef.current = 1;
      lastDeniedToolRef.current = toolName;
    }

    lastDenialTimeRef.current = now;

    // Check if we've exceeded the threshold
    if (consecutiveDenialsRef.current >= config.maxConsecutiveDenials) {
      consecutiveDenialsRef.current = 0; // Reset after triggering
      return buildLoopDetectedMessage();
    }

    return null;
  }, []);

  /**
   * Reset the denial counter (e.g., when a tool is approved)
   */
  const resetDenialCounter = useCallback(() => {
    consecutiveDenialsRef.current = 0;
    lastDeniedToolRef.current = "";
  }, []);

  /**
   * Simple hash function (djb2 algorithm) for fingerprint generation.
   * Returns a base36 string for compact representation.
   */
  const simpleHash = useCallback((str: string): string => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }, []);

  /**
   * Generate a fingerprint for error output using full content hash.
   * This fixes #224 where 200-char truncation caused false loop detection.
   */
  const generateErrorFingerprint = useCallback((errorOutput: string): string => {
    // Normalize error output: remove whitespace variations, use full content
    const normalized = errorOutput
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return simpleHash(normalized);
  }, [simpleHash]);

  /**
   * Generate a key for command identification, scoped per agentId.
   * Every key carries an explicit scope prefix ("__main__:" or "<agentId>:")
   * so each agent's loop counters are fully independent (#140) and a reset
   * can target exactly one agent's keys (#225). Uses full content hashing
   * to avoid collisions from truncation (#224).
   */
  const generateCommandKey = useCallback(
    (toolName: string, input: Record<string, unknown>, agentId?: string): string => {
      const prefix = `${agentId ?? "__main__"}:`;
      // For shell commands, use the command string
      if (input.command && typeof input.command === "string") {
        // Normalize command: remove whitespace variations, use full content
        const normalizedCommand = input.command
          .replace(/\s+/g, " ")
          .trim();
        return `${prefix}${toolName}:${simpleHash(normalizedCommand)}`;
      }
      // For other tools, use full JSON representation hash
      const inputStr = JSON.stringify(input);
      return `${prefix}${toolName}:${simpleHash(inputStr)}`;
    },
    [simpleHash]
  );

  /**
   * Check for command result loop detection
   * Returns CommandLoopRequest if loop detected, null otherwise
   */
  const checkCommandResultLoop = useCallback(
    (
      toolName: string,
      input: Record<string, unknown>,
      result: { exitCode?: number; output: string },
      agentId?: string,
    ): CommandLoopRequest | null => {
      // Skip if loop detection is disabled for this session
      if (loopDetectionDisabledRef.current) {
        return null;
      }

      // Skip loop detection in YOLO mode - allow autonomous iterative workflows
      // (e.g., fix_issue skill: test → fix → test again)
      if (permissionModeRef.current === "yolo") {
        return null;
      }

      const config = commandResultLoopConfigRef.current;
      const now = Date.now();

      // Skip excluded tools
      if (config.excludedTools.has(toolName)) {
        return null;
      }

      // Only check for failed results (non-zero exit code or error indicators)
      const isError =
        result.exitCode !== undefined && result.exitCode !== 0;
      const hasErrorKeywords =
        result.output.toLowerCase().includes("error") ||
        result.output.toLowerCase().includes("failed") ||
        result.output.toLowerCase().includes("not found");

      if (!isError && !hasErrorKeywords) {
        // A success means this agent is making progress: reset its loop
        // counters (across tools), but leave other agents' counters intact
        // (#140 per-agent isolation — a fork's success must not mask another
        // fork's genuine loop). Tradeoff: an agent that alternates a
        // successful no-op with the same failing command resets its own
        // counter every cycle and never trips detection; accepted so
        // iterative workflows aren't blocked (#225).
        const scopePrefix = `${agentId ?? "__main__"}:`;
        for (const key of commandResultsRef.current.keys()) {
          if (key.startsWith(scopePrefix)) {
            commandResultsRef.current.delete(key);
          }
        }
        return null;
      }

      const key = generateCommandKey(toolName, input, agentId);
      const errorFingerprint = generateErrorFingerprint(result.output);

      // Get existing entry
      const entry = commandResultsRef.current.get(key);

      // Reset if outside time window
      if (entry && now - entry.lastTime > config.resetWindowMs) {
        commandResultsRef.current.delete(key);
        return null;
      }

      // Check if same error fingerprint
      if (entry && entry.lastErrorFingerprint === errorFingerprint) {
        entry.count++;
        entry.lastTime = now;

        // Check threshold
        if (entry.count >= config.maxSameCommandResults) {
          // Loop detected - create request
          const loopRequest: CommandLoopRequest = {
            isOpen: true,
            toolName,
            command: input.command
              ? String(input.command).substring(0, 100)
              : JSON.stringify(input).substring(0, 100),
            errorOutput: result.output.substring(0, 200),
          };

          // Reset tracking
          commandResultsRef.current.delete(key);

          return loopRequest;
        }
      } else {
        // New or different error - start tracking
        commandResultsRef.current.set(key, {
          count: 1,
          lastErrorFingerprint: errorFingerprint,
          lastTime: now,
        });
      }

      return null;
    },
    [generateCommandKey, generateErrorFingerprint]
  );

  /**
   * Show command loop detection dialog
   */
  const showCommandLoopRequest = useCallback(
    (request: CommandLoopRequest) => {
      setCommandLoopRequest(request);
      setIsPermissionMode(true);
    },
    []
  );

  /**
   * Close command loop detection dialog
   */
  const closeCommandLoopRequest = useCallback(() => {
    setCommandLoopRequest(null);
    setIsPermissionMode(false);
  }, []);

  /**
   * Reset command result loop detection counters (instead of permanent disable)
   */
  const disableCommandResultLoopDetection = useCallback(() => {
    commandResultsRef.current.clear();
    // Reset auto-rejection counters too
    autoRejectionStatesRef.current.clear();
    closeCommandLoopRequest();
  }, [closeCommandLoopRequest]);

  /**
   * Record an auto-rejected tool call (SDK-level rejection, e.g. stdin closed)
   * Returns CommandLoopRequest if loop detected, null otherwise
   * Each agent (main session or fork) maintains independent counters (#140).
   */
  const recordAutoRejection = useCallback(
    (toolName: string, content: string, agentId?: string): CommandLoopRequest | null => {
      const config = loopDetectionConfigRef.current;
      const now = Date.now();

      // Build a scoped key for agent isolation
      const scopeKey = agentId || "__main__";

      // "Input closed" is a session-level fatal error — always detect immediately
      // Match the full SDK error format to avoid false positives from benign "Operation Cancelled"
      const lowerContent = content.toLowerCase();
      const isInputClosed = lowerContent.includes("input closed") ||
        (lowerContent.includes("operation cancelled") && lowerContent.includes("input closed"));

      // "Input closed" is a session-level fatal error — always detect immediately.
      // When this occurs the CLI process is dead, so the entire session tree
      // (including all fork agents) is unusable regardless of which agent reported it.
      if (isInputClosed) {
        autoRejectionStatesRef.current.clear();
        return {
          isOpen: true,
          toolName,
          command: toolName,
          errorOutput: content.substring(0, 200),
        };
      }

      if (loopDetectionDisabledRef.current) return null;

      // Skip loop detection in YOLO mode - allow autonomous iterative workflows
      if (permissionModeRef.current === "yolo") return null;

      // Skip loop detection for excluded tools
      if (config.excludedTools.has(toolName)) return null;

      // Get or create per-key state
      const states = autoRejectionStatesRef.current;
      const existing = states.get(scopeKey);
      const isWithinWindow = existing && now - existing.lastTime <= config.resetWindowMs;
      const state =
        isWithinWindow && existing.toolName === toolName
          ? existing
          : { toolName, count: 0, lastTime: now };

      state.toolName = toolName;
      state.count++;
      state.lastTime = now;
      states.set(scopeKey, state);

      // Check threshold
      if (state.count >= config.maxConsecutiveDenials) {
        states.delete(scopeKey);
        return {
          isOpen: true,
          toolName,
          command: toolName,
          errorOutput: content.substring(0, 200),
        };
      }

      return null;
    },
    [],
  );

  /**
   * Reset the auto-rejection counter
   */
  const resetAutoRejectionCounter = useCallback(() => {
    autoRejectionStatesRef.current.clear();
  }, []);

  return {
    allowedTools,
    permissionRequest,
    permissionRequestRef,
    showPermissionRequest,
    closePermissionRequest,
    allowToolTemporary,
    allowToolPermanent,
    resetPermissions,
    isPermissionMode,
    setIsPermissionMode,
    planModeRequest,
    showPlanModeRequest,
    closePlanModeRequest,
    updatePermissionMode,
    // Permission denial loop detection
    recordDenial,
    resetDenialCounter,
    // Command result loop detection
    commandLoopRequest,
    checkCommandResultLoop,
    showCommandLoopRequest,
    closeCommandLoopRequest,
    disableCommandResultLoopDetection,
    // Auto-rejection loop detection
    recordAutoRejection,
    resetAutoRejectionCounter,
  };
}
