# Qwen Code Web UI 改造项目分析文档

> 文档版本: 1.0  
> 创建日期: 2026-03-15  
> 项目目标: 将 Claude Code Web UI 改造为 Qwen Code Web UI

---

## 目录

1. [项目目标](#1-项目目标)
2. [已有项目分析](#2-已有项目分析)
   - 2.1 [Claude Code Web UI (当前项目)](#21-claude-code-web-ui-当前项目)
   - 2.2 [Qwen Code 项目](#22-qwen-code-项目)
3. [技术架构对比](#3-技术架构对比)
4. [关键技术点](#4-关键技术点)
   - 4.1 [SDK 对比](#41-sdk-对比)
   - 4.2 [消息格式对比](#42-消息格式对比)
   - 4.3 [工具系统对比](#43-工具系统对比)
   - 4.4 [权限模式对比](#44-权限模式对比)
5. [改造方案](#5-改造方案)
   - 5.1 [后端改造](#51-后端改造)
   - 5.2 [前端改造](#52-前端改造)
   - 5.3 [共享类型改造](#53-共享类型改造)
   - 5.4 [配置和文档更新](#54-配置和文档更新)
6. [潜在问题与风险](#6-潜在问题与风险)
7. [未来建议](#7-未来建议)
8. [附录](#8-附录)

---

## 1. 项目目标

### 1.1 核心目标

将现有的 **Claude Code Web UI** 项目改造为 **Qwen Code Web UI**，实现以下目标：

1. **保持现有 UI 风格** - 保留现有的聊天界面设计、交互体验和视觉风格
2. **切换 AI 后端** - 从 Claude Code SDK 切换到 Qwen Code SDK
3. **功能对齐** - 确保核心功能（聊天、工具调用、会话管理、权限控制）正常工作
4. **最小改动** - 在保证功能的前提下，最小化代码改动量

### 1.2 预期成果

- 一个可独立运行的 Web 应用，通过浏览器访问 Qwen Code
- 支持实时流式响应
- 支持项目目录选择
- 支持会话历史管理
- 支持工具权限控制
- 支持深色/浅色主题

---

## 2. 已有项目分析

### 2.1 Claude Code Web UI (当前项目)

#### 2.1.1 项目概述

Claude Code Web UI 是一个现代化的 Web 界面，用于 Claude Code CLI 工具。它将命令行交互转换为直观的 Web 聊天界面，支持实时流式响应。

#### 2.1.2 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 后端运行时 | Deno / Node.js | Deno 2.x / Node.js 20+ |
| 后端框架 | Hono | ^4.8.5 |
| 前端框架 | React | ^19.1.0 |
| 构建工具 | Vite | ^7.1.6 |
| 样式方案 | TailwindCSS | ^4.1.13 |
| 类型系统 | TypeScript | ~5.8.3 |
| 测试框架 | Vitest | ^3.2.4 |
| AI SDK | @anthropic-ai/claude-code | 1.0.108 |

#### 2.1.3 项目结构

```
claude-code-webui/
├── backend/              # 后端服务
│   ├── cli/             # CLI 入口点
│   ├── handlers/        # API 路由处理器
│   │   ├── chat.ts      # 核心：聊天消息处理
│   │   ├── projects.ts  # 项目目录列表
│   │   ├── histories.ts # 会话历史
│   │   ├── conversations.ts
│   │   └── abort.ts     # 请求中止
│   ├── runtime/         # 运行时抽象层
│   ├── history/         # 历史记录处理
│   ├── middleware/      # HTTP 中间件
│   ├── utils/           # 工具模块
│   ├── app.ts           # 应用入口
│   └── types.ts         # 后端类型定义
│
├── frontend/            # 前端应用
│   ├── src/
│   │   ├── components/  # UI 组件
│   │   │   ├── chat/    # 聊天相关组件
│   │   │   ├── messages/# 消息显示组件
│   │   │   └── settings/# 设置组件
│   │   ├── hooks/       # 自定义 Hooks
│   │   │   ├── streaming/   # 流式处理
│   │   │   │   ├── useStreamParser.ts
│   │   │   │   └── useMessageProcessor.ts
│   │   │   ├── chat/    # 聊天状态管理
│   │   │   └── useClaudeStreaming.ts
│   │   ├── config/      # API 配置
│   │   ├── utils/       # 工具函数
│   │   ├── types/       # 类型定义
│   │   └── contexts/    # React Context
│   └── package.json
│
├── shared/              # 共享类型
│   └── types.ts         # 通用接口定义
│
└── Makefile             # 构建命令
```

#### 2.1.4 核心数据流

```
用户输入 → ChatPage.tsx → POST /api/chat
                              ↓
                    handlers/chat.ts
                              ↓
                    @anthropic-ai/claude-code query()
                              ↓
                    流式 JSON 响应 (NDJSON)
                              ↓
                    useStreamParser.ts 解析
                              ↓
                    UnifiedMessageProcessor 处理
                              ↓
                    UI 渲染更新
```

#### 2.1.5 关键 API 接口

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/projects` | 获取可用项目目录 |
| POST | `/api/chat` | 发送聊天消息（流式响应） |
| POST | `/api/abort/:requestId` | 中止正在进行的请求 |
| GET | `/api/projects/:name/histories` | 获取会话历史列表 |
| GET | `/api/projects/:name/histories/:sessionId` | 获取特定会话 |

#### 2.1.6 消息类型定义

```typescript
// shared/types.ts
export interface StreamResponse {
  type: "claude_json" | "error" | "done" | "aborted";
  data?: unknown; // SDKMessage 对象
  error?: string;
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
  requestId: string;
  allowedTools?: string[];
  workingDirectory?: string;
  permissionMode?: "default" | "plan" | "acceptEdits";
}
```

---

### 2.2 Qwen Code 项目

#### 2.2.1 项目概述

Qwen Code 是一个开源的终端 AI 代理，针对 Qwen3-Coder 模型优化。它基于 Google Gemini CLI 开发，针对 Qwen-Coder 模型进行了适配。

#### 2.2.2 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | >=20.0.0 |
| 语言 | TypeScript | 5.3+ |
| 包管理 | npm workspaces | - |
| 构建工具 | esbuild | ^0.25.0 |
| 测试框架 | Vitest | ^3.2.4 |
| UI 框架 | Ink (React for CLI) | - |
| React 版本 | React | 19.x |

#### 2.2.3 项目结构

```
qwen-code/
├── packages/
│   ├── cli/              # CLI 主入口
│   ├── core/             # 核心逻辑和工具实现
│   │   ├── src/
│   │   │   ├── tools/    # 工具系统
│   │   │   ├── models/   # 模型配置
│   │   │   ├── services/ # 服务层
│   │   │   ├── mcp/      # MCP 实现
│   │   │   └── prompts/  # 提示词
│   │   └── index.ts
│   ├── sdk-typescript/   # TypeScript SDK ⭐
│   │   ├── src/
│   │   │   ├── query/    # query() API
│   │   │   ├── types/    # 类型定义
│   │   │   ├── mcp/      # MCP 支持
│   │   │   └── transport/# 传输层
│   │   └── package.json
│   ├── webui/            # Web UI 组件库 ⭐
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ChatViewer/    # 聊天查看器
│   │   │   │   ├── messages/      # 消息组件
│   │   │   │   ├── toolcalls/     # 工具调用组件
│   │   │   │   └── layout/        # 布局组件
│   │   │   ├── hooks/
│   │   │   ├── context/
│   │   │   └── adapters/  # 数据适配器
│   │   └── package.json
│   ├── vscode-ide-companion/  # VS Code 扩展
│   └── zed-extension/         # Zed 编辑器扩展
│
├── integration-tests/    # 集成测试
├── docs/                 # 文档
└── scripts/              # 构建脚本
```

#### 2.2.4 SDK 核心特性

**@qwen-code/sdk** 提供以下能力：

1. **query() API** - 与 Claude Code SDK 类似的流式查询接口
2. **多认证支持** - Qwen OAuth、OpenAI 兼容 API、Anthropic、Gemini
3. **MCP 支持** - 内置 MCP 服务器支持
4. **权限控制** - 多种权限模式
5. **CLI 捆绑** - SDK 自带 CLI，无需单独安装

#### 2.2.5 WebUI 组件库特性

**@qwen-code/webui** 提供：

1. **ChatViewer** - 独立的聊天显示组件
2. **消息组件** - UserMessage、AssistantMessage、ThinkingMessage
3. **工具调用组件** - ReadToolCall、EditToolCall、ShellToolCall 等
4. **布局组件** - Header、Sidebar、InputForm 等
5. **平台抽象** - PlatformContext 支持多平台

---

## 3. 技术架构对比

### 3.1 整体架构对比

| 方面 | Claude Code Web UI | Qwen Code |
|------|-------------------|-----------|
| 后端运行时 | Deno / Node.js | Node.js |
| 后端框架 | Hono | 无（CLI 直接运行） |
| 前端框架 | React 19 | React 19 (Ink for CLI) |
| SDK | @anthropic-ai/claude-code | @qwen-code/sdk |
| 消息格式 | Claude SDK 消息格式 | Qwen SDK 消息格式（高度相似） |
| 流式传输 | NDJSON | NDJSON |
| 构建方式 | Deno compile / Vite | esbuild |

### 3.2 数据流对比

**Claude Code Web UI:**
```
Browser → Hono Server → Claude SDK → Claude API → 流式响应
```

**Qwen Code (CLI):**
```
Terminal → Ink UI → Qwen Core → Qwen/OpenAI API → 流式响应
```

**改造后的 Qwen Code Web UI:**
```
Browser → Hono Server → Qwen SDK → Qwen/OpenAI API → 流式响应
```

---

## 4. 关键技术点

### 4.1 SDK 对比

#### 4.1.1 Claude Code SDK

```typescript
import { query, type PermissionMode } from "@anthropic-ai/claude-code";

for await (const sdkMessage of query({
  prompt: "Hello",
  options: {
    abortController,
    pathToClaudeCodeExecutable: cliPath,
    cwd: workingDirectory,
    permissionMode: "default" | "plan" | "acceptEdits",
    allowedTools: ["read_file", "write_file"],
    resume: sessionId,
  },
})) {
  // sdkMessage 类型: SDKMessage
}
```

#### 4.1.2 Qwen Code SDK

```typescript
import { query, type PermissionMode } from "@qwen-code/sdk";

for await (const sdkMessage of query({
  prompt: "Hello",
  options: {
    abortController,
    pathToQwenExecutable: cliPath,
    cwd: workingDirectory,
    permissionMode: "default" | "plan" | "auto-edit" | "yolo",
    allowedTools: ["read_file", "write_file"],
    resume: sessionId,
    authType: "openai" | "qwen-oauth",
    model: "qwen3-coder-plus",
  },
})) {
  // sdkMessage 类型: SDKMessage (格式相似)
}
```

#### 4.1.3 主要差异

| 特性 | Claude SDK | Qwen SDK |
|------|-----------|----------|
| 可执行文件路径参数 | `pathToClaudeCodeExecutable` | `pathToQwenExecutable` |
| 权限模式值 | `acceptEdits` | `auto-edit` |
| 额外权限模式 | - | `yolo` (全部自动批准) |
| 认证类型 | 内置 | `authType` 参数 |
| 模型选择 | 内置 | `model` 参数 |
| CLI 捆绑 | 需单独安装 | SDK 自带 CLI |

### 4.2 消息格式对比

#### 4.2.1 Claude SDK 消息类型

```typescript
// 用户消息
interface SDKUserMessage {
  type: 'user';
  session_id: string;
  message: { role: 'user'; content: string | ContentBlock[] };
  parent_tool_use_id: string | null;
}

// 助手消息
interface SDKAssistantMessage {
  type: 'assistant';
  session_id: string;
  message: {
    id: string;
    role: 'assistant';
    model: string;
    content: ContentBlock[];
    stop_reason?: string;
    usage: Usage;
  };
  parent_tool_use_id: string | null;
}

// 系统消息
interface SDKSystemMessage {
  type: 'system';
  subtype: string;
  session_id: string;
  cwd?: string;
  tools?: string[];
  model?: string;
}

// 结果消息
interface SDKResultMessage {
  type: 'result';
  subtype: 'success' | 'error_during_execution' | 'error_max_turns';
  session_id: string;
  is_error: boolean;
  duration_ms: number;
  result?: string;
  usage: Usage;
}
```

#### 4.2.2 Qwen SDK 消息类型

```typescript
// 用户消息
interface SDKUserMessage {
  type: 'user';
  uuid?: string;
  session_id: string;
  message: { role: 'user'; content: string | ContentBlock[] };
  parent_tool_use_id: string | null;
  options?: Record<string, unknown>;
}

// 助手消息
interface SDKAssistantMessage {
  type: 'assistant';
  uuid: string;
  session_id: string;
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    model: string;
    content: ContentBlock[];
    stop_reason?: string | null;
    usage: Usage;
  };
  parent_tool_use_id: string | null;
}

// 系统消息
interface SDKSystemMessage {
  type: 'system';
  subtype: string;
  uuid: string;
  session_id: string;
  data?: unknown;
  cwd?: string;
  tools?: string[];
  mcp_servers?: Array<{ name: string; status: string }>;
  model?: string;
  permission_mode?: string;
  slash_commands?: string[];
  qwen_code_version?: string;
  agents?: string[];
  skills?: string[];
}

// 结果消息
interface SDKResultMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution';
  uuid: string;
  session_id: string;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result?: string;
  usage: ExtendedUsage;
  modelUsage?: Record<string, ModelUsage>;
  permission_denials: CLIPermissionDenial[];
}

// 流式事件消息 (Qwen 特有)
interface SDKPartialAssistantMessage {
  type: 'stream_event';
  uuid: string;
  session_id: string;
  event: StreamEvent;
  parent_tool_use_id: string | null;
}
```

#### 4.2.3 关键差异

| 方面 | Claude SDK | Qwen SDK |
|------|-----------|----------|
| UUID 字段 | 无 | 所有消息都有 `uuid` |
| 系统消息字段 | 基础字段 | 更多字段 (mcp_servers, skills, agents 等) |
| 结果消息 | 基础 usage | ExtendedUsage + modelUsage |
| 流式消息 | 无独立类型 | `SDKPartialAssistantMessage` |
| 权限拒绝 | 无 | `permission_denials` 数组 |

### 4.3 工具系统对比

#### 4.3.1 Claude Code 工具

| 工具名 | 功能 |
|--------|------|
| `read_file` | 读取文件 |
| `write_file` | 写入文件 |
| `edit` | 编辑文件 |
| `glob` | 文件模式匹配 |
| `grep` | 内容搜索 |
| `ls` | 列出目录 |
| `shell` | 执行 shell 命令 |
| `web_fetch` | 获取网页内容 |
| `task` | 子代理任务 |

#### 4.3.2 Qwen Code 工具

| 工具名 | 功能 | 对应 Claude 工具 |
|--------|------|-----------------|
| `read_file` | 读取文件 | `read_file` |
| `write_file` | 写入文件 | `write_file` |
| `edit` | 编辑文件 | `edit` |
| `glob` | 文件模式匹配 | `glob` |
| `grep` / `ripGrep` | 内容搜索 | `grep` |
| `ls` | 列出目录 | `ls` |
| `shell` | 执行 shell 命令 | `shell` |
| `web_fetch` | 获取网页内容 | `web_fetch` |
| `task` | 子代理任务 | `task` |
| `askUserQuestion` | 询问用户 | - |
| `todoWrite` | 待办事项 | - |
| `memoryTool` | 记忆存储 | - |
| `exitPlanMode` | 退出计划模式 | - |
| `mcp-client` | MCP 客户端 | - |
| `skill` | 技能调用 | - |
| `lsp` | LSP 集成 | - |

#### 4.3.3 工具调用格式

两者都使用类似的 `tool_use` 内容块格式：

```typescript
{
  type: 'tool_use',
  id: 'toolu_xxx',
  name: 'read_file',
  input: { path: '/path/to/file' }
}
```

### 4.4 权限模式对比

| 模式 | Claude SDK | Qwen SDK | 说明 |
|------|-----------|----------|------|
| 默认 | `default` | `default` | 写操作需要确认 |
| 计划模式 | `plan` | `plan` | 阻止写操作，先制定计划 |
| 自动编辑 | `acceptEdits` | `auto-edit` | 自动批准编辑操作 |
| 全自动 | - | `yolo` | 所有操作自动执行 |

---

## 5. 改造方案

### 5.1 后端改造

#### 5.1.1 依赖更新

**backend/deno.json:**
```json
{
  "imports": {
    // 移除
    // "@anthropic-ai/claude-code": "npm:@anthropic-ai/claude-code@1.0.108",
    
    // 添加
    "@qwen-code/sdk": "npm:@qwen-code/sdk@0.1.4"
  }
}
```

**backend/package.json:**
```json
{
  "dependencies": {
    // 移除
    // "@anthropic-ai/claude-code": "1.0.108",
    
    // 添加
    "@qwen-code/sdk": "^0.1.4"
  }
}
```

#### 5.1.2 handlers/chat.ts 改造

```typescript
// 之前
import { query, type PermissionMode } from "@anthropic-ai/claude-code";

// 之后
import { query, type PermissionMode } from "@qwen-code/sdk";

async function* executeClaudeCommand(
  message: string,
  requestId: string,
  requestAbortControllers: Map<string, AbortController>,
  cliPath: string,
  sessionId?: string,
  allowedTools?: string[],
  workingDirectory?: string,
  permissionMode?: PermissionMode,
): AsyncGenerator<StreamResponse> {
  // ... 

  for await (const sdkMessage of query({
    prompt: processedMessage,
    options: {
      abortController,
      // 参数名变更
      pathToQwenExecutable: cliPath,  // 之前是 pathToClaudeCodeExecutable
      cwd: workingDirectory,
      permissionMode: mapPermissionMode(permissionMode), // 需要映射
      allowedTools,
      resume: sessionId,
      // Qwen 特有选项
      authType: "openai", // 或从配置读取
    },
  })) {
    yield {
      type: "claude_json",
      data: sdkMessage,
    };
  }
}

// 权限模式映射
function mapPermissionMode(mode?: string): PermissionMode {
  switch (mode) {
    case "acceptEdits":
      return "auto-edit";
    default:
      return mode as PermissionMode;
  }
}
```

#### 5.1.3 CLI 路径检测

修改 CLI 检测逻辑，支持 `qwen` 命令：

```typescript
// 检测顺序
const possiblePaths = [
  // 环境变量
  process.env.QWEN_CODE_CLI_PATH,
  // Volta
  path.join(os.homedir(), '.volta/bin/qwen'),
  // npm global
  path.join(os.homedir(), '.npm-global/bin/qwen'),
  // 系统路径
  '/usr/local/bin/qwen',
  path.join(os.homedir(), '.local/bin/qwen'),
  // node_modules
  path.join(os.homedir(), 'node_modules/.bin/qwen'),
  // yarn
  path.join(os.homedir(), '.yarn/bin/qwen'),
];
```

### 5.2 前端改造

#### 5.2.1 类型定义更新

**frontend/src/types.ts:**

```typescript
// 从 Qwen SDK 导入类型
import type {
  SDKUserMessage,
  SDKAssistantMessage,
  SDKSystemMessage,
  SDKResultMessage,
  PermissionMode as SDKPermissionMode,
} from "@qwen-code/sdk";

// 权限模式类型更新
export type PermissionMode = "default" | "plan" | "auto-edit" | "yolo";

// 权限模式映射函数
export function toSDKPermissionMode(uiMode: PermissionMode): SDKPermissionMode {
  // Qwen SDK 直接支持这些值
  return uiMode as SDKPermissionMode;
}
```

#### 5.2.2 流式处理适配

**frontend/src/hooks/streaming/useStreamParser.ts:**

```typescript
import type { SDKMessage } from "@qwen-code/sdk";
import {
  isSDKUserMessage,
  isSDKAssistantMessage,
  isSDKSystemMessage,
  isSDKResultMessage,
  isSDKPartialAssistantMessage, // Qwen 特有
} from "@qwen-code/sdk";

const processClaudeData = useCallback(
  (claudeData: SDKMessage, context: StreamingContext) => {
    // 使用 Qwen SDK 的类型守卫
    if (isSDKPartialAssistantMessage(claudeData)) {
      // 处理流式事件
      processStreamEvent(claudeData, context);
      return;
    }
    
    // 其他消息类型处理逻辑基本相同
    // ...
  },
  []
);
```

#### 5.2.3 UI 文案更新

全局替换：
- `Claude Code Web UI` → `Qwen Code Web UI`
- `Claude Code` → `Qwen Code`
- `claude-code-webui` → `qwen-code-webui`

### 5.3 共享类型改造

**shared/types.ts:**

```typescript
// 权限模式更新
export type PermissionMode = "default" | "plan" | "auto-edit" | "yolo";

export interface ChatRequest {
  message: string;
  sessionId?: string;
  requestId: string;
  allowedTools?: string[];
  workingDirectory?: string;
  permissionMode?: PermissionMode;
  // Qwen 特有选项
  authType?: "openai" | "qwen-oauth" | "anthropic" | "gemini";
  model?: string;
}

export interface StreamResponse {
  type: "claude_json" | "error" | "done" | "aborted";
  data?: unknown; // Qwen SDKMessage
  error?: string;
}
```

### 5.4 配置和文档更新

#### 5.4.1 包名和版本

**package.json (根目录):**
```json
{
  "name": "qwen-code-webui",
  "version": "0.1.0",
  "description": "A modern web interface for Qwen Code CLI"
}
```

#### 5.4.2 文档更新

- `README.md` - 更新安装说明、认证方式、使用指南
- `QWEN.md` - 更新项目上下文文档
- `CLAUDE.md` - 重命名为 `QWEN_CODE.md` 或删除

---

## 6. 潜在问题与风险

### 6.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| SDK API 差异 | 中 | 详细对比 API，编写适配层 |
| 消息格式差异 | 低 | 消息格式高度相似，主要是额外字段 |
| 工具名称差异 | 低 | 大部分工具名称相同 |
| 流式处理差异 | 中 | Qwen 有额外的 `stream_event` 类型 |
| 认证流程差异 | 高 | Qwen OAuth 流程需要适配 |

### 6.2 功能风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 会话管理差异 | 中 | 测试 session_id 持久化 |
| 权限控制差异 | 低 | 映射权限模式值 |
| MCP 配置差异 | 中 | 对比 MCP 配置格式 |
| 历史记录格式 | 低 | 可能需要适配 |

### 6.3 运维风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Deno 兼容性 | 中 | 测试 Deno 运行时兼容性 |
| 构建流程变更 | 低 | 更新构建脚本 |
| 依赖冲突 | 低 | 检查依赖版本兼容性 |

### 6.4 需要特别关注的问题

1. **权限模式映射**
   - Claude 的 `acceptEdits` 对应 Qwen 的 `auto-edit`
   - Qwen 额外支持 `yolo` 模式

2. **流式事件处理**
   - Qwen SDK 有 `SDKPartialAssistantMessage` 类型
   - 需要处理 `stream_event` 类型的消息

3. **认证配置**
   - Qwen 支持多种认证方式
   - 需要在设置界面添加认证配置选项

4. **模型选择**
   - Qwen 支持多种模型
   - 需要添加模型选择功能

---

## 7. 未来建议

### 7.1 短期优化 (1-2 周)

1. **完成基础改造**
   - SDK 替换
   - 类型适配
   - 基础功能测试

2. **添加认证配置**
   - 支持 API Key 配置
   - 支持 Qwen OAuth

3. **添加模型选择**
   - 支持切换不同 Qwen 模型
   - 显示当前使用的模型

### 7.2 中期优化 (1-2 月)

1. **利用 Qwen WebUI 组件库**
   - 考虑集成 `@qwen-code/webui` 组件
   - 替换自定义的消息渲染组件

2. **增强工具调用显示**
   - 使用 Qwen WebUI 的工具调用组件
   - 更好的工具结果展示

3. **添加 Qwen 特有功能**
   - Skills 支持
   - Subagents 支持
   - Todo 列表显示

### 7.3 长期优化 (3+ 月)

1. **多语言支持**
   - 国际化 (i18n)
   - 中文界面支持

2. **性能优化**
   - 消息虚拟滚动
   - 大文件处理优化

3. **扩展功能**
   - VS Code 扩展集成
   - 移动端优化
   - 离线支持

### 7.4 架构建议

1. **考虑使用 Qwen WebUI 组件库**
   - `@qwen-code/webui` 提供了完整的 UI 组件
   - 可以减少维护成本
   - 保持与 Qwen Code 一致的 UI 风格

2. **抽象 AI 后端**
   - 创建统一的 AI 后端接口
   - 支持切换不同的 AI 提供商
   - 便于未来扩展

3. **配置管理优化**
   - 支持多配置文件
   - 环境变量覆盖
   - 配置验证

---

## 8. 附录

### 8.1 相关链接

- **Qwen Code GitHub**: https://github.com/QwenLM/qwen-code
- **Qwen Code 文档**: https://qwenlm.github.io/qwen-code-docs/
- **Qwen Code SDK**: https://www.npmjs.com/package/@qwen-code/sdk
- **Qwen Code WebUI**: https://www.npmjs.com/package/@qwen-code/webui
- **Claude Code Web UI**: https://github.com/sugyan/claude-code-webui

### 8.2 参考文档

- Qwen Code SDK README: `qwen-code-source/packages/sdk-typescript/README.md`
- Qwen Code WebUI README: `qwen-code-source/packages/webui/README.md`
- Qwen Code 项目文档: `qwen-code-source/QWEN.md`

### 8.3 版本信息

| 组件 | 当前版本 | 目标版本 |
|------|----------|----------|
| @qwen-code/sdk | - | 0.1.4 |
| @qwen-code/webui | - | 0.12.3 |
| React | 19.1.0 | 19.x (兼容) |
| Node.js | 20+ | 20+ (兼容) |
| TypeScript | 5.8.3 | 5.x (兼容) |

---

*文档结束*