#!/bin/bash
#
# Qwen Code Web UI - Offline Package Uninstaller
# Removes the installed binary and service from the system
#
# Usage:
#   sudo ./uninstall.sh              # Basic uninstall
#   sudo ./uninstall.sh --all        # Full cleanup including config
#   sudo ./uninstall.sh --firewall   # Also remove firewall rules
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Default values
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/qwen-code-webui"
SERVICE_NAME="qwen-code-webui"
REMOVE_FIREWALL=false
REMOVE_CONFIG=false
PORT=""

# Detected OS and firewall info
OS_TYPE=""
FIREWALL_TYPE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            REMOVE_CONFIG=true
            REMOVE_FIREWALL=true
            shift
            ;;
        --firewall)
            REMOVE_FIREWALL=true
            shift
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --all             Remove everything including config and firewall rules"
            echo "  --firewall        Remove firewall rules"
            echo "  --port <port>     Port to remove firewall rule for (default: 3000)"
            echo "  -h, --help        Show this help message"
            echo ""
            echo "Default behavior:"
            echo "  - Stop and remove service"
            echo "  - Remove binary from $INSTALL_DIR"
            echo "  - Keep configuration directory"
            echo "  - Keep firewall rules"
            echo ""
            echo "Examples:"
            echo "  $0                      # Basic uninstall"
            echo "  $0 --all                # Full cleanup"
            echo "  $0 --firewall --port 8080  # Remove firewall rule for port 8080"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# ============================================
# Helper Functions
# ============================================

print_header() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                                          ║${NC}"
    echo -e "${BLUE}║    ${BOLD}Qwen Code Web UI - Uninstaller${NC}         ${BLUE}║${NC}"
    echo -e "${BLUE}║                                          ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "\n${CYAN}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}  $1${NC}"
}

# ============================================
# System Detection
# ============================================

detect_system() {
    case "$(uname -s)" in
        Darwin*)
            OS_TYPE="macos"
            ;;
        Linux*)
            OS_TYPE="linux"
            ;;
        *)
            print_error "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac
}

# ============================================
# Firewall Detection and Removal
# ============================================

detect_firewall() {
    case "$OS_TYPE" in
        macos)
            detect_firewall_macos
            ;;
        linux)
            detect_firewall_linux
            ;;
    esac
}

detect_firewall_macos() {
    # Check if pf is configured
    if [ -f "/etc/pf.anchors/qwen-code-webui" ]; then
        FIREWALL_TYPE="pf"
        return
    fi

    # Check Application Firewall
    local fw_status
    fw_status=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null || echo "disabled")
    if echo "$fw_status" | grep -qi "enabled"; then
        FIREWALL_TYPE="socketfilterfw"
    else
        FIREWALL_TYPE="none"
    fi
}

detect_firewall_linux() {
    # Check for ufw (Ubuntu/Debian)
    if command -v ufw > /dev/null 2>&1 && ufw status 2>/dev/null | grep -qi "active"; then
        FIREWALL_TYPE="ufw"
        return
    fi

    # Check for firewalld (CentOS/RHEL/Fedora)
    if command -v firewall-cmd > /dev/null 2>&1 && systemctl is-active firewalld > /dev/null 2>&1; then
        FIREWALL_TYPE="firewalld"
        return
    fi

    # Check for iptables
    if command -v iptables > /dev/null 2>&1 && [ "$(iptables -S 2>/dev/null | grep -c 'ACCEPT\|DROP\|REJECT' || echo 0)" -gt 3 ]; then
        FIREWALL_TYPE="iptables"
        return
    fi

    # Check for nftables
    if command -v nft > /dev/null 2>&1 && nft list ruleset 2>/dev/null | grep -q "chain"; then
        FIREWALL_TYPE="nftables"
        return
    fi

    FIREWALL_TYPE="none"
}

remove_firewall_port() {
    local port=$1
    local proto=${2:-tcp}

    print_info "Removing firewall rule for port $port..."

    case "$FIREWALL_TYPE" in
        ufw)
            if ufw status 2>/dev/null | grep -q "$port/$proto"; then
                sudo ufw delete allow "$port/$proto"
                print_success "UFW rule removed for port $port"
            else
                print_info "No UFW rule found for port $port"
            fi
            ;;
        firewalld)
            if firewall-cmd --list-ports 2>/dev/null | grep -q "$port/$proto"; then
                sudo firewall-cmd --permanent --remove-port="$port/$proto"
                sudo firewall-cmd --remove-port="$port/$proto"
                print_success "firewalld rule removed for port $port"
            else
                print_info "No firewalld rule found for port $port"
            fi
            ;;
        iptables)
            if iptables -L INPUT -n 2>/dev/null | grep -q "dpt:$port"; then
                sudo iptables -D INPUT -p $proto --dport $port -m state --state NEW -j ACCEPT 2>/dev/null || true
                print_success "iptables rule removed for port $port"
            else
                print_info "No iptables rule found for port $port"
            fi
            ;;
        pf)
            local custom_conf="/etc/pf.anchors/qwen-code-webui"
            if [ -f "$custom_conf" ]; then
                sudo rm -f "$custom_conf"
                sudo pfctl -ef /etc/pf.conf 2>/dev/null || true
                print_success "pf rule removed"
            else
                print_info "No pf rule file found"
            fi
            ;;
        socketfilterfw)
            print_info "macOS Application Firewall uses application-based rules"
            print_info "Rules will be removed automatically when the app is removed"
            ;;
        *)
            print_info "No firewall configured or firewall is inactive"
            ;;
    esac
}

# ============================================
# Service Management
# ============================================

stop_service() {
    print_step "Stopping service..."

    case "$OS_TYPE" in
        linux)
            if systemctl is-active --quiet $SERVICE_NAME 2>/dev/null; then
                systemctl stop $SERVICE_NAME
                print_success "Service stopped"
            else
                print_info "Service is not running"
            fi
            ;;
        macos)
            local plist_path="$HOME/Library/LaunchAgents/com.qwen-code-webui.plist"
            if launchctl list | grep -q "com.qwen-code-webui"; then
                launchctl unload "$plist_path" 2>/dev/null || true
                print_success "Service stopped"
            else
                print_info "Service is not running"
            fi
            ;;
    esac
}

disable_service() {
    print_step "Disabling service..."

    case "$OS_TYPE" in
        linux)
            if systemctl is-enabled --quiet $SERVICE_NAME 2>/dev/null; then
                systemctl disable $SERVICE_NAME
                print_success "Service disabled"
            fi
            ;;
        macos)
            # launchd services are disabled by unloading
            print_info "Service disabled"
            ;;
    esac
}

remove_service_files() {
    print_step "Removing service files..."

    case "$OS_TYPE" in
        linux)
            if [ -f "/etc/systemd/system/$SERVICE_NAME.service" ]; then
                rm -f "/etc/systemd/system/$SERVICE_NAME.service"
                systemctl daemon-reload
                print_success "Systemd service file removed"
            else
                print_info "No systemd service file found"
            fi
            ;;
        macos)
            local plist_path="$HOME/Library/LaunchAgents/com.qwen-code-webui.plist"
            if [ -f "$plist_path" ]; then
                rm -f "$plist_path"
                print_success "Launchd plist removed"
            else
                print_info "No launchd plist found"
            fi
            ;;
    esac
}

# ============================================
# Binary and Config Removal
# ============================================

remove_binary() {
    print_step "Removing binary..."

    if [ -f "$INSTALL_DIR/$SERVICE_NAME" ]; then
        rm -f "$INSTALL_DIR/$SERVICE_NAME"
        print_success "Binary removed from $INSTALL_DIR"
    else
        print_info "No binary found at $INSTALL_DIR/$SERVICE_NAME"
    fi
}

remove_config() {
    print_step "Removing configuration..."

    if [ -d "$CONFIG_DIR" ]; then
        rm -rf "$CONFIG_DIR"
        print_success "Configuration directory removed"
    else
        print_info "No configuration directory found"
    fi
}

# ============================================
# Permission Check
# ============================================

check_permissions() {
    if [ "$OS_TYPE" = "linux" ] && [ "$(id -u)" -ne 0 ]; then
        print_error "This script must be run as root on Linux"
        print_info "Try: sudo $0"
        exit 1
    fi

    if [ "$OS_TYPE" = "macos" ]; then
        # Check if we need sudo for /usr/local/bin
        if [ ! -w "$INSTALL_DIR" ] && [ "$(id -u)" -ne 0 ]; then
            print_warning "Installation directory $INSTALL_DIR requires elevated permissions"
            print_info "You may be prompted for your password..."
            # Re-run with sudo
            exec sudo "$0" "$@"
        fi
    fi
}

# ============================================
# Main Uninstall
# ============================================

main() {
    # Detect system
    detect_system

    # Check permissions
    check_permissions "$@"

    print_header

    # Default port for firewall removal
    if [ -z "$PORT" ]; then
        PORT="3000"
    fi

    # Stop and disable service
    stop_service
    disable_service

    # Remove service files
    remove_service_files

    # Remove binary
    remove_binary

    # Remove config if requested
    if [ "$REMOVE_CONFIG" = true ]; then
        remove_config
    else
        print_step "Configuration..."
        print_info "Keeping configuration directory (use --all to remove)"
    fi

    # Remove firewall rules if requested
    if [ "$REMOVE_FIREWALL" = true ]; then
        detect_firewall
        remove_firewall_port "$PORT" "tcp"
    else
        print_step "Firewall rules..."
        print_info "Keeping firewall rules (use --firewall to remove)"
    fi

    # Print summary
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                          ║${NC}"
    echo -e "${GREEN}║         ${BOLD}Uninstall Complete!${NC}                ${GREEN}║${NC}"
    echo -e "${GREEN}║                                          ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "  ${BOLD}Summary:${NC}"
    echo -e "    Removed: service, binary"
    if [ "$REMOVE_CONFIG" = true ]; then
        echo -e "    Removed: configuration directory"
    else
        echo -e "    Kept:    configuration directory"
    fi
    if [ "$REMOVE_FIREWALL" = true ]; then
        echo -e "    Removed: firewall rule for port $PORT"
    else
        echo -e "    Kept:    firewall rules"
    fi

    echo ""
    echo -e "  ${BLUE}Reinstall:${NC} Run the install.sh script from the package"
    echo ""
}

main "$@"