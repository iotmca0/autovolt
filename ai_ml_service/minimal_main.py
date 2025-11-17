from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Minimal AI/ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "message": "Minimal service running"
    }

@app.get("/forecast")
async def forecast():
    return {
        "forecast": [10, 11, 12, 13, 14],
        "confidence": [0.8, 0.8, 0.8, 0.8, 0.8]
    }

@app.get("/anomaly")
async def anomaly():
    return {
        "anomalies": [],
        "scores": [0.1, 0.2, 0.1, 0.15, 0.1]
    }