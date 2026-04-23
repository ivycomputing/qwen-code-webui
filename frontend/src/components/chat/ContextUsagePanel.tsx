import React from "react";
import { useTranslation } from "react-i18next";
import type { ContextUsageData } from "../../utils/tokenUsage";

function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return `${tokens}`;
}

const ProgressBar: React.FC<{
  usedPct: number;
  bufferPct: number;
}> = ({ usedPct, bufferPct }) => {
  const usedWidth = Math.min(usedPct, 100);
  const bufferWidth = Math.min(bufferPct, 100 - usedPct);

  let usedColor = "bg-emerald-500";
  if (usedPct > 80) usedColor = "bg-red-500";
  else if (usedPct > 60) usedColor = "bg-amber-500";

  return (
    <div className="flex h-3 w-full rounded-sm overflow-hidden bg-slate-200 dark:bg-slate-700">
      <div className={usedColor} style={{ width: `${usedWidth}%` }} />
      <div
        className="bg-amber-300 dark:bg-amber-600"
        style={{ width: `${bufferWidth}%` }}
      />
    </div>
  );
};

const CategoryRow: React.FC<{
  label: string;
  tokens: number;
  contextWindowSize: number;
  color?: string;
  indent?: boolean;
  count?: number;
}> = ({ label, tokens, contextWindowSize, color, indent, count }) => {
  const pct = contextWindowSize > 0 ? ((tokens / contextWindowSize) * 100).toFixed(1) : "0.0";
  const displayLabel = count !== undefined ? `${label} (${count})` : label;
  return (
    <div className={`flex justify-between text-xs font-mono ${indent ? "pl-6" : ""}`}>
      <span className="flex items-center gap-1.5">
        {color && (
          <span className={`inline-block w-2 h-2 rounded-sm ${color}`} />
        )}
        <span className="text-slate-600 dark:text-slate-400">{displayLabel}</span>
      </span>
      <span className="text-slate-500 dark:text-slate-400">
        {formatTokens(tokens)} tokens ({pct}%)
      </span>
    </div>
  );
};

interface ContextUsagePanelProps {
  data: ContextUsageData;
  onClose: () => void;
}

export const ContextUsagePanel: React.FC<ContextUsagePanelProps> = ({
  data,
  onClose,
}) => {
  const { t } = useTranslation();
  const {
    totalTokens,
    contextWindowSize,
    modelName,
    percentage,
    breakdown,
    messageBreakdown,
    hasCacheData,
  } = data;

  const bufferPct =
    contextWindowSize > 0
      ? (breakdown.autocompactBuffer / contextWindowSize) * 100
      : 0;

  return (
    <div className="border border-slate-300 dark:border-slate-600 rounded-lg p-4 my-2 bg-white dark:bg-slate-800">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
          {t("contextPanel.title")}
        </span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {/* Model + Context window info */}
      <div className="flex justify-between text-xs font-mono text-slate-500 dark:text-slate-400 mb-2">
        <span>Model: {modelName}</span>
        <span>
          {t("contextPanel.contextWindow")}: {formatTokens(contextWindowSize)} {t("contextPanel.tokens")}
        </span>
      </div>

      {/* Progress bar */}
      <ProgressBar usedPct={percentage} bufferPct={bufferPct} />

      {/* Legend */}
      <div className="mt-2 space-y-1">
        <CategoryRow
          label={t("contextPanel.used")}
          tokens={totalTokens}
          contextWindowSize={contextWindowSize}
          color="bg-emerald-500"
        />
        <CategoryRow
          label={t("contextPanel.free")}
          tokens={breakdown.freeSpace}
          contextWindowSize={contextWindowSize}
          color="bg-slate-200 dark:bg-slate-700"
        />
        <CategoryRow
          label={t("contextPanel.autocompactBuffer")}
          tokens={breakdown.autocompactBuffer}
          contextWindowSize={contextWindowSize}
          color="bg-amber-300 dark:bg-amber-600"
        />
      </div>

      {/* Usage by category */}
      <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
        <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
          {t("contextPanel.usageByCategory")}
        </div>
        <div className="space-y-1">
          <CategoryRow
            label={t("contextPanel.overhead")}
            tokens={breakdown.overhead}
            contextWindowSize={contextWindowSize}
            color="bg-blue-400"
          />
          <CategoryRow
            label={t("contextPanel.messages")}
            tokens={breakdown.messages}
            contextWindowSize={contextWindowSize}
            color="bg-violet-400"
          />
          {/* Message sub-categories */}
          <CategoryRow
            label={t("contextPanel.userMessages")}
            tokens={messageBreakdown.userMessages}
            contextWindowSize={contextWindowSize}
            indent
            count={messageBreakdown.counts.user}
          />
          <CategoryRow
            label={t("contextPanel.assistantMessages")}
            tokens={messageBreakdown.assistantMessages}
            contextWindowSize={contextWindowSize}
            indent
            count={messageBreakdown.counts.assistant}
          />
          <CategoryRow
            label={t("contextPanel.toolCalls")}
            tokens={messageBreakdown.toolCalls}
            contextWindowSize={contextWindowSize}
            indent
            count={messageBreakdown.counts.tool}
          />
          <CategoryRow
            label={t("contextPanel.thinking")}
            tokens={messageBreakdown.thinking}
            contextWindowSize={contextWindowSize}
            indent
            count={messageBreakdown.counts.thinking}
          />
        </div>
      </div>

      {/* Info footer */}
      <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-400 dark:text-slate-500 space-y-1">
        <div className="italic">
          {hasCacheData
            ? t("contextPanel.cacheInfo")
            : t("contextPanel.estimatedInfo")}
        </div>
        <div>{t("contextPanel.autoCompressInfo")}</div>
      </div>
    </div>
  );
};
