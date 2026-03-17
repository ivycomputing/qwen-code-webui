#!/usr/bin/env python3
"""
Rewrite commit messages using git filter-branch with proper single-line handling.
"""

import subprocess
import tempfile
import os

# Commit message mappings
COMMITS = {
    "dee4f0cee608f4f8c084f59f12e912703b6b235b": "chore: clean up project documentation and config files",
    "c5af80cd2b8e1f93b4c4b73606e3dab15ff634dc": "Add copyright notice for Ivy Computing Team",
    "c50af7e3fb72d7986ee509f22b99579e44bec488": "Merge pull request #15 from ivycomputing/feature/optimize-qwen-webui-components",
    "35e650a68a162bf43299848f5b30ecef88048a31": "feat: add open source project copyright notice",
    "7bbbb8fda05ddfda2a73d980fe672c53af6de5b7": "feat: add version display and experimental feature toggle",
    "ab3a6c2b90b4338c5a2afba278dcfc5eaf797db2": "Merge pull request #13 from richardhuang/feature/optimize-qwen-webui-components",
    "9977f03af5021d78c704f7d9b6fc8b849cc4fb0f": "docs: move QWEN_WEBUI_ANALYSIS.md to docs directory",
    "1f6bc3afbfb48ceafa5af6863e52d86d9b7bf899": "docs: add @qwen-code/webui component library integration analysis",
    "86233b6acbc1f85a437dcab123a7c16d8187a105": "feat: integrate @qwen-code/webui component library",
    "be3cfcf5c1d0a6cc0ffc0e2f6c3f54e30d043583": "fix: clean up broken symlinks to eliminate packaging warnings",
    "d8e4b5b8a1afaf9ab2e4ed6468153ac3de4cb37f": "fix: fix Deno runtime serve() return type",
    "f6ac9cb4611dd8b778a0a2c540edd2ff851b84ac": "fix: update packaging script for Qwen Code Web UI",
    "0ed71ae6a712ad2aadbe8b62b75dc43c636be185": "fix: fix backend service crashing frequently after startup",
    "bd22502a1d6f65bdb4388ba71b9f8b7f05fa8053": "fix: correctly decode project paths with hyphens",
    "68266b6ea621e4c73137ebf7a26999824804d0e7": "fix: fix project list API to read from ~/.qwen/projects directory",
    "c50e6f5dc343a6009f2995d1dda7bc03b5b6e9c0": "fix: update project history path from .claude to .qwen",
    "ed4a4aee3f936d35a78b29a6c1fdff9ef212b695": "fix: update remaining 'Claude Code Web UI' references to 'Qwen Code Web UI'",
    "1b2cdc9bdb3595cc7ff24639da3482ec35f61a82": "fix: update test files for Qwen SDK compatibility",
    "8b353650c67a5931e9af1399d83f0d6ba513058c": "feat: transform Claude Code Web UI to Qwen Code Web UI",
}

def main():
    # Create a Python script that reads the old message from stdin and outputs the new one
    script_content = '''import sys
import os

COMMITS = {
    "dee4f0cee608f4f8c084f59f12e912703b6b235b": "chore: clean up project documentation and config files",
    "c5af80cd2b8e1f93b4c4b73606e3dab15ff634dc": "Add copyright notice for Ivy Computing Team",
    "c50af7e3fb72d7986ee509f22b99579e44bec488": "Merge pull request #15 from ivycomputing/feature/optimize-qwen-webui-components",
    "35e650a68a162bf43299848f5b30ecef88048a31": "feat: add open source project copyright notice",
    "7bbbb8fda05ddfda2a73d980fe672c53af6de5b7": "feat: add version display and experimental feature toggle",
    "ab3a6c2b90b4338c5a2afba278dcfc5eaf797db2": "Merge pull request #13 from richardhuang/feature/optimize-qwen-webui-components",
    "9977f03af5021d78c704f7d9b6fc8b849cc4fb0f": "docs: move QWEN_WEBUI_ANALYSIS.md to docs directory",
    "1f6bc3afbfb48ceafa5af6863e52d86d9b7bf899": "docs: add @qwen-code/webui component library integration analysis",
    "86233b6acbc1f85a437dcab123a7c16d8187a105": "feat: integrate @qwen-code/webui component library",
    "be3cfcf5c1d0a6cc0ffc0e2f6c3f54e30d043583": "fix: clean up broken symlinks to eliminate packaging warnings",
    "d8e4b5b8a1afaf9ab2e4ed6468153ac3de4cb37f": "fix: fix Deno runtime serve() return type",
    "f6ac9cb4611dd8b778a0a2c540edd2ff851b84ac": "fix: update packaging script for Qwen Code Web UI",
    "0ed71ae6a712ad2aadbe8b62b75dc43c636be185": "fix: fix backend service crashing frequently after startup",
    "bd22502a1d6f65bdb4388ba71b9f8b7f05fa8053": "fix: correctly decode project paths with hyphens",
    "68266b6ea621e4c73137ebf7a26999824804d0e7": "fix: fix project list API to read from ~/.qwen/projects directory",
    "c50e6f5dc343a6009f2995d1dda7bc03b5b6e9c0": "fix: update project history path from .claude to .qwen",
    "ed4a4aee3f936d35a78b29a6c1fdff9ef212b695": "fix: update remaining 'Claude Code Web UI' references to 'Qwen Code Web UI'",
    "1b2cdc9bdb3595cc7ff24639da3482ec35f61a82": "fix: update test files for Qwen SDK compatibility",
    "8b353650c67a5931e9af1399d83f0d6ba513058c": "feat: transform Claude Code Web UI to Qwen Code Web UI",
}

commit_hash = os.environ.get("GIT_COMMIT", "")
old_msg = sys.stdin.read().strip()

if commit_hash in COMMITS:
    print(COMMITS[commit_hash])
else:
    print(old_msg)
'''
    
    # Write the script to a temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(script_content)
        script_path = f.name

    try:
        env = os.environ.copy()
        env['FILTER_BRANCH_SQUELCH_WARNING'] = '1'
        
        # Run git filter-branch
        cmd = [
            'git', 'filter-branch', '-f',
            '--msg-filter', f'python3 {script_path}',
            '--tag-name-filter', 'cat',
            '--', '--all'
        ]
        
        print("Rewriting commit messages...")
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        
        print(result.stdout)
        if result.stderr:
            # Filter out the warning about unchanged refs
            stderr_lines = result.stderr.split('\n')
            filtered_stderr = [l for l in stderr_lines if 'WARNING:' not in l or 'unchanged' not in l.lower()]
            if filtered_stderr:
                print("STDERR:", '\n'.join(filtered_stderr))
            
        if result.returncode == 0:
            print("\n✅ Commit messages rewritten successfully!")
        else:
            print(f"\n❌ Failed with exit code {result.returncode}")
            
    finally:
        os.unlink(script_path)

if __name__ == "__main__":
    main()
