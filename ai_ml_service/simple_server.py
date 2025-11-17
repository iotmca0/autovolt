import json
import http.server
import socketserver
from urllib.parse import urlparse, parse_qs
import threading
import time

class AIMLHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed_path = urlparse(self.path)
            path = parsed_path.path
            print(f"Request received: {path}")

            if path == '/health':
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                response = {
                    "status": "healthy",
                    "prophet_available": False,
                    "scikit_available": True,
                    "mlflow_available": False,
                    "advanced_ai_available": False,
                    "timestamp": time.time()
                }
                self.wfile.write(json.dumps(response).encode())
                print("Health response sent")

            elif path == '/forecast':
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                response = {
                    "device_id": "test",
                    "forecast": [10.5, 11.2, 12.1, 13.0, 14.5],
                    "confidence": [0.8, 0.8, 0.8, 0.8, 0.8],
                    "timestamp": time.time(),
                    "model_type": "simple"
                }
                self.wfile.write(json.dumps(response).encode())

            elif path == '/anomaly':
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                response = {
                    "device_id": "test",
                    "anomalies": [],
                    "scores": [0.1, 0.2, 0.1, 0.15, 0.1],
                    "threshold": 0.5,
                    "timestamp": time.time()
                }
                self.wfile.write(json.dumps(response).encode())

            else:
                self.send_response(404)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Not found"}')

        except Exception as e:
            print(f"Error handling request: {e}")
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b'{"error": "Internal server error"}')

    def do_POST(self):
        self.do_GET()  # For simplicity, handle POST like GET

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        # Suppress default logging
        pass

def run_server():
    with socketserver.TCPServer(("", 8002), AIMLHandler) as httpd:
        print("AI/ML Service running on port 8002")
        httpd.serve_forever()

if __name__ == "__main__":
    print("Starting AI/ML Service on port 8002...")
    with socketserver.TCPServer(("", 8002), AIMLHandler) as httpd:
        print("AI/ML Service running on port 8002")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("Server stopped")