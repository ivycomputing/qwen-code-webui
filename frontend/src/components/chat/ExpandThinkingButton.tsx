import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

interface ExpandThinkingButtonProps {
  isExpanded: boolean;
  onClick: () => void;
}

export function ExpandThinkingButton({
  isExpanded,
  onClick,
}: ExpandThinkingButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className={`p-2 rounded-lg border transition-all duration-200 backdrop-blur-sm shadow-sm hover:shadow-md ${
        isExpanded
          ? "bg-blue-600 dark:bg-blue-600 border-blue-700 dark:border-blue-500 scale-105"
          : "bg-white/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800"
      }`}
      aria-label={isExpanded ? t("chat.thinkingExpanded") : t("chat.thinkingCollapsed")}
      title={isExpanded ? t("chat.thinkingExpanded") : t("chat.thinkingCollapsed")}
    >
      {isExpanded ? (
        <ChevronDownIcon className="w-4 h-4 text-white" />
      ) : (
        <ChevronUpIcon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
      )}
    </button>
  );
}
