# 🌐 Qwen Code Web UI

[![npm Version](https://img.shields.io/npm/v/qwen-code-webui)](https://www.npmjs.com/package/qwen-code-webui)
[![License](https://img.shields.io/github/license/ivycomputing/qwen-code-webui)](https://github.com/ivycomputing/qwen-code-webui/blob/main/LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/ivycomputing/qwen-code-webui)](https://github.com/ivycomputing/qwen-code-webui/releases)

> **A modern web interface for Qwen Code CLI** - Transform your command-line coding experience into an intuitive web-based chat interface

## 📱 Screenshots

<div align="center">

| Desktop Interface | Mobile Experience |
| ----------------- | ----------------- |
| Chat-based coding interface with instant responses and ready input field | Mobile-optimized chat experience with touch-friendly design |

</div>

---

## 📑 Table of Contents

- [✨ Why Qwen Code Web UI?](#-why-qwen-code-web-ui)
- [🚀 Quick Start](#-quick-start)
- [⚙️ CLI Options](#️-cli-options)
- [🚨 Troubleshooting](#-troubleshooting)
- [🔧 Development](#-development)
- [🔒 Security Considerations](#-security-considerations)
- [❓ FAQ](#-faq)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## ✨ Why Qwen Code Web UI?

**Transform the way you interact with Qwen Code**

Instead of being limited to command-line interactions, Qwen Code Web UI brings you:

| CLI Experience                | Web UI Experience            |
| ----------------------------- | ---------------------------- |
| ⌨️ Terminal only              | 🌐 Any device with a browser |
| 📱 Desktop bound              | 📱 Mobile-friendly interface |
| 📝 Plain text output          | 🎨 Rich formatted responses  |
| 🗂️ Manual directory switching | 📁 Visual project selection  |

### 🎯 Key Features

- **📋 Permission Mode Switching** - Toggle between normal, plan, auto-edit, and yolo modes
- **🔄 Real-time streaming responses** - Live Qwen Code output in chat interface
- **📁 Project directory selection** - Visual project picker for context-aware sessions
- **💬 Conversation history** - Browse and restore previous chat sessions
- **🛠️ Tool permission management** - Granular control over Qwen's tool access
- **🎨 Dark/light theme support** - Automatic system preference detection
- **📱 Mobile-responsive design** - Touch-optimized interface for any device

---

## 🚀 Quick Start

Get up and running in under 2 minutes:

### Option 1: npm Package (Recommended)

```bash
# Install globally via npm
npm install -g qwen-code-webui

# Start the server
qwen-code-webui

# Open browser to http://localhost:8080
```

### Option 2: Development Mode

```bash
# Clone repository
git clone https://github.com/ivycomputing/qwen-code-webui.git
cd qwen-code-webui

# Backend (choose one)
cd backend && npm run dev      # Node.js runtime

# Frontend (new terminal)
cd frontend && npm run dev

# Open browser to http://localhost:3000
```

### Prerequisites

- ✅ **Qwen CLI** installed and authenticated ([Get it here](https://github.com/QwenLM/qwen-code)) — recommended. If no `qwen` is found in PATH, the WebUI falls back to the CLI bundled with `@qwen-code/sdk` and logs a warning
- ✅ **Node.js >=20.0.0** (for npm installation)
- ✅ **Modern browser** (Chrome, Firefox, Safari, Edge)

**CLI version compatibility:** the tested range is `0.17.0` – `0.24.6`. At startup the WebUI logs the CLI path and version it will actually use; versions below the minimum get a warning (some features such as model-proxy delegation may silently misbehave), and newer versions are noted as unverified. Prefer keeping your installed CLI up to date (`npm install -g @qwen-code/qwen-code`) — the WebUI deliberately uses your installed CLI rather than the SDK-bundled one so the terminal and WebUI share the same version, credentials, and settings.

---

## ⚙️ CLI Options

The backend server supports the following command-line options:

| Option                 | Description                                               | Default     |
| ---------------------- | --------------------------------------------------------- | ----------- |
| `-p, --port <port>`    | Port to listen on                                         | 8080        |
| `--host <host>`        | Host address to bind to (use 0.0.0.0 for all interfaces)  | 127.0.0.1   |
| `--qwen-path <path>`   | Path to qwen executable (overrides automatic detection), or `bundled` to use the CLI bundled with `@qwen-code/sdk` | Auto-detect |
| `-d, --debug`          | Enable debug mode                                         | false       |
| `-h, --help`           | Show help message                                         | -           |
| `-v, --version`        | Show version                                              | -           |

### Environment Variables

- `PORT` - Same as `--port`
- `DEBUG` - Same as `--debug`
- `TOKEN_TTL_SECONDS` - Token time-to-live (seconds) for Open-ACE integration. Defaults to `86400` (24 hours), matching the Open-ACE default. **This must match `OPENACE_WEBUI_TOKEN_TTL_SECONDS` in the Open-ACE backend**; a mismatch causes tokens to be rejected as expired by whichever side has the shorter TTL. Invalid values (non-numeric, `<= 0`) fall back to the default.

### Examples

```bash
# Default (localhost:8080)
qwen-code-webui

# Custom port
qwen-code-webui --port 3000

# Bind to all interfaces (accessible from network)
qwen-code-webui --host 0.0.0.0 --port 9000

# Enable debug mode
qwen-code-webui --debug

# Custom Qwen CLI path
qwen-code-webui --qwen-path /path/to/qwen

# Force the CLI bundled with @qwen-code/sdk
qwen-code-webui --qwen-path bundled
```

---

## 🚨 Troubleshooting

### Qwen CLI Path Detection Issues

If you encounter errors, this typically indicates Qwen CLI path detection failure.

When no `qwen` is found in PATH, the server falls back to the CLI bundled with `@qwen-code/sdk` (Node installations) and logs a warning; Deno single-binary builds require a host-installed CLI. You can also pick a CLI explicitly:

```bash
# Use your installed CLI at a known location
qwen-code-webui --qwen-path "$(which qwen)"

# Use the SDK-bundled CLI
qwen-code-webui --qwen-path bundled
```

**Debug Mode:**
Use `--debug` flag for detailed error information:

```bash
qwen-code-webui --debug
```

---

## 🔧 Development

### Setup

```bash
# Clone repository
git clone https://github.com/ivycomputing/qwen-code-webui.git
cd qwen-code-webui

# Install dependencies
cd backend && npm install
cd ../frontend && npm install
```

### Development Commands

```bash
# Start backend
cd backend && npm run dev

# Start frontend (new terminal)
cd frontend && npm run dev
```

### Keeping `@qwen-code/sdk` in sync (maintainers)

The SDK version has a single source of truth: `backend/package.json`. Deno
resolves it from there (`backend/deno.json` deliberately does not pin it), so:

- Dependabot opens weekly npm bumps for `/backend`; after merging one, run
  `deno install` in `backend/` to refresh `deno.lock`. Note: `deno install`
  rewrites `backend/node_modules` into Deno's symlink layout; run `npm ci` in
  `backend/` afterwards if you need npm's canonical layout back.
- CI (`sdk-version-sync` job, `backend/scripts/check-sdk-version-sync.js`)
  fails the PR if `package-lock.json` and `deno.lock` disagree.
- The bundled-CLI fallback and `--qwen-path bundled` use the CLI shipped
  inside the SDK, so a SDK bump also moves the fallback CLI version — update
  `MAX_TESTED_CLI_VERSION` in `backend/cli/validation.ts` **and the `qwenCode`
  metadata in `backend/package.json`** (a test enforces they stay in sync).
  Downstream consumers such as open-ace read that metadata via
  `npm view qwen-code-webui qwenCode` to derive the tested CLI pair.

---

## 🔒 Security Considerations

**Important**: This tool executes Qwen CLI locally and provides web access to it.

### ✅ Safe Usage Patterns

- **🏠 Local development**: Default localhost access
- **📱 Personal network**: LAN access from your own devices

### ⚠️ Security Notes

- **No authentication**: Currently no built-in auth mechanism
- **System access**: Qwen can read/write files in selected projects
- **Network exposure**: Configurable but requires careful consideration
- **Open-ACE integration token lifetime**: In iframe-integrated mode the auth token is passed as a URL query parameter (`?token=...`) and is valid for `TOKEN_TTL_SECONDS` (24h by default). Because query parameters can leak via browser history, server logs, or `Referer` headers, a longer TTL widens the window during which a leaked token is usable. Prefer a shorter TTL in shared/sensitive deployments and ensure transport is HTTPS.

---

## ❓ FAQ

<details>
<summary><strong>Q: Do I need Qwen API access?</strong></summary>

You need the Qwen CLI tool installed and authenticated for the full experience — the web UI drives your installed CLI so both share credentials and settings. If no CLI is installed, the web UI falls back to the CLI bundled with `@qwen-code/sdk` (Node installations), but installing your own is recommended so you control the version.

</details>

<details>
<summary><strong>Q: Can I use this on mobile?</strong></summary>

Yes! The web interface is fully responsive and works great on mobile devices when connected to your local network.

</details>

<details>
<summary><strong>Q: Is my code safe?</strong></summary>

Yes, everything runs locally. No data is sent to external servers except Qwen's normal API calls through the CLI.

</details>

---

## 🤝 Contributing

We welcome contributions! Please feel free to:

- 🐛 Report bugs
- ✨ Suggest features
- 📝 Improve documentation
- 🔧 Submit pull requests

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Made with ❤️ for the Qwen Code community**

[⭐ Star this repo](https://github.com/ivycomputing/qwen-code-webui) • [🐛 Report issues](https://github.com/ivycomputing/qwen-code-webui/issues)

</div>