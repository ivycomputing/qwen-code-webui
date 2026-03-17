// Slash command registry and types

export interface SlashCommand {
  name: string;
  description: string;
  action: () => void | Promise<void>;
}

// Command registry
const slashCommands: SlashCommand[] = [
  {
    name: "/skills",
    description: "Show available skills",
    action: () => {
      // Action will be handled by the component
    },
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
