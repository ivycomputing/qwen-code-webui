import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { TFunction } from "i18next";
import type { CSSProperties } from "react";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { JSX } from "react";

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

// Helper function to render permission content based on patterns
function renderPermissionContent(patterns: string[], toolName: string | undefined, t: TFunction): JSX.Element {
  // Handle empty patterns array — use toolName as fallback
  if (patterns.length === 0) {
    const displayName = toolName || t("permission.bashCommands");
    return (
      <p className="text-slate-600 dark:text-slate-300 mb-3">
        {t("permission.wantsToUse", { command: displayName })}
      </p>
    );
  }

  // Extract and deduplicate command names
  const commandNames = [...new Set(patterns.map((p) => extractCommandName(p, toolName)))];

  if (commandNames.length === 1) {
    return (
      <p className="text-slate-600 dark:text-slate-300 mb-3">
        {t("permission.wantsToUse", { command: commandNames[0] })}
      </p>
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
function renderPermanentButtonText(patterns: string[], toolName: string | undefined, t: TFunction): string {
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

type Option = "allow" | "allowPermanent" | "deny";

export function PermissionInputPanel({
  patterns,
  toolName,
  onAllow,
  onAllowPermanent,
  onDeny,
  getButtonClassName = (_, defaultClassName) => defaultClassName,
  onSelectionChange,
  externalSelectedOption,
}: PermissionInputPanelProps) {
  const { t } = useTranslation();
  const [selectedOption, setSelectedOption] = useState<Option>("allow");

  const effectiveSelectedOption = externalSelectedOption ?? selectedOption;

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
        if (effectiveSelectedOption === "allow") onAllow();
        else if (effectiveSelectedOption === "allowPermanent") onAllowPermanent();
        else if (effectiveSelectedOption === "deny") onDeny();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDeny();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [effectiveSelectedOption, onAllow, onAllowPermanent, onDeny, updateSelectedOption, externalSelectedOption]);

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
        {renderPermissionContent(patterns, toolName, t)}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("permission.proceedHint")}
        </p>
      </div>

      {/* Buttons */}
      <div className="space-y-2">
        {([
          {
            key: "allow" as Option,
            label: t("permission.yes"),
            action: onAllow,
          },
          {
            key: "allowPermanent" as Option,
            label: renderPermanentButtonText(patterns, toolName, t),
            action: onAllowPermanent,
          },
          {
            key: "deny" as Option,
            label: t("permission.no"),
            action: onDeny,
          },
        ]).map(({ key, label, action }) => {
          const isSelected = effectiveSelectedOption === key;
          const selected = selectedStyles[key];
          return (
            <button
              key={key}
              data-permission-action={key}
              onClick={() => action()}
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
