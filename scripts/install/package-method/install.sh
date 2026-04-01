#!/bin/bash
#
# Qwen Code Web UI - Offline Package Installer
# Installs the pre-built binary package on the target system
#
# Usage:
#   sudo ./install.sh              # Interactive mode
#   sudo ./install.sh -p 3000 -y   # Non-interactive mode
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
PORT="${PORT:-3000}"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/qwen-code-webui"
SERVICE_NAME="qwen-code-webui"
INTERACTIVE=true
CONFIGURE_FIREWALL=false
PROJECT_DIRS=""
SERVICE_USER=""

# Detected OS and firewall info
OS_TYPE=""
ARCH_TYPE=""
FIREWALL_TYPE=""
FIREWALL_ENABLED=false

# Get script directory (where the package is extracted)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--port)
            PORT="$2"
            INTERACTIVE=false
            shift 2
            ;;
        -y|--yes)
            INTERACTIVE=false
            shift
            ;;
        --firewall)
            CONFIGURE_FIREWALL=true
            shift
            ;;
        -d|--dirs)
            PROJECT_DIRS="$2"
            shift 2
            ;;
        -u|--user)
            SERVICE_USER="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -p, --port <port>    Port to listen on (default: 3000)"
            echo "  -y, --yes            Non-interactive mode, use defaults"
            echo "  --firewall           Configure firewall to allow the port"
            echo "  -d, --dirs <dirs>    Colon-separated list of project directories"
            echo "  -u, --user <user>    User to run the service as (default: SUDO_USER or current user)"
            echo "  -h, --help           Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  PORT                 Port to listen on (default: 3000)"
            echo "  PROJECT_DIRS         Colon-separated list of project directories"
            echo ""
            echo "Examples:"
            echo "  $0                              # Interactive mode"
            echo "  $0 -p 3000 -y                   # Non-interactive on port 3000"
            echo "  $0 -p 8080 --firewall           # Port 8080 with firewall config"
            echo "  PROJECT_DIRS=~/projects:~/work $0  # Mount project directories"
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
    echo -e "${BLUE}║    ${BOLD}Qwen Code Web UI - Installer${NC}           ${BLUE}║${NC}"
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

# Check if a port is in use
port_in_use() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1 2>/dev/null || netstat -an 2>/dev/null | grep -q ":$port "; then
        return 0
    fi
    return 1
}

# Find next available port
find_available_port() {
    local port=$1
    while port_in_use $port; do
        ((port++))
    done
    echo $port
}

# ============================================
# System Detection
# ============================================

detect_system() {
    print_step "Detecting system..."

    # Detect OS
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

    # Detect architecture
    case "$(uname -m)" in
        x86_64|amd64)
            ARCH_TYPE="x64"
            ;;
        aarch64|arm64)
            ARCH_TYPE="arm64"
            ;;
        *)
            print_error "Unsupported architecture: $(uname -m)"
            exit 1
            ;;
    esac

    print_success "Detected: $OS_TYPE $ARCH_TYPE"
}

# Find the binary for current platform
# Sets BINARY_PATH global variable and returns 0 on success, 1 on failure
find_binary() {
    local binary_name=""

    case "$OS_TYPE" in
        linux)
            binary_name="qwen-code-webui-linux-$ARCH_TYPE"
            ;;
        macos)
            binary_name="qwen-code-webui-macos-$ARCH_TYPE"
            ;;
    esac

    if [ -f "$SCRIPT_DIR/$binary_name" ]; then
        BINARY_PATH="$SCRIPT_DIR/$binary_name"
        return 0
    else
        print_error "Binary not found: $binary_name"
        print_info "Available binaries in package:"
        ls -la "$SCRIPT_DIR"/qwen-code-webui-* 2>/dev/null || echo "  None found"
        return 1
    fi
}

# ============================================
# Dependency Checks
# ============================================

check_dependencies() {
    print_step "Checking dependencies..."

    local missing=()

    # Check for Qwen CLI
    if ! command -v qwen &> /dev/null; then
        missing+=("qwen (Qwen CLI)")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        print_error "Missing required dependencies:"
        for dep in "${missing[@]}"; do
            echo -e "  ${RED}✗${NC} $dep"
        done
        echo ""
        echo -e "${YELLOW}Please install missing dependencies and try again.${NC}"
        echo ""
        echo "To install Qwen CLI:"
        echo "  npm install -g @anthropic-ai/qwen-code"
        echo ""
        echo "Or with Deno:"
        echo "  deno install -g jsr:@anthropic-ai/qwen-code"
        exit 1
    fi

    print_success "All dependencies satisfied"
}

# Check if running with appropriate permissions
check_permissions() {
    if [ "$OS_TYPE" = "linux" ] && [ "$(id -u)" -ne 0 ]; then
        print_error "This script must be run as root on Linux"
        print_info "Try: sudo $0"
        exit 1
    fi

    if [ "$OS_TYPE" = "macos" ]; then
        # On macOS, we need sudo for /usr/local/bin
        if [ ! -w "$INSTALL_DIR" ] && [ "$(id -u)" -ne 0 ]; then
            print_warning "Installation directory $INSTALL_DIR requires elevated permissions"
            print_info "You may be prompted for your password..."
            # Re-run with sudo
            exec sudo "$0" "$@"
        fi
    fi
}

# Determine the service user
# Priority: -u/--user > SUDO_USER > current user
determine_service_user() {
    if [ -n "$SERVICE_USER" ]; then
        # User specified via -u/--user argument
        if ! id "$SERVICE_USER" > /dev/null 2>&1; then
            print_error "User '$SERVICE_USER' does not exist"
            exit 1
        fi
        print_info "Service user: $SERVICE_USER (specified)"
        return
    fi

    # Try SUDO_USER first
    if [ -n "$SUDO_USER" ]; then
        SERVICE_USER="$SUDO_USER"
        print_info "Service user: $SERVICE_USER (from sudo)"
        return
    fi

    # Fall back to current user
    SERVICE_USER="$USER"
    if [ -z "$SERVICE_USER" ]; then
        SERVICE_USER=$(whoami)
    fi

    # If running as root without SUDO_USER, require -u option
    if [ "$SERVICE_USER" = "root" ]; then
        print_error "Running as root without SUDO_USER."
        print_info "Please specify a service user with -u option."
        print_info "Example: $0 -u myuser -y"
        exit 1
    fi
}

# ============================================
# Firewall Detection and Configuration
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
    # Check if Application Firewall is enabled
    local fw_status
    fw_status=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null || echo "disabled")

    if echo "$fw_status" | grep -qi "enabled"; then
        FIREWALL_TYPE="socketfilterfw"
        FIREWALL_ENABLED=true
    else
        # Check if pf is enabled
        if pfctl -s info 2>/dev/null | grep -q "Enabled"; then
            FIREWALL_TYPE="pf"
            FIREWALL_ENABLED=true
        else
            FIREWALL_TYPE="socketfilterfw"
            FIREWALL_ENABLED=false
        fi
    fi
}

detect_firewall_linux() {
    # Check for ufw (Ubuntu/Debian)
    if command -v ufw > /dev/null 2>&1; then
        local ufw_status
        ufw_status=$(ufw status 2>/dev/null || echo "inactive")
        if echo "$ufw_status" | grep -qi "active"; then
            FIREWALL_TYPE="ufw"
            FIREWALL_ENABLED=true
            return
        fi
    fi

    # Check for firewalld (CentOS/RHEL/Fedora)
    if command -v firewall-cmd > /dev/null 2>&1; then
        if systemctl is-active firewalld > /dev/null 2>&1; then
            FIREWALL_TYPE="firewalld"
            FIREWALL_ENABLED=true
            return
        fi
    fi

    # Check for iptables
    if command -v iptables > /dev/null 2>&1; then
        local iptables_rules
        iptables_rules=$(iptables -S 2>/dev/null | grep -c "ACCEPT\|DROP\|REJECT" || echo "0")
        if [ "$iptables_rules" -gt 3 ]; then
            FIREWALL_TYPE="iptables"
            FIREWALL_ENABLED=true
            return
        fi
    fi

    # Check for nftables
    if command -v nft > /dev/null 2>&1; then
        if nft list ruleset 2>/dev/null | grep -q "chain"; then
            FIREWALL_TYPE="nftables"
            FIREWALL_ENABLED=true
            return
        fi
    fi

    FIREWALL_TYPE="none"
    FIREWALL_ENABLED=false
}

configure_firewall_port() {
    local port=$1
    local proto=${2:-tcp}

    print_step "Configuring firewall for port $port..."

    case "$FIREWALL_TYPE" in
        socketfilterfw)
            print_info "macOS Application Firewall uses application-based rules"
            print_info "The application will be allowed through the firewall automatically"
            print_success "No manual firewall configuration needed"
            ;;
        pf)
            configure_firewall_pf_port "$port" "$proto"
            ;;
        ufw)
            configure_firewall_ufw_port "$port" "$proto"
            ;;
        firewalld)
            configure_firewall_firewalld_port "$port" "$proto"
            ;;
        iptables)
            configure_firewall_iptables_port "$port" "$proto"
            ;;
        nftables)
            configure_firewall_nftables_port "$port" "$proto"
            ;;
        *)
            print_warning "No firewall detected or firewall is inactive"
            print_info "If you have a firewall, please manually allow port $port"
            ;;
    esac
}

# macOS pf configuration
configure_firewall_pf_port() {
    local port=$1
    local proto=$2

    local anchor_name="qwen-code-webui"
    local pf_conf="/etc/pf.conf"
    local custom_conf="/etc/pf.anchors/qwen-code-webui"

    # Check if rule already exists
    if [ -f "$custom_conf" ]; then
        if grep -q "port $port" "$custom_conf" 2>/dev/null; then
            print_success "Firewall rule already exists for port $port"
            return 0
        fi
    fi

    print_info "Creating pf anchor for port $port..."

    # Create anchor file
    echo "# Qwen Code Web UI - Auto-generated firewall rule" | sudo tee "$custom_conf" > /dev/null
    echo "pass in proto $proto from any to any port $port" | sudo tee -a "$custom_conf" > /dev/null

    # Add anchor to pf.conf if not already present
    if ! grep -q "qwen-code-webui" "$pf_conf" 2>/dev/null; then
        echo "anchor \"qwen-code-webui\"" | sudo tee -a "$pf_conf" > /dev/null
        echo "load anchor \"qwen-code-webui\" from \"/etc/pf.anchors/qwen-code-webui\"" | sudo tee -a "$pf_conf" > /dev/null
    fi

    # Reload pf rules
    sudo pfctl -ef "$pf_conf" 2>/dev/null || true

    print_success "pf configured to allow port $port"
}

# UFW configuration (Ubuntu/Debian)
configure_firewall_ufw_port() {
    local port=$1
    local proto=$2

    # Check if rule already exists
    if ufw status | grep -q "$port/$proto"; then
        print_success "UFW rule already exists for port $port"
        return 0
    fi

    print_info "Adding UFW rule for port $port..."

    sudo ufw allow "$port/$proto" comment "Qwen Code Web UI"

    print_success "UFW configured to allow port $port"
}

# firewalld configuration (CentOS/RHEL/Fedora)
configure_firewall_firewalld_port() {
    local port=$1
    local proto=$2

    # Check if rule already exists
    if firewall-cmd --list-ports 2>/dev/null | grep -q "$port/$proto"; then
        print_success "firewalld rule already exists for port $port"
        return 0
    fi

    print_info "Adding firewalld rule for port $port..."

    sudo firewall-cmd --permanent --add-port="$port/$proto"
    sudo firewall-cmd --add-port="$port/$proto"

    print_success "firewalld configured to allow port $port"
}

# iptables configuration
configure_firewall_iptables_port() {
    local port=$1
    local proto=$2

    # Check if rule already exists
    if iptables -L INPUT -n 2>/dev/null | grep -q "dpt:$port"; then
        print_success "iptables rule already exists for port $port"
        return 0
    fi

    print_info "Adding iptables rule for port $port..."

    sudo iptables -I INPUT -p $proto --dport $port -m state --state NEW -j ACCEPT

    # Try to save the rule
    if command -v iptables-save > /dev/null 2>&1; then
        sudo iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    fi

    print_success "iptables configured to allow port $port"
}

# nftables configuration
configure_firewall_nftables_port() {
    local port=$1
    local proto=$2

    print_info "Adding nftables rule for port $port..."

    sudo nft add rule inet filter input "$proto" dport "$port" accept

    print_success "nftables configured to allow port $port"
}

# ============================================
# Service Installation
# ============================================

# Create project session directories and mapping file
# This allows projects to appear in the Web UI project list
setup_project_sessions() {
    local user="$SERVICE_USER"
    local home_dir=$(eval echo "~$user")
    local projects_dir="$home_dir/.qwen/projects"

    # Create projects directory if it doesn't exist
    if [ ! -d "$projects_dir" ]; then
        print_info "Creating projects directory..."
        mkdir -p "$projects_dir"
        chown "$user:$user" "$projects_dir" 2>/dev/null || true
        print_success "Created $projects_dir"
    fi

    # Process each project directory
    if [ -n "$PROJECT_DIRS" ]; then
        IFS=':' read -ra DIRS <<< "$PROJECT_DIRS"

        for dir in "${DIRS[@]}"; do
            # Expand ~ to home directory
            dir="${dir/#\~/$home_dir}"

            if [ -d "$dir" ]; then
                # Encode the path (same encoding as Qwen CLI)
                # e.g., /home/user/workspace -> -home-user-workspace
                local encoded_name=$(echo "$dir" | sed 's/^[\/]//' | sed 's/[\/]/-/g' | sed 's/^/-/')
                local project_session_dir="$projects_dir/$encoded_name"

                if [ ! -d "$project_session_dir" ]; then
                    print_info "Creating project session for: $dir"
                    mkdir -p "$project_session_dir/chats"
                    chown -R "$user:$user" "$project_session_dir" 2>/dev/null || true
                    print_success "Created: $encoded_name"
                else
                    print_info "Project session exists: $encoded_name"
                fi

                # Update mapping file
                local mapping_file="$projects_dir/.mapping.json"
                if [ -f "$mapping_file" ]; then
                    # Check if mapping already exists
                    if ! grep -q "\"$encoded_name\"" "$mapping_file" 2>/dev/null; then
                        # Add new mapping
                        local existing=$(cat "$mapping_file")
                        echo "$existing" | sed "s/}/, \"$encoded_name\": \"$dir\"}/" | sed 's/{,/{/' > "$mapping_file" 2>/dev/null || \
                            echo "{\"$encoded_name\": \"$dir\"}" > "$mapping_file"
                    fi
                else
                    echo "{\"$encoded_name\": \"$dir\"}" > "$mapping_file"
                fi
                chown "$user:$user" "$mapping_file" 2>/dev/null || true
            else
                print_warning "Directory not found: $dir"
            fi
        done
    fi
}

create_systemd_service() {
    local port=$1
    local user="$SERVICE_USER"
    local home_dir=$(eval echo "~$user")

    print_step "Creating systemd service..."

    # Create service file
    cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=Qwen Code Web UI
After=network.target

[Service]
Type=simple
User=$user
Environment="PORT=$port"
Environment="HOST=0.0.0.0"
Environment="QWEN_CONFIG_DIR=$home_dir/.qwen"
EOF

    # Add project directories if specified
    if [ -n "$PROJECT_DIRS" ]; then
        # Convert colon-separated to comma-separated for the service
        local mount_dirs=$(echo "$PROJECT_DIRS" | tr ':' ',')
        cat >> /etc/systemd/system/$SERVICE_NAME.service << EOF
Environment="PROJECT_DIRS=$mount_dirs"
EOF
    fi

    cat >> /etc/systemd/system/$SERVICE_NAME.service << EOF
ExecStart=$INSTALL_DIR/$SERVICE_NAME
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload

    print_success "Systemd service created"
}

create_launchd_service() {
    local port=$1
    local user="$SERVICE_USER"
    local home_dir=$(eval echo "~$user")

    print_step "Creating launchd service..."

    local plist_path="$home_dir/Library/LaunchAgents/com.qwen-code-webui.plist"

    # Create plist file
    cat > "$plist_path" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.qwen-code-webui</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/$SERVICE_NAME</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>$port</string>
        <key>HOST</key>
        <string>0.0.0.0</string>
        <key>QWEN_CONFIG_DIR</key>
        <string>$home_dir/.qwen</string>
EOF

    # Add project directories if specified
    if [ -n "$PROJECT_DIRS" ]; then
        local mount_dirs=$(echo "$PROJECT_DIRS" | tr ':' ',')
        cat >> "$plist_path" << EOF
        <key>PROJECT_DIRS</key>
        <string>$mount_dirs</string>
EOF
    fi

    cat >> "$plist_path" << EOF
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/qwen-code-webui.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/qwen-code-webui.error.log</string>
</dict>
</plist>
EOF

    # Set ownership
    chown "$user" "$plist_path"

    print_success "Launchd service created"
}

start_service() {
    print_step "Starting service..."

    case "$OS_TYPE" in
        linux)
            systemctl enable $SERVICE_NAME
            systemctl start $SERVICE_NAME

            # Wait for service to start
            sleep 2

            if systemctl is-active --quiet $SERVICE_NAME; then
                print_success "Service started successfully"
            else
                print_error "Service failed to start"
                print_info "Check logs: journalctl -u $SERVICE_NAME -f"
                exit 1
            fi
            ;;
        macos)
            local user="${SUDO_USER:-$USER}"
            local plist_path="$user/Library/LaunchAgents/com.qwen-code-webui.plist"

            # Unload if already loaded
            launchctl unload "$plist_path" 2>/dev/null || true

            # Load the service
            launchctl load "$plist_path"

            sleep 2

            if launchctl list | grep -q "com.qwen-code-webui"; then
                print_success "Service started successfully"
            else
                print_error "Service failed to start"
                print_info "Check logs: /tmp/qwen-code-webui.error.log"
                exit 1
            fi
            ;;
    esac
}

# ============================================
# Interactive Configuration
# ============================================

run_interactive() {
    print_header

    # Step 1: Port selection
    print_step "Step 1: Configure Port"

    if port_in_use $PORT; then
        print_warning "Port $PORT is already in use"
        local available_port=$(find_available_port $((PORT+1)))
        echo -e "  ${CYAN}1)${NC} Use suggested port: ${GREEN}$available_port${NC}"
        echo -e "  ${CYAN}2)${NC} Enter custom port"
        echo -e "  ${CYAN}3)${NC} Force use port $PORT (may conflict)"
        echo ""

        while true; do
            read -p "  Select [1-3]: " port_choice
            case $port_choice in
                1) PORT=$available_port; break ;;
                2)
                    read -p "  Enter port number: " custom_port
                    if [[ "$custom_port" =~ ^[0-9]+$ ]] && [ "$custom_port" -ge 1 ] && [ "$custom_port" -le 65535 ]; then
                        PORT=$custom_port
                        break
                    fi
                    print_warning "Invalid port number"
                    ;;
                3) break ;;
                *) print_warning "Invalid selection" ;;
            esac
        done
    else
        echo -e "  Default port: ${GREEN}$PORT${NC}"
        echo -e "  ${CYAN}1)${NC} Use default port $PORT"
        echo -e "  ${CYAN}2)${NC} Enter custom port"
        echo ""

        read -p "  Select [1-2, default=1]: " port_choice
        case $port_choice in
            2)
                read -p "  Enter port number: " custom_port
                if [[ "$custom_port" =~ ^[0-9]+$ ]] && [ "$custom_port" -ge 1 ] && [ "$custom_port" -le 65535 ]; then
                    PORT=$custom_port
                fi
                ;;
        esac
    fi

    print_success "Port set to $PORT"

    # Step 2: Project directories
    print_step "Step 2: Mount Project Directories (Optional)"

    # Find common project directories
    local common_dirs=()
    for dir in "$HOME/projects" "$HOME/workspace" "$HOME/work" "$HOME/code" "$HOME/dev"; do
        if [ -d "$dir" ]; then
            common_dirs+=("$dir")
        fi
    done

    if [ ${#common_dirs[@]} -gt 0 ]; then
        echo -e "  Found project directories:"
        for i in "${!common_dirs[@]}"; do
            echo -e "    ${CYAN}$((i+1)))${NC} ${common_dirs[$i]}"
        done
        echo ""
        echo -e "  ${CYAN}Enter numbers to select (comma-separated), or press Enter to skip:${NC}"
        read -p "  " selection

        if [ -n "$selection" ]; then
            local selected_dirs=""
            IFS=',' read -ra nums <<< "$selection"
            for num in "${nums[@]}"; do
                num=$(echo "$num" | tr -d ' ')
                if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le ${#common_dirs[@]} ]; then
                    if [ -n "$selected_dirs" ]; then
                        selected_dirs="$selected_dirs:${common_dirs[$((num-1))]}"
                    else
                        selected_dirs="${common_dirs[$((num-1))]}"
                    fi
                fi
            done
            PROJECT_DIRS="$selected_dirs"
        fi
    fi

    # Manual directory input
    echo ""
    echo -e "  ${CYAN}Enter additional directories to mount (comma or space separated)${NC}"
    echo -e "  ${CYAN}Or press Enter to skip:${NC}"
    read -p "  " manual_dirs

    if [ -n "$manual_dirs" ]; then
        # Replace commas and spaces with colons
        manual_dirs=$(echo "$manual_dirs" | tr ', ' ':' | tr -s ':')
        # Expand ~ to home directory
        manual_dirs="${manual_dirs//\~/$HOME}"

        if [ -n "$PROJECT_DIRS" ]; then
            PROJECT_DIRS="$PROJECT_DIRS:$manual_dirs"
        else
            PROJECT_DIRS="$manual_dirs"
        fi
    fi

    if [ -n "$PROJECT_DIRS" ]; then
        print_success "Selected directories: ${PROJECT_DIRS//:/, }"
    else
        print_info "No directories selected"
    fi

    # Step 3: Firewall configuration
    print_step "Step 3: Firewall Configuration"

    detect_firewall

    if [ "$FIREWALL_ENABLED" = true ]; then
        echo -e "  Detected firewall: ${GREEN}$FIREWALL_TYPE${NC}"
        echo -e "  ${CYAN}1)${NC} Configure firewall to allow port $PORT"
        echo -e "  ${CYAN}2)${NC} Skip firewall configuration"
        echo ""

        read -p "  Select [1-2, default=1]: " fw_choice
        case $fw_choice in
            2)
                print_info "Skipping firewall configuration"
                ;;
            *)
                CONFIGURE_FIREWALL=true
                ;;
        esac
    else
        echo -e "  No active firewall detected"
        print_info "Skipping firewall configuration"
    fi

    # Step 4: Service user configuration
    print_step "Step 4: Service User Configuration"

    local current_user="$SERVICE_USER"
    echo -e "  Service will run as user: ${GREEN}$current_user${NC}"
    echo -e "  ${CYAN}1)${NC} Use default user: $current_user"
    echo -e "  ${CYAN}2)${NC} Enter custom user"
    echo ""

    read -p "  Select [1-2, default=1]: " user_choice
    case $user_choice in
        2)
            read -p "  Enter username: " custom_user
            if [ -n "$custom_user" ]; then
                if id "$custom_user" > /dev/null 2>&1; then
                    SERVICE_USER="$custom_user"
                    print_success "Service user set to: $SERVICE_USER"
                else
                    print_warning "User '$custom_user' not found, using default: $current_user"
                fi
            fi
            ;;
    esac

    # Step 5: Confirmation
    print_step "Step 5: Confirm Installation"

    echo ""
    echo -e "  ${BOLD}Installation Summary:${NC}"
    echo -e "    Port:              ${GREEN}$PORT${NC}"
    echo -e "    Install directory: ${GREEN}$INSTALL_DIR${NC}"
    echo -e "    Service user:      ${GREEN}$SERVICE_USER${NC}"
    if [ -n "$PROJECT_DIRS" ]; then
        echo -e "    Project dirs:      ${GREEN}${PROJECT_DIRS//:/, }${NC}"
    fi
    echo -e "    Firewall config:   ${GREEN}$([ "$CONFIGURE_FIREWALL" = true ] && echo "Yes" || echo "No")${NC}"
    echo ""

    read -p "  Proceed with installation? [Y/n]: " confirm
    if [[ "$confirm" =~ ^[Nn] ]]; then
        print_info "Installation cancelled"
        exit 0
    fi
}

# ============================================
# Main Installation
# ============================================

main() {
    # Detect system
    detect_system

    # Check permissions
    check_permissions "$@"

    # Determine service user
    determine_service_user

    # Run interactive or non-interactive
    if [ "$INTERACTIVE" = true ]; then
        run_interactive
    else
        print_header
        print_info "Non-interactive mode"
        print_info "Port: $PORT"
        print_info "Service user: $SERVICE_USER"
        if [ -n "$PROJECT_DIRS" ]; then
            print_info "Project dirs: ${PROJECT_DIRS//:/, }"
        fi
    fi

    # Check dependencies
    check_dependencies

    # Find binary
    if ! find_binary; then
        exit 1
    fi
    print_step "Installing binary..."
    print_info "Binary: $(basename "$BINARY_PATH")"

    # Install binary
    cp "$BINARY_PATH" "$INSTALL_DIR/$SERVICE_NAME"
    chmod +x "$INSTALL_DIR/$SERVICE_NAME"
    print_success "Binary installed to $INSTALL_DIR/$SERVICE_NAME"

    # Create config directory
    print_step "Creating configuration..."
    mkdir -p "$CONFIG_DIR"
    print_success "Configuration directory created: $CONFIG_DIR"

    # Configure firewall if requested
    if [ "$CONFIGURE_FIREWALL" = true ]; then
        detect_firewall
        configure_firewall_port "$PORT"
    fi

    # Setup project sessions (create directories and mapping file)
    setup_project_sessions

    # Create and start service
    case "$OS_TYPE" in
        linux)
            create_systemd_service "$PORT"
            ;;
        macos)
            create_launchd_service "$PORT"
            ;;
    esac

    start_service

    # Print success message
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                          ║${NC}"
    echo -e "${GREEN}║         ${BOLD}Installation Complete!${NC}             ${GREEN}║${NC}"
    echo -e "${GREEN}║                                          ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "  ${BOLD}Qwen Code Web UI is now running!${NC}"
    echo ""
    echo -e "  ${BLUE}Access:${NC}     http://localhost:$PORT"
    echo -e "  ${BLUE}Service:${NC}    $SERVICE_NAME"
    echo ""

    case "$OS_TYPE" in
        linux)
            echo -e "  ${BLUE}Commands:${NC}"
            echo -e "    Status:   ${CYAN}systemctl status $SERVICE_NAME${NC}"
            echo -e "    Stop:     ${CYAN}sudo systemctl stop $SERVICE_NAME${NC}"
            echo -e "    Restart:  ${CYAN}sudo systemctl restart $SERVICE_NAME${NC}"
            echo -e "    Logs:     ${CYAN}journalctl -u $SERVICE_NAME -f${NC}"
            ;;
        macos)
            echo -e "  ${BLUE}Commands:${NC}"
            echo -e "    Status:   ${CYAN}launchctl list | grep qwen${NC}"
            echo -e "    Stop:     ${CYAN}launchctl unload ~/Library/LaunchAgents/com.qwen-code-webui.plist${NC}"
            echo -e "    Start:    ${CYAN}launchctl load ~/Library/LaunchAgents/com.qwen-code-webui.plist${NC}"
            echo -e "    Logs:     ${CYAN}tail -f /tmp/qwen-code-webui.log${NC}"
            ;;
    esac

    echo ""
    echo -e "  ${BLUE}Uninstall:${NC} ./uninstall.sh"
    echo ""
}

main "$@"