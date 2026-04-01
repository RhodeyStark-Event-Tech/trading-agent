from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import schwab  # type: ignore

router = APIRouter()

TRADING_MODE = os.getenv("TRADING_MODE", "paper")


def get_client():
    try:
        return schwab.auth.client_from_token_file(
            token_path=os.getenv("SCHWAB_TOKEN_PATH", "./schwab_token.json"),
            api_key=os.getenv("SCHWAB_CLIENT_ID", ""),
            app_secret=os.getenv("SCHWAB_CLIENT_SECRET", ""),
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Schwab client unavailable: {e}")


class BracketOrderPayload(BaseModel):
    ticker: str
    action: str          # BUY or SELL
    quantity: int
    entry_price: float
    stop_loss: float
    take_profit: float
    account_hash: str


class OrderResponse(BaseModel):
    order_id: str | None
    status: str
    mode: str


@router.post("/bracket", response_model=OrderResponse)
async def place_bracket_order(payload: BracketOrderPayload) -> OrderResponse:
    if TRADING_MODE != "live":
        # Paper trading — log and return simulated response
        return OrderResponse(
            order_id=f"PAPER-{payload.ticker}-{payload.quantity}",
            status="simulated",
            mode="paper",
        )

    client = get_client()

    # Build bracket order using schwab-py builder
    order = (
        schwab.orders.equities.equity_buy_limit(payload.ticker, payload.quantity, payload.entry_price)
        .set_duration(schwab.orders.common.Duration.DAY)
        .set_session(schwab.orders.common.Session.NORMAL)
        .attach_child_order(
            schwab.orders.equities.equity_sell_limit(payload.ticker, payload.quantity, payload.take_profit)
        )
        .attach_child_order(
            schwab.orders.equities.equity_sell_stop(payload.ticker, payload.quantity, payload.stop_loss)
        )
        .build()
    )

    response = client.place_order(payload.account_hash, order)

    if response.status_code not in (200, 201):
        raise HTTPException(status_code=response.status_code, detail="Order placement failed")

    order_id = response.headers.get("Location", "").split("/")[-1]

    return OrderResponse(order_id=order_id, status="submitted", mode="live")
