# Integration Verification Protocol

This file contains the complete Step 7 verification protocol. It is loaded on demand when the developer triggers integration testing.

---

## Overview

Test the integration end-to-end **through the project's own endpoints**, not by calling the SDK directly. The acceptance criteria are fixed; the test implementation is dynamically generated based on the project's code.

**Trigger phrases**: "run test cases", "integration test", "集成测试", "验收测试", "跑测试用例", "UAT"

### Entry Conditions

Step 7 can be entered two ways:

1. **After Step 6** — natural continuation after writing integration code
2. **Direct trigger** — developer says "跑集成测试" on an already-integrated project

---

## Phased Execution (MANDATORY)

Step 7 is split into phases with explicit checkpoints. This prevents context exhaustion.

```
Phase A — Core Tests (~15 tool calls):
  order-create → payment-success → payment-failure
  → order-create-error → webhook-idempotency
  ✓ Checkpoint: output Phase A results

Phase B1 — Card Payment Coverage (~6 tool calls):
  payMethodConfig().inquiry() → build minimum test set (§Pay Method Discovery)
  → card methods: create orders via curl → pay via browser_run_code with test cards
  ✓ Checkpoint: output Phase B1 results

Phase B2 — Non-Card Payment Coverage (~10 tool calls):
  e-wallet / VA / OTC / special-params methods from minimum test set
  → create orders via curl → Playwright opens checkout → click simulate button
  ✓ Checkpoint: output Phase B2 results

Phase C1 — Refund (~10 tool calls):
  refund-success → refund-inquiry → refund-webhook
  ✓ Checkpoint: output Phase C1 results

Phase C2 — Subscription (~15 tool calls):
  subscription-create → inquiry → renewal → cancel
  subscription-change → change-inquiry (if integrated)
  ✓ Checkpoint: output Phase C2 results

Phase D — Passive Verification + Report (~5 tool calls):
  Code review 21 items → generate final report with all phase results
```

- Phase A MUST complete in the current session
- Phase B1 runs sequentially in main session (card payments via browser_run_code)
- Phase B2 runs sequentially in main session (non-card payments via simulate buttons)
- Phase C1 may continue in same session or handoff to new session if context is low
- Phase C2 may continue in same session or handoff to new session if context is low
- **Phase D is BLOCKED until ALL prior phases are complete** — do NOT generate the report while any phase is still running or has pending background agents.
- **Execution order is strict**: A → B1 → B2 → C1 → C2 → D. The only exception: C1 API-only tests (curl) may run while B2 browser tests execute, but Phase D report MUST wait for all.

---

## Browser Conflict Warning (CRITICAL)

**Playwright MCP uses a single shared browser instance.** If you dispatch a subagent that uses Playwright, it will compete with the main session for the same browser — causing page navigation conflicts, stale selectors, and flaky test results.

**Rules:**
- **NEVER** dispatch regular (non-isolated) subagents to run Playwright tests
- Phase B1/B2 payment tests MUST use one of these two strategies:

### Strategy 1: Sequential Batch in Main Session (DEFAULT — recommended)

Run all card brand payments sequentially in the main session using `browser_run_code`. Each card takes ~3 tool calls (navigate + run_code + verify). For 4-8 card brands this is ~12-24 tool calls — well within budget.

```
1. Main session: Create ALL orders via curl (fast, no browser)
2. For each card brand sequentially:
   a. browser_navigate to checkout URL
   b. browser_run_code: fill card + submit + wait for result
   c. Verify result (screenshot or text check)
3. Collect all results, output Phase B1/B2 summary
```

### Strategy 2: Isolated Agents (when context budget is tight)

If context is running low and you need to offload Phase B1/B2, dispatch agents with `isolation: "worktree"` — but note they still share the Playwright browser. To truly isolate:

1. **Main session finishes ALL Playwright work first** (Phase A payment tests)
2. **Main session stops using Playwright** (no more browser calls)
3. **Then** dispatch a single agent (not parallel) to run Phase B1/B2 tests
4. Wait for agent to complete before resuming Playwright in main session

**NEVER run Playwright in main session and an agent simultaneously.**

---

## Context Budget Rules

Before starting Step 7, estimate the tool call budget:

| Mode | Calls per card payment | 8 card brands total |
|------|----------------------|-------------------|
| Step-by-step Playwright | ~12 | ~96 (❌ exceeds budget) |
| `browser_run_code` batch | ~3 (navigate + run_code + verify) | ~24 (✅ fits in main session) |

**Rules:**
- ALWAYS use `browser_run_code` batch mode (§2 Batch Mode) instead of step-by-step clicks
- Run card brand tests sequentially in main session (Strategy 1) by default
- Only use Strategy 2 if context is critically low AND main session has stopped using Playwright

---

## Loop Mode — Fix-and-Retry Protocol

When a test FAILS, follow this loop instead of just recording the failure:

```
Execute test → FAIL → Classify failure → Fix if possible → Rebuild → Re-run
```

**Classification:**

| Type | Examples | Action |
|------|---------|--------|
| `FIXABLE_CODE` | Wrong field name, missing field, logic error, type mismatch | Diagnose → Edit fix → rebuild → re-run |
| `FIXABLE_INFRA` | Tunnel down, server not running, config missing | Restore infra → re-run (no code change) |
| `NOT_FIXABLE` | Sandbox limitation, needs user architectural decision | Record SKIP/BLOCKED, ask user if needed |

**Loop rules:**
- Max **3 fix attempts** per test case
- After fix: only re-run the **failed test + its dependents** (not all tests)
- Each fix must be **minimal and targeted** — do not refactor
- **Track all fixes** — record root cause + fix location for the report

**Rebuild protocol (after code fix):**
```bash
# Go projects
go build -o /tmp/new-api-waffo . && kill $(lsof -ti:$PORT) 2>/dev/null
/tmp/new-api-waffo --port $PORT &
sleep 3 && curl -s http://localhost:$PORT/api/status

# Node.js projects
npm run build && pm2 restart app  # or kill + node start

# Java projects
mvn compile -q && kill $(lsof -ti:$PORT) 2>/dev/null
java -jar target/*.jar &
```

**State tracking across retries:**
Maintain a `test_state` dict across test cases:
- `order-create` → saves `{orderID, checkoutURL, acquiringOrderID}`
- `payment-success` → saves `{paidOrderID, quotaBefore, quotaAfter}`
- `refund-success` → saves `{refundRequestID}`
- `subscription-create` → saves `{subscriptionRequest, subscriptionID}`

When re-running after fix, check if dependent state needs refresh (e.g., if order-create was fixed, payment-success needs a new order).

When generating the report, use `test_state` order IDs to populate the `Order ID` column in:
- Active Test Results: each test item maps to its `acquiringOrderID` or `subscriptionRequest`
- Pay Method Coverage: each TESTED method maps to the order used for that payment

**Fix log format (included in report):**
```
Test: payment-success
  Attempt 1: FAIL — webhook not processed, order stuck in pending
    Root cause: notifyURL used stale ServerAddress
    Fix: Updated ServerAddress option via API
  Attempt 2: PASS ✓
  Fixes applied: 1
```

---

## Business Validation References (MANDATORY — read before testing)

Before generating any test, read these reference files:
- `references/business-validation.md` — code check list (§1), business questions (§2), competitor reference (§3), passive verification checklist (§4), acceptance report template (§5)
- `references/sandbox-knowledge.md` — Sandbox-specific quirks: refund must use e-wallet not card (K024), subscription renewal simulation (K018), checkout selectors (K026), response format (K023), rate limiting (K027), disable project rate limiting before test (K028), payMethodType limits checkout (K029), subscription management page DOM (K030), exception trigger amounts

---

## Context Discovery (MANDATORY first step)

Before generating any test, read the project's code to understand:

1. **Routes**: Find Waffo-related HTTP endpoints (e.g., `router/`, `routes/`, `app.ts`)
2. **Controllers**: Understand request/response format, authentication requirements
3. **Webhook handler**: Understand what business logic runs on payment success/failure (e.g., recharge balance, update order status)
4. **Pay methods**: Call `payMethodConfig().inquiry()` using the project's SDK credentials to get the **actual contracted pay methods** (source of truth). Filter `currentStatus == "1"` only. Then apply the pay method simplification rules (§Pay Method Discovery) to build the minimum test set.
5. **Credentials**: Check env vars, config files, database options for Sandbox credentials
6. **Feature scope**: Determine which features are integrated → map to applicable test items
7. **payMethodType cross-check** (K029): Read project code to find what `payMethodType` / `payMethodName` values are passed in order/subscription create calls. Cross-compare with step 4's contracted list to produce the **checkout-available** methods. Only methods that are both contracted AND passed in `payMethodType` will appear on the checkout page. Flag mismatches in the summary.
8. **Go-Live Questionnaire** — ask the developer these questions (answers feed into the report's Go-Live Readiness section):

   | # | Question | Risk if wrong |
   |---|----------|---------------|
   | Q1 | "HTTP client timeout 设了多少？（调用 Waffo API 的超时时间）" | < 8s → 多网关容灾可能超时，建议 >= 8s（最低），15s（推荐） |
   | Q2 | "DNS cache TTL 是多少？" | > 60s → Waffo 多网关灾备切换时 DNS 不生效 |
   | Q3 | "服务器部署在哪个地区？" | 大陆 → 跨境延迟风险，建议 SDWAN/VPN/专线 |
   | Q4 | "有集成 WeChat Pay 吗？" | 有 → 上线前需提供生产域名给 Waffo 做渠道注册 |
   | Q5 | "有集成 Apple Pay 吗？checkout 页面是否在 iframe 里？" | Apple Pay + iframe → BLOCK，Apple Pay 不支持 iframe 内调用 |
   | Q6 | "你们的产品有手机 APP 吗？(iOS/Android)" | 有 APP → Q7 |
   | Q7 | "APP 里打开支付页面是怎么加载的？(外跳系统浏览器 / 端内 WebView / 其他)" | WebView → userTerminal 必须传 APP，WeChat Pay + Apple Pay 成为必测项 |
   | Q8 | "APP 端的订单创建接口是否传了 `userTerminal=APP`？" | 没传 → FIXABLE_CODE，部分支付渠道 (WeChat Pay) 在 APP 场景下行为不同 |

   **APP Terminal Assessment Logic:**
   - Q6=No → skip Q7/Q8, report "APP Terminal: N/A (no mobile app)"
   - Q6=Yes + Q7=WebView → WeChat Pay and Apple Pay become REQUIRED test items (not MANUAL/SKIP). Check code for `userTerminal: 'APP'` in order/subscription create. If missing → FIXABLE_CODE.
   - Q6=Yes + Q7=External browser → WeChat Pay still REQUIRED (opens in browser's WeChat SDK). Apple Pay is MANUAL (only available in Safari/WebView).
   - For APPLEPAY/GOOGLEPAY testing in APP context: generate QR code from checkout URL → merchant scans with phone → tests on real device (see §4 APP Terminal Assessment).

   Record answers for the report. If developer doesn't know (e.g., timeout), try to find the value in project code (HTTP client config, DNS resolver config).

9. **Integration configuration** (from Step 3 answers or inferred from project code):
   - `userTerminal`: WEB or APP (read from order/subscription create calls)
   - Subscription mode: payment-first or service-first (read from SDK config or handler comments)
   - Checkout mode: Waffo checkout (no `payMethodType`) or integrator checkout (has `payMethodType`)
   - Currency mode: single-currency (hardcoded) or multi-currency (parameter)
   - Selected subscription events: which handlers are registered in webhook setup
   These values populate the "Integration Configuration" section of the report.

Output a summary before proceeding:
```
Context Discovery:
  Order endpoint:    POST /api/waffo/pay (auth: JWT)
  Webhook endpoint:  POST /api/waffo/webhook (no auth, signature verified)
  Business logic:    Webhook success → RechargeWaffo() → add balance
  Pay methods (API): 12 contracted (8 active) — see minimum test set below
  payMethodType in code: "CREDITCARD,DEBITCARD" (hardcoded in order create)
  Checkout-available: CC_VISA, CC_MASTER, DC_VISA, DC_MASTER (card only)
  ⚠ Mismatch: DANA, OVO, QRIS contracted but NOT checkout-available
  Minimum test set:  CC_VISA (card representative) — other types blocked by payMethodType
  Credentials:       Found in database options (Sandbox)
  Features:          Order Create + Webhook (no Cancel/Refund/Subscription)
  Applicable tests:  order-create, payment-success, payment-failure, order-create-error, webhook-idempotency, pay-method-coverage
  Terminal:          WEB
  Sub mode:          payment-first (benefits suspended during retry)
  Checkout mode:     Waffo checkout (no payMethodType in order create)
  Currency:          single-currency (USD)
  Sub events:        SUBSCRIPTION_STATUS_NOTIFICATION + SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION
  APP terminal:      Q6=Yes (iOS+Android), Q7=WebView, Q8=APP passed ✓
  APP mandatory:     WeChat Pay (REQUIRED), Apple Pay (REQUIRED — QR code testing)
  Go-Live:           Q1=15s ✓, Q2=60s ✓, Q3=Singapore ✓, Q4=N/A, Q5=N/A
```

---

## Prerequisites

1. **Backend running**: Check if the project's server port is listening
2. **Tunnel**: Start cloudflared/ngrok for webhook delivery (detect which is installed)
3. **Credentials**: Verify Sandbox credentials are available
4. **Auth token**: If the project's order endpoint requires authentication, obtain a valid token (e.g., login via API, or ask the developer)

---

## Acceptance Criteria

Read `references/acceptance-criteria.md` for the full criteria definitions. The criteria are organized by feature:

**Core (all projects that integrate Order Payment + Webhook):**

| Test Item | What to verify |
|-----------|----------------|
| order-create | Project endpoint creates order → returns checkout URL |
| payment-success | Playwright pays → webhook arrives → project executes business logic (e.g., balance added) |
| payment-failure | Playwright pays with failure card → webhook arrives → project does NOT execute business logic |
| order-create-error | Trigger SDK error via project endpoint → project returns error, marks local order as failed |
| webhook-idempotency | Send same webhook notification twice → business logic executes only once |
| pay-method-coverage | **Minimum test set** from Pay Method Discovery (§Step 3). Each selected method tested with a full payment-success cycle. APPLEPAY/GOOGLEPAY marked MANUAL. |

**Refund (if integrated):**

| Test Item | What to verify |
|-----------|----------------|
| refund-success | Project refund endpoint → refund succeeds → order status updated |
| refund-inquiry | Project refund query endpoint → returns correct refund status |
| refund-webhook | Refund notification arrives → project updates order status |

**Multi-currency (if developer answered "multi-currency" in Step 3 Q5):**

| Test Item | What to verify |
|-----------|----------------|
| currency-coverage | For each currency the developer listed: create an order with that currency → verify checkout page loads and displays appropriate payment methods. At minimum test the primary currency + one secondary currency. |

**Subscription — basic (if integrated):**

| Test Item | What to verify |
|-----------|----------------|
| subscription-create | Project endpoint creates subscription → Playwright pays → activation webhook → project handles (local record must exist) |
| subscription-inquiry | Project subscription query endpoint → returns correct status |
| subscription-renewal | Next period notification arrives → project processes renewal |
| subscription-cancel | Project cancel endpoint → subscription cancelled → status updated |

**Subscription — change (if integrated):**

| Test Item | What to verify |
|-----------|----------------|
| subscription-change | Project change endpoint → change succeeds |
| subscription-change-inquiry | Project change query endpoint → returns correct change status |

---

## Test Execution

For each applicable test item:

1. **Announce**: "Testing {test-item}: {description}"
2. **Generate test approach** based on discovered project code (endpoint, auth, params)
3. **Execute** through the project's HTTP endpoint (NOT directly via SDK)
4. **Verify** the expected project behavior (check database state, API response, webhook processing)
5. **Record** result: PASS / FAIL with details

**Execution order matters** — some tests depend on earlier results:
```
order-create → payment-success → webhook-idempotency
order-create → payment-failure
order-create-error (independent)
payment-success → pay-method-coverage (minimum test set from Pay Method Discovery)
payment-success → refund-success → refund-inquiry, refund-webhook        [Phase C1]
subscription-create → subscription-inquiry, subscription-renewal, subscription-cancel  [Phase C2]
subscription-change → subscription-change-inquiry                        [Phase C2]
```

---

## Playwright Checkout Protocol

When a test requires completing payment on the checkout page, follow `references/acceptance-criteria.md` §2 (Playwright Protocol).

**ALWAYS use Batch Mode** (`browser_run_code`) as the primary approach — it completes an entire card payment in 1 tool call instead of ~12. Only fall back to step-by-step mode if `browser_run_code` is unavailable or fails.

Key points:
- Batch Mode: `browser_navigate` → `browser_run_code` (fills all fields + submits + waits for result) → parse JSON result
- Use `pressSequentially` (slowly) for card fields, NOT `fill()`
- Wait for "Processing Payment..." to disappear
- Verify result page shows correct redirect URL in "Confirm" link
- Poll inquiry API for terminal status confirmation

---

## Pay Method Discovery

### Step 1: Get contracted methods

Call `payMethodConfig().inquiry()` with the project's SDK credentials. Filter `currentStatus == "1"`. This is the **source of truth** — do not rely on project config alone.

### Step 2: Classify by type

Use this static mapping (until API returns `payMethodType` directly):

| Type | payMethodName values |
|------|---------------------|
| CARD | VISA, MASTERCARD, JCB, AMEX, UNIONPAY |
| EWALLET | GCASH, ALIPAY, WECHATPAY, DANA, SHOPEEPAY, KAKAOPAY, LINEPAY, TRUEMONEY, GRABPAY, MOMO, ZALOPAY, BOOST, TNG |
| VA | BCA_VA, BNI_VA, MANDIRI_VA, PERMATA_VA, CIMB_VA, BRI_VA |
| BANK_TRANSFER | PIX, FPX, DOKU, PROMPTPAY |
| OTC | ALFAMART, INDOMARET |
| DEVICE_PAY | APPLEPAY, GOOGLEPAY |
| SPECIAL_PARAMS | OVO (requires phone), PIX (requires CPF) |

Unknown methods: classify by suffix (`_VA` → VA) or default to EWALLET. Log a warning for manual review.

### Step 3: Build minimum test set

Apply these simplification rules to select the **minimum required test set**:

| Rule | Description |
|------|-------------|
| Per country per type, at least 1 | e.g., ID e-wallet test 1, ID bank transfer test 1 |
| App-class at least 1 | GCash / Alipay / WeChat — pick one that is contracted |
| Special-params methods must test | OVO (phone field), PIX (CPF field) — parameter structure differs |
| Card at least 1 | Credit or debit, any brand |
| VA at least 1 | Verify VA-specific parameter passing |
| APPLEPAY / GOOGLEPAY | Mark MANUAL — requires real device, inform integrator to self-test |

Output the selected test set with reason for each inclusion/exclusion:
```
Pay Method Test Set (6 of 15 contracted):
  ✓ CC_VISA      — card representative
  ✓ DANA         — ID e-wallet representative
  ✓ BCA_VA       — VA representative
  ✓ OVO          — special params (phone required)
  ✓ PIX          — special params (CPF required)
  ✓ GCASH        — app-class representative
  ○ APPLEPAY     — MANUAL (real device required)
  ○ GOOGLEPAY    — MANUAL (real device required)
  - MASTERCARD   — skipped (card already covered by VISA)
  - SHOPEEPAY    — skipped (ID e-wallet already covered by DANA)
  ...
```

### Step 4: Execute tests

For each method in the minimum test set:
- **Card** → map to test cards in `references/acceptance-criteria.md` §1. Execute a full payment-success cycle.
- **Non-card** → create order with that pay method, open checkout URL with Playwright, look for Sandbox "simulate success" button. If found → click and verify. If not found → SKIP with reason.
- **APPLEPAY / GOOGLEPAY** → mark MANUAL. Inform integrator: "Create an order, open checkout URL on your phone, complete payment using the device's native payment flow."

---

## Business Logic Verification

For payment-success, payment-failure, webhook-idempotency: after the webhook is processed, verify the project's business logic by checking actual state:

- **Database**: Query the project's database for order status, user balance, etc.
- **API**: Call the project's query endpoints to verify state changes
- **Logs**: Check backend logs for expected log entries

The specific checks depend on what Context Discovery found in the webhook handler code.

---

## Post-Execution Checklist

After all test items are executed, evaluate:

| # | Check | Evaluate |
|---|-------|----------|
| C1 | All applicable tests executed | Were any test items skipped that should have been tested? |
| C2 | Pay method coverage | Cross-check against Context Discovery's `payMethodConfig().inquiry()` result. List **every** contracted method with final status: TESTED / SKIPPED (+ reason) / MANUAL. Flag any method that is contracted + checkout-available but has no test result and no skip reason. |
| C3 | Business logic verified | Was the project's actual behavior checked (not just API response)? |
| C4 | Redirect URLs verified | Were success/failure redirect URLs asserted from checkout result page? |
| C5 | Webhook Content-Type | Webhook response sets `Content-Type: application/json`? SDK only generates responseBody — the web framework default is usually `text/plain`. Check the actual response header during active tests (e.g., inspect webhook call logs or curl the endpoint). If wrong → `FIXABLE_CODE`, apply Loop Mode fix. |
| C6 | Parameter quality | During active tests, inspect API request parameters: (1) `orderDescription` is specific, not "test" placeholder; (2) `goodsName`/`goodsUrl` or `appName` provided; (3) `userEmail` format valid, no "test" in address; (4) `userTerminal` matches actual terminal type (WEB/APP). If any wrong → `FIXABLE_CODE`. |
| C7 | Data persistence | After payment-success: verify `acquiringOrderID` stored in project database. After refund-success (if applicable): verify `refundRequestId` returned to caller and persisted. These IDs are required for webhook matching and inquiry operations. |
| C8 | orderExpiredAt format | Only if project sets custom checkout expiry: verify `orderExpiredAt` is ISO 8601 UTC+0 format ending with `Z`, and value is in the future. Skip if default expiry (4h). |

**Verdict:**
- All C1-C8 PASS → **FULL**
- Any PARTIAL → **CONDITIONAL** (list remediation steps)
- Any FAIL → **INCOMPLETE** (list what failed and why)

---

## Code Review — Passive Verification (MANDATORY after active tests)

After all active tests complete, perform a code review against the passive verification checklist in `references/business-validation.md` §4. This covers 21 items: 11 payment exception scenarios, 8 subscription exception scenarios, and 2 data safety checks (time format + idempotency key persist order) — all verified by reading code, not by running tests.

For each passive verification item:

1. **Read** the relevant code section (error handler, webhook signature check, request ID generation, etc.)
2. **Check** if the exception handling branch exists and implements the correct strategy
3. **Record** result: `COVERED` / `MISSING` / `PARTIAL` with the code file and line reference
4. **If MISSING or PARTIAL → apply Loop Mode fix** — these are `FIXABLE_CODE` defects, same as active test failures. Diagnose → edit fix → rebuild → re-verify. Do NOT just record and move on. Max 3 fix attempts per item, same as active Loop Mode rules.

Example:
```
Passive Verification (Code Review):
  Payment 1.3 (C0005 channel rejection)  : COVERED  — service/waffo_payment.go:45
  Payment 1.4 (A0011 idempotency)        : COVERED  — paymentRequestId uses uuid per request
  Payment 3.3 (webhook signature failure) : COVERED  — SDK HandleWebhook auto-rejects
  Subscription 1.8 (Unknown Status)       : MISSING  — no WaffoUnknownStatusError handler
    → Fix applied: added catch branch in service/waffo_subscription.go:89
    → Re-verified: COVERED ✓
```

Include the full Code Review results in the verification report under "Passive Verification" section. Fixed items should show both the original finding and the fix applied.

---

## Verification Report

Generate report per `references/acceptance-criteria.md` §4 template. Include:
- Test item results (PASS/FAIL/SKIP per item, using descriptive names)
- Pay method coverage: list every contracted method with final status (TESTED/SKIPPED/MANUAL), cross-checked against `payMethodConfig().inquiry()` result from Context Discovery
- Fixes applied during testing (if Loop Mode was triggered, including passive verification fixes)
- Checklist results (C1-C8)
- Go-Live Readiness: only items relevant to this project based on Q1-Q5 answers from Context Discovery
- Overall verdict (FULL / CONDITIONAL / INCOMPLETE)
- Failed items with details
- Skipped items with reasons

Print to console AND save to `integration-report-{YYYYMMDD}.md` in project root.
