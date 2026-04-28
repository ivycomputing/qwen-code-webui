import { ClockIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

interface HistoryButtonProps {
  onClick: () => void;
}

export function HistoryButton({ onClick }: HistoryButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 backdrop-blur-sm shadow-sm hover:shadow-md"
      aria-label={t("chat.viewHistory")}
      title={t("chat.viewHistory")}
    >
      <ClockIcon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
    </button>
  );
}
