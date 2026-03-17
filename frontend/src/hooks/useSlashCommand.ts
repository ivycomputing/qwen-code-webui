import { useState, useCallback, useEffect } from "react";
import type { RefObject } from "react";
import type { SlashCommand, SubCommand } from "../utils/slashCommands";
import { searchSlashCommands, getSubCommands, searchSubCommands } from "../utils/slashCommands";

interface SlashCommandState {
  isActive: boolean;
  query: string;
  suggestions: SlashCommand[] | SubCommand[];
  selectedIndex: number;
  position: { top: number; left: number } | null;
  isSubCommand: boolean;
  parentCommand: string | null;
}

export function useSlashCommand(
  inputRef: RefObject<HTMLTextAreaElement>,
  input: string,
  onInputChange: (value: string) => void,
  onExecuteCommand?: (command: SlashCommand | SubCommand, isSubCommand: boolean) => void,
) {
  const [state, setState] = useState<SlashCommandState>({
    isActive: false,
    query: "",
    suggestions: [],
    selectedIndex: 0,
    position: null,
    isSubCommand: false,
    parentCommand: null,
  });

  // Check for slash command trigger
  useEffect(() => {
    const text = input;
    const lines = text.split("\n");
    const lastLine = lines[lines.length - 1];

    // Check for sub-command pattern: /skills xxx
    const subCommandMatch = lastLine.match(/\/skills\s+([a-zA-Z-]*)$/);
    if (subCommandMatch) {
      const subQuery = subCommandMatch[1];
      const subCommands = getSubCommands("/skills");
      const filtered = searchSubCommands(subCommands, subQuery);
      
      setState((prev) => ({
        ...prev,
        isActive: true,
        query: subQuery,
        suggestions: filtered,
        selectedIndex: 0,
        isSubCommand: true,
        parentCommand: "/skills",
      }));

      if (inputRef.current) {
        const textarea = inputRef.current;
        const rect = textarea.getBoundingClientRect();
        const charWidth = 8.5;

        // Calculate horizontal position
        const left = rect.left + Math.min((subCommandMatch[0].length) * charWidth, rect.width - 200);

        // Calculate vertical position with smart dropdown direction
        const dropdownHeight = 240; // Max height of dropdown (max-h-60 = 15rem = 240px)
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Prefer dropdown below, but switch to above if not enough space
        const openAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
        const gap = 2; // Minimal gap (2px) to make dropdown appear close to input
        const top = openAbove
          ? rect.top + window.scrollY - dropdownHeight - gap
          : rect.bottom + window.scrollY + gap;

        setState((prev) => ({
          ...prev,
          position: {
            top: top,
            left: left + window.scrollX,
          },
        }));
      }
      return;
    }

    // Check for slash command pattern: /xxx
    const slashMatch = lastLine.match(/\/([a-zA-Z]*)$/);
    if (slashMatch) {
      const query = slashMatch[0];
      const suggestions = searchSlashCommands(query.slice(1));
      setState((prev) => ({
        ...prev,
        isActive: true,
        query: query,
        suggestions,
        selectedIndex: 0,
        isSubCommand: false,
        parentCommand: null,
      }));

      if (inputRef.current) {
        const textarea = inputRef.current;
        const rect = textarea.getBoundingClientRect();
        const cursorPosition = textarea.selectionStart || 0;
        const textBeforeCursor = text.substring(0, cursorPosition);
        const linesBeforeCursor = textBeforeCursor.split("\n");
        const currentLineIndex = linesBeforeCursor.length - 1;
        const currentColumn = linesBeforeCursor[currentLineIndex].length;
        const charWidth = 8.5;

        // Calculate horizontal position
        const left = rect.left + Math.min(currentColumn * charWidth, rect.width - 200);

        // Calculate vertical position with smart dropdown direction
        const dropdownHeight = 240; // Max height of dropdown (max-h-60 = 15rem = 240px)
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Prefer dropdown below, but switch to above if not enough space
        const openAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
        const gap = 2; // Minimal gap (2px) to make dropdown appear close to input
        const top = openAbove
          ? rect.top + window.scrollY - dropdownHeight - gap
          : rect.bottom + window.scrollY + gap;

        setState((prev) => ({
          ...prev,
          position: {
            top: top,
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
        isSubCommand: false,
        parentCommand: null,
      }));
    }
  }, [input, inputRef]);

  // Complete command with Tab (auto-complete best match)
  const completeWithTab = useCallback(() => {
    if (!state.isActive || state.suggestions.length === 0) return false;
    
    const selected = state.suggestions[state.selectedIndex] as SlashCommand | SubCommand;
    
    if (inputRef.current) {
      const textarea = inputRef.current;
      const cursorPosition = textarea.selectionStart || 0;
      const text = input;
      const textBeforeCursor = text.substring(0, cursorPosition);
      
      if (state.isSubCommand) {
        // Completing sub-command: /skills gh-i -> /skills gh-issue
        const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
        if (lastSpaceIndex !== -1) {
          const beforeSubCommand = textBeforeCursor.substring(0, lastSpaceIndex + 1);
          const newText = beforeSubCommand + selected.name + " ";
          onInputChange(newText);
          
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(newText.length, newText.length);
          }, 0);
        }
      } else {
        // Completing main command: /s -> /skills
        const lastSlashIndex = textBeforeCursor.lastIndexOf("/");
        if (lastSlashIndex !== -1) {
          const beforeCommand = textBeforeCursor.substring(0, lastSlashIndex);
          const newText = beforeCommand + selected.name + " ";
          onInputChange(newText);
          
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(newText.length, newText.length);
          }, 0);
        }
      }
    }
    
    return true;
  }, [state, input, inputRef, onInputChange]);

  // Select a command
  const selectCommand = useCallback(
    (command: SlashCommand | SubCommand) => {
      if (inputRef.current) {
        const textarea = inputRef.current;
        const cursorPosition = textarea.selectionStart || 0;
        const text = input;
        const textBeforeCursor = text.substring(0, cursorPosition);
        const textAfterCursor = text.substring(cursorPosition);

        if (state.isSubCommand) {
          // Selecting sub-command: execute it
          const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
          if (lastSpaceIndex !== -1) {
            const beforeSubCommand = textBeforeCursor.substring(0, lastSpaceIndex);
            const newText = beforeSubCommand + " " + command.name + textAfterCursor;
            onInputChange(newText);
            
            setTimeout(() => {
              textarea.focus();
              const newCursorPos = beforeSubCommand.length + command.name.length + 1;
              textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
          }
        } else {
          // Selecting main command: just complete it
          const lastSlashIndex = textBeforeCursor.lastIndexOf("/");
          if (lastSlashIndex !== -1) {
            const beforeCommand = textBeforeCursor.substring(0, lastSlashIndex);
            const newText = beforeCommand + command.name + " " + textAfterCursor;
            onInputChange(newText);

            setTimeout(() => {
              textarea.focus();
              const newCursorPos = beforeCommand.length + command.name.length + 1;
              textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
          }
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

      onExecuteCommand?.(command, state.isSubCommand);
    },
    [input, inputRef, onInputChange, onExecuteCommand, state.isSubCommand],
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
    isSubCommand: state.isSubCommand,
    navigateUp,
    navigateDown,
    confirmSelection,
    cancelSuggestions,
    selectCommand,
    completeWithTab,
  };
}
