import { useState, useCallback, useEffect } from "react";

const HISTORY_MAX_LENGTH = 100;
const HISTORY_STORAGE_KEY = "qwen_input_history";

export function useInputHistory() {
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [currentInput, setCurrentInput] = useState("");

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(parsed.slice(0, HISTORY_MAX_LENGTH));
        }
      }
    } catch (error) {
      console.error("Failed to load input history:", error);
    }
  }, []);

  // Save history to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
      console.error("Failed to save input history:", error);
    }
  }, [history]);

  // Add a message to history (called when sending a message)
  const addToHistory = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setHistory((prev) => {
      // Remove duplicates and add to front
      const filtered = prev.filter((item) => item !== trimmed);
      return [trimmed, ...filtered].slice(0, HISTORY_MAX_LENGTH);
    });
    setHistoryIndex(null); // Reset index when adding new message
  }, []);

  // Navigate to previous history entry (up arrow)
  const navigatePrevious = useCallback(
    (currentValue: string): string => {
      if (history.length === 0) return currentValue;

      // If we're not in history navigation, start from current value
      if (historyIndex === null) {
        // Save current input as temporary
        setCurrentInput(currentValue);
        setHistoryIndex(0);
        return history[0];
      }

      // If we're already at the oldest entry, stay there
      if (historyIndex >= history.length - 1) {
        return history[history.length - 1];
      }

      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      return history[newIndex];
    },
    [history, historyIndex],
  );

  // Navigate to next history entry (down arrow)
  const navigateNext = useCallback(
    (currentValue: string): string => {
      if (historyIndex === null) {
        return currentValue;
      }

      // If we're at the newest entry, go back to what was being typed
      if (historyIndex <= 0) {
        setHistoryIndex(null);
        return currentInput || currentValue;
      }

      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      return history[newIndex];
    },
    [history, historyIndex, currentInput],
  );

  // Reset history navigation (called when input changes manually)
  const resetNavigation = useCallback(() => {
    setHistoryIndex(null);
  }, []);

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([]);
    setHistoryIndex(null);
    setCurrentInput("");
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear input history:", error);
    }
  }, []);

  return {
    history,
    addToHistory,
    navigatePrevious,
    navigateNext,
    resetNavigation,
    clearHistory,
    isNavigating: historyIndex !== null,
  };
}
