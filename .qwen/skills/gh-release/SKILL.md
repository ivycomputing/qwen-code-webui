---
name: gh-release
description: Build packages and create GitHub release with downloadable assets
---

# Overview

This skill automates the release process:
1. Build offline installation packages for multiple platforms
2. Create a git tag for the release
3. Create a GitHub release
4. Upload packages as release assets

# Prerequisites

- `gh` CLI installed and authenticated
- Deno installed for building
- Write access to the repository

# Steps

## 1. Check Current Version

```bash
# Get version from package.json
cat backend/package.json | grep '"version"'

# Check existing tags
git tag -l | tail -5
```

## 2. Build Packages

```bash
# Run the packaging script
bash scripts/package.sh
```

This creates packages in `packages/` directory:
- `qwen-code-webui-v{VERSION}-{DATE}-Linux-x64.tar.gz`
- `qwen-code-webui-v{VERSION}-{DATE}-Linux-arm64.tar.gz`
- `qwen-code-webui-v{VERSION}-{DATE}-macOS-x64.tar.gz`
- `qwen-code-webui-v{VERSION}-{DATE}-macOS-arm64.tar.gz`

## 3. Create Git Tag

```bash
# Create annotated tag
git tag -a v{VERSION} -m "Release v{VERSION}

Features:
- Feature 1
- Feature 2

Bug Fixes:
- Fix 1"
```

## 4. Push Tag to GitHub

```bash
# Push the tag
git push origin v{VERSION}
```

## 5. Create GitHub Release

```bash
gh release create v{VERSION} \
  --title "v{VERSION}" \
  --notes "## Qwen Code Web UI v{VERSION}

### Features
- Feature list

### Bug Fixes
- Fix list

### Installation

\`\`\`bash
npm install -g qwen-code-webui
qwen-code-webui
\`\`\`

**Full Changelog**: https://github.com/{OWNER}/{REPO}/commits/v{VERSION}"
```

## 6. Upload Packages to Release

```bash
gh release upload v{VERSION} packages/*.tar.gz --clobber
```

## 7. Verify Release

```bash
# View release details
gh release view v{VERSION}

# List uploaded assets
gh release view v{VERSION} --json assets --jq '.assets[] | "\(.name) - \(.size / 1024 / 1024 | floor)MB"'
```

# Example Usage

When user asks to create a release:

1. First check if there are uncommitted changes
2. Get the current version from `backend/package.json`
3. Ask user to confirm the version or specify a new one
4. Run `bash scripts/package.sh` to build packages
5. Create tag and push to GitHub
6. Create release with release notes
7. Upload all packages from `packages/` directory

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
Download the appropriate package for your platform from the assets below.

**Full Changelog**: https://github.com/{OWNER}/{REPO}/compare/v{PREVIOUS_VERSION}...v{VERSION}
```

# Error Handling

- If build fails, check TypeScript errors and fix them
- If tag already exists, ask user to bump version
- If upload fails, use `--clobber` flag to overwrite existing assets
- If `gh` not authenticated, run `gh auth login`

# Notes

- Packages are built for: Linux (x64, ARM64), macOS (x64, ARM64)
- Each package includes: binary, install script, README
- Package size is approximately 85-90MB each