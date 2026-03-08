import http.server
import socketserver
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = int(os.environ.get("PORT", 3000))

handler = http.server.SimpleHTTPRequestHandler
handler.extensions_map.update({
    ".wasm": "application/wasm",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
})

with socketserver.TCPServer(("", PORT), handler) as httpd:
    print(f"Serving on http://localhost:{PORT}")
    httpd.serve_forever()
