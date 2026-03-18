import React from "react";
import {
  createContentPreview,
  createMoreLinesIndicator,
} from "../../utils/contentUtils";

interface CollapsibleDetailsProps {
  label: string;
  details: string;
  colorScheme: {
    header: string;
    content: string;
    border: string;
    bg: string;
  };
  icon?: React.ReactNode;
  badge?: string;
  defaultExpanded?: boolean;
  /** When true, forces expanded state regardless of defaultExpanded */
  forceExpanded?: boolean;
  maxPreviewLines?: number;
  showPreview?: boolean;
  previewContent?: string;
  previewSummary?: string;
  /** When true, collapsed state shows only a minimal header with no padding/border */
  compact?: boolean;
}

export function CollapsibleDetails({
  label,
  details,
  colorScheme,
  icon,
  badge,
  defaultExpanded = false,
  forceExpanded,
  maxPreviewLines = 5,
  showPreview = true,
  previewContent,
  previewSummary,
  compact = false,
}: CollapsibleDetailsProps) {
  const hasDetails = details.trim().length > 0;

  // When forceExpanded is provided, use it directly; otherwise use local state
  // Don't use local state when forceExpanded is provided to avoid sync issues
  // When forceExpanded is provided, user can still click to toggle (local override)
  const [localOverride, setLocalOverride] = React.useState<boolean | undefined>(undefined);
  const effectiveExpanded = forceExpanded !== undefined 
    ? (localOverride !== undefined ? localOverride : forceExpanded)
    : defaultExpanded;

  // Always allow collapsing/expanding via click when there are details
  const isCollapsible = hasDetails;

  // Reset local override when forceExpanded changes
  React.useEffect(() => {
    if (forceExpanded !== undefined) {
      setLocalOverride(undefined);
    }
  }, [forceExpanded]);

  const handleToggle = () => {
    if (forceExpanded !== undefined) {
      // When forceExpanded is controlled, use local override
      setLocalOverride(!forceExpanded);
    } else {
      // Otherwise just toggle (handled by parent or default behavior)
      // This case shouldn't happen in normal usage since isCollapsible requires hasDetails
    }
  };

  const contentPreview = React.useMemo(() => {
    const computedTotalLines = details.split("\n").length;
    if (previewContent !== undefined) {
      return {
        preview: previewContent,
        hasMore: true,
        totalLines: computedTotalLines,
        previewLines: previewContent.split("\n").length,
      };
    }
    // Only create preview if showPreview is enabled
    if (showPreview) {
      return createContentPreview(details, maxPreviewLines);
    }
    // Return no preview
    return {
      preview: "",
      hasMore: false,
      totalLines: computedTotalLines,
      previewLines: 0,
    };
  }, [details, maxPreviewLines, previewContent, showPreview]);

  const shouldShowPreview =
    showPreview && !effectiveExpanded && hasDetails && contentPreview.hasMore;

  // Compact mode: show minimal header when collapsed
  const isCompactCollapsed = compact && !effectiveExpanded;

  return (
    <div
      className={`mb-2 rounded-lg ${
        isCompactCollapsed
          ? "px-2 py-1"
          : `p-3 ${colorScheme.bg} border ${colorScheme.border}`
      }`}
    >
      <div
        className={`${colorScheme.header} text-xs font-medium flex items-center gap-2 ${isCollapsible ? "cursor-pointer hover:opacity-80" : ""} ${!isCompactCollapsed ? "mb-1" : ""}`}
        role={isCollapsible ? "button" : undefined}
        tabIndex={isCollapsible ? 0 : undefined}
        aria-expanded={isCollapsible ? effectiveExpanded : undefined}
        onClick={isCollapsible ? handleToggle : undefined}
        onKeyDown={
          isCollapsible
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleToggle();
                }
              }
            : undefined
        }
      >
        {icon && (
          <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs">
            {icon}
          </div>
        )}
        <span>{label}</span>
        {badge && <span className="opacity-80">({badge})</span>}
        {previewSummary && (
          <span className="opacity-60 text-xs ml-2">{previewSummary}</span>
        )}
        {isCollapsible && (
          <span className="ml-1 opacity-80">{effectiveExpanded ? "▼" : "▶"}</span>
        )}
      </div>
      {shouldShowPreview && (
        <div
          className="mt-2 pl-6 border-l-2 border-dashed opacity-80"
          style={{ borderColor: "inherit" }}
        >
          <pre
            className={`whitespace-pre-wrap ${colorScheme.content} text-xs font-mono leading-relaxed`}
          >
            {contentPreview.preview}
          </pre>
          <div
            className={`${colorScheme.content} text-xs opacity-60 mt-1 italic`}
          >
            {createMoreLinesIndicator(
              contentPreview.totalLines,
              contentPreview.previewLines,
            )}
          </div>
        </div>
      )}
      {hasDetails && effectiveExpanded && (
        <pre
          className={`whitespace-pre-wrap ${colorScheme.content} text-xs font-mono leading-relaxed mt-2 pl-6 border-l-2 ${colorScheme.border}`}
        >
          {details}
        </pre>
      )}
    </div>
  );
}
