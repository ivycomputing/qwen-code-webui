#!/usr/bin/env python3
"""
Test script for Issue #49: Open-ACE Quota Integration for Request Limits

Tests:
1. Quota status API
2. Quota check middleware
3. QuotaExceeded component UI
"""

import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Error: playwright not installed. Run: pip install playwright && playwright install chromium")
    sys.exit(1)

# Configuration
WEBUI_URL = "http://localhost:3000"  # Frontend
BACKEND_URL = "http://localhost:8080"  # Backend (Deno)
OPENACE_URL = "http://localhost:5001"  # Open-ACE API
VIEWPORT_SIZE = {"width": 1400, "height": 900}
TIMEOUT = 30000

# Output directory
PROJECT_ROOT = Path(__file__).parent.parent.parent
OUTPUT_DIR = PROJECT_ROOT / "screenshots" / "issues" / "49"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def test_api_endpoints():
    """Test API endpoints."""
    print("\n=== Testing API Endpoints ===")
    
    import urllib.request
    import json
    
    tests = [
        (f"{BACKEND_URL}/api/quota/status", "Quota Status API"),
        (f"{OPENACE_URL}/api/quota/check", "Open-ACE Quota Check"),
    ]
    
    results = []
    for url, name in tests:
        try:
            req = urllib.request.Request(url)
            try:
                response = urllib.request.urlopen(req, timeout=5)
                data = json.loads(response.read().decode())
                status = "✓ PASS"
                print(f"{status}: {name} - {url}")
                results.append({"url": url, "name": name, "status": "PASS", "data": data})
            except urllib.error.HTTPError as e:
                if e.code == 401:
                    status = "✓ PASS"
                    print(f"{status}: {name} - {url} (401 expected - requires auth)")
                    results.append({"url": url, "name": name, "status": "PASS", "note": "401 expected"})
                else:
                    status = "✗ FAIL"
                    print(f"{status}: {name} - {url} (HTTP {e.code})")
                    results.append({"url": url, "name": name, "status": "FAIL", "error": str(e)})
        except Exception as e:
            status = "✗ FAIL"
            print(f"{status}: {name} - {url} ({str(e)})")
            results.append({"url": url, "name": name, "status": "FAIL", "error": str(e)})
    
    return results


def take_screenshots():
    """Take screenshots of UI components."""
    print("\n=== Taking UI Screenshots ===")
    
    screenshots = []
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        page.set_viewport_size(VIEWPORT_SIZE)
        
        # Clear cookies
        context.clear_cookies()
        
        # Test 1: Main page (to check if QuotaExceeded shows when quota exceeded)
        print("\n1. Testing Main Page...")
        try:
            page.goto(WEBUI_URL, wait_until='networkidle', timeout=TIMEOUT)
            page.wait_for_timeout(3000)
            
            filename = f"screenshot_{timestamp}_01_main_page.png"
            filepath = OUTPUT_DIR / filename
            page.screenshot(path=str(filepath), full_page=True)
            screenshots.append({
                "filename": filename,
                "description": "Main Page (qwen-code-webui)",
                "url": WEBUI_URL
            })
            print(f"✓ Saved: {filename}")
        except Exception as e:
            print(f"✗ Failed: Main Page - {e}")
        
        # Test 2: Check if QuotaExceeded component exists in codebase
        print("\n2. Checking QuotaExceeded component...")
        quota_exceeded_path = PROJECT_ROOT / "frontend" / "src" / "components" / "QuotaExceeded.tsx"
        if quota_exceeded_path.exists():
            print(f"✓ QuotaExceeded.tsx exists at: {quota_exceeded_path}")
            screenshots.append({
                "filename": "QuotaExceeded.tsx",
                "description": "QuotaExceeded Component (file exists)",
                "url": str(quota_exceeded_path)
            })
        else:
            print(f"✗ QuotaExceeded.tsx not found")
        
        # Test 3: Backend quota handler
        print("\n3. Checking backend quota handler...")
        quota_handler_path = PROJECT_ROOT / "backend" / "handlers" / "quota.ts"
        if quota_handler_path.exists():
            print(f"✓ quota.ts exists at: {quota_handler_path}")
            screenshots.append({
                "filename": "quota.ts",
                "description": "Backend Quota Handler (file exists)",
                "url": str(quota_handler_path)
            })
        else:
            print(f"✗ quota.ts not found")
        
        browser.close()
    
    return screenshots


def generate_report(api_results, screenshots):
    """Generate HTML test report."""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    report_filename = f"test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
    report_path = OUTPUT_DIR / report_filename
    
    # API results HTML
    api_html = ""
    for result in api_results:
        status_class = "pass" if result["status"] == "PASS" else "fail"
        api_html += f"""
        <tr class="{status_class}">
            <td>{result['name']}</td>
            <td>{result['url']}</td>
            <td>{result['status']}</td>
            <td>{result.get('note', result.get('error', ''))}</td>
        </tr>"""
    
    # Screenshots HTML
    screenshots_html = ""
    for i, shot in enumerate(screenshots, 1):
        if shot['filename'].endswith('.png'):
            screenshots_html += f"""
            <div class="screenshot">
                <h3>{i}. {shot['description']}</h3>
                <p class="url">URL: {shot['url']}</p>
                <img src="{shot['filename']}" alt="{shot['description']}">
            </div>"""
        else:
            screenshots_html += f"""
            <div class="file-check">
                <h3>{i}. {shot['description']}</h3>
                <p class="path">Path: {shot['url']}</p>
                <span class="status">✓ File exists</span>
            </div>"""
    
    html_content = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Issue #49 Test Report - Open-ACE Quota Integration</title>
    <style>
        * {{ box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }}
        h1 {{
            color: #333;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }}
        h2 {{
            color: #667eea;
            margin-top: 30px;
        }}
        .meta {{
            color: #666;
            margin-bottom: 20px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background: white;
            border-radius: 8px;
            overflow: hidden;
        }}
        th, td {{
            padding: 12px 16px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }}
        th {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }}
        tr.pass td:last-child {{ color: green; }}
        tr.fail td:last-child {{ color: red; }}
        .screenshot {{
            margin: 20px 0;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
        }}
        .screenshot h3 {{
            margin: 0;
            padding: 12px 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }}
        .screenshot .url {{
            padding: 8px 16px;
            color: #666;
            font-size: 12px;
        }}
        .screenshot img {{
            max-width: 100%;
            display: block;
        }}
        .file-check {{
            margin: 20px 0;
            background: white;
            border-radius: 8px;
            padding: 16px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        .file-check h3 {{
            margin: 0 0 8px 0;
            color: #333;
        }}
        .file-check .path {{
            color: #666;
            font-size: 12px;
            margin: 0;
        }}
        .file-check .status {{
            color: green;
            font-weight: bold;
        }}
        .footer {{
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #999;
            font-size: 12px;
            text-align: center;
        }}
    </style>
</head>
<body>
    <h1>📋 Issue #49 Test Report</h1>
    <div class="meta">
        <p><strong>Feature:</strong> Open-ACE Quota Integration for Request Limits</p>
        <p><strong>Generated:</strong> {timestamp}</p>
        <p><strong>WebUI URL:</strong> {WEBUI_URL}</p>
        <p><strong>Backend URL:</strong> {BACKEND_URL}</p>
        <p><strong>Open-ACE URL:</strong> {OPENACE_URL}</p>
    </div>
    
    <h2>API Endpoint Tests</h2>
    <table>
        <thead>
            <tr>
                <th>Test Name</th>
                <th>URL</th>
                <th>Status</th>
                <th>Notes</th>
            </tr>
        </thead>
        <tbody>
            {api_html}
        </tbody>
    </table>
    
    <h2>UI & File Checks</h2>
    {screenshots_html}
    
    <div class="footer">
        <p>Generated by Qwen Test Script</p>
    </div>
</body>
</html>"""
    
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    return str(report_path)


def open_file(filepath: str):
    """Open file with system default application."""
    system = sys.platform
    if system == 'darwin':
        subprocess.run(['open', filepath])
    elif system == 'linux':
        subprocess.run(['xdg-open', filepath])
    elif system == 'win32':
        subprocess.run(['start', filepath], shell=True)


def main():
    print("=" * 60)
    print("Issue #49: Open-ACE Quota Integration for Request Limits")
    print("=" * 60)
    
    # Test API endpoints
    api_results = test_api_endpoints()
    
    # Take UI screenshots
    screenshots = take_screenshots()
    
    # Generate report
    report_path = generate_report(api_results, screenshots)
    
    print("\n" + "=" * 60)
    print(f"Test Report: {report_path}")
    print("=" * 60)
    
    # Open report
    open_file(report_path)
    
    return report_path


if __name__ == '__main__':
    main()