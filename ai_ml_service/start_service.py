#!/usr/bin/env python3
"""
AI/ML Service Launcher
Starts the Flask-based AI/ML service for AutoVolt
"""

import subprocess
import sys
import os
import time

def main():
    # Change to the ai_ml_service directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    print("Starting AutoVolt AI/ML Service...")
    print(f"Working directory: {script_dir}")
    print("Service will be available at:")
    print("  - Local: http://127.0.0.1:8002")
    print("  - Network: http://172.16.3.171:8002")
    print("Press Ctrl+C to stop the service")
    print("-" * 50)

    try:
        # Start the Flask server
        subprocess.run([
            sys.executable, "flask_server.py"
        ], check=True)
    except KeyboardInterrupt:
        print("\nService stopped by user")
    except subprocess.CalledProcessError as e:
        print(f"Service failed to start: {e}")
        return 1
    except Exception as e:
        print(f"Unexpected error: {e}")
        return 1

    return 0

if __name__ == "__main__":
    sys.exit(main())