# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Abort tracking now reaches CLI consumers that import `spawn`/`fork` as ESM
  named bindings (`syncBuiltinESMExports` after patching), which had silently
  left per-request child tracking ineffective; an aborted child's stdio pipes
  are also disposed after exit so they cannot hold the event loop.

## [0.2.43] - 2026-09-08

- fix(deps): patch all Dependabot-flagged vulnerable dependencies (#244)
- fix(security): restrict postMessage target origins (CodeQL cross-window leak) (#245)

## [0.2.42] - 2026-09-07

- Version bump only.

## [0.2.41] - 2026-09-05

- fix: preserve original questions in ask_user_question tool responses
- fix: add missing toolName in backward compatibility test
- test: add test for client tampering prevention
- fix: guarantee questions snapshot and validate answers for ask_user_question
- fix(openace): inject X-Session-Id header into LLM proxy requests (#221)
- fix(vscode): normalize Windows path for VS Code folder parameter (#240)
- fix: conversation history list shows empty due to CLI/WebUI incompatibility (#236)
- fix: preserve URL params in navigation to maintain remote context (#237)
- fix(remote): add remote session branch to Allow All permission handler (#238)
- fix: handle control_request messages in local mode permission flow (#239)
- fix(openace): pre-register session before first request to ensure proper attribution (#241)
- fix(loop-detection): use full content hash instead of truncation for error fingerprinting (#227)
- fix: skip loop detection in YOLO mode for autonomous workflows (#226)
- fix: reset loop counter on successful tool results (#225) (#228)

## [0.2.40] - 2026-07-31

- fix: 集成模式下 Token 过期自动刷新机制 (#213)

## [0.2.39] - 2026-07-27

- fix(frontend): make `typecheck` actually type-check (tsc -b --noEmit) (#205)
- feat: add v2 token format support with TTL validation (#210)

## [0.2.38] - 2026-07-14

- fix: prevent white flash (FOUC) in dark theme iframe loading (#200)
- fix(frontend): SSE auto-reconnect for remote session stability (#196)
- chore(deps): bump ws (#202)
- fix(frontend): unblock `npm run build` (ES2022 lib + drop unused imports) (#203)

## [0.2.37] - 2026-07-13

- fix: 深色主题下部分区域背景和文字不可读 (#198)

## [0.2.36] - 2026-07-03

- fix(DirectoryBrowser): display API errors and path hints in browse step
- feat: handle openace-scroll-to-bottom message when switching tabs
- feat: add origin validation and tests for scroll-to-bottom feature
- fix: 修复深色模式下聊天输入框文字颜色问题 (#184)
- chore: clean up unused destructure and fix test typing (#188)
- chore: ignore .qwen/ local tooling artifacts (#189)
- chore: ignore root-only package-lock.json (#190)
- test: green frontend suite + run vitest in CI (#192)
- chore(deps-dev): bump the npm_and_yarn group across 2 directories with 1 update (#191)
- fix: keep CLI alive when client disconnects during pending permission (#187)
- chore(deps): bump the npm_and_yarn group across 2 directories with 7 updates (#193)

## [0.2.35] - 2026-06-03

- Fix Stop abort flow for lingering CLI sessions
- Add stop abort integration verification script
- Preserve user abort source in stop handler
- Fix duplicate createRequire import causing SyntaxError in ESM bundle (#170)
- feat: Add URL parameter theme override for iframe theme sync (#165)
- Fix remote stop abort confirmation flow
- Tidy remote stop hook dependencies
- Show remote stopping state in Stop button
- Clean up deprecated reactive permission flow
- Address PR review feedback
- Fix auto-rejection loop reset semantics

## [0.2.34] - 2026-06-01

- feat: remote workspace file changes panel and VSCode editor support
- fix: address PR review feedback
- fix: address PR #156 second review feedback
- feat: improve file changes panel UI
- feat: interactive AskUserQuestion dialog with countdown support (#159)

## [0.2.33] - 2026-05-29

- feat: add ask_user_question display and improve todo activeForm (#145)
- feat: add file changes panel and VS Code integration (#144)
- fix: correct react-resizable-panels import names (#144)
- fix: correct react-resizable-panels API and remove unused import (#144)
- fix: use percentage strings for react-resizable-panels defaultSize (#144)
- fix: optimize VS Code (code-server) startup from hanging to ~0.4s (#144)
- feat: add Japanese and Korean i18n translations (#144)
- fix: address PR #146 code review feedback
- fix: address second round PR #146 review feedback
- feat: add workingDirectory whitelist + replace manual WebSocket proxy
- fix: resolve TS2454 in chat.test.ts — add definite assignment assertion
- perf: add chunk splitting to reduce initial bundle size
- fix: resolve dependabot brace-expansion vulnerability (GHSA-jxxr-4gwj-5jf2)
- fix: update @vitejs/plugin-react-swc to 4.3.1 to resolve esbuild deprecation warning
- fix: resolve qs DoS vulnerability (dependabot #96, #97)
- fix: support commonjs requires in esm bundle
- fix: improve VS Code proxy headers and add auth token to editor URL
- fix: apply addTokenToUrl in checkStatus and restore workingDirectory guard
- fix: resolve VS Code WebSocket 1006 error by correcting path matching
- fix: resolve VS Code WebSocket 1006 error
- fix: rewrite Origin header when proxying to code-server
- fix: add path guard and conditional origin rewrite per review
- Improve file changes panel interactions (#151)
- Handle remote file changes panel gracefully
- Open code-server with current project folder
- fix: 切换项目创建新Tab而非中断会话 (#229)
- feat: integrate Open ACE HA model pool for qwen-code model selection (#155)

## [0.2.32] - 2026-05-21

- Version bump only.

## [0.2.30] - 2026-05-21

- fix: pass stderr as function instead of boolean to QueryOptions
- fix: scope loop detection per agent to fix fork agent false positives (#140) (#141)
- fix: prevent stream stall detector false positives (#125)
- fix: update chat handler tests to match stderr function type
- fix: auto-approve countdown for permission prompts in default mode (#143)
- fix: add autoApproveMs to onPermissionRequest callback type

## [0.2.29] - 2026-05-19

- fix: support BrowserRouter basename via window.__WEBUI_BASENAME__
- refactor: add type declaration and guard for __WEBUI_BASENAME__
- ci: add branch protection to prevent direct commits to main (#130)
- fix: bridge Claude Code session resume and handle stream errors (#131)
- fix: address PR review comments for session bridge (#132)
- fix: address second round review — extract constant, narrow patterns, fix tests
- fix: guard interrupted message type and correct abort callback (#134)
- fix: replace onPermissionError with onAbortRequest in test — type-safe negative assertion (#135)
- fix: update stale chat handler tests for canUseTool/stderr/timeout options (#136)

## [0.2.28] - 2026-05-15

- chore(deps): bump the npm_and_yarn group across 2 directories with 2 updates
- fix: detect stream stall when frontend reader hangs indefinitely (#114)
- fix: enable Enter key to confirm ConfirmModal dialogs (#115)
- fix: permission dialog still showing for tools in allowedTools
- fix: address PR review — error handling, dedup, log levels
- fix: sync controlRequest timeout with canUseTool to prevent session abort (#118)
- fix: clear thinking/assistant state on remote SSE disconnect (#82)
- fix: add resetRequestState() to remote handleAbort path
- fix: migrate project mapping to dedicated config directory (#120)
- chore(deps): bump the npm_and_yarn group across 2 directories with 3 updates
- fix: prevent AI sub-agent prompts from appearing as User messages (#122)
- fix: upgrade frontend vite plugins for vite 8 compatibility
- fix: prevent concurrent CLI sessions and detect interrupted conversations (#123)
- fix: address PR review - pending permission cleanup, diagnostic, and tests
- fix: keepalive not reaching frontend causes stall detector false positive (#126)
- fix: remove reactive permission flow that misinterpreted execution errors (#128)
- fix: configure vitest jsdom environment and test setup

## [0.2.27] - 2026-05-12

- fix: context percentage showing >100% due to accumulated result message usage
- fix: rename openace-tab-activated to openace-clear-notification-state
- fix: debounce auto-scroll disable to prevent false negatives during streaming
- fix: skip permission dialog for tools already in allowed list
- fix: address PR review - multi-word commands, tests, and comments

## [0.2.26] - 2026-05-11

- fix: smart auto-scroll — stop interrupting users reading chat history
- fix: auto-scroll stops working after returning to bottom
- fix: thinking timeout false positive and abort not working

## [0.2.25] - 2026-05-09

- fix: handle SSE error events in remote chat hook
- fix: replace PascalCase tool names with snake_case constants
- fix: update usePermissions.test.ts with TOOL_NAMES constants
- feat: improve permission dialog UX and fix type errors (#106)
- fix: address PR review feedback for permission dialog UX
- fix: extend canUseTool timeout to 24 hours
- fix: show specific command in permanent allow button to avoid ambiguity
- feat: granular run_shell_command permission with 3-button UI
- fix: address PR re-review — non-shell allow scope, extract utility, scope semantics
- fix: rename non-shell allow button to "允许本次" / "Allow this time"
- chore: remove unused permission.yes i18n key
- fix: make SettingsModal props optional and add scope to sendPermissionResponse
- fix: SSE error recovery — clear stale sessionId, handle non-200 responses, abort on permission failure
- fix: address PR review — extract helper, await abort, guard sessionId clear
- fix: improve chat error handling — show actual errors, fix chunk boundaries
- fix: disable Node.js HTTP server timeouts for streaming responses
- fix: chat reliability — stream fixes + Input closed error handling (#111)

## [0.2.24] - 2026-05-06

- fix: replace hardcoded English strings with i18n t() calls
- fix: translate hardcoded Local/Remote strings in AddProjectModal

## [0.2.23] - 2026-05-06

- chore(deps): bump the npm_and_yarn group across 2 directories with 1 update
- fix: context percentage exceeding 100% due to accumulated input_tokens
- fix: replace invalid query-filters with valid queries exclude syntax
- fix: updateLastMessage search backwards for last ChatMessage
- fix: use correct query-filters field for CodeQL config
- fix: clear conversation should not generate fake session ID
- fix: suppress stale error message on /clear abort
- fix: reset clearAbortRef in finally block to prevent swallowing errors
- fix: project deletion fails silently and CORS missing DELETE method (#92)
- feat: auto-approve previously allowed tools within same streaming session
- fix: refine auto-approve to read-only tools only + proactive deny detection (#98)
- fix: thinking timeout fires even when AI is actively producing output (#99)
- fix: add diagnostic logging for chat request lifecycle and fix test compatibility

## [0.2.22] - 2026-04-29

- feat: add permission_request types to shared StreamResponse
- feat: backend permission endpoint for proactive canUseTool
- refactor: add canUseTool callback to executeQwenCommand
- feat: frontend permission response API and permission request state
- feat: stream parser handles permission_request and orphan cleanup
- feat: ChatPage proactive permission flow and [proactive] marker handling
- fix: address post-implementation review — 6 issues (#85)
- fix: enqueue consistency — loop detection + outer catch (#85)

## [0.2.21] - 2026-04-28

- fix: handle Qwen SDK message format, auto-abort on loop, thinking timeout
- fix: thinking toggle, demo tool name cache, arrow key navigation, i18n tooltips (#73, #72, #68, #67)
- fix: Input closed loop detection — status:"cancelled", backend watchdog, cross-tool counting (#83)

## [0.2.20] - 2026-04-28

- Version bump only.

## [0.2.19] - 2026-04-28

- Version bump only.

## [0.2.18] - 2026-04-27

- feat: add auto-rejection loop detection and fix command result loop callback
- fix: remote abort button not showing, abort error handling, and race condition

## [0.2.17] - 2026-04-26

- Add pause/resume support for remote sessions (#164)
- Fix remote workspace: project path shows "/" and back arrow in integrated mode

## [0.2.16] - 2026-04-26

- fix: /context command not responding and context circle display issues
- feat: remote session reconnect history replay, abort API, permission i18n

## [0.2.15] - 2026-04-24

- refactor: improve chat input status bar UX
- style: add visual separators in chat status bar
- feat: add remote workspace support with machine selection and SSE streaming
- fix: add global ESC key handler to forward to parent window for fullscreen exit (Issue #103)
- fix: 权限确认面板 UI 优化 — i18n、选中样式、去重
- feat: remote workspace model switching support
- feat: remote session model hot-switch and /context command
- fix: context panel sub-category sum mismatch and missing unit label
- fix: resolve symlink in qwen CLI path to prevent spawn ENOENT
- fix: remote workspace session resilience and UX improvements

## [0.2.14] - 2026-04-17

- Version bump only.

## [0.2.13] - 2026-04-16

- fix: remove duplicate cache token counting in context ratio

## [0.2.12] - 2026-04-15

- refactor: remove real-time stats sync to Open-ACE

## [0.2.11] - 2026-04-14

### Fixed

- Correct URL building for Open-ACE session API calls

## [0.2.10] - 2026-04-13

- fix: project delete button visibility and click handler for integrated mode
- feat: add session statistics tracking for Open-ACE integration

## [0.2.9] - 2026-04-13

- fix: improve modal dialog interaction and keyboard handling

## [0.2.8] - 2026-04-12

- fix: add pointer-events-none to modal overlay elements to prevent click blocking
- fix: remove pointer-events styles from AddProjectModal (issue #65)
- feat: 支持 --auth-type 参数传递认证类型 (#66)

## [0.2.7] - 2026-04-10

- docs: add README for offline package installation method
- feat: add command result loop detection to prevent AI infinite retry
- test: add unit tests for command result loop detection
- feat: add Open-ACE quota integration
- fix: improve test types and add Open-ACE env config
- fix: Node.js runtime compatibility and quota check defaults
- fix: correct static path for bundled production builds
- feat: add token authentication for Open-ACE integration
- feat: enforce quota limits via backend middleware
- feat: add project management integration and session tracking
- fix: use openace_url parameter for cross-origin API calls
- feat: implement i18n framework with Chinese and English support
- fix: improve Enter key handling in Add Project dialog
- feat: add Enter key support to ConfirmModal for quick confirmation
- fix: add i18n support for ProjectSelector page
- feat: add /clear slash command to clear conversation context
- fix: generate new sessionId when clearing conversation
- feat: display model name and token usage in status bar (issue #54)
- chore: update Makefile to use npm instead of deno
- chore: add deno build target for standalone executable
- feat: add auto-focus to project selector for keyboard navigation
- feat: auto fullscreen when entering chat page in iframe
- fix: translate hardcoded UI text for i18n support (issue #51)
- fix: improve status bar layout and add i18n support (issue #54)
- fix: auto-select default model and validate saved selection (issue #55)
- fix: improve clear dialog with proper buttons and keyboard shortcuts
- fix: add !important to ConfirmModal button background colors
- Fix issue 56: Update project selector title and remove redundant subtitle
- Fix security vulnerabilities: Update lodash and vite dependencies
- fix: resolve ESLint errors and frontend test failures (issue #59)
- Configure CodeQL to exclude demo/test file false positives
- feat: implement /clear command and related features
- Add CodeQL suppression comments for intentional patterns
- Fix issue #62: Move send button outside textarea to prevent text occlusion
- Fix context window usage calculation to use prompt tokens instead of accumulated tokens
- Add delete project feature for local mode (issue #61)
- feat(i18n): Add language sync from open-ace via URL parameter
- feat: Auto-focus input when switching workspace tabs (Issue #63)
- feat(tab-notification): Add multi-session tab notification mechanism (Issue #63)
- feat(chat): Add session update postMessage for workspace state persistence
- fix(#68): Change tab switch shortcut to Cmd+Shift+,/. to avoid Chrome conflicts
- feat(#63): Trigger input tab notification when AI finishes responding
- fix: use getEncodedName() for workspace session update
- fix: improve session state persistence for workspace restoration (Issue #70)
- fix: support Qwen SDK 'parts' format in message history loading (Issue #70)
- feat: add tab settings persistence for workspace restoration (Issue #70)
- fix: show input notification only after AI finishes responding
- fix: use iframe check instead of isIntegratedMode for tab switch (Issue #68)
- feat: focus permission button when switching to tab with permission request (Issue #68)
- fix: revert permission button focus change that broke keyboard shortcut (Issue #68)
- fix: use e.code for keyboard shortcut to support non-English input methods (Issue #68)

## [0.2.4] - 2026-04-01

- Version bump only.

## [0.2.3] - 2026-04-01

- fix: prevent AI infinite retry loop when user denies permission

## [0.2.2] - 2026-04-01

- docs: update gh-release skill with npm token storage
- Create codeql.yml
- fix: make 'Press Enter' hint follow selected project on keyboard navigation
- Remove Current Mode toggle button from ChatPage header
- feat: add model selector dropdown to ChatPage header
- style: add visible scrollbar and improve hover highlight for model selector
- fix: use static class names for hover effect in model selector
- fix: add custom CSS class for model selector hover effect
- fix: make Enter key behavior consistent with Tab in slash command autocomplete
- fix: use completeWithTab for Enter key to ensure consistent behavior
- Fix issue #37: Remove [Bailian Coding Plan] prefix and fix hover style
- chore: restore Docker deployment and maintenance updates

## [0.2.0] - 2026-03-18

- fix: prevent duplicate tool name display in WebUI components
- feat: add reusable ChatTestBase for UI testing
- fix: support Cmd+Shift+M keyboard shortcut on macOS for mode toggle
- fix: optimize ChatPage UI for better space utilization
- feat: add project switch button to ChatPage header
- feat: add expand thinking toggle button to ChatPage
- fix: exclude non-existent directories from project list
- feat: add default project selection and keyboard navigation
- feat: sort projects by hierarchy and alphabetically
- fix: remove duplicate loading indicator when WebUI Components enabled
- feat: add input history navigation and slash command autocomplete
- feat: enhance slash command with Tab autocomplete and sub-command support
- fix: Thinking expand toggle not working correctly
- fix: Issue 27 input history not working
- fix: slash command dropdown should open above when space is limited
- test: add UI test for slash command autocomplete (Issue 28)
- fix: reduce slash command dropdown gap to 2px
- fix: expand thinking button not working and add settings toggle (Issue #23)
- test: update expand thinking test to use correct port (Issue #23)
- fix: Thinking content not expanding when expandThinking is enabled
- fix: Thinking messages not expanding in WebUI Components mode
- fix: Thinking messages rendering in wrong position in WebUI mode
- fix: restore ChatViewer rendering for Thinking messages in WebUI mode
- fix: control Thinking expand state via DOM manipulation in WebUI mode
- fix: expandThinking default to true and reverse arrow direction
- fix: use refs in useInputHistory to fix arrow key navigation
- test: add Playwright tests for Issue 27 input history navigation
- fix: update refs immediately in useInputHistory for arrow key navigation
- fix: remove e.target check for arrow key navigation in ChatInput
- fix: call addToHistory when sending message with Enter key
- feat: position slash command dropdown below input with auto-expand
- feat: auto-expand input height for slash command suggestions
- feat: use fixed 25vh expanded height for slash command input
- feat: align slash command dropdown with input text
- fix: position dropdown directly below input within expanded margin
- fix: adjust Send button position and skill dropdown alignment
- fix: use fixed vertical position for slash command dropdown
- Add toggle button for WebUI Components in ChatPage
- Update toggle button style to match ExpandThinkingButton
- Update toggle button icon color to blue when enabled
- Match toggle button style to ExpandThinkingButton
- Update ExpandThinkingButton disabled state to white background
- Fix ExpandThinkingButton border to match other buttons
- Change YOLO mode shortcut from Cmd+Shift+M to Cmd+Shift+Y and add mode toggle button
- Fix permission mode shortcut not working globally
- feat: add debug logging for permissionMode tracking

## [0.1.1] - 2026-03-17

- feat: transform Claude Code Web UI to Qwen Code Web UI
- fix: update test files for Qwen SDK compatibility
- fix: update remaining 'Claude Code Web UI' references to 'Qwen Code Web UI'
- fix: update project history path from .claude to .qwen
- fix: fix project list API to read from ~/.qwen/projects directory
- fix: correctly decode project paths with hyphens
- fix: fix backend service crashing frequently after startup
- fix: update packaging script for Qwen Code Web UI
- fix: fix Deno runtime serve() return type
- fix: clean up broken symlinks to eliminate packaging warnings
- feat: integrate @qwen-code/webui component library
- docs: add @qwen-code/webui component library integration analysis
- docs: move QWEN_WEBUI_ANALYSIS.md to docs directory
- feat: add version display and experimental feature toggle
- feat: add open source project copyright notice
- Add copyright notice for Ivy Computing Team
- chore: clean up project documentation and config files
- fix: resolve TypeScript errors in MessageAdapter
- feat: add gh-release skill for automated release process
- docs: update CHANGELOG for v0.1.0 release
- feat: add version bump support to package.sh
- docs: update gh-release skill with version bump support
- docs: add npm publish step to gh-release skill
- fix: correct git clone URL in README
- fix: correct repository URL to ivycomputing/qwen-code-webui
- fix: collapse system messages by default to maximize chat area
- fix: prevent duplicate tool_use and tool_result messages in chat
- Update LICENSE
- fix: make system messages fully collapsed by default
- test: add YOLO mode test case for permission mode handling
- test: add E2E test for YOLO mode (issue #18)

## [0.1.0] - 2026-03-16

### Added

- Version display in settings page with `/api/version` endpoint
- Experimental features toggle for `useWebUIComponents` setting
- `useVersion` hook for fetching application version
- `@qwen-code/webui` component library integration
  - `MessageAdapter` for message format conversion
  - `WebUIChatMessages` component for chat rendering
  - `WebPlatformContext` for platform abstraction

### Changed

- Renamed `QWEN.md` to `PROJECT_CONTEXT.md` and moved to `docs/` directory
- Transformed project from Claude Code Web UI to Qwen Code Web UI
- Updated SDK dependency from `@anthropic-ai/claude-code` to `@qwen-code/sdk`

### Removed

- `CLAUDE.md` file (outdated)
- `.mcp.json` configuration (no longer needed)
- `.qwen/skills/ui-test/scripts/` directory (migrated)
- `docs/images/` directory (unused screenshots)

### Fixed

- TypeScript errors in `MessageAdapter` (unused imports, type conversion)
- Backend service crashing frequently after startup
- Project list API to read from `~/.qwen/projects` directory
- Project path decoding with hyphens
- Deno runtime `serve()` return type
- Broken symlinks causing packaging warnings

## [0.1.56](https://github.com/sugyan/claude-code-webui/compare/0.1.55...0.1.56) - 2025-09-18
- chore(deps): Bump @hono/node-server from 1.17.0 to 1.19.1 in /backend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/314
- chore(deps): Bump actions/download-artifact from 4.3.0 to 5.0.0 by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/307
- chore(deps): Bump actions/setup-node from 4.4.0 to 5.0.0 by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/306
- chore(deps-dev): Bump esbuild from 0.25.6 to 0.25.9 in /backend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/312
- chore(deps-dev): Bump @types/node from 20.19.4 to 24.3.0 in /backend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/308
- chore(deps-dev): Bump typescript-eslint from 8.33.1 to 8.42.0 in /frontend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/313
- chore(deps-dev): Bump @types/react from 19.1.6 to 19.1.12 in /frontend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/316
- Fix release workflow: Generate version.ts before Deno dependency caching by @sugyan in https://github.com/sugyan/claude-code-webui/pull/317

## [0.1.55](https://github.com/sugyan/claude-code-webui/compare/0.1.54...0.1.55) - 2025-09-18
- chore(deps): Bump hono from 4.8.5 to 4.9.7 in /backend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/288
- chore(deps): Bump esbuild and vitest in /backend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/289
- Add Dependabot configuration with cooldown settings by @sugyan in https://github.com/sugyan/claude-code-webui/pull/290
- chore(deps): Bump @logtape/pretty from 1.0.4 to 1.0.5 in /backend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/300
- chore(deps): Bump Songmu/tagpr from 1.8.4 to 1.9.0 by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/294
- chore(deps): Bump actions/github-script from 7.1.0 to 8.0.0 by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/292
- chore(deps): Bump react-dom and @types/react-dom in /frontend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/303
- chore(deps-dev): Bump eslint from 9.30.1 to 9.34.0 in /backend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/295
- chore(deps): Bump actions/checkout from 4.3.0 to 5.0.0 by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/293
- chore(deps-dev): Bump @tailwindcss/vite from 4.1.8 to 4.1.13 in /frontend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/304
- chore(deps-dev): Bump @typescript-eslint/parser from 8.36.0 to 8.42.0 in /backend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/298
- chore(deps-dev): Bump vitest from 3.2.3 to 3.2.4 in /frontend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/297
- chore(deps-dev): Bump eslint from 9.28.0 to 9.34.0 in /frontend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/299
- chore(deps-dev): Bump vite from 6.3.5 to 7.1.2 in /frontend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/301
- chore(deps-dev): Bump typescript from 5.8.3 to 5.9.2 in /backend by @dependabot[bot] in https://github.com/sugyan/claude-code-webui/pull/302
- Fix dependabot and tagpr labels conflict by @sugyan in https://github.com/sugyan/claude-code-webui/pull/305

## [0.1.54](https://github.com/sugyan/claude-code-webui/compare/0.1.53...0.1.54) - 2025-09-18
- Fix path encoding for Windows usernames with underscores by @BoQsc in https://github.com/sugyan/claude-code-webui/pull/276
- security: Pin GitHub Actions to commit hashes using pinact by @sugyan in https://github.com/sugyan/claude-code-webui/pull/287

## [0.1.53](https://github.com/sugyan/claude-code-webui/compare/0.1.52...0.1.53) - 2025-09-07
- Fix release workflow draft handling and npm OIDC authentication by @sugyan in https://github.com/sugyan/claude-code-webui/pull/274

## [0.1.52](https://github.com/sugyan/claude-code-webui/compare/0.1.51...0.1.52) - 2025-09-07
- Improve release flow with draft releases and OIDC npm publishing by @sugyan in https://github.com/sugyan/claude-code-webui/pull/272

## [0.1.51](https://github.com/sugyan/claude-code-webui/compare/0.1.50...0.1.51) - 2025-09-06
- Fix CollapsibleDetails tool result display with preview functionality by @sugyan in https://github.com/sugyan/claude-code-webui/pull/266
- Improve hooks message display by simplifying system message content by @sugyan in https://github.com/sugyan/claude-code-webui/pull/268
- Update @anthropic-ai/claude-code to v1.0.108 and fix AbortError import by @sugyan in https://github.com/sugyan/claude-code-webui/pull/269
- Fix Claude CLI validation to use fallback instead of exit on detection failure by @sugyan in https://github.com/sugyan/claude-code-webui/pull/270
- Update native binary installation description in README by @sugyan in https://github.com/sugyan/claude-code-webui/pull/271

## [0.1.50](https://github.com/sugyan/claude-code-webui/compare/0.1.49...0.1.50) - 2025-08-31
- fix: unify message processing pipelines between streaming and history by @sugyan in https://github.com/sugyan/claude-code-webui/pull/262
- ci: add build validation and fix claude-code dependency issue by @sugyan in https://github.com/sugyan/claude-code-webui/pull/264

## [0.1.49](https://github.com/sugyan/claude-code-webui/compare/0.1.48...0.1.49) - 2025-08-30
- Implement thinking message display for Claude's reasoning process by @sugyan in https://github.com/sugyan/claude-code-webui/pull/255
- Enhanced TodoWrite display with visual todo list by @sugyan in https://github.com/sugyan/claude-code-webui/pull/259
- chore: update @anthropic-ai/claude-code dependency to 1.0.98 by @sugyan in https://github.com/sugyan/claude-code-webui/pull/260
- docs: optimize CLAUDE.md for better performance by @sugyan in https://github.com/sugyan/claude-code-webui/pull/261

## [0.1.48](https://github.com/sugyan/claude-code-webui/compare/0.1.47...0.1.48) - 2025-08-26
- remove: Select New Directory option from project selector by @sugyan in https://github.com/sugyan/claude-code-webui/pull/241
- Update demo video of README.md by @sugyan in https://github.com/sugyan/claude-code-webui/pull/248
- Add keyboard shortcut for permission mode cycling by @sugyan in https://github.com/sugyan/claude-code-webui/pull/253
- Add unified settings page with theme and enter behavior integration by @sugyan in https://github.com/sugyan/claude-code-webui/pull/254

## [0.1.47](https://github.com/sugyan/claude-code-webui/compare/0.1.46...0.1.47) - 2025-08-22
- fix: improve error handling when Claude CLI path detection fails by @sugyan in https://github.com/sugyan/claude-code-webui/pull/235
- feat: implement always-visible permission mode toggle UI by @sugyan in https://github.com/sugyan/claude-code-webui/pull/237
- feat: implement comprehensive plan mode testing (#137) by @sugyan in https://github.com/sugyan/claude-code-webui/pull/238
- docs: add Permission Mode feature documentation by @sugyan in https://github.com/sugyan/claude-code-webui/pull/239

## [0.1.46](https://github.com/sugyan/claude-code-webui/compare/0.1.45...0.1.46) - 2025-08-13
- feat: implement LogTape logging system for debug log control by @sugyan in https://github.com/sugyan/claude-code-webui/pull/220
- feat: simplify runtime abstraction using Node.js standard modules by @sugyan in https://github.com/sugyan/claude-code-webui/pull/223
- feat: add permission mode support and unify localStorage management (#132) by @sugyan in https://github.com/sugyan/claude-code-webui/pull/226
- feat: Backend Permission Mode Support by @sugyan in https://github.com/sugyan/claude-code-webui/pull/227
- fix: improve logger output by removing emojis and excessive indentation by @sugyan in https://github.com/sugyan/claude-code-webui/pull/229
- feat: complete ExitPlanMode implementation with UI integration by @sugyan in https://github.com/sugyan/claude-code-webui/pull/230
- feat: implement session-scoped permission mode state management by @sugyan in https://github.com/sugyan/claude-code-webui/pull/232
- fix: parse JSON theme value from localStorage in index.html by @sugyan in https://github.com/sugyan/claude-code-webui/pull/233
- feat: update @anthropic-ai/claude-code dependency to 1.0.77 by @sugyan in https://github.com/sugyan/claude-code-webui/pull/234

## [0.1.45](https://github.com/sugyan/claude-code-webui/compare/0.1.44...0.1.45) - 2025-07-31
- feat: make demo page available only in development mode by @sugyan in https://github.com/sugyan/claude-code-webui/pull/217
- fix: add Windows .cmd parsing fallback for node.exe colocated environments by @sugyan in https://github.com/sugyan/claude-code-webui/pull/219

## [0.1.44](https://github.com/sugyan/claude-code-webui/compare/0.1.43...0.1.44) - 2025-07-27
- fix: use absolute URLs for README images to properly display on npm by @sugyan in https://github.com/sugyan/claude-code-webui/pull/215

## [0.1.43](https://github.com/sugyan/claude-code-webui/compare/0.1.42...0.1.43) - 2025-07-27
- Update video URL of README.md by @sugyan in https://github.com/sugyan/claude-code-webui/pull/212
- fix: include images in npm package for README display by @sugyan in https://github.com/sugyan/claude-code-webui/pull/214

## [0.1.42](https://github.com/sugyan/claude-code-webui/compare/0.1.41...0.1.42) - 2025-07-27
- fix: include docs/ directory in npm package for README images by @sugyan in https://github.com/sugyan/claude-code-webui/pull/207
- fix: add permissions to demo-comparison workflow for issue creation by @sugyan in https://github.com/sugyan/claude-code-webui/pull/209
- chore: cleanup documentation and remove unused files by @sugyan in https://github.com/sugyan/claude-code-webui/pull/210

## [0.1.41](https://github.com/sugyan/claude-code-webui/compare/0.1.40...0.1.41) - 2025-07-26
- feat: replace blocking modal permission dialog with inline interface by @sugyan in https://github.com/sugyan/claude-code-webui/pull/203
- feat: add comprehensive README screenshots with optimized layout by @sugyan in https://github.com/sugyan/claude-code-webui/pull/205
- chore: update @anthropic-ai/claude-code to version 1.0.61 by @sugyan in https://github.com/sugyan/claude-code-webui/pull/206

## [0.1.40](https://github.com/sugyan/claude-code-webui/compare/0.1.39...0.1.40) - 2025-07-22
- feat: comprehensive Windows compatibility and configuration improvements by @sugyan in https://github.com/sugyan/claude-code-webui/pull/199
- feat: add comprehensive GitHub issue templates by @sugyan in https://github.com/sugyan/claude-code-webui/pull/202

## [0.1.39](https://github.com/sugyan/claude-code-webui/compare/0.1.38...0.1.39) - 2025-07-20
- feat: add Claude Code hooks for automatic prettier formatting by @sugyan in https://github.com/sugyan/claude-code-webui/pull/196
- feat: improve Windows path handling for cross-platform compatibility by @sugyan in https://github.com/sugyan/claude-code-webui/pull/198

## [0.1.38](https://github.com/sugyan/claude-code-webui/compare/0.1.37...0.1.38) - 2025-07-19
- Change version option from -V to -v to match Claude CLI by @sugyan in https://github.com/sugyan/claude-code-webui/pull/189
- feat: add comprehensive Windows support by @sugyan in https://github.com/sugyan/claude-code-webui/pull/193
- fix: resolve asdf shim paths for Claude Code SDK compatibility by @sugyan in https://github.com/sugyan/claude-code-webui/pull/191
- feat: Universal Claude CLI path detection with detectClaudeCliPath by @sugyan in https://github.com/sugyan/claude-code-webui/pull/194
- feat: simplify Node.js runtime with Hono v1.17.0 absolute path support by @sugyan in https://github.com/sugyan/claude-code-webui/pull/195

## [0.1.37](https://github.com/sugyan/claude-code-webui/compare/0.1.36...0.1.37) - 2025-07-14
- docs: improve npm installation documentation and badge layout by @sugyan in https://github.com/sugyan/claude-code-webui/pull/184
- feat: add Windows support for Claude Code WebUI by @sugyan in https://github.com/sugyan/claude-code-webui/pull/186
- docs: update CLAUDE.md to reflect current implementation by @sugyan in https://github.com/sugyan/claude-code-webui/pull/187

## [0.1.36](https://github.com/sugyan/claude-code-webui/compare/0.1.35...0.1.36) - 2025-07-13
- feature: Add Enter behavior toggle feature for chat input by @xiaocang in https://github.com/sugyan/claude-code-webui/pull/173
- feat: implement dual linting strategy for backend with Deno/ESLint by @sugyan in https://github.com/sugyan/claude-code-webui/pull/182

## [0.1.35](https://github.com/sugyan/claude-code-webui/compare/0.1.34...0.1.35) - 2025-07-12
- fix: resolve static path for npm global installation by @sugyan in https://github.com/sugyan/claude-code-webui/pull/177
- fix: add prepack script to include README and LICENSE in npm package by @sugyan in https://github.com/sugyan/claude-code-webui/pull/180

## [0.1.34](https://github.com/sugyan/claude-code-webui/compare/0.1.33...0.1.34) - 2025-07-12
- fix: add shebang to CLI entry point for npm global installation by @sugyan in https://github.com/sugyan/claude-code-webui/pull/175
- fix: added copy frontend before deno compile. by @xiaocang in https://github.com/sugyan/claude-code-webui/pull/174

## [0.1.33](https://github.com/sugyan/claude-code-webui/compare/0.1.32...0.1.33) - 2025-07-11
- fix: unify backend testing to use npm run test by @sugyan in https://github.com/sugyan/claude-code-webui/pull/169

## [0.1.32](https://github.com/sugyan/claude-code-webui/compare/0.1.31...0.1.32) - 2025-07-11
- fix: remove redundant version consistency check from npm publishing workflow by @sugyan in https://github.com/sugyan/claude-code-webui/pull/167

## [0.1.31](https://github.com/sugyan/claude-code-webui/compare/0.1.30...0.1.31) - 2025-07-11
- docs: add --claude-path option to README by @sugyan in https://github.com/sugyan/claude-code-webui/pull/164
- feat: add CI/CD npm publishing automation by @sugyan in https://github.com/sugyan/claude-code-webui/pull/166

## [0.1.30](https://github.com/sugyan/claude-code-webui/compare/0.1.29...0.1.30) - 2025-07-11
- chore: update @anthropic-ai/claude-code to version 1.0.48 by @sugyan in https://github.com/sugyan/claude-code-webui/pull/160
- feat: add --claude-path CLI option with optimized path resolution by @sugyan in https://github.com/sugyan/claude-code-webui/pull/162

## [0.1.29](https://github.com/sugyan/claude-code-webui/compare/0.1.28...0.1.29) - 2025-07-11
- fix: update release workflow to trigger on tags without v prefix by @sugyan in https://github.com/sugyan/claude-code-webui/pull/158

## [0.1.28](https://github.com/sugyan/claude-code-webui/compare/v0.1.28...0.1.28) - 2025-07-11
- feat: implement npm package configuration and TypeScript build setup by @sugyan in https://github.com/sugyan/claude-code-webui/pull/153
- fix: unify static file paths across Deno and Node.js builds by @sugyan in https://github.com/sugyan/claude-code-webui/pull/157

## [v0.1.28](https://github.com/sugyan/claude-code-webui/compare/v0.1.27...v0.1.28) - 2025-07-10
- Add Node.js CLI entry point and runtime support by @sugyan in https://github.com/sugyan/claude-code-webui/pull/144
- Remove runtime branches by abstracting static file serving and path resolution by @sugyan in https://github.com/sugyan/claude-code-webui/pull/146
- fix: resolve permission dialog crash and improve bash builtin handling (#147) by @sugyan in https://github.com/sugyan/claude-code-webui/pull/148

## [v0.1.27](https://github.com/sugyan/claude-code-webui/compare/v0.1.26...v0.1.27) - 2025-07-09
- fix: update release workflow to resolve build failures by @sugyan in https://github.com/sugyan/claude-code-webui/pull/142

## [v0.1.26](https://github.com/sugyan/claude-code-webui/compare/v0.1.25...v0.1.26) - 2025-07-09
- fix: replace unreliable FedericoCarboni/setup-ffmpeg with apt-get install by @sugyan in https://github.com/sugyan/claude-code-webui/pull/121
- docs: update documentation to reflect current implementation by @sugyan in https://github.com/sugyan/claude-code-webui/pull/123
- feat: implement runtime abstraction layer and CLI modernization for backend (Phase 1-5) by @sugyan in https://github.com/sugyan/claude-code-webui/pull/125
- feat: implement Node.js runtime implementation by @sugyan in https://github.com/sugyan/claude-code-webui/pull/139
- fix: resolve compound command permission loop in issue #140 by @sugyan in https://github.com/sugyan/claude-code-webui/pull/141

## [v0.1.25](https://github.com/sugyan/claude-code-webui/compare/v0.1.24...v0.1.25) - 2025-07-04
- Fix compatibility with migrate-installer bash wrapper by @nichiki in https://github.com/sugyan/claude-code-webui/pull/116

## [v0.1.24](https://github.com/sugyan/claude-code-webui/compare/v0.1.23...v0.1.24) - 2025-07-03
- fix: prevent infinite loop in useChatState hook causing demo page crash by @sugyan in https://github.com/sugyan/claude-code-webui/pull/118

## [v0.1.23](https://github.com/sugyan/claude-code-webui/compare/v0.1.22...v0.1.23) - 2025-07-03
- 🔧 Remove unnecessary apt-get update in demo-comparison workflow by @sugyan in https://github.com/sugyan/claude-code-webui/pull/98
- feat: implement conversation history listing API by @sugyan in https://github.com/sugyan/claude-code-webui/pull/105
- feat: implement conversation detail retrieval API (Issue #104) by @sugyan in https://github.com/sugyan/claude-code-webui/pull/107
- refactor: extract endpoint handlers from main.ts for better maintainability by @sugyan in https://github.com/sugyan/claude-code-webui/pull/109
- feat: add history list route and navigation from ChatPage by @sugyan in https://github.com/sugyan/claude-code-webui/pull/114
- feat: enable ChatPage to load and display conversation history by @sugyan in https://github.com/sugyan/claude-code-webui/pull/115
- fix: complete navigation flow and UX improvements for history feature (Issue #113) by @sugyan in https://github.com/sugyan/claude-code-webui/pull/117

## [v0.1.22](https://github.com/sugyan/claude-code-webui/compare/v0.1.21...v0.1.22) - 2025-06-25
- Improve README with modern design and better organization by @sugyan in https://github.com/sugyan/claude-code-webui/pull/93
- Migrate backend CLI from manual parsing to Cliffy framework by @sugyan in https://github.com/sugyan/claude-code-webui/pull/95
- Update Claude Code dependency to v1.0.33 and unify version management by @sugyan in https://github.com/sugyan/claude-code-webui/pull/96
- Fix demo comparison algorithm to use SSIM by @sugyan in https://github.com/sugyan/claude-code-webui/pull/97

## [v0.1.21](https://github.com/sugyan/claude-code-webui/compare/v0.1.20...v0.1.21) - 2025-06-23
- Add --host option to enable network binding by @sugyan in https://github.com/sugyan/claude-code-webui/pull/89
- Fix SPA routing fallback for direct URL access in binary mode by @sugyan in https://github.com/sugyan/claude-code-webui/pull/91
- Update chat message labels and loading animation by @sugyan in https://github.com/sugyan/claude-code-webui/pull/92

## [v0.1.20](https://github.com/sugyan/claude-code-webui/compare/v0.1.19...v0.1.20) - 2025-06-23
- Implement flexible API port configuration (fixes #78) by @sugyan in https://github.com/sugyan/claude-code-webui/pull/87

## [v0.1.19](https://github.com/sugyan/claude-code-webui/compare/v0.1.18...v0.1.19) - 2025-06-22
- Remove branches restriction and increase threshold for demo comparison by @sugyan in https://github.com/sugyan/claude-code-webui/pull/85

## [v0.1.18](https://github.com/sugyan/claude-code-webui/compare/v0.1.17...v0.1.18) - 2025-06-22
- Fix demo comparison workflow timing and URL extraction issues by @sugyan in https://github.com/sugyan/claude-code-webui/pull/83

## [v0.1.17](https://github.com/sugyan/claude-code-webui/compare/v0.1.16...v0.1.17) - 2025-06-22
- Fix demo comparison workflow and release pipeline issues by @sugyan in https://github.com/sugyan/claude-code-webui/pull/81

## [v0.1.16](https://github.com/sugyan/claude-code-webui/compare/v0.1.15...v0.1.16) - 2025-06-22
- Add Lefthook for automated code quality enforcement by @sugyan in https://github.com/sugyan/claude-code-webui/pull/74
- Add Playwright demo recording automation with dark mode support by @sugyan in https://github.com/sugyan/claude-code-webui/pull/77
- Implement automated demo recording CI/CD pipeline (closes #68) by @sugyan in https://github.com/sugyan/claude-code-webui/pull/80

## [v0.1.15](https://github.com/sugyan/claude-code-webui/compare/v0.1.14...v0.1.15) - 2025-06-19
- Update claude-code dependency to 1.0.27 by @sugyan in https://github.com/sugyan/claude-code-webui/pull/60
- Add DemoPage component with mock response system (#63) by @sugyan in https://github.com/sugyan/claude-code-webui/pull/69
- Implement demo automation hook and typing animations by @sugyan in https://github.com/sugyan/claude-code-webui/pull/70
- Fix demo permission dialogs and add visual feedback by @sugyan in https://github.com/sugyan/claude-code-webui/pull/71
- Fix IME composition Enter key triggering unintended message submission by @sugyan in https://github.com/sugyan/claude-code-webui/pull/73

## [v0.1.14](https://github.com/sugyan/claude-code-webui/compare/v0.1.13...v0.1.14) - 2025-06-18
- Refactor frontend with modular architecture for improved maintainability by @sugyan in https://github.com/sugyan/claude-code-webui/pull/56
- Add project directory selection feature by @sugyan in https://github.com/sugyan/claude-code-webui/pull/59

## [v0.1.13](https://github.com/sugyan/claude-code-webui/compare/v0.1.12...v0.1.13) - 2025-06-17
- feat: add abort functionality for streaming responses by @sugyan in https://github.com/sugyan/claude-code-webui/pull/51
- Add permission handling for tool usage with user dialog by @sugyan in https://github.com/sugyan/claude-code-webui/pull/54

## [v0.1.12](https://github.com/sugyan/claude-code-webui/compare/v0.1.11...v0.1.12) - 2025-06-15
- feat: Show 'Claude Code initialized' message only once per session by @sugyan in https://github.com/sugyan/claude-code-webui/pull/42
- feat: Add timestamps to chat messages by @sugyan in https://github.com/sugyan/claude-code-webui/pull/44
- feat: simplify system messages with collapsible details by @sugyan in https://github.com/sugyan/claude-code-webui/pull/46
- Improve tool message display: simplify tool_use and add tool_result support by @sugyan in https://github.com/sugyan/claude-code-webui/pull/48
- chore: Update README.md by @sugyan in https://github.com/sugyan/claude-code-webui/pull/49

## [v0.1.11](https://github.com/sugyan/claude-code-webui/compare/v0.1.10...v0.1.11) - 2025-06-14
- Remove Windows support since @anthropic-ai/claude-code doesn't support Windows by @sugyan in https://github.com/sugyan/claude-code-webui/pull/40

## [v0.1.10](https://github.com/sugyan/claude-code-webui/compare/v0.1.9...v0.1.10) - 2025-06-14
- Fix streaming state bug and update backend dependencies by @sugyan in https://github.com/sugyan/claude-code-webui/pull/35
- feat: replace custom Claude types with official SDK types and optimize serialization by @sugyan in https://github.com/sugyan/claude-code-webui/pull/37
- feat: implement session continuity using Claude Code SDK resume functionality by @sugyan in https://github.com/sugyan/claude-code-webui/pull/39

## [v0.1.9](https://github.com/sugyan/claude-code-webui/compare/v0.1.8...v0.1.9) - 2025-06-14
- Replace CLI subprocess approach with Claude Code SDK by @sugyan in https://github.com/sugyan/claude-code-webui/pull/19
- Format config files with Prettier for consistency by @sugyan in https://github.com/sugyan/claude-code-webui/pull/22
- Update documentation to reflect Claude Code SDK usage by @sugyan in https://github.com/sugyan/claude-code-webui/pull/28
- Implement auto-scroll to bottom for new messages by @sugyan in https://github.com/sugyan/claude-code-webui/pull/27
- Implement bottom-to-top message flow layout by @sugyan in https://github.com/sugyan/claude-code-webui/pull/31
- Add debug mode to backend with --debug flag and DEBUG environment variable support by @sugyan in https://github.com/sugyan/claude-code-webui/pull/33

## [v0.1.8](https://github.com/sugyan/claude-code-webui/compare/v0.1.7...v0.1.8) - 2025-06-13
- Implement multiline input with Shift+Enter support by @sugyan in https://github.com/sugyan/claude-code-webui/pull/12
- Implement message layout redesign with left/right alignment and chat bubbles by @sugyan in https://github.com/sugyan/claude-code-webui/pull/15
- Fix documentation discrepancies and add security warnings by @sugyan in https://github.com/sugyan/claude-code-webui/pull/16

## [v0.1.7](https://github.com/sugyan/claude-code-webui/compare/v0.1.6...v0.1.7) - 2025-06-12
- Fix Windows build failure by replacing symlink with file copy by @sugyan in https://github.com/sugyan/claude-code-webui/pull/8

## [v0.1.6](https://github.com/sugyan/claude-code-webui/compare/v0.1.5...v0.1.6) - 2025-06-12
- Fix binary resource bundling and update binary naming by @sugyan in https://github.com/sugyan/claude-code-webui/pull/6

## [v0.1.5](https://github.com/sugyan/claude-code-webui/compare/v0.1.4...v0.1.5) - 2025-06-12
- Fix tagpr workflow to use GH_PAT for checkout by @sugyan in https://github.com/sugyan/claude-code-webui/pull/4

## [v0.1.4](https://github.com/sugyan/claude-code-webui/compare/v0.1.3...v0.1.4) - 2025-06-12
- Add changelog and pull request workflow by @sugyan in https://github.com/sugyan/claude-code-webui/pull/1
- Add tagpr integration for automated release PRs by @sugyan in https://github.com/sugyan/claude-code-webui/pull/2

## [Unreleased]

### Added

- Pull request based development workflow
- Changelog tracking for better release management
- tagpr integration for automated release PR generation
- Repository ruleset for branch protection
- Dynamic version reading from VERSION file in --version command

### Changed

- Release process now uses PRs with automated version management
- VERSION file moved to backend/ directory for better integration

## [0.1.3] - 2025-06-11

### Added

- True single binary distribution with embedded frontend assets
- Command line interface with `--port`, `--help`, `--version` options
- Startup validation to check Claude CLI availability
- Cross-platform automated releases for Linux (x64/ARM64), macOS (x64/ARM64), Windows (x64)
- GitHub Actions workflow for automated releases on git tags
- Comprehensive documentation for installation and usage

### Changed

- Migrated from basic HTTP handler to Hono framework for better middleware support
- Frontend assets are now bundled into the binary for self-contained execution
- Updated release workflow to use softprops/action-gh-release@v2 with proper permissions

### Fixed

- Windows build issues in GitHub Actions (PowerShell multiline command parsing)
- Release workflow permissions (added `contents: write`)
- Test warnings and errors by mocking fetch API
- TypeScript lint errors in test files

## [0.1.0] - 2025-06-11

### Added

- Initial web-based interface for Claude CLI tool
- Real-time streaming response display
- React frontend with TailwindCSS styling
- Deno backend with TypeScript
- Support for different Claude message types (system, assistant, result)
- Dark/light theme toggle
- Comprehensive test suite with Vitest and Testing Library
- CI/CD pipeline with GitHub Actions

### Technical Details

- Backend serves on port 8080 (configurable)
- Frontend serves on port 3000 in development
- Uses WebSocket-like streaming for real-time responses
- Executes `claude --output-format stream-json --verbose -p <message>`
- Cross-platform support (Linux, macOS, Windows)

[Unreleased]: https://github.com/sugyan/claude-code-webui/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/sugyan/claude-code-webui/compare/v0.1.0...v0.1.3
[0.1.0]: https://github.com/sugyan/claude-code-webui/releases/tag/v0.1.0
