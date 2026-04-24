# Integration Acceptance Criteria

This file defines the **fixed acceptance criteria** for Waffo SDK integration verification.
The criteria define WHAT to verify; test implementation is dynamically generated based on each project's code.

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

---

## §2 Playwright Checkout Protocol

When a test requires completing payment on the checkout page, **prefer the Batch Mode** (single `browser_run_code` call) over the Step-by-Step Mode to minimize context consumption.

### Batch Mode (PREFERRED — 1 tool call per payment)

Use `browser_run_code` to execute the entire checkout flow in a single call. This reduces ~12 tool calls to 1, which is critical for pay-method-coverage where multiple card brands are tested.

```js
// Parameters: cardNumber, expectSuccess (true/false)
const cardNumber = '{{CARD_NUMBER}}';

// Fill card details using pressSequentially (not fill)
const cardField = page.locator('input[autocomplete="cc-number"], [placeholder*="1234"]').first();
await cardField.click();
await cardField.pressSequentially(cardNumber, { delay: 50 });

const expiryField = page.locator('input[autocomplete="cc-exp"], [placeholder*="mm"]').first();
await expiryField.click();
await expiryField.pressSequentially('1229', { delay: 50 });

const cvvField = page.locator('input[autocomplete="cc-csc"], [placeholder*="CVV"]').first();
await cvvField.click();
await cvvField.pressSequentially('123', { delay: 50 });

const nameField = page.getByRole('textbox', { name: /cardholder/i });
await nameField.click();
await nameField.pressSequentially('TEST USER', { delay: 30 });

// Submit — use testid to avoid strict mode conflict (Google Pay / Apple Pay buttons also match "Pay")
await page.getByTestId('pay').getByRole('button', { name: 'Pay' }).click();

// Wait for result — failure scenario shows "Processing" heading for 5-8s before final result
// Poll until heading is no longer "Processing" (max 60s)
const startTime = Date.now();
let heading = '';
while (Date.now() - startTime < 60000) {
  heading = await page.locator('h1').first().textContent() || '';
  if (heading && !heading.includes('Processing')) break;
  await new Promise(r => setTimeout(r, 2000));
}

const confirmLink = await page.locator('a:has-text("Confirm")').getAttribute('href').catch(() => null);
const isSuccess = heading.includes('Successful');

return JSON.stringify({ success: isSuccess, heading, redirectUrl: confirmLink });
```

**Usage**: Navigate to checkout URL first (`browser_navigate`), then run this code via `browser_run_code`. Parse the returned JSON to determine PASS/FAIL.

### Subscription Batch Mode (1 tool call per subscription payment)

Subscription checkout has a **different flow** from one-time payment: payment method tabs → select card brand → click Pay → fill card → click Subscribe. The result page heading is "Subscription successful" (lowercase s), not "Payment Successful".

```js
// Parameters: cardNumber
const cardNumber = '{{CARD_NUMBER}}';

// Step 1: Select payment method tab (Credit/Debit Card)
const cardTab = page.locator('[data-testid="payment-method-card"], :text("Credit"), :text("Debit")').first();
if (await cardTab.isVisible()) {
  await cardTab.click();
  await new Promise(r => setTimeout(r, 1000));
}

// Step 2: Click Pay button to proceed to card form
await page.getByTestId('pay').getByRole('button', { name: 'Pay' }).click();
await new Promise(r => setTimeout(r, 2000));

// Step 3: Fill card details
const cardField = page.locator('input[autocomplete="cc-number"], [placeholder*="1234"]').first();
await cardField.click();
await cardField.pressSequentially(cardNumber, { delay: 50 });

const expiryField = page.locator('input[autocomplete="cc-exp"], [placeholder*="mm"]').first();
await expiryField.click();
await expiryField.pressSequentially('1229', { delay: 50 });

const cvvField = page.locator('input[autocomplete="cc-csc"], [placeholder*="CVV"]').first();
await cvvField.click();
await cvvField.pressSequentially('123', { delay: 50 });

const nameField = page.getByRole('textbox', { name: /cardholder/i });
await nameField.click();
await nameField.pressSequentially('TEST USER', { delay: 30 });

// Step 4: Click Subscribe
await page.getByRole('button', { name: /subscribe/i }).click();

// Step 5: Wait for result — poll until heading is not "Processing"
const startTime = Date.now();
let heading = '';
while (Date.now() - startTime < 60000) {
  heading = await page.locator('h1').first().textContent() || '';
  if (heading && !heading.includes('Processing')) break;
  await new Promise(r => setTimeout(r, 2000));
}

const confirmLink = await page.locator('a:has-text("Confirm")').getAttribute('href').catch(() => null);
const isSuccess = heading.toLowerCase().includes('successful');

return JSON.stringify({ success: isSuccess, heading, redirectUrl: confirmLink });
```

**Important differences from one-time payment:**
- Subscription checkout requires selecting payment method tab first, then clicking Pay to reach the card form
- Final submit button is "Subscribe", not "Pay"
- Success heading is "Subscription successful" (lowercase s)

### Step-by-Step Mode (FALLBACK — when batch mode fails)

Use this mode only if `browser_run_code` is not available or if the batch script fails (e.g., checkout page structure changed). Each step is a separate tool call:

1. **Navigate**: `browser_navigate` to the checkout URL
2. **Wait**: `browser_wait_for` the payment form to load
3. **Snapshot**: `browser_snapshot` to identify form structure
4. **Select card type**: If there's a card type selector, click the appropriate card brand tab
5. **Fill card details** — use `pressSequentially` (slowly) for each field, NOT `fill()`, because the checkout page has custom input handlers that `fill()` may bypass:
   - Click field → type card number slowly (§1 test card matching the pay method)
   - Click expiry field → type `1229` slowly (auto-formats to `12/29`)
   - Click CVV field → type `123` slowly
   - Click cardholder name field → type `TEST USER` slowly
6. **Snapshot before submit**: Verify all fields show expected values. If any field is empty or shows validation errors, re-fill that field.
7. **Submit**: Click the Pay button
8. **Wait for result page**: `browser_wait_for` "Processing Payment..." text to disappear (do NOT wait for URL redirect — Waffo shows an intermediate result page)
9. **Verify result page**: `browser_snapshot` — the page shows either:
   - **Success**: heading "Payment Successful", amount, order ID, and a "Confirm" link with `href` = `successRedirectUrl`
   - **Failure**: heading "Payment Failed", error message, and a "Confirm" link with `href` = `failedRedirectUrl`
10. **Assert redirect URL**: Extract the "Confirm" link's `href` from the snapshot and assert it matches the expected redirect URL.
11. **Poll inquiry**: Call SDK inquiry API every 3s until terminal status or 120s timeout

**Important**: Waffo checkout does NOT auto-redirect after payment. It shows an intermediate result page with a "Confirm" link.

**If Playwright MCP is not available**: Output the checkout URL and test card info, ask developer to complete payment manually, then continue with API polling.

### Non-Card Payment Methods (Sandbox Simulation)

For non-card methods (e-wallets, bank transfers, etc.) in Sandbox:

1. **Navigate**: `browser_navigate` to the checkout URL (created with the specific pay method)
2. **Snapshot**: `browser_snapshot` to inspect the checkout page
3. **Look for simulation controls**: Sandbox checkout pages for non-card methods may display a "Simulate Success" / "Mock Payment Success" / "模拟支付成功" button instead of a real payment form
4. **If simulation button exists**: Click it → wait for result page → verify success + webhook delivery + business logic
5. **If no simulation button exists**: SKIP this pay method with reason "no Sandbox simulation available"
6. **APPLEPAY / GOOGLEPAY**: Do NOT attempt — these require a real mobile device. SKIP and inform the integrator to test manually on their phone.

---

## §3 Acceptance Criteria

### Core — Order Payment + Webhook (all projects)

| ID | Criteria | How to verify |
|----|----------|---------------|
| order-create | **Order creation** | Call project's order creation endpoint (with valid auth) → response contains checkout URL. Verify a local order record was created in the project's database with pending status. |
| payment-success | **Payment success** | Use checkout URL from order-create → Playwright fills success test card (§1) → wait for terminal status. Verify: (1) order status updated to success in project database, (2) business logic executed (e.g., balance increased, credits added), (3) redirect URL correct on result page. |
| payment-failure | **Payment failure** | Create new order via project endpoint → Playwright fills failure test card (§1) → wait for terminal status. Verify: (1) order status updated to failed in project database, (2) business logic NOT executed (e.g., balance unchanged), (3) redirect URL correct on result page. |
| order-create-error | **Order creation failure** | Call project's order creation endpoint with invalid params (e.g., amount below minimum, or missing required fields) → Verify project returns user-friendly error message and local order is marked as failed (not left in pending). |
| webhook-idempotency | **Webhook idempotency** | After payment-success completes, replay the same webhook notification to the project's webhook endpoint (use the same payload captured from payment-success or reconstruct it). Verify business logic does NOT execute a second time (e.g., balance doesn't increase again). |
| pay-method-coverage | **Pay method coverage (minimum test set)** | Call `payMethodConfig().inquiry()` to get contracted methods → apply simplification rules (SKILL.md §Pay Method Discovery Step 3) to build minimum test set → test each selected method: (1) Card — at least 1 brand via §1 test card. (2) E-wallet — at least 1 per country (prefer GCash/Alipay/WeChat for app-class). (3) VA — at least 1 to verify parameter passing. (4) Special-params (OVO, PIX) — must test due to unique required fields. (5) APPLEPAY / GOOGLEPAY — mark MANUAL, inform integrator to test on real device. Report includes full contracted list with tested/skipped/manual status and reason for each. |

### Refund (if project integrates refund)

| ID | Criteria | How to verify |
|----|----------|---------------|
| refund-success | **Refund success** | Call project's refund endpoint on a paid order from payment-success → refund succeeds. Verify order/refund status updated in project database. |
| refund-inquiry | **Refund inquiry** | Call project's refund query endpoint → returns correct refund status matching refund-success result. |
| refund-webhook | **Refund webhook** | After refund-success, verify refund notification was received by project's webhook endpoint and project updated status accordingly. |

### Subscription — basic (if project integrates subscription)

| ID | Criteria | How to verify |
|----|----------|---------------|
| subscription-create | **Subscription creation + activation** | Call project's subscription creation endpoint → Playwright pays → activation webhook arrives → project handles activation (e.g., starts subscription record, local record created). |
| subscription-inquiry | **Subscription inquiry** | Call project's subscription query endpoint → returns correct subscription status (ACTIVE after subscription-create). |
| subscription-renewal | **Renewal webhook** | Trigger next period billing via Sandbox management page (Playwright clicks "Next period payment success") → `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION` arrives → project processes renewal. Verify the `onSubscriptionPeriodChanged` handler was invoked. |
| subscription-cancel | **Subscription cancel** | Call project's cancel endpoint → subscription cancelled. Verify status updated in project database. |

### Subscription — change (if project integrates subscription change)

| ID | Criteria | How to verify |
|----|----------|---------------|
| subscription-change | **Subscription change** | Call project's subscription change endpoint (e.g., upgrade plan or change billing cycle) → change succeeds. Verify: (1) change status updated in project database, (2) new plan/amount/period reflected in subscription record, (3) change webhook received and processed if applicable. |
| subscription-change-inquiry | **Change inquiry** | Call project's change query endpoint → returns correct change status and updated subscription details matching the change request. |

### Subscription — exception scenarios (verified during basic + change tests)

These are NOT separate test items — they are **expected observations** during subscription testing. If any occurs unexpectedly, the related test item FAILS.

| Scenario | When to observe | What to check |
|----------|----------------|---------------|
| Renewal failure → cancel | During subscription-renewal if failure card is used | Project handles renewal failure notification correctly (e.g., marks subscription as past-due, notifies user), does NOT immediately cancel |
| Change after renewal | During subscription-change if renewal just completed | Change applies to the new period, not the current one |
| Cancel during renewal | During subscription-cancel if renewal is in progress | Cancel takes effect, pending renewal is handled gracefully |

### Execution Dependencies

```
order-create → payment-success → webhook-idempotency
order-create → payment-failure
order-create-error (independent)
payment-success → pay-method-coverage (minimum test set from payMethodConfig inquiry)
payment-success → refund-success → refund-inquiry, refund-webhook              [Phase C1]
subscription-create → subscription-inquiry, subscription-renewal, subscription-cancel  [Phase C2]
subscription-change → subscription-change-inquiry                              [Phase C2]
```

---

## §4 Report Template

Output the report in Markdown format:

```markdown
# Integration Acceptance Report

## Overview

| Field | Value |
|-------|-------|
| Project | {project name} |
| Date | {date} |
| SDK Version | {version} |
| Environment | Sandbox |
| MID | {merchant ID} |
| Features | Order Payment, Webhook, Refund, Subscription... |
| Pay Methods Contracted | {full list from payMethodConfig inquiry} |
| Pay Methods Tested | {minimum test set} |

## Integration Configuration

> Record the design choices made during Step 3. Only include rows relevant to integrated features.

| Parameter | Value |
|-----------|-------|
| userTerminal | {WEB / APP} |
| Checkout mode | {Waffo checkout / integrator checkout} |
| Currency mode | {single-currency: USD / multi-currency: USD, IDR, ...} |
| Subscription mode | {payment-first / service-first} — {payment-first: suspend benefits during retry; service-first: continue service during retry} |
| Subscription events | {SUBSCRIPTION_STATUS_NOTIFICATION + SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION + ...} |

## Active Test Results

| Test Item | Result | Order ID | Details |
|-----------|--------|----------|---------|
| order-create | PASS | {acquiringOrderID} | checkout URL returned |
| payment-success (CC_VISA) | PASS | {acquiringOrderID} | balance +100, webhook received |
| payment-failure (CC_VISA) | PASS | {acquiringOrderID} | balance unchanged |
| order-create-error | PASS | - | error message correct |
| webhook-idempotency | PASS | {same as payment-success} | no duplicate execution |
| pay-method: CC_VISA | PASS | {acquiringOrderID} | payment + webhook verified |
| pay-method: DANA | PASS | {acquiringOrderID} | e-wallet simulate success |
| pay-method: BCA_VA | PASS | {acquiringOrderID} | VA parameter passing verified |
| pay-method: OVO | PASS | {acquiringOrderID} | phone field required, verified |
| pay-method: APPLEPAY | MANUAL | - | requires real device — integrator to self-test |
| refund-success | PASS | {acquiringOrderID} | refund initiated (via DANA, not card — K024) |
| refund-inquiry | PASS | {acquiringOrderID} | status correct |
| refund-webhook | PASS | {acquiringOrderID} | local status updated |
| subscription-create | PASS | {subscriptionRequest} | checkout URL + local record |
| subscription-inquiry | PASS | {subscriptionRequest} | status ACTIVE |
| subscription-renewal | PASS | {subscriptionRequest} | period 2 success |
| subscription-cancel | PASS | {subscriptionRequest} | status updated |
| ... | ... | ... | ... |

## Subscription Event Coverage

> Only present if subscription is integrated.

| Event Type | Received | Mapped Test Cases |
|------------|----------|-------------------|
| SUBSCRIPTION_STATUS_NOTIFICATION | PASS | subscription-create (ACTIVE), subscription-cancel |
| SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION | PASS | subscription-renewal |
| PAYMENT_NOTIFICATION | N/A | 4.1-4.3 (if selected) |

## Parameter Check

- [x] `orderDescription`: specific description
- [x] `goodsName` / `goodsUrl` or `appName`: provided
- [x] `userEmail`: valid format, no "test"
- [x] `userTerminal`: matches actual terminal
- [x] Time fields: ISO 8601 UTC+0

## Data Integrity Check

- [x] Idempotency key persisted before API call
- [x] `acquiringOrderID` stored
- [x] `refundRequestId` returned and persisted
- [x] Redirect URLs (success + failed + cancel)

## Risk Items

- [x] `WaffoUnknownStatusError` handling: retry + no close + inquiry
- [x] Webhook duplicate push protection: idempotency check
- [x] Concurrency safety: row-level lock
- [x] Amount precision: decimal library used

## Passive Verification (Code Review) — 21 items

| Case | Description | Result | Evidence |
|------|------------|--------|----------|
| Payment 1.3 | C0005 channel rejection | COVERED | `file:line` |
| Payment 1.4 | A0011 idempotency | COVERED | uuid per request |
| Payment 1.5 | C0001 system unavailable | COVERED | `file:line` |
| Payment 1.6 | E0001 unknown status | COVERED | `file:line` |
| Payment 3.3 | webhook sig failure | COVERED | SDK auto-reject |
| Payment 4.2 | cancel channel rejection | PARTIAL | no user message |
| ... | ... | ... | ... |
| Subscription 3.5 | sub webhook sig fail | COVERED | SDK auto-reject |
| ... | ... | ... | ... |

**Summary**: 19 COVERED / 1 PARTIAL / 1 MISSING

## Pay Method Coverage

> Dynamically populated from `payMethodConfig().inquiry()` results. List every contracted method.

| Method | Country | Type | Status | Order ID | Reason |
|--------|---------|------|--------|----------|--------|
| {method} | {country} | {type} | TESTED | {acquiringOrderID} | {role in minimum test set} |
| {method} | {country} | {type} | SKIPPED | - | {skip reason} |
| {method} | - | DEVICE_PAY | MANUAL | - | requires real device |

**Skip reason vocabulary:**

| Skip Reason | When to use |
|-------------|-------------|
| `redundant — {type} already covered by {method}` | Same type already tested |
| `not checkout-available — filtered by payMethodType (K029)` | Contracted but code restricts |
| `sandbox limitation — no simulation available` | Can't simulate in sandbox |
| `requires real device` | APPLEPAY / GOOGLEPAY |

## APP Terminal Assessment

> Always present. Records whether merchant has a mobile APP and its implications.

### Assessment Result

| Question | Answer |
|----------|--------|
| Has mobile APP? (Q6) | {Yes (iOS+Android) / Yes (iOS only) / Yes (Android only) / No} |
| Checkout loading mode (Q7) | {WebView / External browser / N/A} |
| `userTerminal=APP` passed? (Q8) | {Yes / No → FIXABLE_CODE / N/A} |

### APP-Mandatory Payment Methods

> If Q6=Yes: these methods become REQUIRED (not MANUAL/SKIP). If Q6=No: this section shows "N/A — no mobile APP".

| Method | Status | Reason |
|--------|--------|--------|
| WECHATPAY | {REQUIRED / N/A} | WeChat Pay behaves differently in APP WebView vs desktop; must verify in-app flow |
| APPLEPAY | {REQUIRED / N/A} | Apple Pay only works on iOS Safari or WebView; must test on real device |
| GOOGLEPAY | {RECOMMENDED / N/A} | Google Pay works on Android Chrome or WebView; recommended for Android APP |

### QR Code Testing Protocol (for APPLEPAY/GOOGLEPAY/WECHATPAY)

When a payment method requires real device testing:

1. Create an order via the project's API endpoint
2. Get the checkout URL from the response
3. Generate QR code: `qrencode -t UTF8 "{checkoutURL}"` (terminal) or `qrencode -o /tmp/checkout-qr.png "{checkoutURL}"` (PNG file)
4. Present QR code to integrator: "请用手机扫描此二维码，在手机上打开收银台页面并完成 {method} 支付测试"
5. After integrator confirms payment completed on device → verify webhook received + business logic executed
6. Record result: PASS (device-tested) / FAIL (with reason)

**If `qrencode` is not installed:** Output the checkout URL directly and instruct: "请在手机浏览器中打开此链接测试"

### Desktop-Only Verification Note

Playwright tests verify WEB terminal behavior only. If merchant has APP:

| Test Item | Desktop Verified | APP Re-verification Required |
|-----------|-----------------|------------------------------|
| payment-success | ✓ (Playwright) | Yes — before go-live |
| subscription-create | ✓ (Playwright) | Yes — before go-live |
| WeChat Pay | N/A (desktop) | REQUIRED — must test in APP WebView |
| Apple Pay | N/A (desktop) | REQUIRED — must test on iOS device |

## Checklist

| # | Check | Result |
|---|-------|--------|
| C1 | All applicable tests executed | PASS |
| C2 | Pay method coverage (cross-checked against API) | PASS |
| C3 | Business logic verified | PASS |
| C4 | Redirect URLs verified | PASS |
| C5 | Webhook Content-Type application/json | PASS |
| C6 | Parameter quality (orderDescription, goodsName, userEmail, userTerminal) | PASS |
| C7 | Data persistence (acquiringOrderID, refundRequestId stored) | PASS |
| C8 | orderExpiredAt format (if custom expiry) | N/A |

## Verdict: **CONDITIONAL**

## Go-Live Readiness (from Context Discovery Q1-Q6)

> Only items relevant to this project are listed. N/A items are omitted.

| Item | Status | Detail |
|------|--------|--------|
| HTTP timeout (Q1) | ⚠ WARNING | Current: 3s → recommend >= 8s (minimum), 15s (recommended) |
| DNS cache TTL (Q2) | ✓ OK | 60s |
| Server region (Q3) | ✓ OK | Singapore |
| WeChat Pay domain (Q4) | N/A | Not integrated |
| Apple Pay + iframe (Q5) | N/A | Not integrated |

## Fixes Applied During Testing

> Only present if Loop Mode applied fixes during test execution.

| # | Test Item | Attempt | Root Cause | Fix |
|---|-----------|---------|------------|-----|
| 1 | {test-item} | N→N+1 | {description} | `file:line` — {what changed} |

**Total**: {N} fixes, {M} unresolved

## Remediation

- {item that needs fixing before go-live}
```

**Verdict rules:**
- **FULL**: All C1-C5 are PASS → integration fully verified
- **CONDITIONAL**: Any PARTIAL → report lists what remains
- **INCOMPLETE**: Any FAIL → must fix before go-live

---

## §5 Official Test Cases (53 Items)

Source: Merchant Integration Test Cases v1.3 + Subscription Test Cases v2.2

**Principle**: All 53 items retained. Active scenarios are tested automatically. Exception scenarios are passively verified (code review + observed during testing).

### Payment Test Cases (29 items)

| Case | Description | Verification | Notes |
|------|-----------|-------------|-------|
| 1.1 | Payment success — all pay methods | Active | Run for each contracted pay method |
| 1.2 | Payment failure — all pay methods | Active | Run for each contracted pay method |
| 1.3 | Channel rejection C0005 | Passive | Sandbox: amount 90/990. Review error handler. |
| 1.4 | Idempotency conflict A0011 | Passive | Review ID generation logic. If appears during test → FAIL |
| 1.5 | System unavailable C0001 | Passive | Sandbox: amount 9.1/91. Review retry + message. |
| 1.6 | Unknown Status E0001 | Active (Exception) | Sandbox: amount 9.2/92. Verify: retry → no close → inquiry |
| 2.1 | Query — before payment | Active | Verify intermediate status handling |
| 2.2 | Query — after payment success | Active | Verify field consistency |
| 2.3 | Query — after payment failure | Active | Verify field consistency |
| 3.1 | Payment success webhook | Active | Core |
| 3.2 | Payment failure webhook | Active | Core |
| 3.3 | Webhook signature failure | Passive | Strategy: ignore, query via inquiry |
| 4.1 | Cancel before payment | Active | Business scenario |
| 4.2 | Cancel — channel rejection | Passive | Review error handler |
| 4.3 | Cancel after payment success | Active | Integrator must prevent in UI |
| 4.4 | Cancel — system unavailable | Passive | Review retry + message |
| 4.5 | Cancel — Unknown | Active (Exception) | Sandbox: amount 9.2/92. Verify: no close → inquiry |
| 5.1 | Refund success | Active | Core |
| 5.2 | Refund param validation failure | Passive | Review error handler |
| 5.3 | Refund rule limitation | Active | Integrator must understand refund limits |
| 5.4 | Refund idempotency conflict | Passive | Review ID generation, observe during test |
| 5.5 | Refund — system unavailable | Passive | Review retry + message |
| 5.6 | Refund — Unknown | Active (Exception) | Sandbox: amount 9.2/92. Verify: no close → inquiry |
| 6.1 | Refund query — processing | Active | Verify refund status |
| 6.2 | Refund query — full refund success | Active | Verify refund status |
| 6.3 | Refund query — partial refund success | Active | Verify refund status |
| 6.4 | Refund query — refund failed | Active | Verify refund status |
| 7.1 | Refund success webhook | Active | Core |
| 7.2 | Refund failure webhook | Active | Core |
| 7.3 | Refund webhook signature failure | Passive | Strategy: ignore, query via inquiry |

### Subscription Test Cases (24 items)

| Case | Description | Verification | Notification Type | Notes |
|------|-----------|-------------|-------------------|-------|
| 1.1 | Subscription success — all pay methods | Active | | Run for each contracted pay method |
| 1.2 | Subscription failure — all pay methods | Active | | Run for each contracted pay method |
| 1.3 | Next period payment success | Active | | Renewal core |
| 1.4 | Next period payment failure | Active | | Renewal failure handling |
| 1.5 | Channel rejection | Passive | | Review error handler |
| 1.6 | Idempotency conflict | Passive | | Review ID generation, observe during test |
| 1.7 | System unavailable | Passive | | Review retry + message |
| 1.8 | Unknown Status | Active (Exception) | | Sandbox: amount 9.2/92. Verify: no close → inquiry |
| 2.1 | Query — before payment | Active | | Verify intermediate status |
| 2.2 | Query — after payment success | Active | | Verify field consistency |
| 2.3 | Query — after payment failure | Active | | Verify field consistency |
| 3.1 | Subscription ACTIVE webhook | Active | `SUBSCRIPTION_STATUS_NOTIFICATION` | Core |
| 3.2 | Subscription CLOSE webhook | Active | `SUBSCRIPTION_STATUS_NOTIFICATION` | Core |
| 3.3 | Channel cancel webhook | Active | `SUBSCRIPTION_STATUS_NOTIFICATION` | Core |
| 3.4 | Merchant cancel webhook | Active | `SUBSCRIPTION_STATUS_NOTIFICATION` | Core |
| 3.5 | Subscription webhook signature failure | Passive | `SUBSCRIPTION_STATUS_NOTIFICATION` | Strategy: ignore, query via inquiry |
| 4.1 | First period payment success notification | Active | `PAYMENT_NOTIFICATION` | Per-period payment result |
| 4.2 | Renewal payment success notification | Active | `PAYMENT_NOTIFICATION` | Per-period payment result |
| 4.3 | Renewal payment failure notification | Active | `PAYMENT_NOTIFICATION` | Per-period payment result |
| 4.4 | Payment notification signature failure | Passive | `PAYMENT_NOTIFICATION` | Strategy: ignore, query via inquiry |
| 5.1 | Merchant cancel (each pay method) | Active | | Core |
| 5.6 | Cancel — system unavailable | Passive | | Review retry + message |
| 5.7 | Cancel — Unknown | Active (Exception) | | Sandbox: amount 9.2/92. Verify: no close → inquiry |

### Summary

| | Total | Active | Active (Exception) | Passive |
|--|-------|--------|-------------------|---------|
| Payment | 29 | 18 | 3 (1.6, 4.5, 5.6) | 8 |
| Subscription | 24 | 15 | 2 (1.8, 5.7) | 7 |
| **Total** | **53** | **33** | **5** | **15** |

**Verification method definitions:**
- **Active (33 items)**: Normal scenarios — write test code, execute automatically
- **Active Exception (5 items)**: Unknown Status (E0001) — write test code using specific Sandbox amounts to trigger. Reason: complex handling (retry → no close → inquiry → wait for webhook), Sandbox can reliably reproduce, mishandling has severe consequences (user paid but no benefit granted)
- **Passive (21 items)**: Channel rejection / signature failure / idempotency conflict / data safety — no test code. Verified through code review confirming exception handling exists. If unexpectedly triggered during testing → that item fails
