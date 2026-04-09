import React, { useRef, useEffect, useState, useCallback } from "react";
import { StopIcon } from "@heroicons/react/24/solid";
import { useTranslation } from "react-i18next";
import { UI_CONSTANTS, KEYBOARD_SHORTCUTS } from "../../utils/constants";
import { useEnterBehavior } from "../../hooks/useSettings";
import { useInputHistory } from "../../hooks/useInputHistory";
import { useSlashCommand } from "../../hooks/useSlashCommand";
import { SlashCommandSuggestion } from "./SlashCommandSuggestion";
import { PermissionInputPanel } from "./PermissionInputPanel";
import { PlanPermissionInputPanel } from "./PlanPermissionInputPanel";
import { isIntegratedMode } from "../../api/openace";
import type { PermissionMode } from "../../types";
import type { SlashCommand, SubCommand } from "../../utils/slashCommands";
import type { TokenUsageInfo } from "../../utils/tokenUsage";
import { formatTokenRatio } from "../../utils/tokenUsage";

interface PermissionData {
  patterns: string[];
  onAllow: () => void;
  onAllowPermanent: () => void;
  onDeny: () => void;
  getButtonClassName?: (
    buttonType: "allow" | "allowPermanent" | "deny",
    defaultClassName: string,
  ) => string;
  onSelectionChange?: (selection: "allow" | "allowPermanent" | "deny") => void;
  externalSelectedOption?: "allow" | "allowPermanent" | "deny" | null;
}

interface PlanPermissionData {
  onAcceptWithEdits: () => void;
  onAcceptDefault: () => void;
  onKeepPlanning: () => void;
  getButtonClassName?: (
    buttonType: "acceptWithEdits" | "acceptDefault" | "keepPlanning",
    defaultClassName: string,
  ) => string;
  onSelectionChange?: (
    selection: "acceptWithEdits" | "acceptDefault" | "keepPlanning",
  ) => void;
  externalSelectedOption?:
    | "acceptWithEdits"
    | "acceptDefault"
    | "keepPlanning"
    | null;
}

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  currentRequestId: string | null;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onAbort: () => void;
  disabled?: boolean;
  // Permission mode props
  permissionMode: PermissionMode;
  onPermissionModeChange: (mode: PermissionMode) => void;
  showPermissions?: boolean;
  permissionData?: PermissionData;
  planPermissionData?: PlanPermissionData;
  // Slash command execution callback
  onExecuteCommand?: (commandName: string) => void;
  // Status bar props
  selectedModelName?: string;
  contextWindowSize?: number;
  tokenUsage?: TokenUsageInfo;
}

export function ChatInput({
  input,
  isLoading,
  currentRequestId,
  onInputChange,
  onSubmit,
  onAbort,
  disabled = false,
  permissionMode,
  onPermissionModeChange,
  showPermissions = false,
  permissionData,
  planPermissionData,
  onExecuteCommand,
  selectedModelName,
  contextWindowSize,
  tokenUsage,
}: ChatInputProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const { enterBehavior } = useEnterBehavior();
  const {
    addToHistory,
    navigatePrevious,
    navigateNext,
    resetNavigation,
  } = useInputHistory();

  // Slash command handling
  const handleSlashCommandExecute = useCallback(
    (command: SlashCommand | SubCommand, isSubCommand: boolean) => {
      if (!isSubCommand && (command as SlashCommand).name) {
        onExecuteCommand?.((command as SlashCommand).name);
        onInputChange(""); // Clear input after command execution
      }
    },
    [onExecuteCommand, onInputChange],
  );

  const {
    isActive: isSlashActive,
    suggestions,
    selectedIndex,
    position,
    navigateUp: navigateSlashUp,
    navigateDown: navigateSlashDown,
    confirmSelection: confirmSlashSelection,
    cancelSuggestions: cancelSlashSuggestions,
    completeWithTab,
    isSubCommand,
    expandedHeight,
  } = useSlashCommand(
    inputRef as React.RefObject<HTMLTextAreaElement>,
    input,
    onInputChange,
    handleSlashCommandExecute,
  );

  // Focus input when not loading and not in permission mode
  useEffect(() => {
    if (!isLoading && !showPermissions && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading, showPermissions]);

  // Listen for focus request from Open-ACE parent when switching tabs
  useEffect(() => {
    if (!isIntegratedMode()) return;

    const handleFocusMessage = (event: MessageEvent) => {
      if (event.data?.type === 'openace-focus-input') {
        // Focus input when not loading and not in permission mode
        if (!isLoading && !showPermissions && inputRef.current) {
          inputRef.current.focus();
        }
      }
    };

    window.addEventListener('message', handleFocusMessage);
    return () => window.removeEventListener('message', handleFocusMessage);
  }, [isLoading, showPermissions]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const computedStyle = getComputedStyle(textarea);
      const maxHeight =
        parseInt(computedStyle.maxHeight, 10) ||
        UI_CONSTANTS.TEXTAREA_MAX_HEIGHT;
      const scrollHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${scrollHeight}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      addToHistory(input);
    }
    onSubmit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash command navigation (when active)
    if (isSlashActive && !isComposing) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateSlashUp();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateSlashDown();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (completeWithTab()) {
          return;
        }
      }
      if (e.key === KEYBOARD_SHORTCUTS.SUBMIT) {
        e.preventDefault();
        // Use completeWithTab for consistent behavior with Tab key
        if (completeWithTab()) {
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancelSlashSuggestions();
        return;
      }
    }

    // History navigation with up/down arrows (only when input is focused and slash command not active)
    if (!isSlashActive) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const previousValue = navigatePrevious(input);
        onInputChange(previousValue);
        // Move cursor to end of text
        setTimeout(() => {
          if (inputRef.current) {
            const len = inputRef.current.value.length;
            inputRef.current.setSelectionRange(len, len);
          }
        }, 0);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextValue = navigateNext(input);
        onInputChange(nextValue);
        // Move cursor to end of text
        setTimeout(() => {
          if (inputRef.current) {
            const len = inputRef.current.value.length;
            inputRef.current.setSelectionRange(len, len);
          }
        }, 0);
        return;
      }
    }

    if (e.key === KEYBOARD_SHORTCUTS.SUBMIT && !isComposing) {
      if (enterBehavior === "newline") {
        handleNewlineModeKeyDown(e);
      } else {
        handleSendModeKeyDown(e);
      }
    }
  };

  const handleNewlineModeKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    // Newline mode: Enter adds newline, Shift+Enter sends
    if (e.shiftKey) {
      e.preventDefault();
      // Send message - add to history first
      if (input.trim()) {
        addToHistory(input);
      }
      onSubmit();
    }
    // Enter is handled naturally by textarea (adds newline)
  };

  const handleSendModeKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    // Send mode: Enter sends, Shift+Enter adds newline
    if (!e.shiftKey) {
      e.preventDefault();
      // Send message - add to history first
      if (input.trim()) {
        addToHistory(input);
      }
      onSubmit();
    }
    // Shift+Enter is handled naturally by textarea (adds newline)
  };
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    // Add small delay to handle race condition between composition and keydown events
    setTimeout(() => setIsComposing(false), 0);
  };

  // Get permission mode status indicator (CLI-style)
  const getPermissionModeIndicator = (mode: PermissionMode): string => {
    switch (mode) {
      case "default":
        return `🔧 ${t("chat.normalMode")}`;
      case "plan":
        return `⏸ ${t("chat.planMode")}`;
      case "auto-edit":
        return `⏵⏵ ${t("chat.autoEdit")}`;
      case "yolo":
        return `🚀 ${t("chat.yoloMode")}`;
    }
  };

  // Get next permission mode for cycling
  const getNextPermissionMode = (current: PermissionMode): PermissionMode => {
    const modes: PermissionMode[] = ["default", "plan", "auto-edit", "yolo"];
    const currentIndex = modes.indexOf(current);
    return modes[(currentIndex + 1) % modes.length];
  };

  // If we're in plan permission mode, show the plan permission panel instead
  if (showPermissions && planPermissionData) {
    return (
      <PlanPermissionInputPanel
        onAcceptWithEdits={planPermissionData.onAcceptWithEdits}
        onAcceptDefault={planPermissionData.onAcceptDefault}
        onKeepPlanning={planPermissionData.onKeepPlanning}
        getButtonClassName={planPermissionData.getButtonClassName}
        onSelectionChange={planPermissionData.onSelectionChange}
        externalSelectedOption={planPermissionData.externalSelectedOption}
      />
    );
  }

  // If we're in regular permission mode, show the permission panel instead
  if (showPermissions && permissionData) {
    return (
      <PermissionInputPanel
        patterns={permissionData.patterns}
        onAllow={permissionData.onAllow}
        onAllowPermanent={permissionData.onAllowPermanent}
        onDeny={permissionData.onDeny}
        getButtonClassName={permissionData.getButtonClassName}
        onSelectionChange={permissionData.onSelectionChange}
        externalSelectedOption={permissionData.externalSelectedOption}
      />
    );
  }

  return (
    <div className="flex-shrink-0">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex gap-2 items-end" style={{ marginBottom: isSlashActive ? `${expandedHeight}px` : '0' }}>
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                onInputChange(e.target.value);
                resetNavigation();
              }}
              onKeyDown={handleKeyDown}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              placeholder={
                isLoading && currentRequestId ? t("chat.processing") : t("chat.typeMessage")
              }
              rows={1}
              className={`w-full px-4 py-3 bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 backdrop-blur-sm shadow-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 resize-none overflow-hidden min-h-[48px] max-h-[${UI_CONSTANTS.TEXTAREA_MAX_HEIGHT}px]`}
              disabled={isLoading || disabled}
            />
            {/* Slash command suggestion popup */}
            {isSlashActive && (
              <SlashCommandSuggestion
                suggestions={suggestions}
                selectedIndex={selectedIndex}
                onSelect={() => {
                  confirmSlashSelection();
                }}
                position={position}
                isSubCommand={isSubCommand}
              />
            )}
          </div>
          <div className="flex gap-2 pb-3">
            {isLoading && currentRequestId && (
              <button
                type="button"
                onClick={onAbort}
                className="p-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                title="Stop (ESC)"
              >
                <StopIcon className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || isLoading || disabled}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 text-sm"
            >
              {isLoading ? "..." : permissionMode === "plan" ? t("chat.plan") : t("chat.send")}
            </button>
          </div>
        </div>
      </form>

      {/* Permission mode status bar */}
      <button
        type="button"
        onClick={() =>
          onPermissionModeChange(getNextPermissionMode(permissionMode))
        }
        className="w-full px-4 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-mono text-left transition-colors cursor-pointer"
        title={`${t("chat.clickToCycle")} (Ctrl/Cmd+Shift+Y)`}
      >
        {getPermissionModeIndicator(permissionMode)}
        <span className="ml-2 text-slate-400 dark:text-slate-500 text-[10px]">
          ({t("chat.clickToCycleShortcut")})
        </span>
        {selectedModelName && (
          <span className="ml-2 text-slate-500 dark:text-slate-400">
            {" | "}
            <span className="text-slate-600 dark:text-slate-300">📖</span>
            {" "}
            {selectedModelName}
          </span>
        )}
        {tokenUsage && tokenUsage.promptTokens > 0 && (
          <span className="ml-2 text-slate-500 dark:text-slate-400">
            {" | "}
            <span className="text-slate-600 dark:text-slate-300">💾</span>
            {" "}
            {formatTokenRatio(tokenUsage.promptTokens, contextWindowSize)}
          </span>
        )}
      </button>
    </div>
  );
}
