export type Theme = "light" | "dark";
export type EnterBehavior = "send" | "newline";

/**
 * Experimental features that can be toggled
 */
export interface ExperimentalFeatures {
  /** Use @qwen-code/webui components for chat messages */
  useWebUIComponents: boolean;
}

export interface AppSettings {
  theme: Theme;
  enterBehavior: EnterBehavior;
  version: number;
  /** Experimental features (optional, defaults applied if missing) */
  experimental?: ExperimentalFeatures;
}

export interface LegacySettings {
  theme?: Theme;
  enterBehavior?: EnterBehavior;
  experimental?: ExperimentalFeatures;
}

export interface SettingsContextType {
  settings: AppSettings;
  theme: Theme;
  enterBehavior: EnterBehavior;
  experimental: ExperimentalFeatures;
  toggleTheme: () => void;
  toggleEnterBehavior: () => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
}

// Default experimental features
export const DEFAULT_EXPERIMENTAL: ExperimentalFeatures = {
  useWebUIComponents: false, // Disabled by default, enable for testing
};

// Default settings
export const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  enterBehavior: "send",
  version: 1,
  experimental: DEFAULT_EXPERIMENTAL,
};

// Current settings version for migration
export const CURRENT_SETTINGS_VERSION = 1;
