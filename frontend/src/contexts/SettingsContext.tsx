import React, { useState, useEffect, useCallback, useMemo } from "react";
import type {
  AppSettings,
  SettingsContextType,
  ExperimentalFeatures,
} from "../types/settings";
import { getSettings, setSettings } from "../utils/storage";
import { SettingsContext } from "./SettingsContextTypes";
import { DEFAULT_EXPERIMENTAL } from "../types/settings";

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(() =>
    getSettings(),
  );
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize settings on client side (handles migration automatically)
  useEffect(() => {
    const initialSettings = getSettings();
    setSettingsState(initialSettings);
    setIsInitialized(true);
  }, []);

  // Apply theme changes to document when settings change
  useEffect(() => {
    if (!isInitialized) return;

    const root = window.document.documentElement;

    if (settings.theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Save settings to storage
    setSettings(settings);
  }, [settings, isInitialized]);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const toggleTheme = useCallback(() => {
    updateSettings({
      theme: settings.theme === "light" ? "dark" : "light",
    });
  }, [settings.theme, updateSettings]);

  const toggleEnterBehavior = useCallback(() => {
    updateSettings({
      enterBehavior: settings.enterBehavior === "send" ? "newline" : "send",
    });
  }, [settings.enterBehavior, updateSettings]);

  const toggleExpandThinking = useCallback(() => {
    updateSettings({
      expandThinking: !settings.expandThinking,
    });
  }, [settings.expandThinking, updateSettings]);

  // Get experimental features with defaults
  const experimental: ExperimentalFeatures = useMemo(
    () => ({
      ...DEFAULT_EXPERIMENTAL,
      ...settings.experimental,
    }),
    [settings.experimental],
  );

  const value = useMemo(
    (): SettingsContextType => ({
      settings,
      theme: settings.theme,
      enterBehavior: settings.enterBehavior,
      experimental,
      expandThinking: settings.expandThinking ?? true, // Default to expanded
      toggleTheme,
      toggleEnterBehavior,
      toggleExpandThinking,
      updateSettings,
    }),
    [settings, experimental, toggleTheme, toggleEnterBehavior, toggleExpandThinking, updateSettings],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
