/**
 * Canonical tool name constants matching the Qwen SDK's snake_case format.
 *
 * The Qwen SDK sends tool names in snake_case (e.g., "run_shell_command").
 * All frontend code should use these constants instead of hardcoded string literals.
 *
 * See: qwen-code-cli/packages/core/src/tools/tool-names.ts for the SDK's canonical list.
 */

/** Tool names as sent by the Qwen SDK (snake_case) */
export const TOOL_NAMES = {
  BASH: "run_shell_command",
  READ: "read_file",
  WRITE: "write_file",
  EDIT: "edit",
  GREP: "grep_search",
  GLOB: "glob",
  EXIT_PLAN_MODE: "exit_plan_mode",
  TODO_WRITE: "todo_write",
  ASK_USER_QUESTION: "ask_user_question",
  LIST_DIRECTORY: "list_directory",
  WEB_FETCH: "web_fetch",
  THINK: "think",
  SAVE_MEMORY: "save_memory",
} as const;

/** Union type of all valid tool names */
export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

/**
 * Backward compatibility map: PascalCase (legacy) -> snake_case (SDK).
 * Used by normalizeToolName() to handle old data that may still use PascalCase.
 */
const PASCAL_TO_SNAKE: Record<string, string> = {
  Bash: TOOL_NAMES.BASH,
  Read: TOOL_NAMES.READ,
  Write: TOOL_NAMES.WRITE,
  Edit: TOOL_NAMES.EDIT,
  Grep: TOOL_NAMES.GREP,
  Glob: TOOL_NAMES.GLOB,
  ExitPlanMode: TOOL_NAMES.EXIT_PLAN_MODE,
  TodoWrite: TOOL_NAMES.TODO_WRITE,
  AskUserQuestion: TOOL_NAMES.ASK_USER_QUESTION,
  ListDirectory: TOOL_NAMES.LIST_DIRECTORY,
  WebFetch: TOOL_NAMES.WEB_FETCH,
  Think: TOOL_NAMES.THINK,
  SaveMemory: TOOL_NAMES.SAVE_MEMORY,
  Execute: TOOL_NAMES.BASH, // Legacy alias
};

/**
 * Normalize a tool name from any format (PascalCase or snake_case) to snake_case.
 * Returns the input unchanged if it's already snake_case or not a known tool.
 */
export function normalizeToolName(name: string): string {
  return PASCAL_TO_SNAKE[name] || name;
}

/** Type guard: check if a string is a known SDK tool name */
export function isKnownToolName(name: string): name is ToolName {
  return Object.values(TOOL_NAMES).includes(name as ToolName);
}
