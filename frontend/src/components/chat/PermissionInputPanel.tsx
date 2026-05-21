import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { TFunction } from "i18next";
import type { CSSProperties } from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { JSX } from "react";
import { extractBaseCommand } from "../../utils/toolUtils";
function formatPermissionArgs(input?: Record<string, unknown>): string {
  if (!input) return "";
  if (input.command) return String(input.command);
  if (input.path) return String(input.path);
  if (input.file_path) return String(input.file_path);
  if (input.pattern) return String(input.pattern);
  if (input.url) return String(input.url);
  // Fallback: show all key=value pairs
  return Object.entries(input)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");
}

// Helper function to extract command name from pattern like "Bash(ls:*)" -> "ls"
function extractCommandName(pattern: string, fallbackToolName?: string): string {
  if (!pattern) return fallbackToolName || "Unknown";
  // Bash(cmd:*) format
  const bashMatch = pattern.match(/Bash\(([^:]+):/);
  if (bashMatch) return bashMatch[1];
  // Tool(*) format (e.g. Write(*), Read(*))
  const toolMatch = pattern.match(/^(\w+)\(\*\)$/);
  if (toolMatch) return toolMatch[1];
  // Plain tool name without wildcards
  if (/^\w+$/.test(pattern)) return pattern;
  return fallbackToolName || pattern;
}

// Helper function to render tool command details
function renderCommandDetail(fullCommand: string | null): JSX.Element | null {
  if (!fullCommand) return null;
  return (
    <pre className="mt-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded text-sm font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all">
      {fullCommand}
    </pre>
  );
}

// Helper function to render permission content based on patterns
function renderPermissionContent(patterns: string[], toolName: string | undefined, t: TFunction, toolInput?: Record<string, unknown>): JSX.Element {
  // Build the tool arguments display string — always show full details for security
  const argsDisplay = toolInput ? formatPermissionArgs(toolInput) : "";
  const fullCommand = argsDisplay ? `${toolName || "Tool"}\n${argsDisplay}` : null;

  // Handle empty patterns array — use toolName as fallback
  if (patterns.length === 0) {
    const displayName = toolName || t("permission.bashCommands");
    return (
      <div className="mb-3">
        <p className="text-slate-600 dark:text-slate-300">
          {t("permission.wantsToUse", { command: displayName })}
        </p>
        {renderCommandDetail(fullCommand)}
      </div>
    );
  }

  // Extract and deduplicate command names
  const commandNames = [...new Set(patterns.map((p) => extractCommandName(p, toolName)))];

  if (commandNames.length === 1) {
    return (
      <div className="mb-3">
        <p className="text-slate-600 dark:text-slate-300">
          {t("permission.wantsToUse", { command: commandNames[0] })}
        </p>
        {renderCommandDetail(fullCommand)}
      </div>
    );
  }

  return (
    <>
      <p className="text-slate-600 dark:text-slate-300 mb-2">
        {t("permission.wantsToUseMultiple")}
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {commandNames.map((cmd, index) => (
          <span
            key={index}
            className="font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-sm"
          >
            {cmd}
          </span>
        ))}
      </div>
    </>
  );
}

// Helper function to render button text for permanent permission
// Shows the specific command/tool being approved to avoid ambiguity
function renderPermanentButtonText(
  patterns: string[],
  toolName: string | undefined,
  t: TFunction,
  toolInput?: Record<string, unknown>,
): string {
  // For shell commands, show the specific command being approved
  const specificCommand = toolInput?.command && typeof toolInput.command === "string"
    ? extractBaseCommand(toolInput.command)
    : null;

  if (specificCommand) {
    const displayName = toolName || t("permission.bashCommands");
    const label = `${displayName}(${specificCommand})`;
    return t("permission.yesPermanent", { commands: label });
  }

  if (patterns.length === 0) {
    const displayName = toolName || t("permission.bashCommands");
    return t("permission.yesPermanent", { commands: displayName });
  }

  const commandNames = [...new Set(patterns.map((p) => extractCommandName(p, toolName)))];
  const joined = commandNames.join(" & ");

  if (commandNames.length > 1) {
    return t("permission.yesPermanentMulti", { commands: joined });
  }
  return t("permission.yesPermanent", { commands: joined });
}

interface PermissionInputPanelProps {
  patterns: string[];
  toolName?: string;
  toolInput?: Record<string, unknown>;
  onAllow: () => void;
  onAllowPermanent: () => void;
  onAllowAll?: () => void;
  onDeny: () => void;
  getButtonClassName?: (
    buttonType: "allow" | "allowPermanent" | "deny",
    defaultClassName: string,
  ) => string;
  onSelectionChange?: (selection: "allow" | "allowPermanent" | "deny") => void;
  externalSelectedOption?: "allow" | "allowPermanent" | "deny" | null;
  /** When set, show a countdown and auto-approve (first option) after this many ms. */
  autoApproveMs?: number;
}

type Option = "allow" | "allowPermanent" | "deny";

export function PermissionInputPanel({
  patterns,
  toolName,
  toolInput,
  onAllow,
  onAllowPermanent,
  onAllowAll,
  onDeny,
  getButtonClassName = (_, defaultClassName) => defaultClassName,
  onSelectionChange,
  externalSelectedOption,
  autoApproveMs,
}: PermissionInputPanelProps) {
  const { t } = useTranslation();
  const [selectedOption, setSelectedOption] = useState<Option>("allow");
  const [countdown, setCountdown] = useState<number | null>(null);
  const autoApprovedRef = useRef(false);
  const countdownCancelledRef = useRef(false);

  const effectiveSelectedOption = externalSelectedOption ?? selectedOption;
  const isShellCommand = toolName === "run_shell_command";

  // Cancel countdown when user manually clicks any button
  const cancelCountdown = useCallback(() => {
    countdownCancelledRef.current = true;
    setCountdown(null);
  }, []);

  // Countdown timer: auto-approve when it reaches zero
  useEffect(() => {
    if (!autoApproveMs) return;
    const seconds = Math.ceil(autoApproveMs / 1000);
    setCountdown(seconds);

    const interval = setInterval(() => {
      if (countdownCancelledRef.current) {
        clearInterval(interval);
        return;
      }
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoApproveMs]);

  // Fire auto-approve when countdown hits 0 (unless user already acted)
  useEffect(() => {
    if (countdown === 0 && !autoApprovedRef.current && !countdownCancelledRef.current) {
      autoApprovedRef.current = true;
      onAllow();
    }
  }, [countdown, onAllow]);

  const updateSelectedOption = useCallback(
    (option: Option) => {
      if (externalSelectedOption === undefined) {
        setSelectedOption(option);
      }
      onSelectionChange?.(option);
    },
    [onSelectionChange, externalSelectedOption],
  );

  // Handle keyboard navigation
  useEffect(() => {
    if (externalSelectedOption !== undefined) return;

    const options: Option[] = ["allow", "allowPermanent", "deny"];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const currentIndex = options.indexOf(effectiveSelectedOption!);
        const nextIndex = (currentIndex + 1) % options.length;
        updateSelectedOption(options[nextIndex]);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const currentIndex = options.indexOf(effectiveSelectedOption!);
        const prevIndex = (currentIndex - 1 + options.length) % options.length;
        updateSelectedOption(options[prevIndex]);
      } else if (e.key === "Enter" && effectiveSelectedOption) {
        e.preventDefault();
        cancelCountdown();
        if (effectiveSelectedOption === "allow") onAllow();
        else if (effectiveSelectedOption === "allowPermanent") onAllowPermanent();
        else if (effectiveSelectedOption === "deny") onDeny();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelCountdown();
        onDeny();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [effectiveSelectedOption, onAllow, onAllowPermanent, onDeny, cancelCountdown, updateSelectedOption, externalSelectedOption]);

  const selectedStyles: Record<Option, { className: string; style: React.CSSProperties }> = {
    allow: {
      className: "border-2 shadow-md",
      style: { backgroundColor: "#3b82f6", borderColor: "#2563eb" } as CSSProperties,
    },
    allowPermanent: {
      className: "border-2 shadow-md",
      style: { backgroundColor: "#22c55e", borderColor: "#16a34a" } as CSSProperties,
    },
    deny: {
      className: "border-2 shadow-md",
      style: { backgroundColor: "#ef4444", borderColor: "#dc2626" } as CSSProperties,
    },
  };

  const unselectedStyle = "border-2 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500";

  // Build button config based on tool type
  const baseCommand = toolInput?.command && typeof toolInput.command === "string"
    ? extractBaseCommand(toolInput.command)
    : null;

  const buttons = isShellCommand && baseCommand && onAllowAll
    ? [
        { key: "allow" as Option, label: t("permission.allowSpecific", { command: baseCommand }), action: onAllow },
        { key: "allowPermanent" as Option, label: t("permission.allowAll", { command: baseCommand }), action: onAllowAll },
        { key: "deny" as Option, label: t("permission.no"), action: onDeny },
      ]
    : [
        { key: "allow" as Option, label: t("permission.yesThisRequest"), action: onAllow },
        { key: "allowPermanent" as Option, label: renderPermanentButtonText(patterns, toolName, t, toolInput), action: onAllowPermanent },
        { key: "deny" as Option, label: t("permission.no"), action: onDeny },
      ];

  return (
    <div className="flex-shrink-0 px-4 py-4 bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl backdrop-blur-sm shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-amber-100 dark:bg-amber-900/20 rounded-lg">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {t("permission.title")}
        </h3>
      </div>

      {/* Content */}
      <div className="mb-4">
        {renderPermissionContent(patterns, toolName, t, toolInput)}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("permission.proceedHint")}
        </p>
      </div>

      {/* Countdown banner */}
      {countdown !== null && countdown > 0 && (
        <div className="mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {t("permission.autoApproveCountdown", { seconds: countdown })}
          </p>
          <div className="mt-1 h-1 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(countdown / Math.ceil((autoApproveMs ?? 25000) / 1000)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="space-y-2">
        {buttons.map(({ key, label, action }) => {
          const isSelected = effectiveSelectedOption === key;
          const selected = selectedStyles[key];
          return (
            <button
              key={key}
              data-permission-action={key}
              onClick={() => { cancelCountdown(); action(); }}
              onMouseEnter={() => updateSelectedOption(key)}
              className={getButtonClassName(
                key,
                `w-full p-3 rounded-lg cursor-pointer transition-all duration-200 text-left focus:outline-none ${
                  isSelected ? selected.className : unselectedStyle
                }`,
              )}
              style={isSelected ? selected.style : undefined}
            >
              <span
                className={`text-sm font-semibold ${
                  isSelected ? "text-white" : "text-slate-700 dark:text-slate-300"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
