# 🌐 Qwen Code Web UI

[![npm Version](https://img.shields.io/npm/v/qwen-code-webui)](https://www.npmjs.com/package/qwen-code-webui)
[![License](https://img.shields.io/github/license/richardhuang/qwen-code-webui)](https://github.com/richardhuang/qwen-code-webui/blob/main/LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/richardhuang/qwen-code-webui)](https://github.com/richardhuang/qwen-code-webui/releases)

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
git clone https://github.com/richardhuang/qwen-code-webui.git
cd qwen-code-webui

# Backend (choose one)
cd backend && npm run dev      # Node.js runtime

# Frontend (new terminal)
cd frontend && npm run dev

# Open browser to http://localhost:3000
```

### Prerequisites

- ✅ **Qwen CLI** installed and authenticated ([Get it here](https://github.com/QwenLM/qwen-code))
- ✅ **Node.js >=20.0.0** (for npm installation)
- ✅ **Modern browser** (Chrome, Firefox, Safari, Edge)

---

## ⚙️ CLI Options

The backend server supports the following command-line options:

| Option                 | Description                                               | Default     |
| ---------------------- | --------------------------------------------------------- | ----------- |
| `-p, --port <port>`    | Port to listen on                                         | 8080        |
| `--host <host>`        | Host address to bind to (use 0.0.0.0 for all interfaces)  | 127.0.0.1   |
| `--qwen-path <path>`   | Path to qwen executable (overrides automatic detection)   | Auto-detect |
| `-d, --debug`          | Enable debug mode                                         | false       |
| `-h, --help`           | Show help message                                         | -           |
| `-v, --version`        | Show version                                              | -           |

### Environment Variables

- `PORT` - Same as `--port`
- `DEBUG` - Same as `--debug`

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
```

---

## 🚨 Troubleshooting

### Qwen CLI Path Detection Issues

If you encounter errors, this typically indicates Qwen CLI path detection failure.

**Quick Solution:**

```bash
qwen-code-webui --qwen-path "$(which qwen)"
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
git clone https://github.com/richardhuang/qwen-code-webui.git
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

---

## ❓ FAQ

<details>
<summary><strong>Q: Do I need Qwen API access?</strong></summary>

Yes, you need the Qwen CLI tool installed and authenticated. The web UI is a frontend for the existing Qwen CLI.

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

[⭐ Star this repo](https://github.com/richardhuang/qwen-code-webui) • [🐛 Report issues](https://github.com/richardhuang/qwen-code-webui/issues)

</div>