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
| pay-method-coverage | **Pay method coverage (minimum test set)** | Call `payMethodConfig().inquiry()` to get contracted methods → apply simplification rules (SKILL.md §Pay Method Discovery Step 3) to build minimum test set → test each selected method: (1) Card — at least 1 brand via §1 test card. (2) E-wallet — at least 1 per country (prefer GCash/Alipay/WeChat for app-class). (3) VA — at least 1 to verify parameter passing. (4) Special-params (OVO, PIX) — must test due to unique required fields. (5) APPLEPAY / GOOGLEPAY — mark MANUAL, inform integrator to test on real device. This is a technical minimum coverage set unless a stricter business-defined scope is supplied. Report includes full contracted list with tested/skipped/manual status and reason for each. |

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

### Subscription — notification coverage (if project integrates subscription)

| ID | Criteria | How to verify |
|----|----------|---------------|
| subscription-event-status | **Subscription status notification** | Verify `SUBSCRIPTION_STATUS_NOTIFICATION` is received and processed for activation/cancel/status change. Record `subscriptionRequest` and `subscriptionId`. |
| subscription-event-period-changed | **Subscription period changed notification** | Trigger next period billing via Sandbox management page → verify `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION` is received and processed. Record `subscriptionRequest` and `subscriptionId`. |
| subscription-event-payment | **Subscription payment notification** | Verify `PAYMENT_NOTIFICATION` is received for the first subscription payment or a renewal payment attempt. Route it by `paymentInfo.productName` so one-time payment fulfillment does not process subscription billing. Record request/acquiring IDs if present plus `subscriptionRequest`/`subscriptionId`. |

### Subscription — change (if project integrates subscription change)

| ID | Criteria | How to verify |
|----|----------|---------------|
| subscription-change | **Subscription change** | If upgrade/downgrade is integrated, call project's endpoint backed by `POST /api/v1/subscription/change` → change succeeds. Verify: (1) change status updated in project database, (2) new plan/amount/period reflected in subscription record, (3) `SUBSCRIPTION_CHANGE_NOTIFICATION` received and processed. |
| subscription-change-inquiry | **Change inquiry** | If upgrade/downgrade is integrated, call project's endpoint backed by `POST /api/v1/subscription/change/inquiry` → returns correct change status and updated subscription details matching the change request. |

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
subscription-create → subscription-inquiry, subscription-event-status, subscription-event-payment
subscription-renewal → subscription-event-period-changed, subscription-event-payment, subscription-cancel  [Phase C2]
subscription-change → subscription-change-inquiry, subscription-event-change    [Phase C2, only if upgrade/downgrade integrated]
```

---

## §4A Verification Blocked Summary

When the report hard gate fails, output this instead of the formal report:

```markdown
## Verification Blocked Summary

- Missing phases: {phase list}
- Missing evidence: {IDs, coverage matrix, inquiry result, or other blockers}
- Failed gate: {report hard gate item}
- Classification: {FIXABLE_CODE / FIXABLE_INFRA / WAFFO_SUPPORT_REQUIRED / MANUAL_REQUIRED}
- Next step: {specific action to resume verification}
```

Do not print the formal report body and do not save `integration-report-{YYYYMMDD}.md` when blocked.

## §4B Report Template

If the report hard gate passes but the final outcome is `INCOMPLETE`, output this instead of the formal report:

```markdown
## Verification Failed Summary

- Final outcome: INCOMPLETE
- Failed items: {required executable or passive items that failed}
- Partial items: {items still partial or unverified}
- Support/manual pending: {WAFFO_SUPPORT_REQUIRED or MANUAL_REQUIRED items that block acceptance}
- Evidence bundle: {request IDs, A单s, refund IDs, screenshots, or report sections}
- Next step: {specific remediation and rerun plan}
```

Do not print the formal report body and do not save `integration-report-{YYYYMMDD}.md` when the final outcome is `INCOMPLETE`.

Output a Waffo-team-facing Markdown report only when the final outcome is `FULL` or `CONDITIONAL`. The report reflects integration completeness and evidence. It is not a command transcript.

```markdown
# Integration Acceptance Report / 集成验收报告

> Report language: if the user and AI interacted in Chinese, write the report body in Chinese; otherwise write English. Keep API paths, event names, enum values, and code identifiers in English.

## Overview

| Field | Value |
|-------|-------|
| Project | {project name} |
| Date | {date} |
| SDK Version | {version} |
| Skill Version | {package.json version} |
| Environment | Sandbox |
| MID | {merchant ID} |
| Coverage Basis | {minimum test set / expanded contracted coverage / business-defined scope} |
| Report Eligibility | PASSED_HARD_GATE |
| Features | Order Payment, Webhook, Refund, Subscription... |
| Pay Methods Contracted | {full list from payMethodConfig inquiry} |
| Pay Methods Tested | {minimum test set or stricter approved scope} |

## Integration Configuration

| Parameter | Value |
|-----------|-------|
| userTerminal | {WEB / APP} |
| Checkout mode | {Waffo checkout / integrator checkout} |
| Currency mode | {single-currency: USD / multi-currency: USD, IDR, ...} |
| Subscription mode | {payment-first / service-first} |
| Subscription events | {SUBSCRIPTION_STATUS_NOTIFICATION + SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION + PAYMENT_NOTIFICATION + optional SUBSCRIPTION_CHANGE_NOTIFICATION} |

## Project Integration Surface

> Project endpoints and business behavior discovered before testing. These are not Waffo API endpoints.

| Item | Result |
|------|--------|
| Order endpoints | {project HTTP endpoints} |
| Refund endpoints | {project HTTP endpoints or N/A} |
| Subscription endpoints | {project HTTP endpoints or N/A} |
| Config endpoints | {project HTTP endpoints or N/A} |
| Webhook endpoint | {project HTTP endpoint, auth, signature behavior} |
| Webhook business logic | {fulfillment/revoke/activation/idempotency behavior} |
| Persistence | {where request IDs, acquiringOrderID, refundRequestId, subscriptionID are stored} |
| Credentials | {Sandbox source, sanitized} |
| APP terminal | {N/A or APP assessment summary} |

## Webhook Delivery Evidence

| Status | Detail | Next Step |
|--------|--------|-----------|
| PROJECT_SIDE_VERIFIED | {project-side webhook response, idempotency, and business handling evidence} | {optional follow-up} |
| WAFFO_SIDE_VERIFIED | {first-party Waffo delivery evidence if available} | - |
| WAFFO_SIDE_UNVERIFIED | {why Waffo-side evidence is unavailable; project-side verification only} | {manual verification guidance} |

## Waffo APIs Exercised

| Capability | Waffo SDK/API Operation | Evidence |
|------------|-------------------------|----------|
| Payment create | `order().create()` / `POST /api/v1/order/create` | {test items / order IDs} |
| Payment inquiry | `order().inquiry()` / `POST /api/v1/order/inquiry` | {test items / order IDs} |
| Refund | `order().refund()`, `refund().inquiry()` | {refund IDs or N/A} |
| Subscription | `subscription().create()`, `subscription().manage()`, `subscription().cancel()`; `subscription().change()` / `subscription().changeInquiry()` when upgrade/downgrade is integrated | {subscription IDs / change keys or N/A} |
| Config | `merchantConfig().inquiry()`, `payMethodConfig().inquiry()` | {counts / MID} |

## Active Test Results

| Test Item | Result | Request ID | Acquiring ID (A单) | Subscription Request | Subscription ID | Refund Request ID | Change Request / Key | Details |
|-----------|--------|------------|--------------------|----------------------|-----------------|-------------------|----------------------|---------|
| order-create | PASS | {paymentRequestId} | {acquiringOrderID} | - | - | - | - | checkout URL returned |
| payment-success ({method}) | PASS | {paymentRequestId} | {acquiringOrderID} | - | - | - | - | payment, webhook, and business logic verified |
| payment-failure ({method}) | PASS | {paymentRequestId} | {acquiringOrderID} | - | - | - | - | failure state and no-fulfillment verified |
| order-create-error | PASS | {paymentRequestId} | {acquiringOrderID or -} | - | - | - | - | user-friendly error and local failure state verified |
| pay-method: {method} | PASS / SKIP / MANUAL / WAFFO_SUPPORT_REQUIRED | {paymentRequestId or -} | {acquiringOrderID or -} | - | - | - | - | {reason and evidence} |
| refund-success | PASS | {paymentRequestId} | {acquiringOrderID} | - | - | {refundRequestId} | - | refund and state verified |
| subscription-create | PASS | {paymentRequestId if present} | {acquiringOrderID if present} | {subscriptionRequest} | {subscriptionId} | - | - | activation verified |
| subscription-renewal | PASS | {paymentRequestId if present} | {acquiringOrderID if present} | {subscriptionRequest} | {subscriptionId} | - | - | renewal webhook/state verified |
| subscription-change | PASS / N/A | - | - | {origin/new subscriptionRequest} | {subscriptionId} | - | {change key} | required only if upgrade/downgrade integrated |
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

## Subscription Event Coverage

| Event Test Item | Event Type | Required When | Result | Request ID | Acquiring ID (A单) | Subscription Request | Subscription ID | Change Request / Key | Evidence / Details |
|-----------------|------------|---------------|--------|------------|--------------------|----------------------|-----------------|----------------------|--------------------|
| subscription-event-status | SUBSCRIPTION_STATUS_NOTIFICATION | Subscription integrated | PASS / FAIL / WAFFO_SUPPORT_REQUIRED | - | - | {subscriptionRequest} | {subscriptionId} | - | activation/cancel/status evidence |
| subscription-event-period-changed | SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION | Subscription integrated | PASS / FAIL / WAFFO_SUPPORT_REQUIRED | - | - | {subscriptionRequest} | {subscriptionId} | - | renewal period evidence |
| subscription-event-payment | PAYMENT_NOTIFICATION | Subscription integrated | PASS / FAIL / WAFFO_SUPPORT_REQUIRED | {paymentRequestId if present} | {acquiringOrderID if present} | {subscriptionRequest} | {subscriptionId} | - | first payment or renewal payment notification evidence |
| subscription-event-change | SUBSCRIPTION_CHANGE_NOTIFICATION | Upgrade/downgrade integrated | PASS / N/A / FAIL / WAFFO_SUPPORT_REQUIRED | - | - | {subscriptionRequest} | {subscriptionId} | {change key} | change result evidence |

## Parameter Check

- [x] `orderDescription`: specific description
- [x] `goodsName`: provided (required)
- [x] `goodsUrl` or `appName`: provided for compliance/risk-control review; default merchant classification is non-premium, so no exemption unless explicitly confirmed by user or Waffo
- [x] No App case: `goodsUrl` is provided; `appName` is not invented
- [x] `goodsUrl`: product detail page or official website URL, not an image URL (if provided)
- [x] `appName`: only for App merchants; App Store / Google Play listed app name, not package ID or placeholder (if provided)
- [x] `userEmail`: valid format, no `test`
- [x] `userTerminal`: matches actual terminal
- [x] Time fields: ISO 8601 UTC+0
- [x] Non-card required fields / `payMethodProperties`: verified where applicable

## Data Integrity Check

- [x] Idempotency key persisted before API call
- [x] `acquiringOrderID` stored
- [x] `refundRequestId` returned and persisted
- [x] `subscriptionRequest` / `subscriptionId` stored when applicable
- [x] Redirect URLs: success, failed, cancel

## Passive Verification (Code Review) — 21 items

| Case | Description | Result | Evidence |
|------|-------------|--------|----------|
| Payment 1.3 | C0005 channel rejection | COVERED | `file:line` |
| Payment 1.4 | A0011 idempotency | COVERED | uuid per request |
| Payment 1.6 | E0001 unknown status | COVERED | `file:line` |
| Payment 3.3 | webhook signature failure | COVERED | SDK auto-reject |
| Subscription 1.8 | unknown status | COVERED / N/A | `file:line` |
| ... | ... | ... | ... |

**Summary**: {N} COVERED / {N} PARTIAL / {N} MISSING / {N} N/A

## Pay Method Coverage

> Dynamically populated from `payMethodConfig().inquiry()` results. List every contracted active method.

| Method | Country / Currency | Type | Status | Order ID | Reason / Next Step |
|--------|--------------------|------|--------|----------|--------------------|
| {method} | {country/currency} | {type} | TESTED | {acquiringOrderID} | {role in minimum set} |
| {method} | {country/currency} | {type} | SKIPPED | - | {skip reason} |
| {method} | {country/currency} | DEVICE_PAY | MANUAL | - | requires real device; test link/QR provided |
| {method} | {country/currency} | {type} | WAFFO_SUPPORT_REQUIRED | {ID or -} | {support package summary} |

**Status vocabulary:** `TESTED`, `SKIPPED`, `MANUAL`, `WAFFO_SUPPORT_REQUIRED`.

**Skip/support reason vocabulary:**

| Reason | When to use |
|--------|-------------|
| `redundant - {type} already covered by {method}` | Same type/country already tested |
| `not checkout-available - filtered by payMethodType (K029)` | Contracted but project request filters it out |
| `sandbox limitation - no simulation available` | Sandbox cannot simulate it and docs/support confirm |
| `requires real device` | APPLEPAY / GOOGLEPAY / APP WebView wallet flow |
| `support required - unresolved after 3 attempts` | Repeated API/Sandbox/channel behavior cannot be closed locally |

## APP Terminal Assessment

| Question | Answer |
|----------|--------|
| Has mobile APP? (Q6) | {Yes / No} |
| Checkout loading mode (Q7) | {WebView / External browser / N/A} |
| `userTerminal=APP` passed? (Q8) | {Yes / No / N/A} |
| Device-wallet/APP methods | {PASS / MANUAL / WAFFO_SUPPORT_REQUIRED / N/A} |

## Go-Live Readiness

| Item | Status | Detail |
|------|--------|--------|
| HTTP timeout (Q1) | OK / WARNING | {detail} |
| DNS cache TTL (Q2) | OK / WARNING / N/A | {detail} |
| Server region (Q3) | OK / WARNING / N/A | {detail} |
| WeChat Pay domain (Q4) | OK / N/A / ACTION | {detail} |
| Apple Pay + iframe (Q5) | OK / N/A / BLOCK | {detail} |

## Non-PASS Items

| Item | Status | Request ID | Acquiring ID (A单) | Subscription Request | Subscription ID | Evidence | Reason | Next Step |
|------|--------|------------|--------------------|----------------------|-----------------|----------|--------|-----------|
| {method/test} | SKIPPED / MANUAL / WAFFO_SUPPORT_REQUIRED / PARTIAL / FAIL | {id or -} | {id or -} | {id or -} | {id or -} | {screenshot, code ref, or -} | {why not PASS} | {owner/action} |

**Reason vocabulary (recommended):**
- `verification skipped`
- `missing contracted-method source`
- `phase not executed`
- `manual evidence pending`
- `waffo-side evidence unverified`

## Skill Compliance Review

| Check | Result | Evidence |
|-------|--------|----------|
| `payMethodConfig().inquiry()` executed successfully | PASS / PARTIAL / FAIL | {inquiry evidence} |
| Every active contracted method listed | PASS / PARTIAL / FAIL | {payMethodConfig count + coverage rows} |
| Non-PASS items have reason, evidence, and next step | PASS / PARTIAL / FAIL | {section ref} |
| All applicable active/passive/exception tests complete | PASS / PARTIAL / FAIL | {summary} |
| No active item marked PASS/USED without execution evidence | PASS / PARTIAL / FAIL | {test logs / IDs} |
| Report generated only after applicable phases complete | PASS / PARTIAL / FAIL | {phase summaries} |
| Subscription notification tests explicit | PASS / PARTIAL / FAIL | `SUBSCRIPTION_STATUS_NOTIFICATION`, `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION`, and `PAYMENT_NOTIFICATION` are required when subscription is integrated; `SUBSCRIPTION_CHANGE_NOTIFICATION` is required only when upgrade/downgrade is integrated |
| Report is Waffo-team-facing and excludes command history | PASS / PARTIAL / FAIL | {no Commands Executed section} |
| Report language follows interaction language | PASS / PARTIAL / FAIL | Chinese body when user-AI interaction was Chinese; otherwise English |
| API claims sourced from OpenAPI/developer docs | PASS / PARTIAL / FAIL | {sources} |

## Fixes Applied During Testing

> Optional. Include only a concise summary when fixes explain integration maturity. Keep detailed command logs and retry transcripts in internal run logs or CI artifacts.

| # | Test Item | Root Cause | Fix Summary |
|---|-----------|------------|-------------|
| 1 | {test-item} | {description} | {file/behavior changed} |

## Verdict: **FULL / CONDITIONAL**

## Remediation

- {items that need fixing or manual confirmation before go-live}
```

Do not include a `Commands Executed` section in the main Waffo-facing report.

**Outcome rules:**
- **FULL**: all applicable executable tests pass, passive checks are covered/N/A, and no required manual/support item remains open. Formal report allowed.
- **CONDITIONAL**: executable tests pass but manual/support/go-live items remain with clear next steps. Formal report allowed.
- **INCOMPLETE**: any required executable or passive item fails without an accepted support/manual classification. Emit `Verification Failed Summary` only; do not generate the formal report.

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
