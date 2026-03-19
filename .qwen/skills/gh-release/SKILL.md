---
name: gh-release
description: Build packages, create GitHub release, and publish to npm
---

# Overview

This skill automates the release process:
1. Bump version (optional)
2. Build offline installation packages for multiple platforms
3. Create a git tag for the release
4. Create a GitHub release
5. Upload packages as release assets
6. Publish to npm

# Prerequisites

- `gh` CLI installed and authenticated
- `npm` CLI installed and authenticated (`npm login`)
- Deno installed for building
- Write access to the repository

# Stored Credentials

## npm Automation Token

**Location**: `~/.npm-automation-token`
**Created**: 2026-03-18
**Expires**: 2026-06-16 (90 days)

**Usage**:
```bash
# Load token from file and add to .npmrc
echo "//registry.npmjs.org/:_authToken=$(cat ~/.npm-automation-token)" >> ~/.npmrc
cd backend && npm publish --otp=
```

**⚠️ Token Expiry Check**: Before using this skill, check if the token is within 7 days of expiry:
```bash
# If current date > 2026-06-09, remind user to generate a new token
# Visit: https://www.npmjs.com/settings/ivycomputing/tokens
# Create new "Automation" token and update ~/.npm-automation-token:
#   echo "npm_<new_token>" > ~/.npm-automation-token
#   chmod 600 ~/.npm-automation-token
```

# Steps

## 1. Check Current Version

```bash
# Get version from package.json
cat backend/package.json | grep '"version"'

# Check existing tags
git tag -l | tail -5
```

## 2. Bump Version (Optional)

```bash
# Bump patch version (0.1.0 -> 0.1.1)
bash scripts/package.sh --bump patch

# Bump minor version (0.1.0 -> 0.2.0)
bash scripts/package.sh --bump minor

# Bump major version (0.1.0 -> 1.0.0)
bash scripts/package.sh --bump major

# Build without version bump
bash scripts/package.sh
```

The `--bump` option will:
- Increment the version in `backend/package.json`
- Build all platform packages with the new version
- Show next steps for creating the release

## 3. Build Packages

```bash
# Run the packaging script
bash scripts/package.sh
```

This creates packages in `packages/` directory:
- `qwen-code-webui-v{VERSION}-{DATE}-Linux-x64.tar.gz`
- `qwen-code-webui-v{VERSION}-{DATE}-Linux-arm64.tar.gz`
- `qwen-code-webui-v{VERSION}-{DATE}-macOS-x64.tar.gz`
- `qwen-code-webui-v{VERSION}-{DATE}-macOS-arm64.tar.gz`

## 4. Commit Version Change (if bumped)

```bash
git add backend/package.json
git commit -m "chore: bump version to {VERSION}"
```

## 5. Create Git Tag

```bash
# Create annotated tag
git tag -a v{VERSION} -m "Release v{VERSION}

Features:
- Feature 1
- Feature 2

Bug Fixes:
- Fix 1"
```

## 6. Push Tag to GitHub

```bash
# Push the tag
git push origin v{VERSION}
```

## 7. Create GitHub Release

```bash
gh release create v{VERSION} \
  --title "v{VERSION}" \
  --notes "## Qwen Code Web UI v{VERSION}

### Features
- Feature list

### Bug Fixes
- Fix list

### Installation

#### npm (Recommended)
\`\`\`bash
npm install -g qwen-code-webui
qwen-code-webui
\`\`\`

#### Offline Installation
Download the appropriate package for your platform from the assets below.

**Full Changelog**: https://github.com/{OWNER}/{REPO}/commits/v{VERSION}"
```

## 8. Upload Packages to Release

```bash
gh release upload v{VERSION} packages/*.tar.gz --clobber
```

## 9. Publish to npm

### Check Token Expiry First

**Token File**: `~/.npm-automation-token` (expires 2026-06-16)

```bash
# Check if token is expiring within 7 days
# If current date > 2026-06-09, remind user:
# "⚠️ npm token expires soon! Please generate a new one:"
# 1. Visit https://www.npmjs.com/settings/ivycomputing/tokens
# 2. Click "Generate New Token" → Select "Automation"
# 3. Save new token: echo "npm_<new_token>" > ~/.npm-automation-token
```

### Publish Steps

```bash
# Load token from file and add to .npmrc
echo "//registry.npmjs.org/:_authToken=$(cat ~/.npm-automation-token)" >> ~/.npmrc

# Navigate to backend directory
cd backend

# Build and tests run automatically via prepublishOnly
npm publish --otp=

# Verify publication
npm view qwen-code-webui version
```

### npm Package Info

The package is configured in `backend/package.json`:
- **Name**: `qwen-code-webui`
- **Entry point**: `dist/cli/node.js`
- **Binary**: `qwen-code-webui` command
- **Files**: `dist/`, `README.md`, `LICENSE`

## 10. Verify Release

```bash
# View GitHub release details
gh release view v{VERSION}

# List uploaded assets
gh release view v{VERSION} --json assets --jq '.assets[] | "\(.name) - \(.size / 1024 / 1024 | floor)MB"'

# Verify npm package
npm view qwen-code-webui version

# Test installation
npm install -g qwen-code-webui
qwen-code-webui --version
```

# Example Usage

When user asks to create a release:

1. First check if there are uncommitted changes
2. Get the current version from `backend/package.json`
3. Ask user to confirm the version or specify a bump type (patch/minor/major)
4. Run `bash scripts/package.sh --bump <type>` to bump version and build packages
   - Or run `bash scripts/package.sh` to build without version bump
5. Commit the version change if bumped
6. Create tag and push to GitHub
7. Create release with release notes
8. Upload all packages from `packages/` directory (may take several minutes for ~350MB)
9. Publish to npm:
   - Check token expiry (warn if within 7 days of 2026-06-16)
   - Load token: `echo "//registry.npmjs.org/:_authToken=$(cat ~/.npm-automation-token)" >> ~/.npmrc`
   - Run `cd backend && npm publish --otp=`
10. Verify the release on GitHub and npm

# Release Notes Template

```markdown
## Qwen Code Web UI v{VERSION}

### Features
- New feature descriptions

### Bug Fixes
- Bug fix descriptions

### Changes
- Change descriptions

### Installation

#### npm (Recommended)
\`\`\`bash
npm install -g qwen-code-webui
qwen-code-webui
\`\`\`

#### Offline Installation
Download the appropriate package for your platform from the assets below:
- Linux x64: \`qwen-code-webui-v{VERSION}-{DATE}-Linux-x64.tar.gz\`
- Linux ARM64: \`qwen-code-webui-v{VERSION}-{DATE}-Linux-arm64.tar.gz\`
- macOS x64: \`qwen-code-webui-v{VERSION}-{DATE}-macOS-x64.tar.gz\`
- macOS ARM64: \`qwen-code-webui-v{VERSION}-{DATE}-macOS-arm64.tar.gz\`

**Full Changelog**: https://github.com/{OWNER}/{REPO}/compare/v{PREVIOUS_VERSION}...v{VERSION}
```

# Error Handling

- If build fails, check TypeScript errors and fix them
- If tag already exists, ask user to bump version
- If upload fails, use `--clobber` flag to overwrite existing assets
- If `gh` not authenticated, run `gh auth login`
- If npm publish fails due to OTP:
  - Use stored automation token: `echo "//registry.npmjs.org/:_authToken=$(cat ~/.npm-automation-token)" >> ~/.npmrc`
  - Run `npm publish --otp=`
- If npm publish fails due to version exists, bump version first
- If npm publish fails due to package name, use `--access public` flag
- **If token expired** (after 2026-06-16):
  - Remind user: "⚠️ npm automation token expired!"
  - User should visit: https://www.npmjs.com/settings/ivycomputing/tokens
  - Revoke old token, create new "Automation" token
  - Update `~/.npm-automation-token`:
    ```bash
    echo "npm_<new_token>" > ~/.npm-automation-token
    chmod 600 ~/.npm-automation-token
    ```

# Notes

- Packages are built for: Linux (x64, ARM64), macOS (x64, ARM64)
- Each package includes: binary, install script, README
- Package size is approximately 85-90MB each
- npm package includes: compiled JS, frontend static files, README, LICENSE
- The `prepublishOnly` script automatically runs build and tests before publishing