from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Security, status
from fastapi.security.api_key import APIKeyHeader
import os

from app.routes.indicators import router as indicators_router
from app.routes.market import router as market_router
from app.routes.orders import router as orders_router

API_KEY = os.getenv("PYTHON_MS_API_KEY", "")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

app = FastAPI(title="Trading Agent — Python Microservice", version="1.0.0")


def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    if API_KEY and api_key != API_KEY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API key")
    return api_key


@app.get("/health")
async def health():
    return {"status": "ok", "mode": os.getenv("TRADING_MODE", "paper")}


app.include_router(indicators_router, prefix="/indicators", tags=["indicators"])
app.include_router(market_router, prefix="/market", tags=["market"])
app.include_router(orders_router, prefix="/orders", tags=["orders"])
