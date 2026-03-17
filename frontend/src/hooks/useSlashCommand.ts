import { useState, useCallback, useEffect } from "react";
import type { RefObject } from "react";
import type { SlashCommand } from "../utils/slashCommands";
import { searchSlashCommands } from "../utils/slashCommands";

interface SlashCommandState {
  isActive: boolean;
  query: string;
  suggestions: SlashCommand[];
  selectedIndex: number;
  position: { top: number; left: number } | null;
}

export function useSlashCommand(
  inputRef: RefObject<HTMLTextAreaElement>,
  input: string,
  onInputChange: (value: string) => void,
  onExecuteCommand?: (command: SlashCommand) => void,
) {
  const [state, setState] = useState<SlashCommandState>({
    isActive: false,
    query: "",
    suggestions: [],
    selectedIndex: 0,
    position: null,
  });

  // Check for slash command trigger
  useEffect(() => {
    const text = input;
    const lines = text.split("\n");
    const lastLine = lines[lines.length - 1];

    // Check if the last line starts with / or contains / followed by text
    const slashMatch = lastLine.match(/\/([a-zA-Z]*)$/);

    if (slashMatch) {
      const query = slashMatch[0]; // Include the /
      const suggestions = searchSlashCommands(query.slice(1)); // Search without /
      setState((prev) => ({
        ...prev,
        isActive: true,
        query: query,
        suggestions,
        selectedIndex: 0,
      }));

      // Calculate position
      if (inputRef.current) {
        const textarea = inputRef.current;
        const rect = textarea.getBoundingClientRect();
        const cursorPosition = textarea.selectionStart || 0;
        
        // Get the line number and character position in the line
        const textBeforeCursor = text.substring(0, cursorPosition);
        const linesBeforeCursor = textBeforeCursor.split("\n");
        const currentLineIndex = linesBeforeCursor.length - 1;
        const currentColumn = linesBeforeCursor[currentLineIndex].length;

        // Approximate position based on textarea dimensions
        const charWidth = 8.5; // Approximate character width for monospace
        
        // Calculate position relative to viewport
        const top = rect.bottom - 8; // Position below the textarea
        const left = rect.left + Math.min(currentColumn * charWidth, rect.width - 200);

        setState((prev) => ({
          ...prev,
          position: {
            top: top + window.scrollY,
            left: left + window.scrollX,
          },
        }));
      }
    } else {
      setState((prev) => ({
        ...prev,
        isActive: false,
        query: "",
        suggestions: [],
        selectedIndex: 0,
        position: null,
      }));
    }
  }, [input, inputRef]);

  // Select a command
  const selectCommand = useCallback(
    (command: SlashCommand) => {
      if (inputRef.current) {
        const textarea = inputRef.current;
        const cursorPosition = textarea.selectionStart;
        const text = input;
        const textBeforeCursor = text.substring(0, cursorPosition);
        const textAfterCursor = text.substring(cursorPosition);

        // Find the start of the slash command
        const lastSlashIndex = textBeforeCursor.lastIndexOf("/");
        if (lastSlashIndex !== -1) {
          const beforeCommand = textBeforeCursor.substring(0, lastSlashIndex);
          const afterCommand = textAfterCursor;

          // Replace with the full command name
          const newText = beforeCommand + command.name + " " + afterCommand;
          onInputChange(newText);

          // Focus and set cursor position
          setTimeout(() => {
            textarea.focus();
            const newCursorPos = beforeCommand.length + command.name.length + 1;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
          }, 0);
        }
      }

      setState((prev) => ({
        ...prev,
        isActive: false,
        query: "",
        suggestions: [],
        selectedIndex: 0,
        position: null,
      }));

      onExecuteCommand?.(command);
    },
    [input, inputRef, onInputChange, onExecuteCommand],
  );

  // Navigate suggestions with keyboard
  const navigateUp = useCallback(() => {
    setState((prev) => {
      if (!prev.isActive || prev.suggestions.length === 0) return prev;
      const newIndex =
        prev.selectedIndex <= 0 ? prev.suggestions.length - 1 : prev.selectedIndex - 1;
      return { ...prev, selectedIndex: newIndex };
    });
  }, []);

  const navigateDown = useCallback(() => {
    setState((prev) => {
      if (!prev.isActive || prev.suggestions.length === 0) return prev;
      const newIndex =
        prev.selectedIndex >= prev.suggestions.length - 1 ? 0 : prev.selectedIndex + 1;
      return { ...prev, selectedIndex: newIndex };
    });
  }, []);

  const confirmSelection = useCallback(() => {
    if (state.isActive && state.suggestions.length > 0) {
      const selected = state.suggestions[state.selectedIndex];
      selectCommand(selected);
      return true; // Indicate that we handled the event
    }
    return false;
  }, [state, selectCommand]);

  const cancelSuggestions = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isActive: false,
      query: "",
      suggestions: [],
      selectedIndex: 0,
      position: null,
    }));
  }, []);

  return {
    isActive: state.isActive,
    suggestions: state.suggestions,
    selectedIndex: state.selectedIndex,
    position: state.position,
    navigateUp,
    navigateDown,
    confirmSelection,
    cancelSuggestions,
    selectCommand,
  };
}
