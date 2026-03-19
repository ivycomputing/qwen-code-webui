import { useState, useRef, useEffect } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import type { ModelConfig } from "../../../../shared/types";

interface ModelSelectorProps {
  models: ModelConfig[];
  selectedModel: string | null;
  onSelectModel: (modelId: string | null) => void;
  loading?: boolean;
}

export function ModelSelector({
  models,
  selectedModel,
  onSelectModel,
  loading,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Find selected model name
  const selectedModelName = models.find((m) => m.id === selectedModel)?.name || 
    (loading ? "Loading..." : "Select model");

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setIsOpen(false);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsOpen(!isOpen);
    }
  };

  if (models.length === 0 && !loading) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 backdrop-blur-sm shadow-sm hover:shadow-md cursor-pointer max-w-[200px]"
        aria-label="Select model"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={loading}
      >
        <span className="truncate">{selectedModelName}</span>
        <ChevronDownIcon
          className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
          role="listbox"
        >
          {models.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => {
                onSelectModel(model.id);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                model.id === selectedModel
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "text-slate-700 dark:text-slate-300"
              }`}
              role="option"
              aria-selected={model.id === selectedModel}
            >
              <div className="font-medium truncate">{model.name}</div>
              {model.id !== model.name && (
                <div className="text-slate-500 dark:text-slate-400 text-[10px] truncate">
                  {model.id}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}