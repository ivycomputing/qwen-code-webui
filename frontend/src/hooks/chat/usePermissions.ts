import { useState, useCallback, useRef } from "react";
import type { PermissionMode } from "../../types";

interface PermissionRequest {
  isOpen: boolean;
  toolName: string;
  patterns: string[];
  toolUseId: string;
  requestId?: string; // For remote mode: the control_request request_id
}

interface PlanModeRequest {
  isOpen: boolean;
  planContent: string;
}

interface UsePermissionsOptions {
  onPermissionModeChange?: (mode: PermissionMode) => void;
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
  const { onPermissionModeChange } = options;
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [permissionRequest, setPermissionRequest] =
    useState<PermissionRequest | null>(null);
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
  const autoRejectionCountRef = useRef(0);
  const lastAutoRejectionToolRef = useRef<string>("");
  const lastAutoRejectionTimeRef = useRef(0);

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
    (toolName: string, patterns: string[], toolUseId: string, requestId?: string) => {
      setPermissionRequest({
        isOpen: true,
        toolName,
        patterns,
        toolUseId,
        requestId,
      });
      // Enable inline permission mode
      setIsPermissionMode(true);
    },
    [],
  );

  const closePermissionRequest = useCallback(() => {
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
      const updatedAllowedTools = [...currentAllowedTools, pattern];
      setAllowedTools(updatedAllowedTools);
      return updatedAllowedTools;
    },
    [allowedTools],
  );

  const resetPermissions = useCallback(() => {
    setAllowedTools([]);
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
   * Generate a fingerprint for error output (first 200 chars, normalized)
   */
  const generateErrorFingerprint = useCallback((errorOutput: string): string => {
    // Normalize error output: take first 200 chars, remove whitespace variations
    const normalized = errorOutput
      .substring(0, 200)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return normalized;
  }, []);

  /**
   * Generate a key for command identification
   */
  const generateCommandKey = useCallback(
    (toolName: string, input: Record<string, unknown>): string => {
      // For shell commands, use the command string
      if (input.command && typeof input.command === "string") {
        // Normalize command: remove path variations, keep core structure
        const normalizedCommand = input.command
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 100);
        return `${toolName}:${normalizedCommand}`;
      }
      // For other tools, use JSON representation (truncated)
      const inputStr = JSON.stringify(input).substring(0, 100);
      return `${toolName}:${inputStr}`;
    },
    []
  );

  /**
   * Check for command result loop detection
   * Returns CommandLoopRequest if loop detected, null otherwise
   */
  const checkCommandResultLoop = useCallback(
    (
      toolName: string,
      input: Record<string, unknown>,
      result: { exitCode?: number; output: string }
    ): CommandLoopRequest | null => {
      // Skip if loop detection is disabled for this session
      if (loopDetectionDisabledRef.current) {
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
        // Clear tracking for successful results
        const key = generateCommandKey(toolName, input);
        commandResultsRef.current.delete(key);
        return null;
      }

      const key = generateCommandKey(toolName, input);
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
   * Disable command result loop detection for current session
   */
  const disableCommandResultLoopDetection = useCallback(() => {
    loopDetectionDisabledRef.current = true;
    commandResultsRef.current.clear();
    closeCommandLoopRequest();
  }, [closeCommandLoopRequest]);

  /**
   * Record an auto-rejected tool call (SDK-level rejection, e.g. stdin closed)
   * Returns CommandLoopRequest if loop detected, null otherwise
   */
  const recordAutoRejection = useCallback(
    (toolName: string, content: string): CommandLoopRequest | null => {
      if (loopDetectionDisabledRef.current) return null;

      const config = loopDetectionConfigRef.current;
      const now = Date.now();

      // Reset counter if outside the time window
      if (now - lastAutoRejectionTimeRef.current > config.resetWindowMs) {
        autoRejectionCountRef.current = 0;
      }

      // Skip loop detection for excluded tools
      if (config.excludedTools.has(toolName)) return null;

      // Check if same tool as last auto-rejection
      if (lastAutoRejectionToolRef.current === toolName) {
        autoRejectionCountRef.current++;
      } else {
        autoRejectionCountRef.current = 1;
        lastAutoRejectionToolRef.current = toolName;
      }

      lastAutoRejectionTimeRef.current = now;

      // Check threshold
      if (autoRejectionCountRef.current >= config.maxConsecutiveDenials) {
        autoRejectionCountRef.current = 0;
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
    autoRejectionCountRef.current = 0;
    lastAutoRejectionToolRef.current = "";
  }, []);

  return {
    allowedTools,
    permissionRequest,
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
