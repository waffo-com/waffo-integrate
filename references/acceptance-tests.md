# Waffo Acceptance Test Reference

Load this file when the merchant triggers acceptance testing (Step 9).
This is the data layer — SKILL.md Step 9 defines the execution protocol.

---

## §1 Sandbox Test Cards

All test cards use: **Expiry: 12/2029, CVV: 123, Cardholder: TEST USER**

| Pay Method | Success Card | Failure Card |
|-----------|-------------|-------------|
| CC_VISA | 4576750000000110 | 4576750000000220 |
| CC_MASTER | 2226900000000110 | 2226900000000220 |
| CC_JCB | 3528000000000214 | 3528000000120006 |
| CC_AMEX | 3400000000000216 | 340000000200027 |
| DC_VISA | 4001700000000110 | 4001700000000220 |
| DC_MASTER | 2226930000000110 | 2226930000000220 |
| DC_JCB | 3088850000000116 | 3088850000200004 |
| DC_AMEX | 340034000100009 | 340034000400003 |

**Usage**: When Playwright fills the checkout page, select the card type matching the merchant's contracted pay method, then fill the corresponding card number above.

---

## §2 Magic Amount Table

Sandbox uses specific amounts to simulate error scenarios. Use any amount from the list.

### Order Create / Subscription Create

| Amount | Error Code | Error Description |
|--------|-----------|-------------------|
| 90, 990, 1990, 19990 | C0005 | Payment Channel Rejection |
| 9.1, 91, 991, 1991, 19991 | C0001 | System Error |
| 9.2, 92, 992, 1992, 19992 | E0001 | Unknown Status |

### Order Cancel

| Amount | Error Code | Error Description |
|--------|-----------|-------------------|
| 9.3, 93, 993, 1993, 19993 | C0001 | System Error |
| 9.4, 94, 994, 1994, 19994 | E0001 | Unknown Status |

### Refund

| Amount | Error Code | Error Description |
|--------|-----------|-------------------|
| 9.5, 95, 995, 1995, 19995 | C0001 | System Error |
| 9.6, 96, 996, 1996, 19996 | E0001 | Unknown Status |

**Note**: For refund failure test (6.4 ORDER_REFUND_FAILED), also use amounts 9.6, 96, 996, 1996, 19996 and wait for the refund to reach terminal failed state.

---

## §3 Payment Test Cases (30 cases)

### Phase 1: API Error Scenarios (no human action needed)

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| 1.3 | Channel rejection | API | `orderAmount` = "90", any contracted pay method | `code` = "C0005" | `response.getCode() === "C0005"` |
| 1.4 | Idempotent error | API | Same `paymentRequestId` as 1.3, different `orderAmount` | `code` = "A0011" | `response.getCode() === "A0011"` |
| 1.5 | System error | API | `orderAmount` = "91" | `code` = "C0001" | `response.getCode() === "C0001"` |
| 1.6 | Unknown status | API | `orderAmount` = "92" | `code` = "E0001" | `response.getCode() === "E0001"` |
| 4.4 | Cancel system error | API | Create order with `orderAmount` = "93", then cancel | `code` = "C0001" | `response.getCode() === "C0001"` |
| 4.5 | Cancel unknown | API | Create order with `orderAmount` = "94", then cancel | `code` = "E0001" | `response.getCode() === "E0001"` |
| 5.5 | Refund system error | API | Refund with `refundAmount` = "95" (on a paid order) | `code` = "C0001" | `response.getCode() === "C0001"` |
| 5.6 | Refund unknown | API | Refund with `refundAmount` = "96" (on a paid order) | `code` = "E0001" | `response.getCode() === "E0001"` |

### Phase 2: Payment Success (Playwright checkout)

For EACH contracted pay method, repeat with the matching success test card.

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| 1.1 | Pay success | Playwright | Normal amount (e.g., "100"), success test card | `orderStatus` = "PAY_SUCCESS" via webhook or inquiry | Webhook: verify `paymentRequestId`, `orderCurrency`, `orderAmount` match. Check `successRedirectUrl` redirect. |

**Execution**: Create order → get checkout URL from `orderAction` → Playwright opens URL → fill test card → submit → poll `order().inquiry()` until `PAY_SUCCESS` or timeout.

Save the `paymentRequestId` and `acquiringOrderId` from this phase — used in Phase 4, 5, 7.

### Phase 3: Payment Failure (Playwright checkout)

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| 1.2 | Pay failure | Playwright | Normal amount, failure test card | `orderStatus` = "ORDER_CLOSE" via webhook or inquiry | Webhook: verify `paymentRequestId`, `orderCurrency`, `orderAmount` match. Check `failedRedirectUrl` redirect. |

Save the `paymentRequestId` from this phase — used in Phase 4.

### Phase 4: Inquiry (API, depends on Phase 2 & 3)

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| 2.1 | Inquiry before payment | API | Create a new order (do NOT pay), then inquiry | `orderStatus` = "AUTHORIZATION_REQUIRED" or "PAY_IN_PROGRESS". Check `orderAction` has `webUrl`. | Verify `paymentRequestId`, `orderCurrency`, `orderAmount` match merchant records |
| 2.2 | Inquiry after success | API | Use Phase 2's `paymentRequestId` | `orderStatus` = "PAY_SUCCESS" | Verify `paymentRequestId`, `orderCurrency`, `orderAmount` match |
| 2.3 | Inquiry after failure | API | Use Phase 3's `paymentRequestId` | `orderStatus` = "ORDER_CLOSE" | Verify `paymentRequestId`, `orderCurrency`, `orderAmount` match |

### Phase 5: Cancel (API, depends on Phase 2)

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| 4.1 | Cancel success | API | Create new order, cancel before payment | `orderStatus` = "ORDER_CLOSE" via inquiry | Inquiry confirms ORDER_CLOSE |
| 4.2 | Cancel unsupported channel | API | Cancel on a channel that doesn't support cancel | `code` = "A0015" | `response.getCode() === "A0015"` |
| 4.3 | Cancel after payment | API | Cancel using Phase 2's paid order | `code` = "A0013" | `response.getCode() === "A0013"` |

**Note**: 4.2 requires a pay method that doesn't support cancel. If all contracted methods support cancel, SKIP this test case.

### Phase 6: Webhook Notifications (requires tunnel)

**Prerequisite**: Merchant's webhook endpoint must be running and reachable via tunnel (cloudflared/ngrok).

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| 3.1 | Payment success webhook | Webhook | Triggered by Phase 2 payment success | Webhook received with `orderStatus` = "PAY_SUCCESS" | 1. Signature passes. 2. `paymentRequestId`, `orderCurrency`, `orderAmount` match. |
| 3.2 | Payment failure webhook | Webhook | Triggered by Phase 3 payment failure | Webhook received with `orderStatus` = "ORDER_CLOSE" | 1. Signature passes. 2. `paymentRequestId`, `orderCurrency`, `orderAmount` match. |
| 3.3 | Signature verification failure | Webhook | `curl` with forged `X-SIGNATURE` header to merchant's webhook endpoint | Handler returns non-200 or rejects | Merchant does NOT update order status. Verify via inquiry that order status unchanged. |

**3.3 Execution Protocol**:
```bash
# Send a fake webhook with wrong signature to the merchant's notifyUrl
curl -X POST {notifyUrl} \
  -H "Content-Type: application/json" \
  -H "X-TIMESTAMP: $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -H "X-SIGNATURE: INVALID_SIGNATURE_FOR_TESTING" \
  -d '{"paymentRequestId":"test-sig-fail","orderStatus":"PAY_SUCCESS","orderCurrency":"USD","orderAmount":"100"}'
```
Expected: HTTP status != 200, or response body indicates signature failure.

### Phase 7: Refund (API, depends on Phase 2)

**Important**: Execute in this order to preserve test conditions.

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| 5.2 | Refund param validation | API | Refund with `refundAmount` > original order amount | `code` = "A0003" | `response.getCode() === "A0003"` |
| 5.3 | Refund rules violation | API | Refund on unsupported-refund pay method, OR second refund after partial | `code` = "A0014" | `response.getCode() === "A0014"` |
| 5.4 | Refund idempotent error | API | Same `refundRequestId`, different `refundAmount` | `code` = "A0011" | `response.getCode() === "A0011"` |
| 5.1 | Refund success | API | Refund Phase 2's paid order, valid amount | `refundStatus` = "REFUND_IN_PROGRESS" or terminal state | Verify `refundRequestId`, `refundAmount` match |
| 6.1 | Refund inquiry in progress | API | Inquiry immediately after 5.1 | `refundStatus` = "REFUND_IN_PROGRESS" | Verify `refundRequestId`, `refundAmount` match |
| 6.2 | Refund inquiry fully refunded | API | Inquiry after full refund completes | `refundStatus` = "ORDER_FULLY_REFUNDED" | Verify `refundRequestId`, `refundAmount` match |
| 6.3 | Refund inquiry partially refunded | API | Partial refund first, then inquiry | `refundStatus` = "ORDER_PARTIALLY_REFUNDED" | Verify `refundRequestId`, `refundAmount` match |
| 6.4 | Refund inquiry failed | API | Refund with magic amount (96), wait for failure | `refundStatus` = "ORDER_REFUND_FAILED" | Verify `refundRequestId`, `refundAmount` match |

**Note**: 6.2 and 6.3 may need to be tested with separate orders if the first refund consumes the full amount. Generate two paid orders in Phase 2 if needed.

### Phase 8: Refund Webhook (requires tunnel)

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| 7.1 | Refund success webhook | Webhook | Triggered by 5.1 refund | Webhook with `refundStatus` = "ORDER_FULLY_REFUNDED" or "ORDER_PARTIALLY_REFUNDED" | 1. Signature passes. 2. `refundRequestId`, `refundAmount` match. |
| 7.2 | Refund failure webhook | Webhook | Triggered by failed refund (magic amount 96) | Webhook with `refundStatus` = "ORDER_REFUND_FAILED" | 1. Signature passes. 2. `refundRequestId`, `refundAmount` match. |
| 7.3 | Refund signature failure | Webhook | `curl` with forged signature to `refundNotifyUrl` | Handler rejects | Same protocol as 3.3 |

---

## §4 Subscription Test Cases (35 cases)

### Phase 9: Subscription Error Scenarios (API, no human action)

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| S-1.5 | Channel rejection | API | `amount` = "90" | `code` = "C0005" | `response.getCode() === "C0005"` |
| S-1.6 | Idempotent error | API | Same `subscriptionRequest`, different `amount` | `code` = "A0011" | `response.getCode() === "A0011"` |
| S-1.7 | System error | API | `amount` = "91" | `code` = "C0001" | `response.getCode() === "C0001"` |
| S-1.8 | Unknown status | API | `amount` = "92" | `code` = "E0001" | `response.getCode() === "E0001"` |

### Phase 10: Subscription Payment (Playwright checkout)

For EACH contracted pay method, repeat with matching success/failure test card.

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| S-1.1 | Subscription success | Playwright | Normal amount, success test card | `subscriptionStatus` = "ACTIVE" via webhook. Subscription Notification: verify `subscriptionRequest`, `currency`, `amount`, `periodType`, `periodInterval` match. Subscription Payment Notification: verify `subscriptionRequest`, `orderCurrency` match, `orderAmount` = first period amount. | Check `successRedirectUrl` redirect. |
| S-1.2 | Subscription failure | Playwright | Normal amount, failure test card | `subscriptionStatus` = "CLOSE" via webhook | Check `failedRedirectUrl` redirect. |

Save `subscriptionRequest`, `subscriptionId` from S-1.1 — used in all subsequent phases.

### Phase 11: Subscription Inquiry (API, depends on Phase 10)

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| S-2.1 | Inquiry before payment | API | Create new subscription (do NOT pay), inquiry | `subscriptionStatus` = "AUTHORIZATION_REQUIRED" or "PAY_IN_PROGRESS". Check `subscriptionAction.webUrl` present. | Verify `subscriptionRequest`, `currency`, `amount`, `periodType`, `periodInterval` match |
| S-2.2 | Inquiry after success | API | Use Phase 10's `subscriptionRequest` | `subscriptionStatus` = "ACTIVE" | Verify all subscription fields match |
| S-2.3 | Inquiry after failure | API | Use Phase 10's failed subscription | `subscriptionStatus` = "CLOSE" | Verify all subscription fields match |

### Phase 12: Subscription Notifications (Webhook, depends on Phase 10)

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| S-3.1 | Subscription success notification | Webhook | Triggered by S-1.1 | `subscriptionStatus` = "ACTIVE" | 1. Signature passes. 2. Verify `subscriptionRequest`, `currency`, `amount`, `periodType`, `periodInterval` match. |
| S-3.2 | Subscription failure notification | Webhook | Triggered by S-1.2 | `subscriptionStatus` = "CLOSE" | 1. Signature passes. 2. Verify fields match. |
| S-3.5 | Subscription signature failure | Webhook | `curl` with forged signature | Handler rejects | Same protocol as 3.3 |
| S-4.1 | First period payment notification | Webhook | Triggered by S-1.1 | `orderStatus` = "PAY_SUCCESS" | 1. Signature passes. 2. Verify `subscriptionRequest`, `orderCurrency`, `orderAmount` = first period amount. |
| S-4.4 | Payment notification signature failure | Webhook | `curl` with forged signature | Handler rejects | Same protocol as 3.3 |

### Phase 13: Next Period (Playwright management page)

**Prerequisite**: Call `subscription().manage()` to get the management URL.

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| S-1.3 | Next period success | Playwright | Click "Next Period Payment Success" button on management page | Subscription Payment Notification: `orderStatus` = "PAY_SUCCESS". Verify `subscriptionRequest`, `orderCurrency` match, `orderAmount` = current period amount. | Poll or wait for webhook |
| S-1.4 | Next period failure | Playwright | Click "Next Period Payment Failure" button on management page | Subscription Payment Notification: `orderStatus` = "ORDER_CLOSE". | Poll or wait for webhook |
| S-4.2 | Next period success notification | Webhook | Triggered by S-1.3 | Same as S-4.1 but for period >= 2 | Verify `period` field incremented |
| S-4.3 | Next period failure notification | Webhook | Triggered by S-1.4 | `orderStatus` = "ORDER_CLOSE" | Verify `subscriptionRequest`, `orderCurrency` match |

### Phase 14: Subscription Cancel (API, MUST run AFTER Phase 12 & 13)

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| S-5.1 | Cancel success | API | Cancel Phase 10's active subscription | Subscription Inquiry: `subscriptionStatus` = "MERCHANT_CANCELLED" | Inquiry confirms MERCHANT_CANCELLED |
| S-3.4 | Merchant cancel notification | Webhook | Triggered by S-5.1 | `subscriptionStatus` = "MERCHANT_CANCELLED" | 1. Signature passes. 2. Verify fields match. |
| S-3.3 | Channel cancel notification | Webhook | Triggered when channel cancels | `subscriptionStatus` = "CHANNEL_CANCELLED" | Note: May not be triggerable in Sandbox. SKIP if not applicable. |
| S-5.6 | Cancel system error | API | Cancel with magic amount 93 subscription | `code` = "C0001" | `response.getCode() === "C0001"` |
| S-5.7 | Cancel unknown | API | Cancel with magic amount 94 subscription | `code` = "E0001" | `response.getCode() === "E0001"` |

### Phase 15: Order Inquiry for Subscription Payments (API, optional)

| ID | Name | Mode | Input | Expected | Assertion |
|----|------|------|-------|----------|-----------|
| S-6.1 | Order inquiry after subscription payment success | API | Use `acquiringOrderId` from subscription payment notification | `orderStatus` = "PAY_SUCCESS" | Verify `subscriptionRequest`, `period`, `orderCurrency`, `orderAmount` match |
| S-6.2 | Order inquiry after subscription payment failure | API | Use `acquiringOrderId` from failed payment notification | `orderStatus` = "ORDER_CLOSE" | Verify fields match |

### Phase 16: Subscription Refund (API, optional — skip if previously tested in Payment)

Same as Payment Phase 7-8 (test cases 5.1-5.6, 6.1-6.4, 7.1-7.3) but applied to a subscription payment order.

---

## §5 Execution Dependencies

```
Payment Flow:
  Phase 1 (errors) → no dependency
  Phase 2 (pay success) → no dependency
  Phase 3 (pay failure) → no dependency
  Phase 4 (inquiry) → depends on Phase 2, 3
  Phase 5 (cancel) → depends on Phase 2
  Phase 6 (webhooks) → depends on Phase 2, 3 + tunnel
  Phase 7 (refund) → depends on Phase 2
  Phase 8 (refund webhooks) → depends on Phase 7 + tunnel

Subscription Flow:
  Phase 9 (errors) → no dependency
  Phase 10 (subscribe) → no dependency
  Phase 11 (inquiry) → depends on Phase 10
  Phase 12 (notifications) → depends on Phase 10 + tunnel
  Phase 13 (next period) → depends on Phase 10
  Phase 14 (cancel) → depends on Phase 12, 13 (run AFTER all notification tests)
  Phase 15 (order inquiry) → depends on Phase 10
  Phase 16 (refund) → depends on Phase 10
```

---

## §6 Playwright Checkout Protocol

When a test requires completing payment on the checkout page:

1. **Navigate**: `browser_navigate` to the checkout URL from `orderAction.webUrl` or `subscriptionAction.webUrl`
2. **Wait**: `browser_wait_for` the payment form to load (look for card input fields)
3. **Snapshot**: `browser_snapshot` to identify form structure
4. **Select card type**: If there's a card type selector, click the appropriate card brand tab
5. **Fill card details**:
   - Card number: Use the test card from §1 matching the pay method
   - Expiry month: `12`
   - Expiry year: `2029` (or `29` depending on field format)
   - CVV: `123`
   - Cardholder name: `TEST USER`
6. **Submit**: Click the pay/submit button
7. **Wait for redirect**: `browser_wait_for` navigation to `successRedirectUrl` or `failedRedirectUrl`
8. **Verify**: Check the final URL matches the expected redirect

**If Playwright MCP is not available**: Output the checkout URL and test card info, ask merchant to manually complete payment, then continue with API polling.

---

## §7 Signature Failure Protocol

For all signature verification failure tests (3.3, 7.3, S-3.5, S-4.4):

```bash
curl -X POST {merchant_notify_url} \
  -H "Content-Type: application/json" \
  -H "X-TIMESTAMP: $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -H "X-SIGNATURE: INVALID_SIGNATURE_aaaabbbbccccdddd" \
  -d '{test_payload}'
```

**Expected behavior**: Merchant's webhook handler should:
- Return HTTP status != 200 (e.g., 401 or 400)
- OR return `{"result":"FAIL"}` or similar rejection
- NOT update order/subscription status based on this request

**Verification**: After sending the forged request, call the inquiry API to confirm the order/subscription status has NOT changed.

---

## §8 Report Template

```
╔══════════════════════════════════════════════════════════════════╗
║                  Waffo Acceptance Test Report                    ║
║  Merchant: {merchantId}                                          ║
║  Date: {date}                                                    ║
║  Product: {ONE_TIME_PAYMENT / SUBSCRIPTION / BOTH}               ║
║  Pay Methods Tested: {list}                                      ║
╠════════╦══════════════════════════════╦════════╦═════════════════╣
║ ID     ║ Scenario                     ║ Result ║ Details         ║
╠════════╬══════════════════════════════╬════════╬═════════════════╣
║ 1.1    ║ Pay success (CC_VISA)        ║ PASS   ║ PAY_SUCCESS     ║
║ 1.2    ║ Pay failure (CC_VISA)        ║ PASS   ║ ORDER_CLOSE     ║
║ 1.3    ║ Channel rejection C0005      ║ PASS   ║ code=C0005      ║
║ ...    ║ ...                          ║ ...    ║ ...             ║
╠════════╩══════════════════════════════╩════════╩═════════════════╣
║ Summary: {passed}/{total} passed, {failed} failed, {skipped} skip║
╠═════════════════════════════════════════════════════════════════╣
║ Failed Cases:                                                    ║
║   5.1 - Expected REFUND_IN_PROGRESS, got code=A0003             ║
║ Skipped Cases:                                                   ║
║   4.2 - All pay methods support cancel                          ║
║   S-3.3 - Channel cancel not triggerable in Sandbox             ║
╚══════════════════════════════════════════════════════════════════╝
```

The report should be printed to console AND saved to a file (e.g., `waffo-acceptance-report-{date}.txt`) in the project root.
