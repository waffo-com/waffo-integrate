---
name: waffo-integrate
description: Interactive guide for integrating Waffo Payment SDK into projects. Walks developers through selecting features (payments, refunds, subscriptions, webhooks), choosing language (Node.js/Java/Go), and generates production-ready integration code. Also runs integration verification tests through project endpoints to validate the integration works end-to-end. Use this skill whenever the user mentions integrating Waffo SDK, adding payment functionality with Waffo, setting up Waffo webhooks, asks about Waffo SDK usage, or wants to run integration tests. Trigger phrases include "integrate waffo", "waffo sdk", "waffo payment", "接入waffo", "集成waffo", "接入支付", "waffo webhook setup", "run test cases", "integration test", "集成测试", "验收测试", "跑测试用例", "UAT".
---

# Waffo SDK Integration Guide

Help developers integrate Waffo Payment SDK into their projects through interactive feature selection. The SDK supports order payments, refunds, subscriptions, webhooks, and configuration queries across Node.js, Java, and Go.

## Integration Flow

```
Step 1: Detect or ask language → Node.js / Java / Go
Step 2: Detect or ask project status → existing project / new project
Step 3: Feature selection (interactive Q&A, one at a time)
Step 4: Framework selection (if Webhook chosen)
Step 4.5: Subscription event selection (if Subscription + Webhook chosen)
Step 5: Present code for review
Step 6: Write to project on approval
Step 7: Integration verification (test through project endpoints)
```

---

## Step 1: Language Detection

Check the project directory for language signals before asking:

| Signal | Language |
|--------|----------|
| `package.json` with TypeScript/Node deps | Node.js |
| `pom.xml` or `build.gradle` | Java |
| `go.mod` | Go |

If ambiguous or no project files, ask: "What language are you using? (Node.js / Java / Go)"

## Step 2: Project Status

Check if the project already has a build file (package.json, pom.xml, go.mod):
- **Existing project**: Skip scaffolding, just add SDK dependency and integration files
- **New project**: Guide through project initialization first, then add SDK

## Step 3: Feature Selection (Interactive Q&A)

Ask about each feature module one at a time. For each, briefly explain what it does so the developer can decide.

### Module Menu

Ask in this order (most common first):

**1. Order Payment** (most developers need this)
> "Do you need to accept payments? This includes creating payment orders, querying order status, canceling unpaid orders, and capturing pre-authorized payments."

Operations: `order().create()`, `order().inquiry()`, `order().cancel()`, `order().capture()`

**2. Refund**
> "Do you need refund capability? This lets you refund paid orders (full or partial) and query refund status."

Operations: `order().refund()`, `refund().inquiry()`

**3. Subscription Management**
> "Do you need recurring billing / subscriptions? This includes creating subscriptions, querying status, canceling, pausing/resuming, and upgrading/downgrading plans."

Operations: `subscription().create()`, `subscription().inquiry()`, `subscription().cancel()`, `subscription().manage()`, `subscription().change()`, `subscription().changeInquiry()`

**4. Merchant Config Query** (optional, less common)
> "Do you need to query your merchant configuration (supported currencies, merchant status)?"

Operations: `merchantConfig().inquiry()`

**5. Payment Method Query** (optional, less common)
> "Do you need to query available payment methods for your merchant?"

Operations: `payMethodConfig().inquiry()`

### Webhook Auto-Derive (NOT a separate question)

Webhook is mandatory for any payment integration — do NOT ask the developer whether to integrate webhooks. Automatically register handlers based on selected features:

| Selected Feature | Auto-register handlers |
|-----------------|----------------------|
| Order Payment | `onPayment` |
| Refund | `onRefund` |
| Subscription | `onSubscriptionStatus` + `onSubscriptionPeriodChanged` |
| Subscription + Change | above + `onSubscriptionChange` |

**CRITICAL — onPayment must filter out subscription payments:** When both Order Payment and Subscription are integrated, subscription billing also triggers `PAYMENT_NOTIFICATION`. The `onPayment` handler MUST check `paymentInfo.productName` and skip subscription types:

```
productName := notification.Result.PaymentInfo.ProductName
if productName == "SUBSCRIPTION" || productName == "MINI_PROGRAM_SUBSCRIPTION" {
    // Subscription payments are handled by onSubscriptionStatus / onSubscriptionPeriodChanged
    // If you need to handle failed orders during subscription billing, add logic here
    return
}
// Process one-time payment (ONE_TIME_PAYMENT / DIRECT_PAYMENT) below
```

**Webhook payload structure**: Each webhook notification's payload matches the corresponding inquiry API response structure. For example, `PaymentNotification` has the same fields as Order Inquiry response, `SubscriptionStatusNotification` matches Subscription Inquiry response.

### Integration Context Questions

After feature selection, ask these questions — their answers affect code generation:

**Ask in order (skip questions that don't apply to selected features):**

1. **User terminal type**: "What type of client will users pay from?"
   - `WEB` — PC/desktop browser
   - `APP` — Mobile app or tablet (WebView inside native app)
   - `WAP` — Mobile browser
   - `SYSTEM` — Server-to-server (no user-facing UI)
   
   Determine by actual user terminal: WebView inside App = `APP`, phone browser = `WAP`, PC browser = `WEB`, server call = `SYSTEM`.

2. **Checkout pay method selection**: "Do users select payment method on YOUR checkout page, or on Waffo's checkout page?"
   - **Integrator's checkout** → must pass `payMethodType` and/or `payMethodName` in order create
   - **Waffo's checkout** → do NOT pass `payMethodType`/`payMethodName`, let user choose on Waffo page

3. **Subscription mode** *(only if Subscription selected)*: "When subscription renewal fails, what should happen?"
   - **Payment-first**: Suspend benefits during retry period. On success, next period starts from success date. On permanent failure, stop retrying.
   - **Service-first**: Continue providing service during retry period. Keep retrying in subsequent cycles.

4. **Subscription refund** *(only if Subscription selected)*: "Do you need to refund subscription payments?"
   - Yes → generate refund-related code for subscriptions
   - No → skip subscription refund code

5. **Pricing currency**: "Where does the pricing currency come from? Do different countries use different currencies?"
   - Note: When integrating Japan local payment methods, currency must be `JPY` or `USD`. Global card payments have no currency restriction.

6. **iframe checkout** *(if applicable)*: "Will you load Waffo checkout page inside an iframe?"
   - Yes → additional frontend config needed: `referrer-policy`, `allow="payment"`, responsive width
   - Note: Apple Pay cannot be used inside iframe

7. **Checkout expiry** *(if applicable)*: "Do you need a custom checkout page expiry time?"
   - Default is 4 hours. Can be customized via `orderExpiredAt` field (UTC+0 timezone required).
   - Note: Only `alipay`, `alipayhk`, `wechatpay` channels support custom expiry on the channel side.

### Smart Defaults

- If developer selects "Order Payment", suggest Refund as well (most payment integrations need it)
- Webhook is always included automatically — no need to suggest or ask
- Always include SDK initialization (WaffoConfig + Waffo instance) regardless of selection

## Step 4: Framework Selection

Since webhook is always included, ask about the web framework whenever Order Payment or Subscription is selected.

**Recommend mainstream frameworks by language:**

| Language | Recommended | Also Supported |
|----------|------------|----------------|
| Node.js | Express | NestJS, Fastify |
| Java | Spring Boot | - |
| Go | Gin | Echo, Fiber, Chi |

Ask: "What web framework are you using? If you're not sure, I recommend [Express/Spring Boot/Gin] — it's the most widely used for [language]."

## Step 4.5: Subscription Event Selection (Conditional)

**Only when the developer selected Subscription in Step 3.** Events are auto-registered by default (see Webhook Auto-Derive above), but ask if they need additional events:

Ask: "Subscription webhook events are auto-configured. Do you also need these optional events?"

| Use Case | Recommended Event | Handler |
|----------|-------------------|---------|
| Subscription activation/cancellation | `SUBSCRIPTION_STATUS_NOTIFICATION` | `onSubscriptionStatus` |
| Final renewal result of each period | `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION` | `onSubscriptionPeriodChanged` |
| Subscription change (upgrade/downgrade) result | `SUBSCRIPTION_CHANGE_NOTIFICATION` | `onSubscriptionChange` |
| Track every payment attempt (including retries) | `PAYMENT_NOTIFICATION` | `onPayment` |

**Default recommendation**: Most subscription integrations need `SUBSCRIPTION_STATUS_NOTIFICATION` + `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION`. Only add the others if the developer has a specific need.

Only register the handlers the developer selected in Step 5.

## Step 5: Present Code

Before writing any files, present the complete integration code for the developer to review. Show:

1. **SDK initialization** (always)
2. **Service layer** for each selected feature
3. **Webhook route** (if selected)
4. **Test files** — generate at least one test function per selected feature module:
   - Order Payment selected → `TestCreateOrder`, `TestQueryOrder`, `TestCancelOrder`
   - Refund selected → `TestRefundOrder`, `TestQueryRefund`
   - Subscription selected → `TestCreateSubscription`, `TestQuerySubscription`, `TestCancelSubscription`
   - Merchant Config selected → `TestGetMerchantConfig`
   - Payment Method selected → `TestGetPaymentMethods`

**IMPORTANT**: Before generating any code, read `references/api-contract.md` to verify required fields, enum values, and field types. This is the source of truth extracted from openapi.json — do not guess field names or assume which fields are optional.

**Exception handling (MANDATORY)**: Generated code MUST cover these four exception handling branches. Reference existing payment provider implementations (Stripe/Creem/PayPal) in the project for error handling patterns:

1. **Channel Rejection / System Unavailable** (C0001/C0005) → Return user-friendly error message, guide user to retry or switch payment method
2. **Unknown Status** (E0001 / WaffoUnknownStatusError) → Retry with same parameters up to 3 times → if still fails, do NOT close the order → show friendly message suggesting alternative payment method → use inquiry API result or webhook notification as source of truth
3. **Signature Verification Failed** (in webhook handler) → Do NOT process this notification, keep order/subscription status unchanged → query correct status via inquiry API
4. **Idempotency Conflict** (A0011) → Ensure each paymentRequestId / refundRequestId / subscriptionRequest is independently generated per request, never reused

Then use the language-specific reference files for code templates:
- Node.js: Read `references/node.md`
- Java: Read `references/java.md`
- Go: Read `references/go.md`

## Step 6: Write to Project

After the developer approves, write files to their project:

1. **Install SDK dependency** (run the appropriate package manager command)
2. **Create integration files** in a sensible project structure
3. **Verify build**: Run the project's build command (`go build ./...`, `npm run build`, `mvn compile`) — the generated code **must compile on the first attempt** without manual fixes
4. **Proceed to Step 7 (MANDATORY)**: After a successful build, you MUST immediately begin Step 7 (Integration Verification) **in the same response**. Output "✅ Build passed. Starting Step 7: Integration Verification..." and proceed without waiting for user input. If prerequisites are missing (credentials, running server, tunnel), list exactly what is needed and ask the developer — but do NOT end your turn or stop working. If you are running low on context, output a clear handoff message: "⚠️ Step 7 requires a new session. Run `集成测试` or `run integration tests` to continue."

### SDK Installation

Dynamically fetch the latest version before installing:

**Node.js:**
```bash
npm view @waffo/waffo-node version  # get latest
npm install @waffo/waffo-node
```

**Java (Maven):**
Check Maven Central for latest version of `com.waffo:waffo-java`, then add to pom.xml.

**Go:**
```bash
go get github.com/waffo-com/waffo-go@latest
```

### File Structure

**Existing project adaptation (IMPORTANT):** Before using the default structure below, explore the project's existing layout. If the project already has a layered architecture (e.g., `controller/`, `service/`, `model/`, `setting/`, `router/`), place Waffo files into those existing directories following the project's naming conventions. Look for existing payment provider integrations (Stripe, PayPal, Creem, etc.) and mirror their patterns — file naming, route grouping, config variable style, error handling, and middleware usage. The default structures below are **only for new/empty projects**.

**Competitor-first reference (IMPORTANT):** Before generating Waffo code, search the project for existing payment provider integrations (Stripe, Creem, PayPal, etc.) and align: amount calculation, webhook processing flow, order status transitions, refund benefit handling, route organization and naming. Waffo integration MUST reuse existing patterns to reduce the integrator's cognitive load — this also means many business questions can be answered by reading existing code instead of asking.

Default structures (for new projects only):

**Node.js:**
```
src/
├── config/waffo.ts           # SDK initialization
├── services/
│   ├── payment-service.ts    # Order operations
│   ├── refund-service.ts     # Refund operations
│   └── subscription-service.ts # Subscription operations
├── webhooks/waffo-webhook.ts # Webhook handler + route
tests/
├── payment.test.ts
├── refund.test.ts
└── webhook.test.ts
```

**Java:**
```
src/main/java/com/example/
├── config/WaffoConfiguration.java
├── service/
│   ├── PaymentService.java
│   ├── RefundService.java
│   └── SubscriptionService.java
├── controller/WaffoWebhookController.java
src/test/java/com/example/
├── PaymentServiceTest.java
└── RefundServiceTest.java
```

**Go:**
```
internal/
├── waffo/
│   ├── client.go             # SDK initialization
│   ├── payment.go            # Order operations
│   ├── refund.go
│   ├── subscription.go
│   └── webhook.go            # Webhook handler
internal/waffo/waffo_test.go  # Tests
```

## Important Notes for Generated Code

1. **Response handling**: All SDK methods return `ApiResponse<T>`. Always check `isSuccess()` before accessing `getData()`.

2. **Error types**:
   - `WaffoError` — client-side errors (validation, config)
   - `WaffoUnknownStatusError` — network errors on **all write operations**. The operation may or may not have succeeded. The developer must query status to confirm. **Every write operation must have a `WaffoUnknownStatusError` catch branch** — the full list:
     - `order().create()` — query via `order().inquiry()`
     - `order().refund()` — query via `refund().inquiry()`
     - `order().cancel()` — query via `order().inquiry()`
     - `subscription().create()` — query via `subscription().inquiry()`
     - `subscription().cancel()` — query via `subscription().inquiry()`
     - `subscription().change()` — query via `subscription().changeInquiry()`
     - `order().capture()` — query via `order().inquiry()`

3. **Timestamp auto-injection**: The SDK automatically injects `requestedAt` / `orderRequestedAt` if not provided. No need to set these manually.

4. **merchantId auto-injection**: The SDK automatically adds `merchantId` to all requests from config.

5. **Webhook response**: The webhook handler returns a signed response. The developer must set three things: (1) `X-SIGNATURE` header from `webhookResult.responseSignature`, (2) `Content-Type: application/json` header (SDK does not set this automatically — the framework default is usually `text/plain`), (3) return `responseBody` as-is. Do not modify the response body.

6. **Webhook business logic pattern**: The webhook handler must NOT be left as TODO placeholders. **Every registered notification handler** must implement the three-stage pattern:
   - **Stage 1 — Idempotency check**: Query the local order/subscription by its ID. If already in terminal status (success/failed/cancelled), skip processing and return success response.
   - **Stage 2 — Concurrency protection**: Lock the order (mutex, distributed lock, or DB row-level lock with `FOR UPDATE`) before processing to prevent duplicate webhooks from double-executing business logic.
   - **Stage 3 — Business execution in transaction**: Within a database transaction: update order status → execute business logic → commit. If any step fails, rollback.

   **Per-handler business logic guidance** — ask the developer for each handler's business rules:

   | Handler | Typical business logic | What to ask |
   |---------|----------------------|-------------|
   | `onPayment` | Add balance, fulfill order, grant credits | "What happens when payment succeeds?" |
   | `onRefund` | Revoke benefits, deduct balance, mark refunded | "What to revoke on refund success?" |
   | `onSubscriptionStatus` | Activate/suspend/cancel subscription record | "How do you track subscription lifecycle?" |
   | `onSubscriptionPeriodChanged` | Extend validity period, reset usage quota, handle renewal failure (e.g., mark past-due, notify user) | "What happens on renewal success/failure?" |
   | `onSubscriptionChange` | Update plan/amount/period in local record, apply prorated changes | "What changes on upgrade/downgrade?" |

   **Fallback rule**: If business logic cannot be inferred from the project's existing code, do NOT silently log and skip. Instead:
   - Generate a stub with `// ACTION REQUIRED: implement {specific business logic}` comment
   - **Explicitly ask the developer** in the interactive session: "I cannot infer the business logic for `{handler}` — what should happen when `{event}` is received?"
   - Do NOT treat `// ACTION REQUIRED` as acceptable output — it must be resolved before Step 6 writes code

7. **Thread safety**: Recommend creating a single SDK instance and reusing it (singleton pattern).

8. **Request ID length**: `paymentRequestId`, `refundRequestId`, `subscriptionRequest` all have a **max length of 32 characters**. Do NOT use raw UUIDs (36 chars). Use UUID without dashes: `crypto.randomUUID().replace(/-/g, '')` (Node.js), `UUID.randomUUID().toString().replace("-", "")` (Java), `strings.ReplaceAll(uuid.New().String(), "-", "")` (Go).

9. **Required fields by merchant**: `userInfo.userTerminal` is required — values: `WEB` (PC/desktop browser), `APP` (mobile app, tablet), `WAP` (mobile browser), `SYSTEM` (server-to-server). Ask the developer what terminal type their users will use, and set the default accordingly. Also include `successRedirectUrl` for payment orders — most merchants require a redirect URL after payment.

10. **paymentInfo.productName**: Use `'ONE_TIME_PAYMENT'` for one-time orders and `'SUBSCRIPTION'` for subscriptions — these are the standard product name values recognized by Waffo.

11. **Subscription-specific field names**: Subscription create uses `currency` and `amount` (NOT `orderCurrency`/`orderAmount` used by order create). Required fields for subscription create: `subscriptionRequest`, `merchantSubscriptionId`, `currency`, `amount`, `notifyUrl`, `successRedirectUrl`, `productInfo` (with `description`, `periodType`, `periodInterval`), `userInfo` (with `userTerminal`), `goodsInfo` (with `goodsId`, `goodsName`, `goodsUrl`), `paymentInfo` (with `productName` and `payMethodType`).

12. **PeriodType values**: Valid values are `'DAILY'`, `'WEEKLY'`, `'MONTHLY'`. There is no `YEARLY`. Period interval is a string (e.g., `'1'`), not a number.

13. **manage() API**: `subscription().manage()` returns a `managementUrl` for the subscription management page. It only works when the subscription is `ACTIVE` (payment completed). Request requires `subscriptionRequest` or `subscriptionId`. The Sandbox management URL includes `mock=true` automatically.

14. **payMethodType is REQUIRED for subscriptions**: `paymentInfo.payMethodType` must be set for subscription create — without it the server returns A0003. Default to `'CREDITCARD,DEBITCARD,APPLEPAY,GOOGLEPAY'` (comma-separated string supporting multiple payment methods). This is different from `payMethodName` which is optional. Do NOT omit `payMethodType` or replace it with `payMethodName`.

15. **Store acquiringOrderID from order create response**: The `order().create()` response contains `acquiringOrderID` — this is Waffo's internal order identifier and is the **only key** in refund webhook notifications (`REFUND_NOTIFICATION`). You MUST store this value alongside the local order record (e.g., in a dedicated column or field). Without it, refund webhooks cannot be matched to local orders because `paymentRequestID` is NOT included in refund notifications.

16. **Create local record for subscription**: After `subscription().create()` succeeds, you MUST insert a local order/subscription record using `subscriptionRequest` as the lookup key. All subscription webhooks (`SUBSCRIPTION_STATUS_NOTIFICATION`, `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION`, `SUBSCRIPTION_CHANGE_NOTIFICATION`) identify orders by `subscriptionRequest`. If no local record exists, every subscription webhook will silently fail. Also store `subscriptionID` from the response for future reference.

17. **Wire SDK client reset to config updates**: If the project stores SDK credentials in a database or config file that can be updated at runtime (e.g., admin settings page), ensure that changing any Waffo credential triggers a reset of the SDK singleton. Otherwise the old credentials remain in memory until server restart. Use a callback, event, or direct call depending on the project's architecture.

18. **Return and persist generated request IDs**: When the integration generates a request ID (e.g., `paymentRequestId`, `refundRequestId`, `subscriptionRequest`) during an API call, that ID MUST be (1) returned to the caller in the HTTP response, and (2) persisted in the local database. These IDs are required for subsequent inquiry/status operations. If they are generated internally but not exposed, the corresponding query endpoints become unusable.

19. **Set all redirect URLs**: Order create and subscription create MUST include all three redirect URLs: `successRedirectUrl`, `failedRedirectUrl`, and `cancelRedirectUrl`. Missing the failed or cancel URL causes the Waffo checkout page to show no return link on failure/cancellation, trapping the user on the payment page.

20. **orderDescription**: Pass a specific, descriptive order description (e.g., "Premium Plan - 1 Month"). This helps identify orders during customer support investigations.

21. **goodsName is required**: `goodsName` must always be provided. Additionally, provide either `goodsUrl` (product detail page URL, NOT an image URL) or `appName` (the app's name as listed on AppStore/Google Play). At least one of the two is recommended.

22. **userEmail format**: Do NOT include the word "test" in `userEmail`. Do NOT share the same email across multiple users. Recommended format for generated emails: `{userId}@example.com`.

23. **Card payment payMethodType**: For card-based payments, recommend setting `payMethodType="CREDITCARD,DEBITCARD"` without passing `payMethodName`. This lets Waffo auto-detect the card brand from the BIN (Bank Identification Number).

24. **No payMethodCountry for global cards**: Do NOT pass `payMethodCountry` for global card payments. This field is only relevant for local payment methods.

25. **Time field format**: All time fields (`orderRequestedAt`, `userCreatedAt`, etc.) must use ISO 8601 UTC+0 format ending with `Z`. Milliseconds must not exceed 3 digits. Example: `2026-04-01T12:00:00.000Z`.

26. **subscriptionManagementUrl**: This URL must be provided for subscription integrations and MUST require authentication. Users should not be able to manage their subscription without being logged in.

27. **Webhook callback port**: Waffo can only deliver webhooks to ports **80** (HTTP) and **443** (HTTPS). Other ports are not accessible. Ensure your webhook endpoint is served on one of these standard ports.

28. **Webhook response format**: The webhook response body must be exactly `{"message":"success"}` with `Content-Type: application/json`. No extra whitespace, no different JSON keys, no HTML. When using the SDK's `HandleWebhook()`, this is handled automatically.

29. **Redirect URL format**: Redirect URLs (`successRedirectUrl`, `failedRedirectUrl`, `cancelRedirectUrl`) support both HTTPS links and deeplinks (e.g., `komoe://payment/result`). Both formats are valid.

---

## Step 7: Integration Verification

Test the integration end-to-end **through the project's own endpoints**, not by calling the SDK directly. The acceptance criteria are fixed; the test implementation is dynamically generated based on the project's code.

**Trigger phrases**: "run test cases", "integration test", "集成测试", "验收测试", "跑测试用例", "UAT"

### Entry Conditions

Step 7 can be entered two ways:

1. **After Step 6** — natural continuation after writing integration code
2. **Direct trigger** — developer says "跑集成测试" on an already-integrated project

### Phased Execution (MANDATORY)

Step 7 is split into 4 phases with explicit checkpoints. This prevents context exhaustion.

```
Phase A — Core Tests (~15 tool calls):
  order-create → payment-success → payment-failure
  → order-create-error → webhook-idempotency
  ✓ Checkpoint: output Phase A results

Phase B — Pay Method Coverage (sequential batch in main session):
  payMethodConfig().inquiry() → build minimum test set (§Pay Method Discovery)
  → create orders via curl → pay each sequentially via browser_run_code
  ✓ Checkpoint: output Phase B results

Phase C1 — Refund (~10 tool calls):
  refund-success → refund-inquiry → refund-webhook
  ✓ Checkpoint: output Phase C1 results

Phase C2 — Subscription (~15 tool calls):
  subscription-create → inquiry → renewal → cancel
  subscription-change → change-inquiry (if integrated)
  ✓ Checkpoint: output Phase C2 results

Phase D — Passive Verification + Report (~5 tool calls):
  Code review 15 items → generate final report with all phase results
```

- Phase A MUST complete in the current session
- Phase B runs sequentially in main session (see Browser Conflict Warning below)
- Phase C1 may continue in same session or handoff to new session if context is low
- Phase C2 may continue in same session or handoff to new session if context is low
- **Phase D is BLOCKED until Phase A + B + C1 + C2 are ALL complete** — do NOT generate the report while any phase is still running or has pending background agents. If a background agent was dispatched, you MUST wait for its completion notification before starting Phase D.
- **Execution order is strict**: A → B → C1 → C2 → D. Do NOT start a later phase while an earlier phase has unfinished work (including background agents). The only exception: C1 API-only tests (curl) may run while Phase B browser tests execute, but Phase D report MUST wait for all.

### Browser Conflict Warning (CRITICAL)

**Playwright MCP uses a single shared browser instance.** If you dispatch a subagent that uses Playwright, it will compete with the main session for the same browser — causing page navigation conflicts, stale selectors, and flaky test results.

**Rules:**
- **NEVER** dispatch regular (non-isolated) subagents to run Playwright tests
- Phase B card brand tests MUST use one of these two strategies:

#### Strategy 1: Sequential Batch in Main Session (DEFAULT — recommended)

Run all card brand payments sequentially in the main session using `browser_run_code`. Each card takes ~3 tool calls (navigate + run_code + verify). For 4-8 card brands this is ~12-24 tool calls — well within budget.

```
1. Main session: Create ALL orders via curl (fast, no browser)
2. For each card brand sequentially:
   a. browser_navigate to checkout URL
   b. browser_run_code: fill card + submit + wait for result
   c. Verify result (screenshot or text check)
3. Collect all results, output Phase B summary
```

#### Strategy 2: Isolated Agents (when context budget is tight)

If context is running low and you need to offload Phase B, dispatch agents with `isolation: "worktree"` — but note they still share the Playwright browser. To truly isolate:

1. **Main session finishes ALL Playwright work first** (Phase A payment tests)
2. **Main session stops using Playwright** (no more browser calls)
3. **Then** dispatch a single agent (not parallel) to run Phase B card tests
4. Wait for agent to complete before resuming Playwright in main session

**NEVER run Playwright in main session and an agent simultaneously.**

### Context Budget Rules

Before starting Step 7, estimate the tool call budget:

| Mode | Calls per card payment | 8 card brands total |
|------|----------------------|-------------------|
| Step-by-step Playwright | ~12 | ~96 (❌ exceeds budget) |
| `browser_run_code` batch | ~3 (navigate + run_code + verify) | ~24 (✅ fits in main session) |

**Rules:**
- ALWAYS use `browser_run_code` batch mode (§2 Batch Mode) instead of step-by-step clicks
- Run card brand tests sequentially in main session (Strategy 1) by default
- Only use Strategy 2 if context is critically low AND main session has stopped using Playwright

### Loop Mode — Fix-and-Retry Protocol

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

**Fix log format (included in report):**
```
Test: payment-success
  Attempt 1: FAIL — webhook not processed, order stuck in pending
    Root cause: notifyURL used stale ServerAddress
    Fix: Updated ServerAddress option via API
  Attempt 2: PASS ✓
  Fixes applied: 1
```

### Business Validation References (MANDATORY — read before testing)

Before generating any test, read these reference files:
- `references/business-validation.md` — code check list (§1), business questions (§2), competitor reference (§3), passive verification checklist (§4), acceptance report template (§5)
- `references/sandbox-knowledge.md` — Sandbox-specific quirks: refund must use e-wallet not card (K024), subscription renewal simulation (K018), checkout selectors (K026), response format (K023), rate limiting (K027), disable project rate limiting before test (K028), payMethodType limits checkout (K029), subscription management page DOM (K030), exception trigger amounts

### Context Discovery (MANDATORY first step)

Before generating any test, read the project's code to understand:

1. **Routes**: Find Waffo-related HTTP endpoints (e.g., `router/`, `routes/`, `app.ts`)
2. **Controllers**: Understand request/response format, authentication requirements
3. **Webhook handler**: Understand what business logic runs on payment success/failure (e.g., recharge balance, update order status)
4. **Pay methods**: Call `payMethodConfig().inquiry()` using the project's SDK credentials to get the **actual contracted pay methods** (source of truth). Filter `currentStatus == "1"` only. Then apply the pay method simplification rules (§Pay Method Discovery) to build the minimum test set.
5. **Credentials**: Check env vars, config files, database options for Sandbox credentials
6. **Feature scope**: Determine which features are integrated → map to applicable test items
7. **payMethodType cross-check** (K029): Read project code to find what `payMethodType` / `payMethodName` values are passed in order/subscription create calls. Cross-compare with step 4's contracted list to produce the **checkout-available** methods. Only methods that are both contracted AND passed in `payMethodType` will appear on the checkout page. Flag mismatches in the summary.

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
```

### Prerequisites

1. **Backend running**: Check if the project's server port is listening
2. **Tunnel**: Start cloudflared/ngrok for webhook delivery (detect which is installed)
3. **Credentials**: Verify Sandbox credentials are available
4. **Auth token**: If the project's order endpoint requires authentication, obtain a valid token (e.g., login via API, or ask the developer)

### Acceptance Criteria

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

### Test Execution

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

### Playwright Checkout Protocol

When a test requires completing payment on the checkout page, follow `references/acceptance-criteria.md` §2 (Playwright Protocol).

**ALWAYS use Batch Mode** (`browser_run_code`) as the primary approach — it completes an entire card payment in 1 tool call instead of ~12. Only fall back to step-by-step mode if `browser_run_code` is unavailable or fails.

Key points:
- Batch Mode: `browser_navigate` → `browser_run_code` (fills all fields + submits + waits for result) → parse JSON result
- Use `pressSequentially` (slowly) for card fields, NOT `fill()`
- Wait for "Processing Payment..." to disappear
- Verify result page shows correct redirect URL in "Confirm" link
- Poll inquiry API for terminal status confirmation

### Pay Method Discovery

#### Step 1: Get contracted methods

Call `payMethodConfig().inquiry()` with the project's SDK credentials. Filter `currentStatus == "1"`. This is the **source of truth** — do not rely on project config alone.

#### Step 2: Classify by type

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

#### Step 3: Build minimum test set

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

#### Step 4: Execute tests

For each method in the minimum test set:
- **Card** → map to test cards in `references/acceptance-criteria.md` §1. Execute a full payment-success cycle.
- **Non-card** → create order with that pay method, open checkout URL with Playwright, look for Sandbox "simulate success" button. If found → click and verify. If not found → SKIP with reason.
- **APPLEPAY / GOOGLEPAY** → mark MANUAL. Inform integrator: "Create an order, open checkout URL on your phone, complete payment using the device's native payment flow."

### Business Logic Verification

For payment-success, payment-failure, webhook-idempotency: after the webhook is processed, verify the project's business logic by checking actual state:

- **Database**: Query the project's database for order status, user balance, etc.
- **API**: Call the project's query endpoints to verify state changes
- **Logs**: Check backend logs for expected log entries

The specific checks depend on what Context Discovery found in the webhook handler code.

### Post-Execution Checklist

After all test items are executed, evaluate:

| # | Check | Evaluate |
|---|-------|----------|
| C1 | All applicable tests executed | Were any test items skipped that should have been tested? |
| C2 | Pay method coverage | **Minimum test set** all tested? Skipped methods documented with reason? APPLEPAY/GOOGLEPAY marked MANUAL? |
| C3 | Business logic verified | Was the project's actual behavior checked (not just API response)? |
| C4 | Redirect URLs verified | Were success/failure redirect URLs asserted from checkout result page? |
| C5 | Webhook Content-Type | Webhook response sets `Content-Type: application/json`? SDK only generates responseBody — the web framework default is usually `text/plain`. Check the actual response header during active tests (e.g., inspect webhook call logs or curl the endpoint). If wrong → `FIXABLE_CODE`, apply Loop Mode fix. |

**Verdict:**
- All C1-C5 PASS → **FULL**
- Any PARTIAL → **CONDITIONAL** (list remediation steps)
- Any FAIL → **INCOMPLETE** (list what failed and why)

### Code Review — Passive Verification (MANDATORY after active tests)

After all active tests complete, perform a code review against the passive verification checklist in `references/business-validation.md` §4. This covers 15 exception handling scenarios (8 payment + 7 subscription) that are verified by reading code, not by running tests.

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

### Verification Report

Generate report per `references/acceptance-criteria.md` §4 template. Include:
- Test item results (PASS/FAIL/SKIP per item, using descriptive names)
- Fixes applied during testing (if Loop Mode was triggered)
- Checklist results (C1-C4)
- Overall verdict (FULL / CONDITIONAL / INCOMPLETE)
- Failed items with details
- Skipped items with reasons

Print to console AND save to `integration-report-{YYYYMMDD}.txt` in project root.
