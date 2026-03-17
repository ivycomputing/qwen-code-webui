import { useEffect, useRef } from "react";
import type { SlashCommand, SubCommand } from "../../utils/slashCommands";

interface SlashCommandSuggestionProps {
  suggestions: SlashCommand[] | SubCommand[];
  selectedIndex: number;
  onSelect: () => void;
  position: { top: number; left: number } | null;
  isSubCommand?: boolean;
}

export function SlashCommandSuggestion({
  suggestions,
  selectedIndex,
  onSelect,
  position,
  isSubCommand = false,
}: SlashCommandSuggestionProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedElement = listRef.current.children[selectedIndex];
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
  }, [selectedIndex]);

  if (!position || suggestions.length === 0) {
    return null;
  }

  return (
    <ul
      ref={listRef}
      className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto min-w-[200px]"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {suggestions.map((item, index) => (
        <li
          key={item.name}
          onClick={onSelect}
          className={`px-3 py-2 cursor-pointer text-sm transition-colors ${
            index === selectedIndex
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          }`}
        >
          <div className="font-mono font-medium">
            {isSubCommand ? item.name : (item as SlashCommand).name}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {item.description}
          </div>
        </li>
      ))}
    </ul>
  );
}
