# Python Integration Templates

## Package

```
waffo  (PyPI; install with `pip install waffo` or `pip install --pre waffo`)
```

Supported Python versions: 3.9, 3.10, 3.11, 3.12, 3.13.

The SDK passes dict payloads through to the API as-is. **Always use camelCase keys inside payload dicts** (e.g., `paymentRequestId`, `orderCurrency`, `userInfo`) even though Python convention is snake_case. Only public SDK method names use snake_case (e.g., `waffo.subscription().change_inquiry()`).

## SDK Initialization

```python
# app/config/waffo.py
from __future__ import annotations

import os
from threading import Lock

from waffo import Environment, Waffo, WaffoConfig

_waffo_instance: Waffo | None = None
_waffo_lock = Lock()


def get_waffo() -> Waffo:
    """Return a process-wide singleton Waffo client."""
    global _waffo_instance
    if _waffo_instance is not None:
        return _waffo_instance
    with _waffo_lock:
        if _waffo_instance is None:
            _waffo_instance = Waffo(
                WaffoConfig(
                    api_key=os.environ["WAFFO_API_KEY"],
                    private_key=os.environ["WAFFO_PRIVATE_KEY"],
                    waffo_public_key=os.environ["WAFFO_PUBLIC_KEY"],
                    merchant_id=os.environ["WAFFO_MERCHANT_ID"],
                    environment=(
                        Environment.PRODUCTION
                        if os.environ.get("WAFFO_ENVIRONMENT", "SANDBOX").upper() == "PRODUCTION"
                        else Environment.SANDBOX
                    ),
                )
            )
    return _waffo_instance


def reset_waffo() -> None:
    """Drop the cached client. Call after any credential changes."""
    global _waffo_instance
    with _waffo_lock:
        _waffo_instance = None
```

Alternatively, use the built-in env loader:

```python
from waffo import Waffo

waffo = Waffo.from_env()
```

Environment variables for `Waffo.from_env()`:
- `WAFFO_API_KEY`
- `WAFFO_PRIVATE_KEY`
- `WAFFO_PUBLIC_KEY`
- `WAFFO_ENVIRONMENT` (`SANDBOX` or `PRODUCTION`)
- `WAFFO_MERCHANT_ID`

---

## Order Payment Service

```python
# app/services/payment_service.py
from __future__ import annotations

from typing import Any
from uuid import uuid4

from waffo import WaffoUnknownStatusError

from app.config.waffo import get_waffo


def gen_request_id() -> str:
    """Generate a 32-char request ID (UUID without dashes; max length 32)."""
    return uuid4().hex


class PaymentCreateInput:
    def __init__(
        self,
        *,
        merchant_order_id: str,
        amount: str,
        currency: str,
        description: str,
        notify_url: str,
        success_redirect_url: str,
        user_id: str,
        user_email: str,
        user_terminal: str = "WEB",  # WEB | APP
        pay_method_type: str | None = None,
        pay_method_name: str | None = None,
    ) -> None:
        self.merchant_order_id = merchant_order_id
        self.amount = amount
        self.currency = currency
        self.description = description
        self.notify_url = notify_url
        self.success_redirect_url = success_redirect_url
        self.user_id = user_id
        self.user_email = user_email
        self.user_terminal = user_terminal
        self.pay_method_type = pay_method_type
        self.pay_method_name = pay_method_name


def create_payment(input: PaymentCreateInput) -> dict[str, Any]:
    waffo = get_waffo()
    payment_request_id = gen_request_id()

    payment_info: dict[str, Any] = {"productName": "ONE_TIME_PAYMENT"}
    if input.pay_method_type:
        payment_info["payMethodType"] = input.pay_method_type
    if input.pay_method_name:
        payment_info["payMethodName"] = input.pay_method_name

    try:
        response = waffo.order().create(
            {
                "paymentRequestId": payment_request_id,
                "merchantOrderId": input.merchant_order_id,
                "orderCurrency": input.currency,
                "orderAmount": input.amount,
                "orderDescription": input.description,
                "notifyUrl": input.notify_url,
                "successRedirectUrl": input.success_redirect_url,
                "userInfo": {
                    "userId": input.user_id,
                    "userEmail": input.user_email,
                    "userTerminal": input.user_terminal,
                },
                "paymentInfo": payment_info,
            }
        )
    except WaffoUnknownStatusError:
        # Network unknown status — recover by querying with the SAME paymentRequestId.
        # Do not regenerate the ID; do not assume failure.
        return query_order(payment_request_id)

    if not response.is_success():
        raise RuntimeError(
            f"Payment creation failed: {response.get_code()} - {response.get_message()}"
        )

    data = response.get_data()
    # IMPORTANT: persist data.acquiring_order_id locally — it is the ONLY key for refund webhooks.
    return {
        "paymentRequestId": payment_request_id,
        "acquiringOrderId": data.acquiring_order_id if data else None,
        "orderAction": data.order_action if data else None,
    }


def query_order(payment_request_id: str) -> dict[str, Any]:
    waffo = get_waffo()
    response = waffo.order().inquiry({"paymentRequestId": payment_request_id})

    if not response.is_success():
        raise RuntimeError(
            f"Order inquiry failed: {response.get_code()} - {response.get_message()}"
        )

    data = response.get_data()
    return {
        "paymentRequestId": payment_request_id,
        "acquiringOrderId": data.acquiring_order_id if data else None,
        "orderStatus": data.order_status if data else None,
        "orderAmount": data.order_amount if data else None,
    }


def cancel_order(payment_request_id: str) -> dict[str, Any]:
    waffo = get_waffo()
    try:
        response = waffo.order().cancel({"paymentRequestId": payment_request_id})
    except WaffoUnknownStatusError:
        # Unknown status — confirm with inquiry (same paymentRequestId).
        return query_order(payment_request_id)

    if not response.is_success():
        raise RuntimeError(
            f"Order cancel failed: {response.get_code()} - {response.get_message()}"
        )

    data = response.get_data()
    return {"orderStatus": data.order_status if data else None}


def capture_order(payment_request_id: str, capture_amount: str) -> dict[str, Any]:
    waffo = get_waffo()
    try:
        response = waffo.order().capture(
            {
                "paymentRequestId": payment_request_id,
                "captureAmount": capture_amount,
            }
        )
    except WaffoUnknownStatusError:
        return query_order(payment_request_id)

    if not response.is_success():
        raise RuntimeError(
            f"Order capture failed: {response.get_code()} - {response.get_message()}"
        )

    return response.get_data() or {}
```

---

## Refund Service

```python
# app/services/refund_service.py
from __future__ import annotations

from typing import Any
from uuid import uuid4

from waffo import WaffoUnknownStatusError

from app.config.waffo import get_waffo


def refund_order(
    acquiring_order_id: str,
    refund_amount: str,
    refund_currency: str,
    refund_reason: str | None = None,
) -> dict[str, Any]:
    """
    Refund a paid order.

    IMPORTANT:
    - `refundCurrency` MUST match the original order's currency, not the project's
      internal accounting currency.
    - Persist `refund_request_id` locally before calling Waffo so the unknown-status
      branch can recover with the same key.
    """
    waffo = get_waffo()
    refund_request_id = uuid4().hex

    payload = {
        "refundRequestId": refund_request_id,
        "acquiringOrderId": acquiring_order_id,
        "refundAmount": refund_amount,
        "refundCurrency": refund_currency,
    }
    if refund_reason:
        payload["refundReason"] = refund_reason

    try:
        response = waffo.order().refund(payload)
    except WaffoUnknownStatusError:
        return query_refund(refund_request_id)

    if not response.is_success():
        raise RuntimeError(
            f"Refund failed: {response.get_code()} - {response.get_message()}"
        )

    data = response.get_data()
    return {
        "refundRequestId": refund_request_id,
        "refundStatus": data.refund_status if data else None,
    }


def query_refund(refund_request_id: str) -> dict[str, Any]:
    waffo = get_waffo()
    response = waffo.refund().inquiry({"refundRequestId": refund_request_id})

    if not response.is_success():
        raise RuntimeError(
            f"Refund inquiry failed: {response.get_code()} - {response.get_message()}"
        )

    data = response.get_data()
    return {
        "refundRequestId": refund_request_id,
        "refundStatus": data.refund_status if data else None,
        "refundAmount": data.refund_amount if data else None,
    }
```

---

## Subscription Service

```python
# app/services/subscription_service.py
from __future__ import annotations

from typing import Any
from uuid import uuid4

from waffo import WaffoUnknownStatusError

from app.config.waffo import get_waffo


class SubscriptionCreateInput:
    def __init__(
        self,
        *,
        merchant_subscription_id: str,
        amount: str,
        currency: str,
        description: str,
        notify_url: str,
        success_redirect_url: str,
        user_id: str,
        user_email: str,
        user_terminal: str = "WEB",  # WEB | APP
        product_id: str,
        product_name: str,
        period_type: str = "MONTHLY",  # DAILY | WEEKLY | MONTHLY (NO YEARLY)
        period_interval: str = "1",  # string, not int
        goods_url: str,
    ) -> None:
        self.merchant_subscription_id = merchant_subscription_id
        self.amount = amount
        self.currency = currency
        self.description = description
        self.notify_url = notify_url
        self.success_redirect_url = success_redirect_url
        self.user_id = user_id
        self.user_email = user_email
        self.user_terminal = user_terminal
        self.product_id = product_id
        self.product_name = product_name
        self.period_type = period_type
        self.period_interval = period_interval
        self.goods_url = goods_url


def create_subscription(input: SubscriptionCreateInput) -> dict[str, Any]:
    waffo = get_waffo()
    subscription_request = uuid4().hex

    try:
        response = waffo.subscription().create(
            {
                "subscriptionRequest": subscription_request,
                "merchantSubscriptionId": input.merchant_subscription_id,
                "currency": input.currency,  # NOT orderCurrency (orders use orderCurrency)
                "amount": input.amount,      # NOT orderAmount
                "orderDescription": input.description,
                "notifyUrl": input.notify_url,
                "successRedirectUrl": input.success_redirect_url,
                "productInfo": {
                    "description": input.product_name,
                    "periodType": input.period_type,
                    "periodInterval": input.period_interval,
                },
                "userInfo": {
                    "userId": input.user_id,
                    "userEmail": input.user_email,
                    "userTerminal": input.user_terminal,
                },
                "goodsInfo": {
                    "goodsId": input.product_id,
                    "goodsName": input.product_name,
                    "goodsUrl": input.goods_url,
                },
                "paymentInfo": {
                    "productName": "SUBSCRIPTION",
                    # payMethodType is REQUIRED for subscriptions — omit and the server returns A0003.
                    "payMethodType": "CREDITCARD,DEBITCARD,APPLEPAY,GOOGLEPAY",
                },
            }
        )
    except WaffoUnknownStatusError:
        return query_subscription(subscription_request)

    if not response.is_success():
        raise RuntimeError(
            f"Subscription creation failed: {response.get_code()} - {response.get_message()}"
        )

    data = response.get_data()
    # IMPORTANT: insert a local subscription row keyed by `subscription_request`
    # BEFORE returning. All subscription webhooks identify by subscriptionRequest;
    # missing local rows = silent webhook failures.
    return {
        "subscriptionRequest": subscription_request,
        "subscriptionId": data.subscription_id if data else None,
        "subscriptionAction": data.subscription_action if data else None,
    }


def query_subscription(subscription_request: str) -> dict[str, Any]:
    waffo = get_waffo()
    response = waffo.subscription().inquiry({"subscriptionRequest": subscription_request})

    if not response.is_success():
        raise RuntimeError(
            f"Subscription inquiry failed: {response.get_code()} - {response.get_message()}"
        )

    data = response.get_data()
    return {
        "subscriptionRequest": subscription_request,
        "subscriptionId": data.subscription_id if data else None,
        "subscriptionStatus": data.subscription_status if data else None,
    }


def cancel_subscription(subscription_request: str) -> dict[str, Any]:
    waffo = get_waffo()
    try:
        response = waffo.subscription().cancel({"subscriptionRequest": subscription_request})
    except WaffoUnknownStatusError:
        return query_subscription(subscription_request)

    if not response.is_success():
        raise RuntimeError(
            f"Subscription cancel failed: {response.get_code()} - {response.get_message()}"
        )

    data = response.get_data()
    return {"subscriptionStatus": data.subscription_status if data else None}


def manage_subscription(subscription_request: str) -> str | None:
    """
    Get a subscription management URL. Only works when subscription is ACTIVE
    (after first successful payment).
    """
    waffo = get_waffo()
    response = waffo.subscription().manage({"subscriptionRequest": subscription_request})

    if not response.is_success():
        raise RuntimeError(
            f"Subscription manage failed: {response.get_code()} - {response.get_message()}"
        )

    data = response.get_data()
    return getattr(data, "management_url", None) if data else None


class ChangeSubscriptionInput:
    def __init__(
        self,
        *,
        origin_subscription_request: str,
        remaining_amount: str,
        currency: str,
        notify_url: str,
        user_id: str,
        user_email: str,
        user_terminal: str = "WEB",
        new_product_name: str,
        period_type: str = "MONTHLY",
        period_interval: str = "1",
        new_amount: str,
    ) -> None:
        self.origin_subscription_request = origin_subscription_request
        self.remaining_amount = remaining_amount
        self.currency = currency
        self.notify_url = notify_url
        self.user_id = user_id
        self.user_email = user_email
        self.user_terminal = user_terminal
        self.new_product_name = new_product_name
        self.period_type = period_type
        self.period_interval = period_interval
        self.new_amount = new_amount


def change_subscription(input: ChangeSubscriptionInput) -> dict[str, Any]:
    waffo = get_waffo()
    subscription_request = uuid4().hex

    try:
        response = waffo.subscription().change(
            {
                "subscriptionRequest": subscription_request,
                "originSubscriptionRequest": input.origin_subscription_request,
                "remainingAmount": input.remaining_amount,
                "currency": input.currency,
                "notifyUrl": input.notify_url,
                "productInfoList": [
                    {
                        "description": input.new_product_name,
                        "periodType": input.period_type,
                        "periodInterval": input.period_interval,
                        "amount": input.new_amount,
                    }
                ],
                "userInfo": {
                    "userId": input.user_id,
                    "userEmail": input.user_email,
                    "userTerminal": input.user_terminal,
                },
                "goodsInfo": {
                    "goodsId": "subscription",
                    "goodsName": input.new_product_name,
                },
                "paymentInfo": {
                    "productName": "SUBSCRIPTION",
                },
            }
        )
    except WaffoUnknownStatusError:
        return query_subscription_change(
            input.origin_subscription_request, subscription_request
        )

    if not response.is_success():
        raise RuntimeError(
            f"Subscription change failed: {response.get_code()} - {response.get_message()}"
        )

    data = response.get_data()
    return {
        "subscriptionRequest": subscription_request,
        "subscriptionChangeStatus": data.subscription_change_status if data else None,
        "subscriptionId": data.subscription_id if data else None,
    }


def query_subscription_change(
    origin_subscription_request: str, subscription_request: str
) -> dict[str, Any]:
    waffo = get_waffo()
    response = waffo.subscription().change_inquiry(
        {
            "originSubscriptionRequest": origin_subscription_request,
            "subscriptionRequest": subscription_request,
        }
    )

    if not response.is_success():
        raise RuntimeError(
            f"Subscription change inquiry failed: {response.get_code()} - {response.get_message()}"
        )

    data = response.get_data()
    return {
        "subscriptionRequest": subscription_request,
        "subscriptionChangeStatus": data.subscription_change_status if data else None,
        "subscriptionId": data.subscription_id if data else None,
    }
```

---

## Webhook Handler

Webhook bodies must be the **raw JSON string** as received — do NOT re-serialize after framework parsing, or signature verification will fail. Both response headers (`X-SIGNATURE` and `Content-Type: application/json`) are required; frameworks default to `text/plain`.

### FastAPI

```python
# app/webhooks/waffo_webhook.py
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request, Response

from app.config.waffo import get_waffo

router = APIRouter()


def _on_payment(notification: dict[str, Any]) -> None:
    result = notification.get("result", {}) or {}

    # NOTE: If Subscription is also integrated, route subscription payment notifications separately:
    # product_name = (result.get("paymentInfo") or {}).get("productName")
    # if product_name in {"SUBSCRIPTION", "MINI_PROGRAM_SUBSCRIPTION"}:
    #     # Subscription integrations must test PAYMENT_NOTIFICATION.
    #     # Record/process subscription payment attempts/retries, then skip one-time fulfillment.
    #     return

    # Three-stage pattern: idempotency → lock → transaction
    # Stage 1: Find local order by paymentRequestId; skip if already terminal
    # Stage 2: Lock the order (DB row lock / Redis lock) to prevent duplicate processing
    # Stage 3: In a DB transaction — update status + execute business logic
    #
    # Key fields: result["paymentRequestId"], result["orderStatus"], result["acquiringOrderId"]
    # PAY_SUCCESS → execute business logic (add balance/quota, fulfill order)
    # ORDER_CLOSE → mark order as expired/failed
    print(
        f"Payment: paymentRequestId={result.get('paymentRequestId')}, "
        f"orderStatus={result.get('orderStatus')}, "
        f"acquiringOrderId={result.get('acquiringOrderId')}"
    )


def _on_refund(notification: dict[str, Any]) -> None:
    # Three-stage pattern: idempotency → lock → transaction
    # IMPORTANT: Refund notifications identify orders by acquiringOrderId (NOT paymentRequestId).
    # You must have stored acquiringOrderId from the order create response to look up the local order.
    # Key fields: result["acquiringOrderId"], result["refundStatus"], result["refundRequestId"]
    # ORDER_FULLY_REFUNDED → revoke benefits, mark order as refunded
    # ORDER_PARTIALLY_REFUNDED → update partial refund state
    result = notification.get("result", {}) or {}
    print(
        f"Refund: acquiringOrderId={result.get('acquiringOrderId')}, "
        f"refundStatus={result.get('refundStatus')}, "
        f"refundRequestId={result.get('refundRequestId')}"
    )


def _on_subscription_status(notification: dict[str, Any]) -> None:
    # Three-stage pattern: idempotency → lock → transaction
    # Look up local record by subscriptionRequest (must exist from subscription create).
    # Key fields: result["subscriptionRequest"], result["subscriptionStatus"], result["subscriptionId"]
    # ACTIVE → activate subscription / grant access
    # MERCHANT_CANCELLED / USER_CANCELLED / EXPIRED / CLOSE → revoke access
    result = notification.get("result", {}) or {}
    print(
        f"Subscription status: subscriptionRequest={result.get('subscriptionRequest')}, "
        f"status={result.get('subscriptionStatus')}, "
        f"subscriptionId={result.get('subscriptionId')}"
    )


def _on_subscription_period_changed(notification: dict[str, Any]) -> None:
    # Look up local record by subscriptionRequest.
    # Record the renewal and extend user access for the next billing period.
    result = notification.get("result", {}) or {}
    print(
        f"Subscription period changed: subscriptionRequest={result.get('subscriptionRequest')}, "
        f"subscriptionId={result.get('subscriptionId')}"
    )


def _on_subscription_change(notification: dict[str, Any]) -> None:
    # Handle upgrade/downgrade result.
    # Key fields: result["subscriptionChangeStatus"], result["originSubscriptionRequest"], result["subscriptionRequest"]
    result = notification.get("result", {}) or {}
    print(
        f"Subscription change: changeStatus={result.get('subscriptionChangeStatus')}, "
        f"subscriptionId={result.get('subscriptionId')}"
    )


@router.post("/waffo/webhook")
async def waffo_webhook(request: Request) -> Response:
    waffo = get_waffo()

    # MUST read the raw body bytes — do not let FastAPI parse the JSON, or the
    # bytes used for signature verification will not match what Waffo signed.
    body = (await request.body()).decode("utf-8")
    signature = request.headers.get("X-SIGNATURE", "")

    handler = (
        waffo.webhook()
        .on_payment(_on_payment)
        .on_refund(_on_refund)
        .on_subscription_status(_on_subscription_status)
        .on_subscription_period_changed(_on_subscription_period_changed)
        .on_subscription_change(_on_subscription_change)
    )

    result = handler.handle_webhook(body, signature)

    # Both headers are required. Content-Type defaults to text/plain in FastAPI Response,
    # so set it explicitly.
    return Response(
        content=result.response_body,
        media_type="application/json",
        headers={"X-SIGNATURE": result.response_signature},
        status_code=200,
    )
```

### Flask

```python
# app/webhooks/waffo_webhook.py
from __future__ import annotations

from typing import Any

from flask import Blueprint, Response, request

from app.config.waffo import get_waffo

bp = Blueprint("waffo_webhook", __name__)


def _on_payment(notification: dict[str, Any]) -> None:
    result = notification.get("result", {}) or {}
    # NOTE: If Subscription is also integrated, add productName filter here
    # (skip "SUBSCRIPTION" / "MINI_PROGRAM_SUBSCRIPTION" — see FastAPI template above)
    # Three-stage pattern: idempotency → lock → transaction
    # Key fields: result["paymentRequestId"], result["orderStatus"], result["acquiringOrderId"]
    print(
        f"Payment: paymentRequestId={result.get('paymentRequestId')}, "
        f"orderStatus={result.get('orderStatus')}"
    )


def _on_refund(notification: dict[str, Any]) -> None:
    # IMPORTANT: Refund identifies orders by acquiringOrderId, NOT paymentRequestId.
    # Key fields: result["acquiringOrderId"], result["refundStatus"], result["refundRequestId"]
    result = notification.get("result", {}) or {}
    print(
        f"Refund: acquiringOrderId={result.get('acquiringOrderId')}, "
        f"refundStatus={result.get('refundStatus')}"
    )


@bp.post("/waffo/webhook")
def waffo_webhook() -> Response:
    waffo = get_waffo()

    # Use get_data(as_text=True) for the RAW JSON body — do not call .json or
    # request.get_json(), or signature verification will fail.
    body = request.get_data(as_text=True)
    signature = request.headers.get("X-SIGNATURE", "")

    handler = waffo.webhook().on_payment(_on_payment).on_refund(_on_refund)
    result = handler.handle_webhook(body, signature)

    response = Response(
        result.response_body,
        status=200,
        mimetype="application/json",
    )
    response.headers["X-SIGNATURE"] = result.response_signature
    return response
```

### Django

```python
# app/webhooks/waffo_webhook.py
from __future__ import annotations

from typing import Any

from django.http import HttpRequest, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from app.config.waffo import get_waffo


def _on_payment(notification: dict[str, Any]) -> None:
    result = notification.get("result", {}) or {}
    # NOTE: If Subscription is also integrated, add productName filter here
    # (skip "SUBSCRIPTION" / "MINI_PROGRAM_SUBSCRIPTION" — see FastAPI template above)
    # Three-stage pattern: idempotency → lock → transaction
    # Key fields: result["paymentRequestId"], result["orderStatus"], result["acquiringOrderId"]
    print(
        f"Payment: paymentRequestId={result.get('paymentRequestId')}, "
        f"orderStatus={result.get('orderStatus')}"
    )


def _on_refund(notification: dict[str, Any]) -> None:
    # IMPORTANT: Refund identifies orders by acquiringOrderId, NOT paymentRequestId.
    result = notification.get("result", {}) or {}
    print(
        f"Refund: acquiringOrderId={result.get('acquiringOrderId')}, "
        f"refundStatus={result.get('refundStatus')}"
    )


@csrf_exempt
@require_POST
def waffo_webhook(request: HttpRequest) -> HttpResponse:
    waffo = get_waffo()

    # request.body returns bytes; decode to str without re-parsing.
    body = request.body.decode("utf-8")
    signature = request.headers.get("X-SIGNATURE", "")

    handler = waffo.webhook().on_payment(_on_payment).on_refund(_on_refund)
    result = handler.handle_webhook(body, signature)

    response = HttpResponse(
        result.response_body,
        content_type="application/json",
        status=200,
    )
    response["X-SIGNATURE"] = result.response_signature
    return response
```

---

## Test Template (Sandbox Integration)

```python
# tests/integration/test_payment.py
from __future__ import annotations

import os
from time import time
from uuid import uuid4

import pytest

from waffo import Environment, Waffo, WaffoConfig

HAS_CREDENTIALS = all(
    os.environ.get(key)
    for key in ("WAFFO_API_KEY", "WAFFO_PRIVATE_KEY", "WAFFO_PUBLIC_KEY", "WAFFO_MERCHANT_ID")
)

pytestmark = pytest.mark.skipif(not HAS_CREDENTIALS, reason="Sandbox credentials missing")


@pytest.fixture(scope="module")
def waffo() -> Waffo:
    return Waffo(
        WaffoConfig(
            api_key=os.environ["WAFFO_API_KEY"],
            private_key=os.environ["WAFFO_PRIVATE_KEY"],
            waffo_public_key=os.environ["WAFFO_PUBLIC_KEY"],
            merchant_id=os.environ["WAFFO_MERCHANT_ID"],
            environment=Environment.SANDBOX,
        )
    )


def test_create_payment_order(waffo: Waffo) -> None:
    payment_request_id = uuid4().hex

    response = waffo.order().create(
        {
            "paymentRequestId": payment_request_id,
            "merchantOrderId": f"test-{int(time())}",
            "orderCurrency": "USD",
            "orderAmount": "1.00",
            "orderDescription": "Integration test order",
            "notifyUrl": "https://example.com/webhook",
            "userInfo": {
                "userId": "test-user",
                "userEmail": "test-user@example.com",
                "userTerminal": "WEB",
            },
            "paymentInfo": {"productName": "ONE_TIME_PAYMENT"},
        }
    )

    assert response.is_success(), (
        f"Create order failed: paymentRequestId={payment_request_id}, "
        f"code={response.get_code()}, message={response.get_message()}"
    )

    data = response.get_data()
    assert data is not None
    assert data.acquiring_order_id


def test_inquiry_order(waffo: Waffo) -> None:
    payment_request_id = uuid4().hex

    waffo.order().create(
        {
            "paymentRequestId": payment_request_id,
            "merchantOrderId": f"test-{int(time())}",
            "orderCurrency": "USD",
            "orderAmount": "1.00",
            "orderDescription": "Test",
            "notifyUrl": "https://example.com/webhook",
            "userInfo": {
                "userId": "test-user",
                "userEmail": "test-user@example.com",
                "userTerminal": "WEB",
            },
            "paymentInfo": {"productName": "ONE_TIME_PAYMENT"},
        }
    )

    response = waffo.order().inquiry({"paymentRequestId": payment_request_id})
    assert response.is_success()
```

---

## Merchant Config & Payment Method Query

```python
# app/services/config_service.py
from __future__ import annotations

from typing import Any

from app.config.waffo import get_waffo


def get_merchant_config() -> Any:
    waffo = get_waffo()
    response = waffo.merchant_config().inquiry({})

    if not response.is_success():
        raise RuntimeError(
            f"Merchant config inquiry failed: {response.get_code()} - {response.get_message()}"
        )

    return response.get_data()


def get_payment_methods() -> Any:
    waffo = get_waffo()
    response = waffo.pay_method_config().inquiry({})

    if not response.is_success():
        raise RuntimeError(
            f"Pay method inquiry failed: {response.get_code()} - {response.get_message()}"
        )

    return response.get_data()
```

---

## Python-Specific Pitfalls

1. **Payload keys stay camelCase**: The SDK sends dict payloads to the API verbatim — write `"paymentRequestId"`, not `"payment_request_id"`. Only method names use snake_case (`waffo.subscription().change_inquiry()`).
2. **Request ID = `uuid4().hex`**: returns 32 chars without dashes. `str(uuid4())` returns 36 chars and will be rejected.
3. **Raw webhook body**: read the unparsed request body bytes. FastAPI `await request.body()`, Flask `request.get_data(as_text=True)`, Django `request.body`. Calling `.json()` first re-serializes and breaks signature verification.
4. **Set `Content-Type: application/json` on webhook responses**: Python frameworks default to `text/plain` for `Response(string)`. Use `media_type=` / `mimetype=` / `content_type=` explicitly.
5. **`WaffoUnknownStatusError` only fires on network errors during writes**: it is NOT raised on logical errors. Use `try/except` around `order().create()`, `order().refund()`, `order().cancel()`, `order().capture()`, `subscription().create()`, `subscription().cancel()`, `subscription().change()` — and recover by calling the matching `inquiry()` / `change_inquiry()` with the **same** request ID.
6. **Thread-safe singleton**: workers (Gunicorn / Uvicorn) fork after import. Initialize the Waffo client lazily inside the worker (e.g., the `get_waffo()` cache above) so each worker holds its own client; do not import-time-construct.
7. **`periodInterval` is a string**: `"1"`, not `1`. Same for `currentPeriod`.
8. **`payMethodType` for subscriptions**: required field — server returns A0003 if omitted. Default to `"CREDITCARD,DEBITCARD,APPLEPAY,GOOGLEPAY"`.
9. **Store both `acquiringOrderId` (from order create) and `subscriptionRequest` (your own ID) before returning to the caller**: refund webhooks key on `acquiringOrderId`; subscription webhooks key on `subscriptionRequest`. Missing local rows = silent webhook drops.
10. **Environment is required**: `WaffoConfig` does not default `environment`. Always pass `Environment.SANDBOX` or `Environment.PRODUCTION` to prevent accidental production traffic from a dev machine.
