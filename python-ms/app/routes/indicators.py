from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import numpy as np
import talib

router = APIRouter()


class OHLCVPayload(BaseModel):
    open: list[float]
    high: list[float]
    low: list[float]
    close: list[float]
    volume: list[float]


class IndicatorsResponse(BaseModel):
    rsi: float | None
    macd: float | None
    macd_signal: float | None
    bb_upper: float | None
    bb_lower: float | None
    bb_middle: float | None
    vwap: float | None
    ema9: float | None
    ema21: float | None
    atr: float | None


@router.post("/compute", response_model=IndicatorsResponse)
async def compute_indicators(payload: OHLCVPayload) -> IndicatorsResponse:
    if len(payload.close) < 30:
        raise HTTPException(status_code=400, detail="Need at least 30 candles for indicator computation")

    o = np.array(payload.open)
    h = np.array(payload.high)
    l = np.array(payload.low)
    c = np.array(payload.close)
    v = np.array(payload.volume)

    def last(arr: np.ndarray) -> float | None:
        val = arr[-1] if len(arr) > 0 else None
        return None if val is None or np.isnan(val) else float(val)

    rsi = talib.RSI(c, timeperiod=14)
    macd_line, signal_line, _ = talib.MACD(c, fastperiod=12, slowperiod=26, signalperiod=9)
    bb_upper, bb_middle, bb_lower = talib.BBANDS(c, timeperiod=20)
    ema9 = talib.EMA(c, timeperiod=9)
    ema21 = talib.EMA(c, timeperiod=21)
    atr = talib.ATR(h, l, c, timeperiod=14)

    # VWAP (simple daily approximation)
    typical_price = (h + l + c) / 3
    vwap_val = float(np.sum(typical_price * v) / np.sum(v)) if np.sum(v) > 0 else None

    return IndicatorsResponse(
        rsi=last(rsi),
        macd=last(macd_line),
        macd_signal=last(signal_line),
        bb_upper=last(bb_upper),
        bb_lower=last(bb_lower),
        bb_middle=last(bb_middle),
        vwap=vwap_val,
        ema9=last(ema9),
        ema21=last(ema21),
        atr=last(atr),
    )
