from flask import Flask, jsonify
from flask_cors import CORS
import time

app = Flask(__name__)
CORS(app)

@app.route('/health')
def health():
    try:
        return jsonify({
            "status": "healthy",
            "prophet_available": False,
            "scikit_available": True,
            "mlflow_available": False,
            "advanced_ai_available": False,
            "timestamp": time.time()
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/forecast', methods=['GET', 'POST'])
def forecast():
    try:
        return jsonify({
            "device_id": "test",
            "forecast": [10.5, 11.2, 12.1, 13.0, 14.5],
            "confidence": [0.8, 0.8, 0.8, 0.8, 0.8],
            "timestamp": time.time(),
            "model_type": "simple"
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/anomaly', methods=['GET', 'POST'])
def anomaly():
    try:
        return jsonify({
            "device_id": "test",
            "anomalies": [],
            "scores": [0.1, 0.2, 0.1, 0.15, 0.1],
            "threshold": 0.5,
            "timestamp": time.time()
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/schedule', methods=['GET', 'POST'])
def schedule():
    try:
        return jsonify({
            "device_id": "test",
            "schedule": {
                "monday": {"start": "08:00", "end": "18:00", "priority": "high"},
                "tuesday": {"start": "08:00", "end": "18:00", "priority": "high"},
                "wednesday": {"start": "08:00", "end": "18:00", "priority": "high"},
                "thursday": {"start": "08:00", "end": "18:00", "priority": "high"},
                "friday": {"start": "08:00", "end": "18:00", "priority": "high"},
                "saturday": {"start": "09:00", "end": "17:00", "priority": "medium"},
                "sunday": {"start": "off", "end": "off", "priority": "off"}
            },
            "energy_savings": 15,
            "timestamp": time.time()
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8002, debug=False)