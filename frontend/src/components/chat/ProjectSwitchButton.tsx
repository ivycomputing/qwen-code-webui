import { FolderIcon } from "@heroicons/react/24/outline";

interface ProjectSwitchButtonProps {
  onClick: () => void;
}

export function ProjectSwitchButton({ onClick }: ProjectSwitchButtonProps) {
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 backdrop-blur-sm shadow-sm hover:shadow-md"
      aria-label="Switch project"
      title="Switch project"
    >
      <FolderIcon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
    </button>
  );
}