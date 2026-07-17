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

Direct trigger starts at Phase A. It does NOT allow skipping required phases or jumping straight to a final report.

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
  notification tests: SUBSCRIPTION_STATUS_NOTIFICATION, SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION, PAYMENT_NOTIFICATION
  subscription-change → change-inquiry → SUBSCRIPTION_CHANGE_NOTIFICATION (if upgrade/downgrade integrated)
  ✓ Checkpoint: output Phase C2 results

Phase D — Integration Quality Radar + Report Gate (~5 tool calls):
  Integration Quality Radar code review → skill compliance review → report hard gate → generate final report
```

- Phase A MUST complete in the current session
- Phase B1 runs sequentially in main session (card payments via browser_run_code)
- Phase B2 runs sequentially in main session (non-card payments via simulate buttons)
- Phase C1 may continue in same session or handoff to new session if context is low
- Phase C2 may continue in same session or handoff to new session if context is low
- **Phase D is BLOCKED until ALL prior phases are complete** — do NOT generate the report while any phase is still running or has pending background agents.
- **Execution order is strict**: A → B1 → B2 → C1 → C2 → D. The only exception: C1 API-only tests (curl) may run while B2 browser tests execute, but Phase D report MUST wait for all.

### Coverage Basis

Default to `Coverage Basis: minimum test set`. If the developer, business owner, or acceptance owner gives a stricter coverage scope, record `Coverage Basis: business-defined scope` and use that stricter scope for pay-method coverage and report wording. Never imply that `minimum test set` equals final business acceptance by itself.

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
| `FIXABLE_CODE` | Wrong field name, missing field, logic error, type mismatch | Diagnose → edit fix → rebuild → re-run |
| `FIXABLE_INFRA` | Tunnel down, server not running, config missing | Restore infra → re-run without code changes |
| `WAFFO_SUPPORT_REQUIRED` | Repeated Sandbox/API/channel behavior cannot be explained locally | Prepare support package and contact Waffo technical support |
| `MANUAL_REQUIRED` | Apple Pay / Google Pay / APP WebView flow needs a real device | Generate order/QR/link, guide device test, then verify webhook/business state |
| `SKIP_WITH_REASON` | Contracted but not checkout-available, duplicate representative, known Sandbox limitation | Record reason, evidence, and next step; do not hide it as PASS |

**Loop rules:**
- Max **3 fix attempts** per test case
- After fix: only re-run the **failed test + its dependents** (not all tests)
- Each fix must be **minimal and targeted** — do not refactor
- **Track all fixes** internally; include a concise summary in the Waffo-facing report only when it explains integration maturity
- A failed attempt is not final until logs, request payload, inquiry result, checkout page state, and project-side persistence have been checked
- For non-card checkout stuck in `AUTHORIZATION_REQUIRED`, inspect the live checkout page before classifying the result: collect body text, visible inputs (`name`/`id`/`type`/`autocomplete`/placeholder), checkboxes, buttons, and simulator controls. Handle localized labels and required fields before marking it unresolved.
- For `refund-webhook`, do not fall back to card refunds while any paid e-wallet source exists. Try paid e-wallet sources first and continue across same-class alternatives when one method is rejected by refund rules.
- If 3 attempts cannot close the issue, mark `WAFFO_SUPPORT_REQUIRED` and contact Waffo technical support with a support package

### Pre-Report Non-PASS Gate

Before Phase D writes the final report, every `FAIL`, `PARTIAL`, `WAFFO_SUPPORT_REQUIRED`, or `SKIP_WITH_REASON` item must answer all of these questions in the internal fix log. If any answer is "no" or "unknown", keep investigating instead of reporting the item as final.

| Question | Required Evidence |
|----------|-------------------|
| Was the latest API/inquiry state checked? | Request ID, acquiring ID, status, response code/message |
| Was the checkout or management UI inspected when UI could affect the result? | Page text plus visible input/button/simulator details |
| Were required localized fields and buttons handled? | Filled field names and clicked button/simulator text |
| Were same-class alternatives tried when the failure is method/channel-specific? | Attempts for comparable pay methods, such as DANA before card refund fallback |
| Is the remaining blocker outside local integration/test automation? | Reason it is not `FIXABLE_CODE` or `FIXABLE_INFRA` |

If a later attempt turns the item PASS, keep a concise "Failure Loop Findings" section in the Waffo-facing report explaining the root cause and retest IDs.


### Waffo Support Escalation Package

When a case is `WAFFO_SUPPORT_REQUIRED`, collect this package before contacting Waffo technical support:

| Field | Required Evidence |
|-------|-------------------|
| Merchant context | MID, environment, SDK language/version, feature under test |
| Payment context | payMethodName, payMethodType, country, currency, amount, terminal, checkout mode |
| Identifiers | paymentRequestId, acquiringOrderId, refundRequestId, subscriptionRequest, subscriptionId as applicable |
| API evidence | sanitized request payload, response code/msg, inquiry result, webhook payload summary if received |
| UI evidence | checkout URL, page text/screenshot, clicked simulator/device action, timestamp |
| Retry history | attempts 1-3, fixes tried, commands/tests re-run, remaining symptom |

Do not downgrade an unexplained contracted method failure to SKIP merely to finish the report.

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

# Python projects
ruff check . && mypy . 2>/dev/null  # static checks (skip if not configured)
kill $(lsof -ti:$PORT) 2>/dev/null
# FastAPI / Starlette
uvicorn app.main:app --host 0.0.0.0 --port $PORT &
# or Flask
# flask --app app run --host 0.0.0.0 --port $PORT &
# or Django
# python manage.py runserver 0.0.0.0:$PORT &
sleep 3 && curl -s http://localhost:$PORT/api/status
```

**State tracking across retries:**
Maintain a `test_state` dict across test cases:
- `order-create` → saves `{orderID, checkoutURL, acquiringOrderID}`
- `payment-success` → saves `{paidOrderID, quotaBefore, quotaAfter}`
- `refund-success` → saves `{refundRequestID}`
- `subscription-create` → saves `{subscriptionRequest, subscriptionID}`

When re-running after fix, check if dependent state needs refresh (e.g., if order-create was fixed, payment-success needs a new order).

When generating the report, use `test_state` order IDs to populate the `Order ID` column in:
- Active Test Results: populate split ID columns (`Request ID`, `Acquiring ID (A单)`, `Subscription Request`, `Subscription ID`, `Refund Request ID`, `Change Request / Key`) instead of mixing IDs in one column
- Pay Method Coverage: each TESTED method maps to the request/acquiring order used for that payment

**Internal fix log format:**
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

## Project Integration Surface (MANDATORY first step)

Before generating any test, read the project's code to understand:

1. **Routes**: Find Waffo-related HTTP endpoints (e.g., `router/`, `routes/`, `app.ts`)
2. **Controllers**: Understand request/response format, authentication requirements
3. **Webhook handler**: Understand what business logic runs on payment success/failure (e.g., recharge balance, update order status)
4. **Pay methods**: Call `payMethodConfig().inquiry()` using the project's SDK credentials to get the **actual contracted pay methods** (source of truth). Filter `currentStatus == "1"` only. If the project does not expose a local provider/admin helper, instantiate or use the Waffo SDK directly with the project's Sandbox credentials. Then apply the pay method simplification rules (§Pay Method Discovery) to build the minimum test set. If credentials exist but inquiry still fails, classify the issue as `FIXABLE_INFRA` or `WAFFO_SUPPORT_REQUIRED` and stop before pay-method coverage or final report generation.
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

9. **Integration configuration** (from the developer's Step 2/3 answers; if any value is missing, verify it in project code and confirm with the developer before recording — do not guess):
   - `userTerminal`: WEB or APP (read from order/subscription create calls)
   - Subscription mode: payment-first or service-first (read from SDK config or handler comments)
   - Checkout mode: Waffo checkout (no `payMethodType`) or integrator checkout (has `payMethodType`)
   - Currency mode: single-currency (hardcoded) or multi-currency (parameter)
   - Selected subscription events: which handlers are registered in webhook setup
   These values populate the "Integration Configuration" section of the report.

10. **Waffo APIs Exercised** — record every Waffo SDK/API operation actually used during verification, such as `order().create()`, `order().inquiry()`, `order().refund()`, `refund().inquiry()`, `subscription().create()`, `subscription().manage()`, `subscription().cancel()`, `payMethodConfig().inquiry()`, and `merchantConfig().inquiry()`. These are Waffo APIs, distinct from the project HTTP endpoints.

Output a summary before proceeding:
```
Project Integration Surface:
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
  Sub events:        SUBSCRIPTION_STATUS_NOTIFICATION + SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION + PAYMENT_NOTIFICATION
  APP terminal:      Q6=Yes (iOS+Android), Q7=WebView, Q8=APP passed ✓
  APP mandatory:     WeChat Pay (REQUIRED), Apple Pay (REQUIRED — QR code testing)
  Waffo APIs:        order.create, order.inquiry, refund.inquiry, payMethodConfig.inquiry
  Go-Live:           Q1=15s ✓, Q2=60s ✓, Q3=Singapore ✓, Q4=N/A, Q5=N/A
  Coverage basis:    minimum test set
```

---

## Integration Test Plan Gate

Before Phase A, publish a compact plan that maps the project's integrated Waffo features to required and optional verification items. This is a project-integration gate, not a full SDK release matrix.

| Integrated Feature | Required Tests | Optional Tests | Gate Result |
|--------------------|----------------|----------------|-------------|
| Order payment | order-create, payment-success, payment-failure, order-create-error, webhook-idempotency, pay-method-coverage | cancel/capture if exposed by project | READY / FIX_PLAN |
| Refund | refund-success, refund-inquiry, refund-webhook | partial refund if project supports it | READY / FIX_PLAN / N/A |
| Subscription | subscription-create, subscription-inquiry, subscription-renewal, subscription-cancel, subscription-event-status, subscription-event-period-changed, subscription-event-payment | subscription refund if exposed by project | READY / FIX_PLAN / N/A |
| Subscription upgrade/downgrade | subscription-change, subscription-change-inquiry, subscription-event-change | change-after-renewal scenario | READY / FIX_PLAN / N/A |
| Config query | merchantConfig/payMethodConfig endpoint or SDK path used by project | - | READY / FIX_PLAN / N/A |

Gate rules:
- If subscription is integrated, `SUBSCRIPTION_STATUS_NOTIFICATION`, `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION`, and `PAYMENT_NOTIFICATION` must appear as explicit test rows.
- If subscription upgrade/downgrade is not integrated, `subscription-change`, `subscription-change-inquiry`, and `SUBSCRIPTION_CHANGE_NOTIFICATION` stay `N/A`, not FAIL.
- If upgrade/downgrade is integrated, those three change items are required and must have IDs/evidence in the report.
- Do not start Phase A until every integrated feature is `READY` or explicitly `N/A` with a reason.

---

## Report Hard Gate (MANDATORY before formal report generation)

Only generate the formal Waffo-facing Markdown report after ALL of these are true:

1. Every applicable phase has an execution result.
2. `test_state` contains the core IDs/evidence for the executed items.
3. `payMethodConfig().inquiry()` succeeded and produced the active contracted-method list.
4. The Pay Method Coverage matrix includes every active contracted method.
5. `Skill Compliance Review` is complete and passing enough to allow a verdict.

If any condition fails, output **only** this CLI summary and stop:

```markdown
## Verification Blocked Summary

- Missing phases: {phase list}
- Missing evidence: {IDs, coverage matrix, inquiry result, or other blockers}
- Failed gate: {report hard gate item}
- Classification: {FIXABLE_CODE / FIXABLE_INFRA / WAFFO_SUPPORT_REQUIRED / MANUAL_REQUIRED}
- Next step: {specific action to resume verification}
```

When blocked:
- Do NOT print the formal report body
- Do NOT save `integration-report-{YYYYMMDD}.md`
- Do NOT fabricate PASS/USED results from code inspection, user claims, or previous reports

---

## Result Gate (MANDATORY after verdict calculation)

After the report hard gate passes, calculate the final outcome:

- `FULL`
- `CONDITIONAL`
- `INCOMPLETE`

If the final outcome is `INCOMPLETE`, output **only** this CLI summary and stop:

```markdown
## Verification Failed Summary

- Final outcome: INCOMPLETE
- Failed items: {required executable or passive items that failed}
- Partial items: {items still partial or unverified}
- Support/manual pending: {WAFFO_SUPPORT_REQUIRED or MANUAL_REQUIRED items that block acceptance}
- Evidence bundle: {request IDs, A单s, refund IDs, screenshots, or report sections}
- Next step: {specific remediation and rerun plan}
```

When the final outcome is `INCOMPLETE`:
- Do NOT print the formal report body
- Do NOT save `integration-report-{YYYYMMDD}.md`
- Do NOT convert the failed run into a Waffo-facing acceptance report

Only `FULL` and `CONDITIONAL` outcomes are allowed to produce the formal Waffo-facing report.

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

Refund execution rule: `refund-webhook` must use a paid e-wallet source when any contracted e-wallet was successfully paid in Phase B2. Prefer DANA first in Sandbox, then other paid e-wallets, and only fall back to card when there is no paid e-wallet source. If an e-wallet returns `A0014` or another refund-rule error, record that attempt and continue to the next paid e-wallet before classifying the case.

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
| subscription-event-status | `SUBSCRIPTION_STATUS_NOTIFICATION` received and processed for subscription activation/cancel/status change |
| subscription-event-period-changed | `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION` received and processed for renewal period change |
| subscription-event-payment | `PAYMENT_NOTIFICATION` received for subscription first payment or renewal payment attempt; routed by `paymentInfo.productName` so one-time fulfillment does not process subscription billing |

**Subscription — change (if integrated):**

| Test Item | What to verify |
|-----------|----------------|
| subscription-change | Project endpoint backed by `POST /api/v1/subscription/change` → change succeeds |
| subscription-change-inquiry | Project endpoint backed by `POST /api/v1/subscription/change/inquiry` → returns correct change status |
| subscription-event-change | `SUBSCRIPTION_CHANGE_NOTIFICATION` received and processed |

---

## Test Execution

For each applicable test item:

1. **Announce**: "Testing {test-item}: {description}"
2. **Generate test approach** based on discovered project code (endpoint, auth, params)
3. **Execute** through the project's HTTP endpoint (NOT directly via SDK)
4. **Verify** the expected project behavior (check database state, API response, webhook processing)
5. **Record** result: PASS / FAIL with details

Do not mark an active item as PASS, USED, or complete unless the current run produced execution evidence for that item.

**Execution order matters** — some tests depend on earlier results:
```
order-create → payment-success → webhook-idempotency
order-create → payment-failure
order-create-error (independent)
payment-success → pay-method-coverage (minimum test set from Pay Method Discovery)
payment-success → refund-success → refund-inquiry, refund-webhook        [Phase C1]
subscription-create → subscription-inquiry, subscription-event-status, subscription-event-payment
subscription-renewal → subscription-event-period-changed, subscription-event-payment, subscription-cancel  [Phase C2]
subscription-change → subscription-change-inquiry, subscription-event-change  [Phase C2, only if upgrade/downgrade integrated]
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

Call `payMethodConfig().inquiry()` with the project's SDK credentials. Filter `currentStatus == "1"`. This is the **source of truth** — do not rely on project config alone. If the project lacks a local config-query wrapper, call the SDK directly with the project's Sandbox credentials. If this inquiry cannot be completed, emit `Verification Blocked Summary` and stop before the formal report.

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
- **Non-card** → create order with that pay method, open checkout URL with Playwright, inspect required inputs/checkboxes/buttons, fill method-specific fields, click the localized pay/continue button, then click Sandbox simulator success if present. If it stays `AUTHORIZATION_REQUIRED`, run Loop Mode diagnostics before marking unresolved; do not stop at the first missing English selector.
- **APPLEPAY / GOOGLEPAY** → mark MANUAL. Inform integrator: "Create an order, open checkout URL on your phone, complete payment using the device's native payment flow."

---

## Business Logic Verification

For payment-success, payment-failure, webhook-idempotency: after the webhook is processed, verify the project's business logic by checking actual state:

- **Database**: Query the project's database for order status, user balance, etc.
- **API**: Call the project's query endpoints to verify state changes
- **Logs**: Check backend logs for expected log entries

The specific checks depend on what Project Integration Surface found in the webhook handler code.

---

## Post-Execution Checklist

After all test items are executed, evaluate:

| # | Check | Evaluate |
|---|-------|----------|
| C1 | All applicable tests executed | Were any test items skipped that should have been tested? |
| C2 | Pay method coverage | Cross-check against Project Integration Surface's `payMethodConfig().inquiry()` result. List **every** contracted method with final status: TESTED / SKIPPED (+ reason) / MANUAL. Flag any method that is contracted + checkout-available but has no test result and no skip reason. |
| C3 | Business logic verified | Was the project's actual behavior checked (not just API response)? |
| C4 | Redirect URLs verified | Were success/failure redirect URLs asserted from checkout result page? |
| C5 | Webhook Content-Type | Webhook response sets `Content-Type: application/json`? SDK only generates responseBody — the web framework default is usually `text/plain`. Check the actual response header during active tests (e.g., inspect webhook call logs or curl the endpoint). If wrong → `FIXABLE_CODE`, apply Loop Mode fix. |
| C6 | Parameter quality | During active tests, inspect API request parameters: (1) `orderDescription` is specific, not "test" placeholder; (2) `goodsName` is present; (3) at least one of `goodsUrl` or `appName` is present unless explicit premium merchant exemption exists; default is non-premium/no exemption; (4) if the merchant has no App, `goodsUrl` is required and `appName` should not be invented; (5) `goodsUrl` is a product detail page or official website URL, not an image URL; (6) `appName` is only for App merchants and must be the App Store / Google Play listed app name, not a package ID or placeholder; (7) `userEmail` format valid, no "test" in address; (8) `userTerminal` matches actual terminal type (WEB/APP). If a required quality check fails → `FIXABLE_CODE`; if exemption is claimed, record the explicit confirmation evidence in the report. |
| C7 | Data persistence | After payment-success: verify `acquiringOrderID` stored in project database. After refund-success (if applicable): verify `refundRequestId` returned to caller and persisted. These IDs are required for webhook matching and inquiry operations. |
| C8 | orderExpiredAt format | Only if project sets custom checkout expiry: verify `orderExpiredAt` is ISO 8601 UTC+0 format ending with `Z`, and value is in the future. Skip if default expiry (4h). |
| C9 | Webhook delivery evidence transparency | Record `PROJECT_SIDE_VERIFIED`, `WAFFO_SIDE_VERIFIED`, or `WAFFO_SIDE_UNVERIFIED`. If only proxy replay, local logs, or project-side state are available, use `PROJECT_SIDE_VERIFIED` or `WAFFO_SIDE_UNVERIFIED` — never present that as Waffo-side verified. |

**Verdict:**
- All C1-C8 PASS → **FULL**
- Any PARTIAL without required test/passive failure → **CONDITIONAL** (list remediation steps)
- Any required executable or passive FAIL → **INCOMPLETE** (list what failed and why, then emit `Verification Failed Summary` instead of a formal report)

---

## Code Review — Integration Quality Radar (MANDATORY after active tests)

所有 active tests 完成后，按 `references/business-validation.md` §4 的 passive verification checklist 和 Quality Radar model 做代码审查。覆盖 payment exception scenarios、subscription exception scenarios 和 data safety checks（time format + idempotency key persist order）；这些项目通过读代码验证，不通过主动测试替代。

For each passive verification item:

1. **Read** the relevant code section (error handler, webhook signature check, request ID generation, etc.)
2. **Check** if the exception handling branch exists and implements the correct strategy
3. **Record** passive result: `COVERED` / `MISSING` / `PARTIAL` / `N/A`，并附代码文件和行号证据
4. **Map** passive result 到 Quality Radar risk level: `PASS`, `MUST_FIX`, `SHOULD_FIX`, `MONITOR`, or `N/A`
5. **Produce** 客户可读雷达行：Check Item, Review Anchor, Finding, Risk Level, Recommendation
6. **If MISSING or blocking PARTIAL → apply Loop Mode fix** — 这些是 `FIXABLE_CODE` 缺陷，和 active test failures 一样处理。Diagnose → edit fix → rebuild → re-verify。不能只记录后跳过。每项最多 3 次 fix attempt，和 active Loop Mode 一致。

Example:
```
Integration Quality Radar:
| Check Item | Review Anchor | Finding | Risk Level | Recommendation |
|---|---|---|---|---|
| Payment channel rejection | payment service error handler | C0005 在 service/waffo_payment.go:45 返回 retry/switch-method message | PASS | 保持当前处理。 |
| Payment idempotency | order create request ID generation | paymentRequestId 每次请求使用唯一 32 字符 key | PASS | 保持当前 key 生成。 |
| Webhook signature verification | webhook handler | SDK handler 在业务逻辑前拒绝 invalid signatures | PASS | 保持 signature-first flow。 |
| Subscription unknown status | subscription create error handler | 未发现 `WaffoUnknownStatusError` inquiry 分支 | MUST_FIX | 增加 same-key inquiry recovery，rebuild 后重跑依赖测试。 |
```

在 verification report 的 "Integration Quality Radar" 段落中包含完整雷达结果。已修复项需要同时展示原始 finding 和 fix applied / re-verified result。

## Skill Compliance Review (MANDATORY before report finalization)

Before publishing the report, review the test state against this skill:

| Check | Requirement |
|-------|-------------|
| payMethodConfig inquiry | `payMethodConfig().inquiry()` was actually executed successfully in this run |
| Contracted methods | Every active contracted method from `payMethodConfig().inquiry()` appears in Pay Method Coverage |
| Non-PASS handling | Every SKIP/MANUAL/WAFFO_SUPPORT_REQUIRED has evidence, IDs if available, and a next step |
| Full verification | All applicable active, exception, passive, refund, subscription, and APP/device items are complete or explicitly classified |
| No fabricated active results | No active item is marked PASS or USED without current-run execution evidence |
| Phase order | Formal report generation only happens after all applicable prior phases complete |
| Subscription notification coverage | For subscription integrations, `SUBSCRIPTION_STATUS_NOTIFICATION`, `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION`, and `PAYMENT_NOTIFICATION` are explicit test rows; `SUBSCRIPTION_CHANGE_NOTIFICATION` is explicit when upgrade/downgrade is integrated |
| Report audience | Main report is suitable for Waffo technical support and excludes command history/noisy execution logs |
| Report language | If the user and AI interacted in Chinese, report body is Chinese; otherwise English |
| Source discipline | API assertions cite OpenAPI or Waffo developer docs, not marketing pages |

If any check fails, fix the report or continue verification before producing the verdict.

---

## Verification Report

Generate report per `references/acceptance-criteria.md` §4B rules and formal report template. If the hard gate fails, use the §4A blocked summary instead. If the final outcome is `INCOMPLETE`, use the `Verification Failed Summary` instead of the formal report. Include:
- Overview metadata: `Skill Version`, `Coverage Basis`, `Report Eligibility`
- Test item results (PASS/FAIL/SKIP/MANUAL/WAFFO_SUPPORT_REQUIRED per item, using descriptive names and split ID columns)
- Project Integration Surface: project endpoints, auth, webhook business logic, persistence, terminal, and checkout mode
- Webhook Delivery Evidence: `PROJECT_SIDE_VERIFIED`, `WAFFO_SIDE_VERIFIED`, or `WAFFO_SIDE_UNVERIFIED`
- Waffo APIs Exercised: actual SDK/API operations invoked during verification
- Integration Quality Radar: passive code review findings mapped to `PASS`, `MUST_FIX`, `SHOULD_FIX`, `MONITOR`, or `N/A`
- Pay method coverage: list every contracted method with final status, cross-checked against `payMethodConfig().inquiry()` result from Project Integration Surface
- Non-PASS Items: every non-PASS item must include reason, evidence, ID/order key if available, and next step
- Checklist results (C1-C9), Go-Live Readiness, Skill Compliance Review, and final verdict
- Fixes Applied During Testing only as a concise summary when those fixes materially explain integration completeness

Do not include a `Commands Executed` section in the Waffo-facing report. Keep commands in an internal run log or CI artifact.

Only after the report hard gate passes **and** the final outcome is `FULL` or `CONDITIONAL`, print the report to console AND save to `integration-report-{YYYYMMDD}.md` in project root.
