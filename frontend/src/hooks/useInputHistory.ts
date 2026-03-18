import { useState, useCallback, useEffect, useMemo, useRef } from "react";

const HISTORY_MAX_LENGTH = 100;
const HISTORY_STORAGE_KEY = "qwen_input_history";

// Helper to get history from localStorage
function getHistoryFromStorage(): string[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, HISTORY_MAX_LENGTH);
      }
    }
  } catch (error) {
    console.error("Failed to load input history:", error);
  }
  return [];
}

// Helper to save history to localStorage
function saveHistoryToStorage(history: string[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error("Failed to save input history:", error);
  }
}

export function useInputHistory() {
  // Initialize history from localStorage
  const [history, setHistory] = useState<string[]>(() => getHistoryFromStorage());
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [currentInput, setCurrentInput] = useState("");

  // Use refs to track latest values for use in callbacks
  const historyRef = useRef(history);
  const historyIndexRef = useRef<number | null>(historyIndex);
  const currentInputRef = useRef(currentInput);

  // Keep refs in sync with state
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  useEffect(() => {
    currentInputRef.current = currentInput;
  }, [currentInput]);

  // Sync history with localStorage when it changes
  useEffect(() => {
    saveHistoryToStorage(history);
  }, [history]);

  // Listen for storage events (for cross-tab sync)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === HISTORY_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setHistory(parsed.slice(0, HISTORY_MAX_LENGTH));
          }
        } catch (error) {
          console.error("Failed to parse storage event:", error);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Add a message to history (called when sending a message)
  const addToHistory = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setHistory((prev) => {
      // Remove duplicates and add to front
      const filtered = prev.filter((item) => item !== trimmed);
      const newHistory = [trimmed, ...filtered].slice(0, HISTORY_MAX_LENGTH);

      // Save immediately to localStorage
      saveHistoryToStorage(newHistory);

      // Update ref immediately so navigatePrevious/navigateNext can use it
      historyRef.current = newHistory;

      return newHistory;
    });

    setHistoryIndex(null); // Reset index when adding new message
  }, []);

  // Navigate to previous history entry (up arrow)
  const navigatePrevious = useCallback((currentValue: string): string => {
    const currentHistory = historyRef.current;
    let currentIndex = historyIndexRef.current;

    if (currentHistory.length === 0) return currentValue;

    // If we're not in history navigation, start from current value
    if (currentIndex === null) {
      // Save current input as temporary
      setCurrentInput(currentValue);
      setHistoryIndex(0);
      historyIndexRef.current = 0; // Update ref immediately
      return currentHistory[0];
    }

    // If we're already at the oldest entry, stay there
    if (currentIndex >= currentHistory.length - 1) {
      return currentHistory[currentHistory.length - 1];
    }

    const newIndex = currentIndex + 1;
    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex; // Update ref immediately
    return currentHistory[newIndex];
  }, []);

  // Navigate to next history entry (down arrow)
  const navigateNext = useCallback((currentValue: string): string => {
    let currentIndex = historyIndexRef.current;
    const storedCurrentInput = currentInputRef.current;
    const currentHistory = historyRef.current;

    if (currentIndex === null) {
      return currentValue;
    }

    // If we're at the newest entry, go back to what was being typed
    if (currentIndex <= 0) {
      setHistoryIndex(null);
      historyIndexRef.current = null; // Update ref immediately
      return storedCurrentInput || currentValue;
    }

    const newIndex = currentIndex - 1;
    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex; // Update ref immediately
    return currentHistory[newIndex];
  }, []);

  // Reset history navigation (called when input changes manually)
  const resetNavigation = useCallback(() => {
    setHistoryIndex(null);
    historyIndexRef.current = null; // Update ref immediately
  }, []);

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([]);
    setHistoryIndex(null);
    setCurrentInput("");
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  }, []);

  // Memoize the return value to prevent unnecessary re-renders
  return useMemo(() => ({
    history,
    addToHistory,
    navigatePrevious,
    navigateNext,
    resetNavigation,
    clearHistory,
    isNavigating: historyIndex !== null,
  }), [history, addToHistory, navigatePrevious, navigateNext, resetNavigation, clearHistory, historyIndex]);
}
