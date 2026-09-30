"""Serve the job-app folder on :8080 for local E2E runs, pointing the pages
at the local API (http://localhost:3000/api) instead of production."""
import http.server, os, socketserver, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROD = 'https://wct-job-app-api.azurewebsites.net/api'
LOCAL = os.environ.get('E2E_API', 'http://localhost:3000/api')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def log_message(self, *a):
        pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def do_GET(self):
        path = self.path.split('?')[0]
        if path in ('/', ''):
            path = '/index.html'
        if path.endswith('.html'):
            fp = os.path.join(ROOT, path.lstrip('/'))
            if os.path.exists(fp):
                body = open(fp, encoding='utf-8').read().replace(PROD, LOCAL).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        return super().do_GET()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', port), Handler) as httpd:
    httpd.serve_forever()
