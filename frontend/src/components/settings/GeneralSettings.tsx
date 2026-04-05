import {
  SunIcon,
  MoonIcon,
  CommandLineIcon,
  BeakerIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import { useVersion } from "../../hooks/useVersion";

const languages = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "zh-CN", name: "Chinese (Simplified)", nativeName: "简体中文" },
];

export function GeneralSettings() {
  const { t, i18n } = useTranslation();
  const {
    theme,
    enterBehavior,
    experimental,
    expandThinking,
    toggleTheme,
    toggleEnterBehavior,
    toggleExpandThinking,
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

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode);
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
          {t("settings.general")}
        </h3>

        {/* Theme Setting */}
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              {t("settings.theme")}
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
                    {theme === "light" ? t("settings.lightMode") : t("settings.darkMode")}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {theme === "light" ? t("settings.darkMode") : t("settings.lightMode")}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Language Setting */}
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              {t("settings.language")}
            </label>
            <div className="flex items-center gap-2">
              <select
                value={i18n.language}
                onChange={(e) => changeLanguage(e.target.value)}
                className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                  backgroundSize: "20px",
                }}
              >
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.nativeName} ({lang.name})
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {i18n.language === "zh-CN" 
                ? "选择界面显示语言" 
                : "Select the interface display language"}
            </div>
          </div>

          {/* Enter Behavior Setting */}
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              {t("settings.enterKeyBehavior")}
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
                      ? t("settings.enterToSend")
                      : t("settings.enterForNewline")}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {enterBehavior === "send"
                      ? (i18n.language === "zh-CN" ? "Enter 发送，Shift+Enter 换行" : "Enter sends, Shift+Enter for newline")
                      : (i18n.language === "zh-CN" ? "Enter 换行，Shift+Enter 发送" : "Enter for newline, Shift+Enter sends")}
                  </div>
                </div>
              </button>
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {i18n.language === "zh-CN"
                ? "控制在聊天输入框中按 Enter 键的行为。"
                : "Controls how the Enter key behaves when typing messages in the chat input."}
            </div>
          </div>

          {/* Expand Thinking Setting */}
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              {i18n.language === "zh-CN" ? "默认展开思考内容" : "Default Thinking Expansion"}
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleExpandThinking}
                className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 text-left flex-1"
                role="switch"
                aria-checked={expandThinking}
                aria-label={`Default thinking expansion toggle. Currently ${expandThinking ? "expanded" : "collapsed"}. Click to toggle.`}
              >
                {expandThinking ? (
                  <ChevronDownIcon className="w-5 h-5 text-blue-500" />
                ) : (
                  <ChevronUpIcon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                )}
                <div>
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {expandThinking 
                      ? (i18n.language === "zh-CN" ? "已展开" : "Thinking Expanded")
                      : (i18n.language === "zh-CN" ? "已折叠" : "Thinking Collapsed")}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {expandThinking
                      ? (i18n.language === "zh-CN" ? "AI 思考内容默认展开显示" : "AI thinking content is expanded by default")
                      : (i18n.language === "zh-CN" ? "AI 思考内容默认折叠显示" : "AI thinking content is collapsed by default")}
                  </div>
                </div>
              </button>
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {i18n.language === "zh-CN"
                ? "控制 AI 思考内容和工具调用详情是否默认展开或折叠。"
                : "Controls whether AI thinking content and tool call details are expanded or collapsed by default in chat messages."}
            </div>
          </div>
        </div>
      </div>

      {/* Experimental Features */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <BeakerIcon className="w-5 h-5 text-purple-500" />
          {i18n.language === "zh-CN" ? "实验性功能" : "Experimental Features"}
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
                    {experimental.useWebUIComponents 
                      ? (i18n.language === "zh-CN" ? "已启用" : "Enabled")
                      : (i18n.language === "zh-CN" ? "已禁用" : "Disabled")}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {i18n.language === "zh-CN"
                      ? "使用 @qwen-code/webui 组件显示聊天消息"
                      : "Use @qwen-code/webui components for chat messages"}
                  </div>
                </div>
              </button>
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {i18n.language === "zh-CN"
                ? "启用后将使用官方 Qwen WebUI 组件库渲染聊天消息，提供与 Qwen Code CLI 更一致的体验。"
                : "Enable to use the official Qwen WebUI component library for rendering chat messages. This provides a more consistent experience with Qwen Code CLI."}
            </div>
          </div>
        </div>
      </div>

      {/* Version Info */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <span>{i18n.language === "zh-CN" ? "版本" : "Version"}</span>
          <span className="font-mono">
            {version ? `v${version}` : t("common.loading")}
          </span>
        </div>
      </div>
    </div>
  );
}