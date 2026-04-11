#!/usr/bin/env python3
"""
StreamVault IPTV Player - Server
Serves the app with a built-in /proxy endpoint to bypass browser CORS
restrictions for external playlist URLs (e.g. Dropbox).

Usage:
    python server.py
    python server.py 8787     (specify port)

Then open: http://localhost:8787
"""

import sys
import os
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787

ALLOWED_HOSTS = [
    'dropbox.com', 'dl.dropboxusercontent.com',
    'drive.google.com', 'githubusercontent.com',
    'pastebin.com', 'raw.githubusercontent.com',
]

class StreamVaultHandler(SimpleHTTPRequestHandler):
    """Custom handler that adds /proxy endpoint for CORS bypass."""

    def do_GET(self):
        parsed = urlparse(self.path)

        # Proxy endpoint: GET /proxy?url=https://...
        if parsed.path == '/proxy':
            self.handle_proxy(parsed)
            return

        # Serve static files normally
        super().do_GET()

    def handle_proxy(self, parsed):
        params = parse_qs(parsed.query)
        target_urls = params.get('url', [])

        if not target_urls:
            self.send_error(400, 'Missing ?url= parameter')
            return

        target_url = unquote(target_urls[0])

        # Security: only allow trusted external hosts
        try:
            target_host = urlparse(target_url).hostname or ''
        except Exception:
            self.send_error(400, 'Invalid URL')
            return

        allowed = any(target_host == h or target_host.endswith('.' + h) for h in ALLOWED_HOSTS)
        if not allowed:
            # Still allow if it's a plain HTTP URL (IPTV streams)
            if not target_url.startswith('http'):
                self.send_error(403, f'Host not in allowlist: {target_host}')
                return

        try:
            req = urllib.request.Request(
                target_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (StreamVault/1.0 Proxy)',
                    'Accept': '*/*',
                }
            )

            with urllib.request.urlopen(req, timeout=12) as resp:
                content_type = resp.headers.get('Content-Type', 'application/octet-stream')
                content_length = resp.headers.get('Content-Length')

                self.send_response(200)
                self.send_header('Content-Type', content_type)
                if content_length:
                    self.send_header('Content-Length', content_length)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
                self.send_header('Cache-Control', 'max-age=300')
                self.end_headers()

                # Stream chunks
                try:
                    while True:
                        chunk = resp.read(128 * 1024) # 128KB chunks
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                except (ConnectionResetError, BrokenPipeError):
                    # Client disconnected
                    pass

        except urllib.error.URLError as e:
            self.send_error(502, f'Fetch failed: {e.reason}')
        except Exception as e:
            self.send_error(500, f'Server error: {str(e)}')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        # Suppress static file logs, show proxy logs
        path = str(args[0]) if args else ''
        if '/proxy' in path:
            print(f'[Proxy] {format % args}')
        elif not any(ext in path for ext in ['.js', '.css', '.png', '.ico', '.woff']):
            super().log_message(format, *args)


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Read port from environment variable (for services like Render/Heroku)
    # Default to PORT constant (8788) if not set
    FINAL_PORT = int(os.environ.get('PORT', PORT))
    
    server = HTTPServer(('', FINAL_PORT), StreamVaultHandler)
    print(f'----------------------------------------')
    print(f' StreamVault IPTV Player Server')
    print(f' Status: RUNNING')
    print(f' Port:   {FINAL_PORT}')
    print(f' URL:    http://localhost:{FINAL_PORT}')
    print(f'----------------------------------------')
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down server...')
        server.server_close()
