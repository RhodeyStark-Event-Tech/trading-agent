"""
Placeholder tests for Python microservice.
Add tests for indicator computation, order validation, and market data parsing.
"""
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_indicators_requires_minimum_candles():
    payload = {
        "open": [100.0] * 5,
        "high": [101.0] * 5,
        "low":  [99.0]  * 5,
        "close":[100.5] * 5,
        "volume":[1000.0]*5,
    }
    response = client.post("/indicators/compute", json=payload)
    assert response.status_code == 400
