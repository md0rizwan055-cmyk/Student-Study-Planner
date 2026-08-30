#!/usr/bin/env python3
"""
serve.py — Convenience script to start StudyAI
Starts both the FastAPI backend and a static file server for the frontend.
Run: python serve.py
"""
import subprocess
import sys
import os
import threading
import http.server
import socketserver
import webbrowser
import time

BACKEND_PORT = 8000
FRONTEND_PORT = 3000
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), 'frontend')

def start_backend():
    print("[INFO] Starting FastAPI backend on http://localhost:8000")
    subprocess.run(
        [sys.executable, '-m', 'uvicorn', 'main:app', '--reload', '--host', '0.0.0.0', '--port', str(BACKEND_PORT)],
        cwd=os.path.join(os.path.dirname(__file__), 'backend')
    )

def start_frontend():
    os.chdir(FRONTEND_DIR)
    Handler = http.server.SimpleHTTPRequestHandler

    class SilentHandler(Handler):
        def log_message(self, format, *args):
            pass  # Suppress request logs

    with socketserver.TCPServer(("", FRONTEND_PORT), SilentHandler) as httpd:
        print(f"[INFO] Serving frontend on http://localhost:{FRONTEND_PORT}")
        httpd.serve_forever()

if __name__ == '__main__':
    print("""
================================================
           StudyAI - Starting Up
  
  Backend:  http://localhost:8000
  Frontend: http://localhost:3000
  API Docs: http://localhost:8000/docs
================================================
""")

    # Start frontend in background thread
    frontend_thread = threading.Thread(target=start_frontend, daemon=True)
    frontend_thread.start()

    # Wait a moment, then open browser
    def open_browser():
        time.sleep(3)
        webbrowser.open(f'http://localhost:{FRONTEND_PORT}')
    threading.Thread(target=open_browser, daemon=True).start()

    # Start backend in main thread (blocking)
    start_backend()
