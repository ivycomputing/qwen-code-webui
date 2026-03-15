# Qwen Code Web UI - Project Context

## Project Overview

**Qwen Code Web UI** is a modern web-based interface for the Qwen Code CLI tool. It transforms command-line interactions into an intuitive web chat interface with real-time streaming responses, making Qwen Code accessible from any device with a browser (including mobile).

### Key Technologies

- **Backend**: Deno/Node.js + TypeScript + Hono framework
- **Frontend**: React 19 + Vite + TypeScript + TailwindCSS + React Router
- **Shared**: TypeScript type definitions
- **Build**: Deno compile for single binary distribution
- **Testing**: Vitest + Testing Library (frontend) + Deno test (backend)
- **AI SDK**: @qwen-code/sdk

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Browser (Frontend)                   │
│              React + Vite + TailwindCSS + SWC               │
│                    Port: 3000 (dev)                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP API
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Backend Server                            │
│              Deno/Node.js + Hono + TypeScript               │
│                    Port: 8080 (default)                     │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Qwen CLI Integration                                  │  │
│  │  - Stream JSON output from Qwen Code SDK               │  │
│  │  - Session management & continuity                    │  │
│  │  - Tool permission handling                           │  │
│  │  - Project directory selection                        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Core Features

- **Real-time streaming responses** - Live Qwen Code output in chat interface
- **Project directory selection** - Visual project picker for context-aware sessions
- **Conversation history** - Browse and restore previous chat sessions
- **Tool permission management** - Granular control over Qwen's tool access
- **Dark/light theme support** - Automatic system preference detection
- **Mobile-responsive design** - Touch-optimized interface
- **Permission mode switching** - Toggle between normal, plan, auto-edit, and yolo modes
- **Single binary distribution** - Self-contained executable

## Project Structure

```
qwen-code-webui/
├── backend/              # Server application
│   ├── cli/             # Entry points (deno.ts, node.ts, args.ts, validation.ts)
│   ├── handlers/        # API route handlers (chat, projects, histories, abort)
│   ├── runtime/         # Runtime abstraction layer (Deno/Node.js)
│   ├── history/         # History processing utilities
│   ├── middleware/      # HTTP middleware (CORS, logging, etc.)
│   ├── utils/           # Utility modules (logger.ts)
│   ├── tests/           # Backend test files
│   ├── scripts/         # Build and packaging scripts
│   ├── app.ts           # Main application entry
│   ├── types.ts         # Backend-specific types
│   ├── deno.json        # Deno configuration & tasks
│   ├── package.json     # Node.js dependencies
│   └── tsconfig.json    # TypeScript configuration
│
├── frontend/            # React application
│   ├── src/
│   │   ├── config/      # API configuration
│   │   ├── utils/       # Utilities and constants
│   │   ├── hooks/       # Custom hooks (streaming, theme, chat state)
│   │   ├── components/  # UI components (chat, messages, dialogs)
│   │   ├── types/       # Frontend type definitions
│   │   └── contexts/    # React contexts
│   ├── tests/           # Frontend test files
│   ├── scripts/         # Demo recording & screenshot scripts
│   ├── index.html       # HTML entry point
│   ├── vite.config.ts   # Vite configuration
│   └── package.json     # Dependencies & scripts
│
├── shared/              # Shared TypeScript types
│   └── types.ts         # Common interfaces (StreamResponse, ChatRequest, etc.)
│
├── docs/                # Documentation and assets
├── .github/             # GitHub workflows & templates
├── Makefile             # Unified build & quality commands
└── README.md            # User-facing documentation
```

## Building and Running

### Prerequisites

- ✅ **Qwen CLI** installed and authenticated
- ✅ **Node.js >=20.0.0** (for development)
- ✅ **Deno** (for backend development)

### Quick Start (Production)

```bash
# Install via npm
npm install -g qwen-code-webui

# Run the server
qwen-code-webui

# Access at http://localhost:8080
```

### Development Mode

```bash
# Terminal 1 - Backend (Node.js)
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

**Access**: Frontend http://localhost:3000, Backend http://localhost:8080

### Port Configuration

Create `.env` file in project root:
```bash
PORT=9000
```

## Development Commands

### Quality Checks (Run Before Commit)

```bash
# Run all quality checks (format, lint, typecheck, test, build)
make check

# Individual checks
make format          # Format both frontend and backend
make lint            # Lint both
make typecheck       # Type check both
make test            # Test both
```

## API Reference

### Backend Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List available project directories |
| POST | `/api/chat` | Send chat message with streaming response |
| POST | `/api/abort/:requestId` | Abort ongoing request |
| GET | `/api/projects/:encodedProjectName/histories` | List conversation histories |
| GET | `/api/projects/:encodedProjectName/histories/:sessionId` | Get specific conversation |

### Request/Response Types

See `shared/types.ts` for detailed interfaces:
- `ChatRequest` - Message, sessionId, requestId, allowedTools, workingDirectory, permissionMode
- `StreamResponse` - type (claude_json/error/done/aborted), data, error
- `ProjectInfo` - path, encodedName
- `ConversationSummary` - sessionId, startTime, lastTime, messageCount, lastMessagePreview
- `ConversationHistory` - sessionId, messages, metadata

## Qwen Code SDK Integration

The backend uses `@qwen-code/sdk` to execute commands:

```typescript
// Key options
import { query } from "@qwen-code/sdk";

for await (const sdkMessage of query({
  prompt: message,
  options: {
    pathToQwenExecutable: cliPath,
    cwd: workingDirectory,
    permissionMode: "default" | "plan" | "auto-edit" | "yolo",
    allowedTools: [...],
    resume: sessionId,
  },
})) {
  // Process SDK message
}
```

### Message Types

- **system**: Initialization message with `cwd` field
- **assistant**: Response content with nested `message.content` array
- **result**: Execution summary with `subtype` field
- **stream_event**: Partial/streaming messages (Qwen SDK specific)

### Session Management

1. First message starts new Qwen session
2. Frontend extracts `session_id` from SDK messages
3. Subsequent messages include `session_id` for context
4. Backend passes `session_id` to SDK via `options.resume`

## Permission Modes

Qwen Code Web UI supports the following permission modes:

| Mode | Description |
|------|-------------|
| `default` | Write operations require confirmation |
| `plan` | Blocks write operations, AI presents a plan first |
| `auto-edit` | Auto-approve edit operations (edit, write_file) |
| `yolo` | All operations execute automatically without confirmation |

## Configuration

### Qwen Code Settings

Qwen Code stores settings in `~/.qwen/settings.json`. Example configuration:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "env": {
    "DASHSCOPE_API_KEY": "sk-xxxxxxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

## Security Considerations

- **No built-in authentication** - Designed for local/single-user use
- **Local execution** - Qwen CLI runs locally, no external servers
- **Network exposure** - Configurable via `--host 0.0.0.0` but use with caution
- **File access** - Qwen can read/write files in selected project directories

**Best Practice**: Use default localhost binding for local development. Only expose to network on trusted networks.

## Related Documentation

- **README.md**: User-facing documentation with quick start
- **QWEN_WEBUI_ANALYSIS.md**: Detailed project analysis and migration notes
- **CHANGELOG.md**: Version history and release notes

## Important Notes

1. **Always run from project root** - Use full paths for cd commands
2. **Quality checks** - Run `make check` before every commit
3. **Testing** - Add tests for new features or bug fixes
4. **Documentation** - Update README for user-facing changes