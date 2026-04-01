# Sandbox Knowledge Base

This file is loaded during **Step 7** test execution only. Contains Sandbox-specific behaviors, quirks, and test strategies.

---

## K024: Credit Card Refund Does Not Trigger Webhook in Sandbox

**Symptom**: After refunding a credit card payment in Sandbox, `REFUND_NOTIFICATION` webhook is never delivered.

**Root Cause**: Sandbox limitation — credit card refund webhooks are not simulated.

**Workaround**: To test refund webhook handling, use **DANA** (e-wallet) payment method instead of credit cards. DANA refunds in Sandbox do trigger `REFUND_NOTIFICATION`.

**Impact on Testing**: If the merchant only has card methods contracted, refund-webhook test must be marked SKIP with this reason. Verify refund status via `refund().inquiry()` API instead.

---

## K018: Subscription Renewal Simulation

**Symptom**: Need to trigger `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION` for testing renewal flow.

**How to Trigger**: 
1. Get the subscription management URL via `subscription().manage()` API (subscription must be ACTIVE)
2. The Sandbox management URL includes `mock=true` automatically
3. Open the management page with Playwright
4. Click the **"Next period payment success"** / **"simulate"** button on the page
5. This triggers `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION` webhook delivery

**Note**: `manage()` API only works when subscription status is `ACTIVE` (first payment completed).

---

## K026: Sandbox Checkout Page Selectors

**Symptom**: Sandbox checkout page DOM structure may change between updates.

**Best Practice**: 
- Prefer `autocomplete` attribute selectors over CSS class or ID selectors
- Card number field: `[autocomplete="cc-number"]`
- Expiry field: `[autocomplete="cc-exp"]`
- CVV field: `[autocomplete="cc-csc"]`
- If `autocomplete` selectors don't match, fall back to `browser_snapshot` and adapt to current structure

---

## K023: Webhook Response Format

**Requirement**: Webhook response body must be exactly `{"message":"success"}` with `Content-Type: application/json`.

**Common Mistakes**:
- Extra whitespace or newlines in response body
- Missing or wrong Content-Type header
- Returning HTML or plain text instead of JSON

**Note**: When using the SDK's `HandleWebhook()` method, the response is automatically formatted correctly. This is only a concern for custom webhook implementations.

---

## K027: Concurrency Rate Limiting

**Symptom**: Sending too many API requests in rapid succession may trigger Sandbox rate limiting.

**Best Practice**:
- Add small delays (1-2 seconds) between consecutive API calls during test execution
- If rate limited, wait 5 seconds before retrying
- Do NOT run pay-method-coverage tests in parallel — execute sequentially

---

## Sandbox Exception Trigger Amounts

Use specific amounts to trigger exception scenarios in Sandbox:

| Amount | Error Code | Error Description |
|--------|-----------|-------------------|
| 9.1 or 91 | C0001 | System Unavailable |
| 9.2 or 92 | E0001 | Unknown Status |
| 90 or 990 | C0005 | Channel Rejection |

**Usage**: When testing exception handling (active-exception test cases 1.6, 4.5, 5.6, 1.8, 5.7), create an order with these specific amounts to reliably trigger the corresponding error.

**Note**: These amounts work for both payment and subscription create. The error is returned in the API response, not via webhook.
