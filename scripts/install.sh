#!/bin/bash
#
# Claude Code Web UI - Offline Installer
# Supports Linux (systemd) and macOS (launchd)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_msg() {
    echo -e "${2}${1}${NC}"
}

print_info() {
    print_msg "$1" "$BLUE"
}

print_success() {
    print_msg "$1" "$GREEN"
}

print_warning() {
    print_msg "$1" "$YELLOW"
}

print_error() {
    print_msg "$1" "$RED"
}

# Detect OS
OS=$(uname -s)
case $OS in
    Linux)
        OS_TYPE="linux"
        ;;
    Darwin)
        OS_TYPE="macos"
        ;;
    *)
        print_error "不支持的操作系统: $OS"
        exit 1
        ;;
esac

# Check if running as root (Linux) or with sudo (macOS)
if [ "$OS_TYPE" = "linux" ] && [ "$EUID" -ne 0 ]; then
    print_error "请使用 root 用户执行此脚本"
    exit 1
fi

if [ "$OS_TYPE" = "macos" ] && [ "$EUID" -ne 0 ]; then
    print_error "请使用 sudo 执行此脚本"
    exit 1
fi

# Get script directory (where the binary is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_info "=========================================="
print_info "  Claude Code Web UI 离线安装程序"
print_info "=========================================="
echo ""

# Detect system architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        if [ "$OS_TYPE" = "linux" ]; then
            BINARY_NAME="claude-code-webui-linux-x64"
        else
            BINARY_NAME="claude-code-webui-macos-x64"
        fi
        ;;
    aarch64|arm64)
        if [ "$OS_TYPE" = "linux" ]; then
            BINARY_NAME="claude-code-webui-linux-arm64"
        else
            BINARY_NAME="claude-code-webui-macos-arm64"
        fi
        ;;
    *)
        print_error "不支持的系统架构: $ARCH"
        exit 1
        ;;
esac

# Check if binary exists
BINARY_PATH="$SCRIPT_DIR/$BINARY_NAME"
if [ ! -f "$BINARY_PATH" ]; then
    print_error "找不到二进制文件: $BINARY_PATH"
    print_error "请确保压缩包中包含正确的二进制文件"
    exit 1
fi

print_success "检测到操作系统: $OS"
print_success "检测到系统架构: $ARCH"
print_success "找到二进制文件: $BINARY_NAME"
echo ""

# ============================================
# Interactive prompts
# ============================================

# Prompt for install user
echo ""
print_info "请输入运行服务的用户名"
if [ "$OS_TYPE" = "macos" ]; then
    # On macOS, default to current user
    CURRENT_USER=$(stat -f "%Su" /dev/console)
    read -p "用户名 [$CURRENT_USER]: " INSTALL_USER
    INSTALL_USER=${INSTALL_USER:-$CURRENT_USER}
else
    read -p "用户名 [claude-webui]: " INSTALL_USER
    INSTALL_USER=${INSTALL_USER:-claude-webui}
fi

# Prompt for install directory
echo ""
print_info "请输入安装目录"
if [ "$OS_TYPE" = "macos" ]; then
    read -p "安装目录 [/usr/local/claude-code-webui]: " INSTALL_DIR
    INSTALL_DIR=${INSTALL_DIR:-/usr/local/claude-code-webui}
else
    read -p "安装目录 [/opt/claude-code-webui]: " INSTALL_DIR
    INSTALL_DIR=${INSTALL_DIR:-/opt/claude-code-webui}
fi

# Warn about home directory installation on Linux with SELinux
if [ "$OS_TYPE" = "linux" ] && [[ "$INSTALL_DIR" == /home/* ]]; then
    if command -v getenforce &>/dev/null && [ "$(getenforce)" != "Disabled" ]; then
        print_warning "警告: 检测到 SELinux 已启用"
        print_warning "安装在 /home 目录下需要额外的 SELinux 配置"
        print_warning "建议使用默认目录 /opt/claude-code-webui 或 /usr/local/claude-code-webui"
        echo ""
        read -p "是否继续安装在 $INSTALL_DIR？[y/N]: " CONTINUE_HOME
        if [[ ! "$CONTINUE_HOME" =~ ^[Yy]$ ]]; then
            print_info "请重新运行脚本并选择其他安装目录"
            exit 0
        fi
    fi
fi

# Prompt for port
echo ""
print_info "请输入服务监听端口"
read -p "端口 [3000]: " PORT
PORT=${PORT:-3000}

# Validate port
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    print_error "无效的端口号: $PORT"
    exit 1
fi

# Prompt for host binding
echo ""
print_info "请输入监听地址（0.0.0.0 表示所有网卡，127.0.0.1 表示仅本机）"
read -p "监听地址 [0.0.0.0]: " HOST
HOST=${HOST:-0.0.0.0}

# Summary
echo ""
print_info "=========================================="
print_info "  安装配置确认"
print_info "=========================================="
echo ""
echo "  操作系统:    $OS"
echo "  服务用户:    $INSTALL_USER"
echo "  安装目录:    $INSTALL_DIR"
echo "  监听地址:    $HOST"
echo "  监听端口:    $PORT"
echo ""

read -p "确认以上配置？[Y/n]: " CONFIRM
CONFIRM=${CONFIRM:-Y}

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    print_warning "安装已取消"
    exit 0
fi

# ============================================
# Installation
# ============================================

echo ""
print_info "开始安装..."

# Create user if not exists (Linux only)
if [ "$OS_TYPE" = "linux" ]; then
    if ! id "$INSTALL_USER" &>/dev/null; then
        print_info "创建用户: $INSTALL_USER"
        useradd -r -s /bin/false "$INSTALL_USER"
        print_success "用户创建成功"
    else
        print_info "用户已存在: $INSTALL_USER"
    fi
fi

# Create install directory
print_info "创建安装目录: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Copy binary
print_info "复制二进制文件..."
cp "$BINARY_PATH" "$INSTALL_DIR/claude-code-webui"
chmod +x "$INSTALL_DIR/claude-code-webui"

# Set ownership
if [ "$OS_TYPE" = "linux" ]; then
    chown -R "$INSTALL_USER:$INSTALL_USER" "$INSTALL_DIR"
else
    chown -R "$INSTALL_USER:staff" "$INSTALL_DIR"
fi
print_success "文件安装完成"

# ============================================
# SELinux configuration (Linux only)
# ============================================

if [ "$OS_TYPE" = "linux" ]; then
    # Check if SELinux is enabled
    if command -v getenforce &>/dev/null && [ "$(getenforce)" != "Disabled" ]; then
        print_info "检测到 SELinux，正在配置上下文..."
        
        # For files in home directories, we need to change the context
        # to allow systemd to execute them
        if [[ "$INSTALL_DIR" == /home/* ]]; then
            # Change SELinux context to bin_t for executable
            semanage fcontext -a -t bin_t "$INSTALL_DIR/claude-code-webui" 2>/dev/null || true
            restorecon -v "$INSTALL_DIR/claude-code-webui" 2>/dev/null || true
            print_success "SELinux 上下文配置完成"
        fi
    fi
fi

# ============================================
# Detect Claude CLI path
# ============================================

print_info "检测 Claude CLI 路径..."

# Try to find claude CLI in various locations
CLAUDE_PATH=""
CLAUDE_SEARCH_PATHS=(
    "/usr/local/bin/claude"
    "/usr/bin/claude"
    "$HOME/.local/bin/claude"
    "$HOME/.npm-global/bin/claude"
    "$HOME/.volta/bin/claude"
    "$HOME/.asdf/shims/claude"
    "/home/$INSTALL_USER/.local/bin/claude"
    "/home/$INSTALL_USER/.npm-global/bin/claude"
    "/home/$INSTALL_USER/.volta/bin/claude"
    "/home/$INSTALL_USER/.asdf/shims/claude"
)

# First try which command
if command -v claude &>/dev/null; then
    CLAUDE_PATH=$(command -v claude)
    print_success "找到 Claude CLI: $CLAUDE_PATH"
else
    # Search in common locations
    for path in "${CLAUDE_SEARCH_PATHS[@]}"; do
        if [ -x "$path" ]; then
            CLAUDE_PATH="$path"
            print_success "找到 Claude CLI: $CLAUDE_PATH"
            break
        fi
    done
fi

if [ -z "$CLAUDE_PATH" ]; then
    print_warning "未找到 Claude CLI，服务可能无法正常启动"
    print_warning "请确保 Claude CLI 已安装并认证"
    print_warning "安装命令: npm install -g @anthropic-ai/claude-code"
    print_warning "认证命令: claude auth"
    echo ""
    read -p "是否继续安装？[y/N]: " CONTINUE_NO_CLAUDE
    if [[ ! "$CONTINUE_NO_CLAUDE" =~ ^[Yy]$ ]]; then
        print_info "安装已取消"
        exit 0
    fi
fi

# Build PATH environment variable for the service
# Include common paths where claude might be installed
SERVICE_PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if [ -n "$CLAUDE_PATH" ]; then
    CLAUDE_DIR=$(dirname "$CLAUDE_PATH")
    # Add claude directory to PATH if not already included
    if [[ ":$SERVICE_PATH:" != *":$CLAUDE_DIR:"* ]]; then
        SERVICE_PATH="$CLAUDE_DIR:$SERVICE_PATH"
    fi
fi
# Add common npm global bin paths
for dir in "/home/$INSTALL_USER/.local/bin" "/home/$INSTALL_USER/.npm-global/bin" "/home/$INSTALL_USER/.volta/bin" "/home/$INSTALL_USER/.asdf/shims"; do
    if [ -d "$dir" ] && [[ ":$SERVICE_PATH:" != *":$dir:"* ]]; then
        SERVICE_PATH="$dir:$SERVICE_PATH"
    fi
done

# ============================================
# Create service
# ============================================

if [ "$OS_TYPE" = "linux" ]; then
    # ============================================
    # Linux: Create systemd service
    # ============================================

    print_info "创建 systemd 服务..."

    SERVICE_FILE="/etc/systemd/system/claude-code-webui.service"

    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Claude Code Web UI
After=network.target

[Service]
Type=simple
User=$INSTALL_USER
Group=$INSTALL_USER
WorkingDirectory=$INSTALL_DIR
Environment="PATH=$SERVICE_PATH"
ExecStart=$INSTALL_DIR/claude-code-webui --host $HOST --port $PORT
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    
    print_success "systemd 服务文件创建成功"
    
    # Reload systemd
    print_info "重载 systemd 配置..."
    systemctl daemon-reload
    
    # Enable service
    print_info "启用开机自启..."
    systemctl enable claude-code-webui
    
else
    # ============================================
    # macOS: Create launchd service
    # ============================================

    print_info "创建 launchd 服务..."

    PLIST_FILE="/Library/LaunchDaemons/com.qwen-code-webui.plist"

    cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.qwen-code-webui</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/claude-code-webui</string>
        <string>--host</string>
        <string>$HOST</string>
        <string>--port</string>
        <string>$PORT</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$SERVICE_PATH</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/claude-code-webui.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/claude-code-webui.log</string>
    <key>UserName</key>
    <string>$INSTALL_USER</string>
</dict>
</plist>
EOF

    # Set proper permissions
    chmod 644 "$PLIST_FILE"
    chown root:wheel "$PLIST_FILE"

    print_success "launchd 服务文件创建成功"
fi

# ============================================
# Firewall configuration
# ============================================

echo ""
print_info "配置防火墙..."

if [ "$OS_TYPE" = "linux" ]; then
    # Try firewalld first
    if command -v firewall-cmd &>/dev/null && systemctl is-active firewalld &>/dev/null; then
        print_info "检测到 firewalld，正在配置..."
        firewall-cmd --permanent --add-port="$PORT/tcp"
        firewall-cmd --reload
        print_success "firewalld 配置完成"
    # Try ufw
    elif command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
        print_info "检测到 ufw，正在配置..."
        ufw allow "$PORT/tcp"
        print_success "ufw 配置完成"
    # Try iptables
    elif command -v iptables &>/dev/null; then
        print_info "检测到 iptables，正在配置..."
        iptables -I INPUT -p tcp --dport "$PORT" -j ACCEPT
        if command -v iptables-save &>/dev/null; then
            iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
        fi
        print_success "iptables 配置完成"
    else
        print_warning "未检测到活动的防火墙，跳过防火墙配置"
    fi
else
    # macOS firewall (pf)
    if command -v pfctl &>/dev/null; then
        print_info "配置 macOS 防火墙..."
        # Add anchor rule for the port
        echo "pass in proto tcp from any to any port $PORT" | pfctl -ef - 2>/dev/null || true
        print_success "防火墙配置完成"
    else
        print_warning "未检测到 pf 防火墙，跳过防火墙配置"
    fi
fi

# ============================================
# Start service
# ============================================

echo ""
print_info "启动服务..."

if [ "$OS_TYPE" = "linux" ]; then
    systemctl start claude-code-webui
    sleep 2

    if systemctl is-active --quiet claude-code-webui; then
        print_success "服务启动成功"
    else
        print_error "服务启动失败，请检查日志:"
        journalctl -u claude-code-webui --no-pager -n 20
        
        # Provide SELinux troubleshooting hints
        if command -v getenforce &>/dev/null && [ "$(getenforce)" != "Disabled" ]; then
            if [[ "$INSTALL_DIR" == /home/* ]]; then
                echo ""
                print_warning "SELinux 故障排查:"
                print_warning "检测到安装在 /home 目录下且 SELinux 已启用"
                echo "  1. 检查 SELinux 上下文:"
                echo "     ls -Z $INSTALL_DIR/claude-code-webui"
                echo "  2. 手动修复 SELinux 上下文:"
                echo "     semanage fcontext -a -t bin_t '$INSTALL_DIR/claude-code-webui'"
                echo "     restorecon -v '$INSTALL_DIR/claude-code-webui'"
                echo "  3. 或临时禁用 SELinux 进行测试:"
                echo "     setenforce 0"
                echo "  4. 查看 SELinux 拒绝日志:"
                echo "     ausearch -m avc -ts recent | grep claude-code-webui"
            fi
        fi
        exit 1
    fi
else
    launchctl load -w "$PLIST_FILE"
    sleep 2
    
    if launchctl list | grep -q "com.qwen-code-webui"; then
        print_success "服务启动成功"
    else
        print_error "服务启动失败，请检查日志:"
        tail -20 /var/log/claude-code-webui.log
        exit 1
    fi
fi

# ============================================
# Get server IP
# ============================================

if [ "$OS_TYPE" = "linux" ]; then
    SERVER_IP=$(hostname -I | awk '{print $1}')
else
    SERVER_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
fi

if [ -z "$SERVER_IP" ]; then
    SERVER_IP="<服务器IP>"
fi

# ============================================
# Final message
# ============================================

echo ""
print_success "=========================================="
print_success "  安装完成！"
print_success "=========================================="
echo ""

if [ "$OS_TYPE" = "linux" ]; then
    print_info "服务状态:"
    echo "  systemctl status claude-code-webui"
    echo ""
    print_info "查看日志:"
    echo "  journalctl -u claude-code-webui -f"
    echo ""
    print_info "停止服务:"
    echo "  systemctl stop claude-code-webui"
    echo ""
    print_info "重启服务:"
    echo "  systemctl restart claude-code-webui"
    echo ""
    print_info "卸载服务:"
    echo "  systemctl disable --now claude-code-webui"
    echo "  rm -rf $INSTALL_DIR /etc/systemd/system/claude-code-webui.service"
    echo "  systemctl daemon-reload"
else
    print_info "服务状态:"
    echo "  sudo launchctl list | grep claude-code-webui"
    echo ""
    print_info "查看日志:"
    echo "  tail -f /var/log/claude-code-webui.log"
    echo ""
    print_info "停止服务:"
    echo "  sudo launchctl unload -w $PLIST_FILE"
    echo ""
    print_info "重启服务:"
    echo "  sudo launchctl unload -w $PLIST_FILE && sudo launchctl load -w $PLIST_FILE"
    echo ""
    print_info "卸载服务:"
    echo "  sudo launchctl unload -w $PLIST_FILE"
    echo "  sudo rm -rf $INSTALL_DIR $PLIST_FILE"
fi

echo ""
print_success "=========================================="
print_success "  访问地址"
print_success "=========================================="
echo ""
echo "  本机访问:    http://127.0.0.1:$PORT"
echo "  局域网访问:  http://$SERVER_IP:$PORT"
echo ""
print_warning "注意: 请确保 Claude CLI 已安装并认证"
print_warning "安装命令: npm install -g @anthropic-ai/claude-code"
print_warning "认证命令: claude auth"
echo ""