// Slash command registry and types

export interface SlashCommand {
  name: string;
  descriptionKey: string; // i18n key for description
  action?: () => void | Promise<void>;
  hasSubCommands?: boolean;
  requiresConfirmation?: boolean;
}

// Command registry
const slashCommands: SlashCommand[] = [
  {
    name: "/skills",
    descriptionKey: "slashCommands.skillsDescription",
    hasSubCommands: true,
  },
  {
    name: "/clear",
    descriptionKey: "slashCommands.clearDescription",
    requiresConfirmation: true,
  },
  // Add more commands here in the future
];

export function getSlashCommands(): SlashCommand[] {
  return slashCommands;
}

export function getSlashCommand(name: string): SlashCommand | undefined {
  return slashCommands.find((cmd) => cmd.name === name);
}

export function searchSlashCommands(query: string): SlashCommand[] {
  if (!query) return slashCommands;
  const lowerQuery = query.toLowerCase();
  return slashCommands.filter((cmd) => cmd.name.toLowerCase().includes(lowerQuery));
}

// Sub-command types
export interface SubCommand {
  name: string;
  description: string;
  action?: () => void | Promise<void>;
}

// Get sub-commands for a slash command
export function getSubCommands(commandName: string): SubCommand[] {
  if (commandName === "/skills") {
    return getAvailableSkills();
  }
  return [];
}

// Get available skills from the static list (will be replaced with API call)
export function getAvailableSkills(): SubCommand[] {
  // These are the known skills from .qwen/skills directory
  return [
    { name: "commit", description: "Stage all changes, generate commit message, and commit" },
    { name: "gh-issue", description: "将当前处理的问题记录到 GitHub issue" },
    { name: "gh-release", description: "Build packages, create GitHub release, and publish to npm" },
    { name: "list-open-issues", description: "列出当前项目中所有未解决的 GitHub issues" },
    { name: "playwright", description: "使用 Playwright 对当前问题或结果进行截图验证" },
    { name: "test", description: "Run tests for the current project" },
    { name: "ui-test", description: "使用 Playwright 进行 UI 功能自动化测试" },
  ];
}

// Search sub-commands
export function searchSubCommands(subCommands: SubCommand[], query: string): SubCommand[] {
  if (!query) return subCommands;
  const lowerQuery = query.toLowerCase();
  return subCommands.filter((cmd) => cmd.name.toLowerCase().includes(lowerQuery));
}
