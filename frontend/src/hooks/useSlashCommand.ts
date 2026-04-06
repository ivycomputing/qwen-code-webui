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
  expandedHeight: number;
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
    expandedHeight: 0,
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

      // Use fixed expanded height: 1/4 of viewport height
      const expandedHeight = Math.floor(window.innerHeight / 4);

      setState((prev) => ({
        ...prev,
        isActive: true,
        query: subQuery,
        suggestions: filtered,
        selectedIndex: 0,
        isSubCommand: true,
        parentCommand: "/skills",
        expandedHeight,
      }));

      if (inputRef.current) {
        const textarea = inputRef.current;
        const rect = textarea.getBoundingClientRect();
        const charWidth = 8.5;

        // Calculate horizontal position: align with the first letter of the skill name
        // subCommandMatch[0] = "/skills xxx", subCommandMatch[1] = "xxx"
        // Position should align with the start of "xxx"
        const prefixLength = subCommandMatch[0].length - subQuery.length; // Length of "/skills "
        // Subtract 2 char widths to align dropdown left edge with skill name first letter
        const left = rect.left + prefixLength * charWidth - (2 * charWidth);

        // Fixed vertical position: 3/4 of viewport height from top, minus 30px
        const top = Math.floor(window.innerHeight * 3 / 4) - 30;

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

      // Use fixed expanded height: 1/4 of viewport height
      const expandedHeight = Math.floor(window.innerHeight / 4);

      setState((prev) => ({
        ...prev,
        isActive: true,
        query: query,
        suggestions,
        selectedIndex: 0,
        isSubCommand: false,
        parentCommand: null,
        expandedHeight,
      }));

      if (inputRef.current) {
        const textarea = inputRef.current;
        const rect = textarea.getBoundingClientRect();
        const charWidth = 8.5;

        // Calculate horizontal position: align with the "/" character
        // slashMatch.index is the position of "/" in the last line
        const left = rect.left + (slashMatch.index ?? 0) * charWidth;

        // Fixed vertical position: 3/4 of viewport height from top, minus 30px (same as skill dropdown)
        const top = Math.floor(window.innerHeight * 3 / 4) - 30;

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
        expandedHeight: 0,
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
          
          // For commands that require confirmation (like /clear), execute immediately
          // This ensures the confirmation dialog shows when user presses Enter
          if ((selected as SlashCommand).requiresConfirmation) {
            onExecuteCommand?.(selected, false);
          }
        }
      }
    }
    
    return true;
  }, [state, input, inputRef, onInputChange, onExecuteCommand]);

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
        isSubCommand: false,
        parentCommand: null,
        expandedHeight: 0,
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
      isSubCommand: false,
      parentCommand: null,
      expandedHeight: 0,
    }));
  }, []);

  return {
    isActive: state.isActive,
    suggestions: state.suggestions,
    selectedIndex: state.selectedIndex,
    position: state.position,
    isSubCommand: state.isSubCommand,
    expandedHeight: state.expandedHeight,
    navigateUp,
    navigateDown,
    confirmSelection,
    cancelSuggestions,
    selectCommand,
    completeWithTab,
  };
}
