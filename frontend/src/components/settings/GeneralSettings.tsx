import {
  SunIcon,
  MoonIcon,
  CommandLineIcon,
  BeakerIcon,
} from "@heroicons/react/24/outline";
import { useSettings } from "../../hooks/useSettings";
import { useVersion } from "../../hooks/useVersion";

export function GeneralSettings() {
  const {
    theme,
    enterBehavior,
    experimental,
    toggleTheme,
    toggleEnterBehavior,
    updateSettings,
  } = useSettings();
  const { version } = useVersion();

  const toggleWebUIComponents = () => {
    updateSettings({
      experimental: {
        ...experimental,
        useWebUIComponents: !experimental.useWebUIComponents,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Live region for screen reader announcements */}
      <div aria-live="polite" className="sr-only" id="settings-announcements">
        {theme === "light" ? "Light mode enabled" : "Dark mode enabled"}.{" "}
        {enterBehavior === "send"
          ? "Enter key sends messages"
          : "Enter key creates newlines"}
        .
      </div>

      <div>
        <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100 mb-4">
          General Settings
        </h3>

        {/* Theme Setting */}
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              Theme
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 text-left flex-1"
                role="switch"
                aria-checked={theme === "dark"}
                aria-label={`Theme toggle. Currently set to ${theme} mode. Click to switch to ${theme === "light" ? "dark" : "light"} mode.`}
              >
                {theme === "light" ? (
                  <SunIcon className="w-5 h-5 text-yellow-500" />
                ) : (
                  <MoonIcon className="w-5 h-5 text-blue-400" />
                )}
                <div>
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {theme === "light" ? "Light Mode" : "Dark Mode"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Click to switch to {theme === "light" ? "dark" : "light"}{" "}
                    mode
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Enter Behavior Setting */}
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              Enter Key Behavior
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleEnterBehavior}
                className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 text-left flex-1"
                role="switch"
                aria-checked={enterBehavior === "send"}
                aria-label={`Enter key behavior toggle. Currently set to ${enterBehavior === "send" ? "send message" : "newline"}. Click to switch behavior.`}
              >
                <CommandLineIcon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                <div>
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {enterBehavior === "send"
                      ? "Enter to Send"
                      : "Enter for Newline"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {enterBehavior === "send"
                      ? "Enter sends message, Shift+Enter for newline"
                      : "Enter adds newline, Shift+Enter sends message"}
                  </div>
                </div>
              </button>
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Controls how the Enter key behaves when typing messages in the
              chat input.
            </div>
          </div>
        </div>
      </div>

      {/* Experimental Features */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <BeakerIcon className="w-5 h-5 text-purple-500" />
          Experimental Features
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              Qwen WebUI Components
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleWebUIComponents}
                className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 text-left flex-1"
                role="switch"
                aria-checked={experimental.useWebUIComponents}
                aria-label={`WebUI Components toggle. Currently ${experimental.useWebUIComponents ? "enabled" : "disabled"}. Click to toggle.`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center ${experimental.useWebUIComponents ? "bg-purple-500" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${experimental.useWebUIComponents ? "bg-white" : "bg-slate-500 dark:bg-slate-400"}`}
                  />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {experimental.useWebUIComponents ? "Enabled" : "Disabled"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Use @qwen-code/webui components for chat messages
                  </div>
                </div>
              </button>
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Enable to use the official Qwen WebUI component library for
              rendering chat messages. This provides a more consistent
              experience with Qwen Code CLI.
            </div>
          </div>
        </div>
      </div>

      {/* Version Info */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <span>Version</span>
          <span className="font-mono">
            {version ? `v${version}` : "Loading..."}
          </span>
        </div>
      </div>
    </div>
  );
}