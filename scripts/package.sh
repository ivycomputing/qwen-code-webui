#!/bin/bash
#
# Qwen Code Web UI - Package Builder
# Creates offline installation packages for different platforms
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

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
PACKAGE_DIR="$PROJECT_ROOT/packages"

# Version info
VERSION=$(cd "$PROJECT_ROOT" && git describe --tags --always 2>/dev/null || echo "dev")
DATE=$(date +%Y%m%d)

echo ""
print_info "=========================================="
print_info "  Qwen Code Web UI 离线安装包构建"
print_info "=========================================="
echo ""
print_info "版本: $VERSION"
print_info "日期: $DATE"
echo ""

# Clean previous packages
print_info "清理旧的打包目录..."
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

# Build the project first
print_info "构建项目..."
cd "$PROJECT_ROOT"
make build

# Check if build was successful
if [ ! -f "$DIST_DIR/qwen-code-webui" ]; then
    print_error "构建失败，找不到二进制文件"
    exit 1
fi

print_success "构建完成"
echo ""

# ============================================
# Create Linux packages
# ============================================

# Function to create package for a specific architecture
create_package() {
    local ARCH=$1
    local BINARY_NAME=$2
    local OS_TYPE=$3

    # Determine OS name for package
    if [[ "$BINARY_NAME" == *"macos"* ]]; then
        OS_NAME="macOS"
        PKG_ARCH=${ARCH#macos-}
    else
        OS_NAME="Linux"
        PKG_ARCH=${ARCH#linux-}
    fi

    local PACKAGE_NAME="qwen-code-webui-$VERSION-$DATE-$OS_NAME-$PKG_ARCH"
    local PACKAGE_PATH="$PACKAGE_DIR/$PACKAGE_NAME"

    print_info "创建 $OS_NAME $PKG_ARCH 安装包..."

    # Create package directory
    mkdir -p "$PACKAGE_PATH"

    # Copy and rename binary
    if [ -f "$DIST_DIR/$BINARY_NAME" ]; then
        cp "$DIST_DIR/$BINARY_NAME" "$PACKAGE_PATH/$BINARY_NAME"
    else
        print_warning "找不到二进制文件: $BINARY_NAME，跳过"
        rm -rf "$PACKAGE_PATH"
        return
    fi

    # Copy install script
    cp "$SCRIPT_DIR/install.sh" "$PACKAGE_PATH/install.sh"
    chmod +x "$PACKAGE_PATH/install.sh"

    # Create README
    if [ "$OS_NAME" = "macOS" ]; then
        cat > "$PACKAGE_PATH/README.txt" << EOF
Qwen Code Web UI - 离线安装包
版本: $VERSION
架构: macOS $PKG_ARCH
日期: $DATE

安装说明:
1. 将此压缩包上传到目标机器
2. 解压: tar -xzf $PACKAGE_NAME.tar.gz
3. 进入目录: cd $PACKAGE_NAME
4. 以管理员执行: sudo ./install.sh

系统要求:
- macOS 系统 ($PKG_ARCH 架构)
- Qwen CLI 已安装并认证

更多信息请访问: https://github.com/richardhuang/qwen-code-webui
EOF
    else
        cat > "$PACKAGE_PATH/README.txt" << EOF
Qwen Code Web UI - 离线安装包
版本: $VERSION
架构: Linux $PKG_ARCH
日期: $DATE

安装说明:
1. 将此压缩包上传到目标服务器
2. 解压: tar -xzf $PACKAGE_NAME.tar.gz
3. 进入目录: cd $PACKAGE_NAME
4. 以 root 执行: ./install.sh

系统要求:
- Linux 系统 ($PKG_ARCH 架构)
- systemd 服务管理器
- Qwen CLI 已安装并认证

更多信息请访问: https://github.com/richardhuang/qwen-code-webui
EOF
    fi

    # Remove macOS extended attributes and AppleDouble files
    print_info "移除 macOS 元数据文件..."
    find "$PACKAGE_PATH" -name "._*" -type f -delete 2>/dev/null || true
    # Remove extended attributes recursively (macOS only)
    if command -v xattr &>/dev/null; then
        xattr -cr "$PACKAGE_PATH" 2>/dev/null || true
    fi

    # Create tarball
    cd "$PACKAGE_DIR"
    COPYFILE_DISABLE=1 tar --no-xattrs -czf "$PACKAGE_NAME.tar.gz" "$PACKAGE_NAME"
    rm -rf "$PACKAGE_NAME"

    print_success "创建完成: $PACKAGE_NAME.tar.gz"
}

# Build for current architecture first
print_info "检测当前架构..."
CURRENT_ARCH=$(uname -m)
CURRENT_OS=$(uname -s)

# Function to build for a specific target
build_target() {
    local TARGET=$1
    local OUTPUT_NAME=$2

    print_info "交叉编译 $TARGET..."
    cd "$PROJECT_ROOT/backend"
    deno compile --target "$TARGET" \
        --allow-net --allow-run --allow-read --allow-write --allow-env --allow-sys \
        --include ./dist/static \
        --output "../dist/$OUTPUT_NAME" \
        cli/deno.ts

    if [ $? -eq 0 ]; then
        print_success "编译成功: $OUTPUT_NAME"
        return 0
    else
        print_error "编译失败: $TARGET"
        return 1
    fi
}

# Build for Linux targets (cross-compile)
print_info "构建 Linux x64 版本..."
build_target "x86_64-unknown-linux-gnu" "qwen-code-webui-linux-x64"

print_info "构建 Linux ARM64 版本..."
build_target "aarch64-unknown-linux-gnu" "qwen-code-webui-linux-arm64"

# Build for macOS targets (cross-compile)
print_info "构建 macOS x64 版本..."
build_target "x86_64-apple-darwin" "qwen-code-webui-macos-x64"

print_info "构建 macOS ARM64 版本..."
build_target "aarch64-apple-darwin" "qwen-code-webui-macos-arm64"

# Create packages for each architecture
create_package "linux-x64" "qwen-code-webui-linux-x64"
create_package "linux-arm64" "qwen-code-webui-linux-arm64"
create_package "macos-x64" "qwen-code-webui-macos-x64"
create_package "macos-arm64" "qwen-code-webui-macos-arm64"

# ============================================
# Summary
# ============================================

echo ""
print_success "=========================================="
print_success "  打包完成"
print_success "=========================================="
echo ""
print_info "生成的文件:"
ls -lh "$PACKAGE_DIR"/*.tar.gz 2>/dev/null || print_warning "没有生成任何安装包"
echo ""
print_info "文件位置: $PACKAGE_DIR"
echo ""