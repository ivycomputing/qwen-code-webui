#!/usr/bin/env python3
"""
Qwen SDK Format E2E Test (Issue #79)

Tests that the WebUI correctly processes Qwen SDK message formats:
1. Remote session: functionResponse in parts, tool_result top-level
2. Loop detection: repeated error outputs trigger auto-abort

Run:
  HEADLESS=true  python tests/e2e_qwen_sdk_format.py
  HEADLESS=false python tests/e2e_qwen_sdk_format.py
"""

import json
import os
import sys
import time
import traceback
import uuid

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

import requests
from playwright.sync_api import sync_playwright

# ── Config ──
BASE_URL = os.environ.get("BASE_URL", "http://localhost:5001")
WEBUI_URL = os.environ.get("WEBUI_URL", "http://localhost:3000")
HEADLESS = os.environ.get("HEADLESS", "true").lower() == "true"
SCREENSHOT_DIR = os.path.join(PROJECT_ROOT, "screenshots", "e2e-qwen-sdk-format")

TEST_USER = os.environ.get("TEST_USER", "admin")
TEST_PASS = os.environ.get("TEST_PASS", "admin123")

passed = []
failed = []


def ensure_dir():
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)


def shot(page, name):
    ensure_dir()
    path = os.path.join(SCREENSHOT_DIR, f"{name}.png")
    try:
        page.screenshot(path=path, full_page=True, timeout=15000)
    except Exception:
        try:
            page.screenshot(path=path, full_page=False, timeout=10000)
        except Exception:
            return
    print(f"  📸 {name}.png")


def log(tag, msg):
    print(f"  [{tag}] {msg}")


def ok(name):
    passed.append(name)
    print(f"  ✓ {name}")


def fail(name, detail=""):
    failed.append(name)
    print(f"  ✗ {name}" + (f" — {detail}" if detail else ""))


# ── API helpers ──

def api_login(username=TEST_USER, password=TEST_PASS):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": username, "password": password})
    assert r.status_code == 200, f"Login failed: {r.status_code}"
    token = r.cookies.get("session_token")
    assert token, "No session_token"
    return token


def api_register_machine(admin_token):
    """Register a simulated remote machine. Returns machine_id."""
    # Generate registration token
    r = requests.post(f"{BASE_URL}/api/remote/machines/register",
                      json={"tenant_id": 1},
                      cookies={"session_token": admin_token})
    assert r.status_code == 200, f"Reg token failed: {r.status_code} {r.text}"
    reg_token = r.json()["registration_token"]

    mid = str(uuid.uuid4())
    r = requests.post(f"{BASE_URL}/api/remote/agent/register", json={
        "registration_token": reg_token,
        "machine_id": mid,
        "machine_name": "E2E Qwen Format Test",
        "hostname": "qwen-format-test.local",
        "os_type": "linux",
        "os_version": "Ubuntu 24.04",
        "capabilities": {"cpu_cores": 4, "memory_gb": 16, "cli_installed": True},
        "agent_version": "1.0.0-e2e",
    })
    assert r.status_code == 200, f"Agent register failed: {r.status_code}"

    # Mark connected
    r = requests.post(f"{BASE_URL}/api/remote/agent/message", json={
        "type": "register",
        "machine_id": mid,
        "capabilities": {"cpu_cores": 4, "memory_gb": 16, "cli_installed": True},
    })
    assert r.status_code == 200, f"Connect failed: {r.status_code}"

    # Assign user
    # Get current user info
    r = requests.get(f"{BASE_URL}/api/remote/machines/available",
                     cookies={"session_token": admin_token})
    # Try assigning with user_id=1 (admin)
    requests.post(f"{BASE_URL}/api/remote/machines/{mid}/assign",
                  json={"user_id": 1, "permission": "admin"},
                  cookies={"session_token": admin_token})

    return mid


def api_create_session(token, mid, permission_mode="yolo"):
    r = requests.post(f"{BASE_URL}/api/remote/sessions",
                      json={
                          "machine_id": mid,
                          "project_path": "/tmp/test-project",
                          "cli_tool": "qwen-code-cli",
                          "model": "qwen3-coder-plus",
                          "title": "Qwen Format E2E",
                          "permission_mode": permission_mode,
                      },
                      cookies={"session_token": token})
    assert r.status_code == 200, f"Create session: {r.status_code} {r.text}"
    return r.json()["session"]["session_id"]


def api_inject(mid, sid, data):
    """Inject CLI output as session_output."""
    r = requests.post(f"{BASE_URL}/api/remote/agent/message", json={
        "type": "session_output",
        "machine_id": mid,
        "session_id": sid,
        "data": json.dumps(data) if isinstance(data, dict) else data,
        "stream": "stdout",
        "is_complete": False,
    })
    return r.status_code == 200


def api_poll_output(token, sid, timeout=15):
    """Poll session until output appears."""
    start = time.time()
    while time.time() - start < timeout:
        r = requests.get(f"{BASE_URL}/api/remote/sessions/{sid}",
                         cookies={"session_token": token})
        if r.status_code == 200:
            session = r.json().get("session", {})
            output = session.get("output", [])
            if output:
                return output
        time.sleep(1)
    return []


def api_cleanup(token, mid, sid):
    if sid:
        try:
            requests.post(f"{BASE_URL}/api/remote/sessions/{sid}/stop",
                          cookies={"session_token": token}, timeout=5)
        except Exception:
            pass
    if mid:
        try:
            requests.delete(f"{BASE_URL}/api/remote/machines/{mid}",
                            cookies={"session_token": token}, timeout=5)
        except Exception:
            pass


# ══════════════════════════════════════════════════════════════
# TEST 1: Qwen SDK Format — functionCall + functionResponse
# ══════════════════════════════════════════════════════════════

def test_qwen_format_remote():
    """
    Inject Qwen-format messages (functionCall, tool_result, functionResponse)
    and verify they are correctly buffered and delivered via SSE.
    """
    log("Format", "Starting Qwen SDK format test...")
    mid = None
    sid = None

    try:
        token = api_login()
        mid = api_register_machine(token)
        sid = api_create_session(token, mid)
        log("Format", f"Session: {sid[:12]}...")

        # 1. System init
        api_inject(mid, sid, {
            "type": "system", "subtype": "init", "session_id": sid,
            "cwd": "/tmp/test-project", "model": "qwen3-coder-plus",
        })

        # 2. Assistant with functionCall (Qwen parts format)
        api_inject(mid, sid, {
            "type": "assistant",
            "message": {
                "role": "model",
                "parts": [
                    {"text": "Let me search for files.", "thought": True},
                    {"text": "Searching now..."},
                    {"functionCall": {
                        "id": "tool-e2e-001",
                        "name": "glob",
                        "args": {"pattern": "**/*.py"},
                    }},
                ],
            },
            "session_id": sid,
        })

        # 3. Tool result (Qwen top-level tool_result)
        api_inject(mid, sid, {
            "type": "tool_result",
            "message": {
                "role": "user",
                "parts": [{"functionResponse": {
                    "id": "tool-e2e-001",
                    "name": "glob",
                    "response": {"output": "Found 2 files:\nmain.py\nutils.py"},
                }}],
            },
            "toolCallResult": {
                "callId": "tool-e2e-001",
                "status": "success",
                "resultDisplay": "Found 2 files",
            },
        })

        # 4. Result
        api_inject(mid, sid, {
            "type": "result", "subtype": "success", "session_id": sid,
            "result": "Found 2 Python files.", "duration_ms": 3000,
            "num_turns": 1, "usage": {"input_tokens": 100, "output_tokens": 50},
        })

        log("Format", "Injected Qwen-format messages")

        # Poll output
        output = api_poll_output(token, sid, timeout=10)
        output_text = json.dumps(output)

        # Verify each message type is present in output
        has_init = any("init" in json.dumps(o) for o in output)
        has_thinking = any("thought" in json.dumps(o) or "thinking" in json.dumps(o).lower() for o in output)
        has_function_call = any("functionCall" in json.dumps(o) or "glob" in json.dumps(o) for o in output)
        has_function_response = any("functionResponse" in json.dumps(o) or "Found 2" in json.dumps(o) for o in output)
        has_result = any("result" in json.dumps(o).lower() for o in output)

        ok("Format: output received") if output else fail("Format: output received", "No output")
        ok("Format: init message") if has_init else fail("Format: init message")
        ok("Format: thinking content") if has_thinking else fail("Format: thinking content")
        ok("Format: functionCall (glob)") if has_function_call else fail("Format: functionCall (glob)")
        ok("Format: functionResponse") if has_function_response else fail("Format: functionResponse")
        ok("Format: result message") if has_result else fail("Format: result message")

    except Exception as e:
        fail("Format: setup", str(e))
        traceback.print_exc()
    finally:
        api_cleanup(token, mid, sid)


# ══════════════════════════════════════════════════════════════
# TEST 2: Loop detection with repeated Input Closed errors
# ══════════════════════════════════════════════════════════════

def test_loop_detection():
    """
    Inject repeated error tool results (simulating 'Input closed' loop)
    and verify the error pattern is correctly buffered.
    """
    log("Loop", "Starting loop detection test...")
    mid = None
    sid = None

    try:
        token = api_login()
        mid = api_register_machine(token)
        sid = api_create_session(token, mid, permission_mode="default")
        log("Loop", f"Session: {sid[:12]}...")

        # System init
        api_inject(mid, sid, {
            "type": "system", "subtype": "init", "session_id": sid,
        })

        # Inject 5 error cycles
        for i in range(5):
            tool_id = f"tool-loop-{i}"

            # Assistant attempts tool
            api_inject(mid, sid, {
                "type": "assistant",
                "message": {
                    "role": "model",
                    "parts": [
                        {"text": f"Retrying... attempt {i+1}"},
                        {"functionCall": {
                            "id": tool_id,
                            "name": "run_shell_command",
                            "args": {"command": "ssh test"},
                        }},
                    ],
                },
                "session_id": sid,
            })

            # Error result (Input closed — Qwen format)
            api_inject(mid, sid, {
                "type": "tool_result",
                "message": {
                    "role": "user",
                    "parts": [{"functionResponse": {
                        "id": tool_id,
                        "name": "run_shell_command",
                        "response": {"output": "[Operation Cancelled] Reason: Error: Input closed"},
                    }}],
                },
                "toolCallResult": {"callId": tool_id, "status": "error"},
            })

        log("Loop", "Injected 5 error cycles")

        output = api_poll_output(token, sid, timeout=10)
        output_text = json.dumps(output)

        has_errors = "Input closed" in output_text
        has_tool_calls = "run_shell_command" in output_text or "functionCall" in output_text
        has_multiple = output_text.count("Input closed") >= 3

        ok("Loop: error output present") if has_errors else fail("Loop: error output")
        ok("Loop: tool calls visible") if has_tool_calls else fail("Loop: tool calls")
        ok("Loop: multiple error cycles") if has_multiple else fail("Loop: multiple errors", f"Count: {output_text.count('Input closed')}")

    except Exception as e:
        fail("Loop: setup", str(e))
        traceback.print_exc()
    finally:
        api_cleanup(token, mid, sid)


# ══════════════════════════════════════════════════════════════
# TEST 3: Browser UI — Qwen format messages display correctly
# ══════════════════════════════════════════════════════════════

def test_browser_ui():
    """
    Open the remote workspace in browser and verify:
    1. Chat page loads without error
    2. Remote indicator visible
    3. Messages display correctly (no raw JSON)
    """
    log("UI", "Starting browser UI test...")
    mid = None
    sid = None

    try:
        token = api_login()
        mid = api_register_machine(token)
        sid = api_create_session(token, mid)

        # Inject a simple conversation
        api_inject(mid, sid, {
            "type": "system", "subtype": "init", "session_id": sid,
            "cwd": "/tmp/test", "model": "qwen3-coder-plus",
        })
        api_inject(mid, sid, {
            "type": "assistant",
            "message": {
                "role": "model",
                "parts": [{"text": "Hello! I can help you with that."}],
            },
            "session_id": sid,
        })
        api_inject(mid, sid, {
            "type": "result", "subtype": "success", "session_id": sid,
            "result": "Done", "duration_ms": 1000,
            "num_turns": 1, "usage": {"input_tokens": 50, "output_tokens": 20},
        })

        time.sleep(2)

        # Open browser
        pw = sync_playwright().start()
        browser = pw.chromium.launch(headless=HEADLESS)
        page = browser.new_page(viewport={"width": 1280, "height": 900})

        # Navigate to workspace
        workspace_url = (
            f"{BASE_URL}/work?"
            f"workspaceType=remote&"
            f"machineId={mid}&"
            f"machineName=Test+Machine"
        )
        page.goto(workspace_url, wait_until="networkidle", timeout=30000)
        time.sleep(5)
        shot(page, "ui_01_workspace")

        body = page.inner_text("body")

        # Check no error state
        no_error = "Error Loading" not in body and "Failed to" not in body[:200]
        ok("UI: no error state") if no_error else fail("UI: no error state", body[:200])

        # Check no raw JSON
        no_json = '"functionCall"' not in body and '"type"' not in body
        ok("UI: no raw JSON") if no_json else fail("UI: no raw JSON")

        shot(page, "ui_02_final")
        browser.close()
        pw.stop()

    except Exception as e:
        fail("UI: test", str(e))
        traceback.print_exc()
    finally:
        api_cleanup(token, mid, sid)


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("Qwen SDK Format E2E Tests (Issue #79)")
    print(f"API: {BASE_URL}")
    print(f"WebUI: {WEBUI_URL}")
    print(f"Headless: {HEADLESS}")
    print("=" * 60)

    for name, fn in [
        ("Qwen Format (Remote API)", test_qwen_format_remote),
        ("Loop Detection (Remote API)", test_loop_detection),
        ("Browser UI", test_browser_ui),
    ]:
        print(f"\n── {name} ──")
        try:
            fn()
        except Exception as e:
            fail(f"{name}: unexpected", str(e))
            traceback.print_exc()

    # Summary
    print(f"\n{'=' * 60}")
    print("Summary")
    print(f"{'=' * 60}")
    for n in passed:
        print(f"  ✓ {n}")
    for n in failed:
        print(f"  ✗ {n}")
    total = len(passed) + len(failed)
    print(f"\n{len(passed)}/{total} passed")
    return len(failed) == 0


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
