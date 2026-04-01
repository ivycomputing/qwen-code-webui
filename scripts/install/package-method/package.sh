#!/bin/bash
#
# Qwen Code Web UI - Package Builder
# Creates offline installation packages for different platforms
#
# Usage:
#   ./package.sh                          # Build Linux x64 only (default)
#   ./package.sh --all                    # Build all platforms
#   ./package.sh --platform linux-x64     # Build specific platform
#   ./package.sh --platform linux-arm64,macos-arm64  # Build multiple platforms
#   ./package.sh --bump patch             # Build and bump patch version
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
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
PACKAGE_DIR="$PROJECT_ROOT/packages"
PACKAGE_JSON="$PROJECT_ROOT/backend/package.json"

# Default platform (Linux x64 only)
BUILD_PLATFORMS="linux-x64"
ALL_PLATFORMS="linux-x64,linux-arm64,macos-x64,macos-arm64"

# Parse arguments
BUMP_TYPE=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --bump)
            BUMP_TYPE="$2"
            shift 2
            ;;
        --all|-a)
            BUILD_PLATFORMS="$ALL_PLATFORMS"
            shift
            ;;
        --platform|-p)
            BUILD_PLATFORMS="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --all, -a                Build all platforms (linux-x64, linux-arm64, macos-x64, macos-arm64)"
            echo "  --platform, -p <list>    Build specific platforms (comma-separated)"
            echo "                           Available: linux-x64, linux-arm64, macos-x64, macos-arm64"
            echo "  --bump <type>            Bump version before building (patch|minor|major)"
            echo "  -h, --help               Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                                # Build Linux x64 only (default)"
            echo "  $0 --all                          # Build all platforms"
            echo "  $0 --platform linux-arm64         # Build Linux ARM64 only"
            echo "  $0 -p linux-x64,macos-arm64       # Build Linux x64 and macOS ARM64"
            echo "  $0 --bump patch                   # Build and bump patch version"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Function to bump version
bump_version() {
    local current_version="$1"
    local bump_type="$2"
    
    # Remove 'v' prefix if present
    current_version="${current_version#v}"
    
    # Parse version parts
    local major minor patch
    IFS='.' read -r major minor patch <<< "$current_version"
    
    # Bump version based on type
    case "$bump_type" in
        patch)
            patch=$((patch + 1))
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        *)
            print_error "Invalid bump type: $bump_type (use patch|minor|major)"
            exit 1
            ;;
    esac
    
    echo "${major}.${minor}.${patch}"
}

# Function to update package.json version
update_package_json() {
    local new_version="$1"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${new_version}\"/" "$PACKAGE_JSON"
    else
        # Linux
        sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${new_version}\"/" "$PACKAGE_JSON"
    fi
}

# Get current version from package.json
CURRENT_VERSION=$(grep '"version"' "$PACKAGE_JSON" | sed 's/.*"version": *"\([^"]*\)".*/\1/')

# Handle version bumping
if [[ -n "$BUMP_TYPE" ]]; then
    print_info "Current version: $CURRENT_VERSION"
    
    NEW_VERSION=$(bump_version "$CURRENT_VERSION" "$BUMP_TYPE")
    print_info "Bumping version: $CURRENT_VERSION -> $NEW_VERSION"
    
    # Update package.json
    update_package_json "$NEW_VERSION"
    print_success "Updated package.json to version $NEW_VERSION"
    
    VERSION="$NEW_VERSION"
else
    VERSION="$CURRENT_VERSION"
fi

DATE=$(date +%Y%m%d)

echo ""
print_info "=========================================="
print_info "  Qwen Code Web UI Package Builder"
print_info "=========================================="
echo ""
print_info "Version: $VERSION"
print_info "Date: $DATE"
echo ""

# Clean previous packages
print_info "Cleaning previous packages..."
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

# Clean up broken symlinks in node_modules that cause warnings during deno compile
print_info "Cleaning broken symlinks..."
find "$PROJECT_ROOT/backend/node_modules/.deno/node_modules/@img" -type l ! -exec test -e {} \; -delete 2>/dev/null || true
rmdir "$PROJECT_ROOT/backend/node_modules/.deno/node_modules/@img" 2>/dev/null || true

# Build the project first
print_info "Building project..."
cd "$PROJECT_ROOT"
make build

# Check if build was successful
if [ ! -f "$DIST_DIR/qwen-code-webui" ]; then
    print_error "Build failed: binary not found"
    exit 1
fi

print_success "Build completed"
echo ""

# ============================================
# Create packages
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

    local PACKAGE_NAME="qwen-code-webui-v${VERSION}-${DATE}-${OS_NAME}-${PKG_ARCH}"
    local PACKAGE_PATH="$PACKAGE_DIR/$PACKAGE_NAME"

    print_info "Creating $OS_NAME $PKG_ARCH package..."

    # Create package directory
    mkdir -p "$PACKAGE_PATH"

    # Copy and rename binary
    if [ -f "$DIST_DIR/$BINARY_NAME" ]; then
        cp "$DIST_DIR/$BINARY_NAME" "$PACKAGE_PATH/$BINARY_NAME"
    else
        print_warning "Binary not found: $BINARY_NAME, skipping"
        rm -rf "$PACKAGE_PATH"
        return
    fi

    # Copy install and uninstall scripts
    cp "$SCRIPT_DIR/install.sh" "$PACKAGE_PATH/install.sh"
    cp "$SCRIPT_DIR/uninstall.sh" "$PACKAGE_PATH/uninstall.sh"
    chmod +x "$PACKAGE_PATH/install.sh"
    chmod +x "$PACKAGE_PATH/uninstall.sh"

    # Create README
    cat > "$PACKAGE_PATH/README.txt" << EOF
Qwen Code Web UI - Offline Installation Package
Version: $VERSION
Platform: $OS_NAME $PKG_ARCH
Date: $DATE

Installation Instructions:
1. Upload this archive to the target machine
2. Extract: tar -xzf $PACKAGE_NAME.tar.gz
3. Enter directory: cd $PACKAGE_NAME
4. Run as admin: sudo ./install.sh

Advanced Options:
  sudo ./install.sh -u <user>              # Run service as specific user
  sudo ./install.sh -d /path/to/projects   # Mount project directories
  sudo ./install.sh -p 8080 -y             # Non-interactive on custom port

Examples:
  # Interactive mode (recommended)
  sudo ./install.sh

  # Non-interactive with service user and project directories
  sudo ./install.sh -u myuser -d /home/myuser/workspace -y

  # Specify multiple project directories
  sudo ./install.sh -u myuser -d /home/myuser/workspace:/home/myuser/projects -y

Uninstallation:
  sudo ./uninstall.sh          # Basic uninstall
  sudo ./uninstall.sh --all    # Full cleanup including config

Requirements:
- $OS_NAME system ($PKG_ARCH architecture)
- Qwen CLI installed and authenticated

For more information: https://github.com/ivycomputing/qwen-code-webui
EOF

    # Remove macOS extended attributes and AppleDouble files
    print_info "Removing macOS metadata files..."
    find "$PACKAGE_PATH" -name "._*" -type f -delete 2>/dev/null || true
    # Remove extended attributes recursively (macOS only)
    if command -v xattr &>/dev/null; then
        xattr -cr "$PACKAGE_PATH" 2>/dev/null || true
    fi

    # Create tarball
    cd "$PACKAGE_DIR"
    COPYFILE_DISABLE=1 tar --no-xattrs -czf "$PACKAGE_NAME.tar.gz" "$PACKAGE_NAME"
    rm -rf "$PACKAGE_NAME"

    print_success "Created: $PACKAGE_NAME.tar.gz"
}

# Function to build for a specific target
build_target() {
    local TARGET=$1
    local OUTPUT_NAME=$2

    print_info "Cross-compiling for $TARGET..."
    cd "$PROJECT_ROOT/backend"
    deno compile --target "$TARGET" \
        --allow-net --allow-run --allow-read --allow-write --allow-env --allow-sys \
        --include ./dist \
        --output "../dist/$OUTPUT_NAME" \
        cli/deno.ts

    if [ $? -eq 0 ]; then
        print_success "Compiled: $OUTPUT_NAME"
        return 0
    else
        print_error "Failed to compile: $TARGET"
        return 1
    fi
}

# Function to check if platform is in build list
should_build() {
    local platform="$1"
    local platforms="$BUILD_PLATFORMS"
    
    # Convert to lowercase and check
    [[ ",$platforms," == *",$platform,"* ]]
}

# Build targets based on selected platforms
print_info "Detecting current architecture..."
CURRENT_ARCH=$(uname -m)
CURRENT_OS=$(uname -s)

print_info "Platforms to build: $BUILD_PLATFORMS"
echo ""

# Build Linux x64
if should_build "linux-x64"; then
    print_info "Building Linux x64 binary..."
    build_target "x86_64-unknown-linux-gnu" "qwen-code-webui-linux-x64"
fi

# Build Linux ARM64
if should_build "linux-arm64"; then
    print_info "Building Linux ARM64 binary..."
    build_target "aarch64-unknown-linux-gnu" "qwen-code-webui-linux-arm64"
fi

# Build macOS x64
if should_build "macos-x64"; then
    print_info "Building macOS x64 binary..."
    build_target "x86_64-apple-darwin" "qwen-code-webui-macos-x64"
fi

# Build macOS ARM64
if should_build "macos-arm64"; then
    print_info "Building macOS ARM64 binary..."
    build_target "aarch64-apple-darwin" "qwen-code-webui-macos-arm64"
fi

echo ""

# Create packages for selected platforms
if should_build "linux-x64"; then
    create_package "linux-x64" "qwen-code-webui-linux-x64"
fi

if should_build "linux-arm64"; then
    create_package "linux-arm64" "qwen-code-webui-linux-arm64"
fi

if should_build "macos-x64"; then
    create_package "macos-x64" "qwen-code-webui-macos-x64"
fi

if should_build "macos-arm64"; then
    create_package "macos-arm64" "qwen-code-webui-macos-arm64"
fi

# ============================================
# Summary
# ============================================

echo ""
print_success "=========================================="
print_success "  Build Complete"
print_success "=========================================="
echo ""
print_info "Generated files:"
ls -lh "$PACKAGE_DIR"/*.tar.gz 2>/dev/null || print_warning "No packages generated"
echo ""
print_info "Package location: $PACKAGE_DIR"

# Show next steps if version was bumped
if [[ -n "$BUMP_TYPE" ]]; then
    echo ""
    print_info "Next steps:"
    echo "  1. Commit the version change:"
    echo "     git add backend/package.json && git commit -m \"chore: bump version to $VERSION\""
    echo ""
    echo "  2. Create and push tag:"
    echo "     git tag -a v$VERSION -m \"Release v$VERSION\""
    echo "     git push origin v$VERSION"
    echo ""
    echo "  3. Create GitHub release:"
    echo "     gh release create v$VERSION --title \"v$VERSION\" --notes \"...\""
    echo ""
    echo "  4. Upload packages:"
    echo "     gh release upload v$VERSION packages/*.tar.gz --clobber"
fi

echo ""