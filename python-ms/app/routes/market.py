from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import schwab  # type: ignore

router = APIRouter()

TRADING_MODE = os.getenv("TRADING_MODE", "paper")


def get_client():
    """Initialize Schwab client — tokens stored securely in file, never in source."""
    try:
        return schwab.auth.client_from_token_file(
            token_path=os.getenv("SCHWAB_TOKEN_PATH", "./schwab_token.json"),
            api_key=os.getenv("SCHWAB_CLIENT_ID", ""),
            app_secret=os.getenv("SCHWAB_CLIENT_SECRET", ""),
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Schwab client unavailable: {e}")


class QuoteResponse(BaseModel):
    ticker: str
    price: float
    bid: float
    ask: float
    volume: int


class OHLCVResponse(BaseModel):
    candles: list[dict]


@router.get("/quote/{ticker}", response_model=QuoteResponse)
async def get_quote(ticker: str) -> QuoteResponse:
    client = get_client()
    response = client.get_quote(ticker)
    data = response.json()

    quote = data.get(ticker, {}).get("quote", {})
    return QuoteResponse(
        ticker=ticker,
        price=quote.get("lastPrice", 0.0),
        bid=quote.get("bidPrice", 0.0),
        ask=quote.get("askPrice", 0.0),
        volume=int(quote.get("totalVolume", 0)),
    )


@router.get("/ohlcv/{ticker}", response_model=OHLCVResponse)
async def get_ohlcv(ticker: str, period_type: str = "day", period: int = 10, frequency: int = 5) -> OHLCVResponse:
    client = get_client()
    response = client.get_price_history(
        ticker,
        period_type=schwab.client.Client.PriceHistory.PeriodType(period_type),
        period=schwab.client.Client.PriceHistory.Period(period),
        frequency_type=schwab.client.Client.PriceHistory.FrequencyType.MINUTE,
        frequency=schwab.client.Client.PriceHistory.Frequency(frequency),
    )
    data = response.json()
    return OHLCVResponse(candles=data.get("candles", []))


@router.get("/account")
async def get_account():
    client = get_client()
    response = client.get_accounts()
    return response.json()
