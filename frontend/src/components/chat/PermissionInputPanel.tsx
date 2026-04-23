import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { JSX } from "react";
import { useState, useEffect, useCallback } from "react";

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
function renderPermissionContent(patterns: string[], toolName?: string): JSX.Element {
  // Handle empty patterns array — use toolName as fallback
  if (patterns.length === 0) {
    const displayName = toolName || "bash commands";
    return (
      <p className="text-slate-600 dark:text-slate-300 mb-3">
        Qwen wants to use the{" "}
        <span className="font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-sm">
          {displayName}
        </span>{" "}
        command.
      </p>
    );
  }

  const isMultipleCommands = patterns.length > 1;

  if (isMultipleCommands) {
    // Extract and deduplicate command names from patterns like "Bash(ls:*)" -> "ls"
    const commandNames = [...new Set(patterns.map((p) => extractCommandName(p, toolName)))];

    // After dedup, might only be one unique command
    if (commandNames.length === 1) {
      return (
        <p className="text-slate-600 dark:text-slate-300 mb-3">
          Qwen wants to use the{" "}
          <span className="font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-sm">
            {commandNames[0]}
          </span>{" "}
          command.
        </p>
      );
    }

    return (
      <>
        <p className="text-slate-600 dark:text-slate-300 mb-2">
          Qwen wants to use the following commands:
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
  } else {
    const commandName = extractCommandName(patterns[0], toolName);
    return (
      <p className="text-slate-600 dark:text-slate-300 mb-3">
        Qwen wants to use the{" "}
        <span className="font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-sm">
          {commandName}
        </span>{" "}
        command.
      </p>
    );
  }
}

// Helper function to render button text for permanent permission
function renderPermanentButtonText(patterns: string[], toolName?: string): string {
  // Handle empty patterns array
  if (patterns.length === 0) {
    const displayName = toolName || "bash commands";
    return `Yes, and don't ask again for ${displayName} command`;
  }

  const isMultipleCommands = patterns.length > 1;
  const commandNames = [...new Set(patterns.map((p) => extractCommandName(p, toolName)))];

  if (isMultipleCommands) {
    return `Yes, and don't ask again for ${commandNames.join(" and ")} commands`;
  } else {
    return `Yes, and don't ask again for ${commandNames[0]} command`;
  }
}

interface PermissionInputPanelProps {
  patterns: string[];
  toolName?: string;
  onAllow: () => void;
  onAllowPermanent: () => void;
  onDeny: () => void;
  // Optional extension point for custom button styling (e.g., demo effects)
  getButtonClassName?: (
    buttonType: "allow" | "allowPermanent" | "deny",
    defaultClassName: string,
  ) => string;
  // Optional callback for demo automation to control selection state
  onSelectionChange?: (selection: "allow" | "allowPermanent" | "deny") => void;
  // Optional external control for demo automation (overrides internal state)
  externalSelectedOption?: "allow" | "allowPermanent" | "deny" | null;
}

export function PermissionInputPanel({
  patterns,
  toolName,
  onAllow,
  onAllowPermanent,
  onDeny,
  getButtonClassName = (_, defaultClassName) => defaultClassName, // Default: no modification
  onSelectionChange, // Optional callback for demo automation
  externalSelectedOption, // Optional external control for demo automation
}: PermissionInputPanelProps) {
  const [selectedOption, setSelectedOption] = useState<
    "allow" | "allowPermanent" | "deny" | null
  >("allow");

  // Check if component is externally controlled (for demo mode)
  const isExternallyControlled = externalSelectedOption !== undefined;

  // Use external selection if provided (for demo), otherwise use internal state
  const effectiveSelectedOption = externalSelectedOption ?? selectedOption;

  // Update selection state based on external changes (for demo automation)
  const updateSelectedOption = useCallback(
    (option: "allow" | "allowPermanent" | "deny") => {
      // Only update internal state if not controlled externally
      if (externalSelectedOption === undefined) {
        setSelectedOption(option);
      }
      onSelectionChange?.(option);
    },
    [onSelectionChange, externalSelectedOption],
  );

  // Handle keyboard navigation
  useEffect(() => {
    // Skip keyboard navigation if controlled externally (demo mode)
    if (externalSelectedOption !== undefined) return;

    // Define options array inside useEffect to avoid unnecessary re-renders
    const options = ["allow", "allowPermanent", "deny"] as const;

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
        // Execute the currently selected option
        if (effectiveSelectedOption === "allow") {
          onAllow();
        } else if (effectiveSelectedOption === "allowPermanent") {
          onAllowPermanent();
        } else if (effectiveSelectedOption === "deny") {
          onDeny();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDeny(); // "Deny" option when ESC is pressed
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    effectiveSelectedOption,
    onAllow,
    onAllowPermanent,
    onDeny,
    updateSelectedOption,
    externalSelectedOption,
  ]);

  return (
    <div className="flex-shrink-0 px-4 py-4 bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl backdrop-blur-sm shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-amber-100 dark:bg-amber-900/20 rounded-lg">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Permission Required
        </h3>
      </div>

      {/* Content */}
      <div className="mb-4">
        {renderPermissionContent(patterns, toolName)}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Do you want to proceed? (Press ESC to deny)
        </p>
      </div>

      {/* Direct-click permission options with selection state */}
      <div className="space-y-2">
        <button
          data-permission-action="allow"
          onClick={() => {
            updateSelectedOption("allow");
            onAllow();
          }}
          onFocus={() => updateSelectedOption("allow")}
          onBlur={() => {
            if (!isExternallyControlled) {
              setSelectedOption(null);
            }
          }}
          onMouseEnter={() => updateSelectedOption("allow")}
          onMouseLeave={() => {
            if (!isExternallyControlled) {
              setSelectedOption(null);
            }
          }}
          className={getButtonClassName(
            "allow",
            `w-full p-3 rounded-lg cursor-pointer transition-all duration-200 text-left focus:outline-none ${
              effectiveSelectedOption === "allow"
                ? "bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 dark:border-blue-400 shadow-sm"
                : "border-2 border-transparent"
            }`,
          )}
        >
          <span
            className={`text-sm font-medium ${
              effectiveSelectedOption === "allow"
                ? "text-blue-700 dark:text-blue-300"
                : "text-slate-700 dark:text-slate-300"
            }`}
          >
            Yes
          </span>
        </button>

        <button
          onClick={() => {
            updateSelectedOption("allowPermanent");
            onAllowPermanent();
          }}
          onFocus={() => updateSelectedOption("allowPermanent")}
          onBlur={() => {
            if (!isExternallyControlled) {
              setSelectedOption(null);
            }
          }}
          onMouseEnter={() => updateSelectedOption("allowPermanent")}
          onMouseLeave={() => {
            if (!isExternallyControlled) {
              setSelectedOption(null);
            }
          }}
          className={getButtonClassName(
            "allowPermanent",
            `w-full p-3 rounded-lg cursor-pointer transition-all duration-200 text-left focus:outline-none ${
              effectiveSelectedOption === "allowPermanent"
                ? "bg-green-50 dark:bg-green-900/20 border-2 border-green-500 dark:border-green-400 shadow-sm"
                : "border-2 border-transparent"
            }`,
          )}
        >
          <span
            className={`text-sm font-medium ${
              effectiveSelectedOption === "allowPermanent"
                ? "text-green-700 dark:text-green-300"
                : "text-slate-700 dark:text-slate-300"
            }`}
          >
            {renderPermanentButtonText(patterns, toolName)}
          </span>
        </button>

        <button
          onClick={() => {
            updateSelectedOption("deny");
            onDeny();
          }}
          onFocus={() => updateSelectedOption("deny")}
          onBlur={() => {
            if (!isExternallyControlled) {
              setSelectedOption(null);
            }
          }}
          onMouseEnter={() => updateSelectedOption("deny")}
          onMouseLeave={() => {
            if (!isExternallyControlled) {
              setSelectedOption(null);
            }
          }}
          className={getButtonClassName(
            "deny",
            `w-full p-3 rounded-lg cursor-pointer transition-all duration-200 text-left focus:outline-none ${
              effectiveSelectedOption === "deny"
                ? "bg-slate-50 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-500 shadow-sm"
                : "border-2 border-transparent"
            }`,
          )}
        >
          <span
            className={`text-sm font-medium ${
              effectiveSelectedOption === "deny"
                ? "text-slate-800 dark:text-slate-200"
                : "text-slate-700 dark:text-slate-300"
            }`}
          >
            No
          </span>
        </button>
      </div>
    </div>
  );
}
