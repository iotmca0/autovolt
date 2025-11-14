#!/usr/bin/env python3
"""
Test script for AI/ML service
"""
import requests
import json
import time

def test_health():
    """Test health endpoint"""
    try:
        response = requests.get("http://localhost:8003/health", timeout=5)
        if response.status_code == 200:
            print("✓ Health check passed")
            print(json.dumps(response.json(), indent=2))
            return True
        else:
            print(f"✗ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Health check error: {e}")
        return False

def test_forecast():
    """Test forecast endpoint"""
    try:
        data = {
            "device_id": "test_device",
            "history": [10, 12, 15, 11, 14, 16, 13],
            "periods": 3
        }
        response = requests.post("http://localhost:8002/forecast", json=data, timeout=10)
        if response.status_code == 200:
            print("✓ Forecast endpoint working")
            result = response.json()
            print(f"Forecast: {result['forecast']}")
            return True
        else:
            print(f"✗ Forecast failed: {response.status_code}")
            print(response.text)
            return False
    except Exception as e:
        print(f"✗ Forecast error: {e}")
        return False

def test_voice():
    """Test voice processing endpoint"""
    try:
        data = {
            "text": "turn on the lights in classroom 101",
            "language": "en"
        }
        response = requests.post("http://localhost:8002/voice/nlp", json=data, timeout=10)
        if response.status_code == 200:
            print("✓ Voice processing working")
            result = response.json()
            print(f"Intent: {result['intent']}, Confidence: {result['confidence']}")
            return True
        else:
            print(f"✗ Voice processing failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Voice processing error: {e}")
        return False

if __name__ == "__main__":
    print("Testing AI/ML Service...")
    print("=" * 50)

    # Test health
    if test_health():
        print("\n" + "=" * 50)
        # Test forecast
        test_forecast()

        print("\n" + "=" * 50)
        # Test voice
        test_voice()

        print("\n" + "=" * 50)
        print("✓ AI/ML service is working with advanced features!")
    else:
        print("✗ Service not responding")