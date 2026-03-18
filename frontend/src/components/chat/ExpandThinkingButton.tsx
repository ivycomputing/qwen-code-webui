import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

interface ExpandThinkingButtonProps {
  isExpanded: boolean;
  onClick: () => void;
}

export function ExpandThinkingButton({
  isExpanded,
  onClick,
}: ExpandThinkingButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`p-2 rounded-lg border-2 transition-all duration-200 backdrop-blur-sm shadow-md hover:shadow-lg ${
        isExpanded
          ? "bg-blue-600 dark:bg-blue-600 border-blue-700 dark:border-blue-500 scale-105"
          : "bg-white/80 dark:bg-slate-800/80 border-slate-300 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-800"
      }`}
      aria-label={isExpanded ? "Collapse thinking by default" : "Expand thinking by default"}
      title={isExpanded ? "Thinking content is expanded by default (click to collapse)" : "Thinking content is collapsed by default (click to expand)"}
    >
      {isExpanded ? (
        <ChevronDownIcon className="w-4 h-4 text-white" />
      ) : (
        <ChevronUpIcon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
      )}
    </button>
  );
}