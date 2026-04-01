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

**4. Webhook Notifications**
> "Do you need to receive real-time notifications from Waffo? (payment results, refund results, subscription status changes). This requires a publicly accessible endpoint on your server."

Events: `PAYMENT_NOTIFICATION`, `REFUND_NOTIFICATION`, `SUBSCRIPTION_STATUS_NOTIFICATION`, `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION`, `SUBSCRIPTION_CHANGE_NOTIFICATION`

Only register handlers for events relevant to selected features. For example, if the developer only chose Order Payment + Refund, only register `onPayment` and `onRefund`. If the developer also chose Subscription, defer subscription event selection to Step 4.5.

**5. Merchant Config Query** (optional, less common)
> "Do you need to query your merchant configuration (supported currencies, merchant status)?"

Operations: `merchantConfig().inquiry()`

**6. Payment Method Query** (optional, less common)
> "Do you need to query available payment methods for your merchant?"

Operations: `payMethodConfig().inquiry()`

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
- If developer selects "Subscription", suggest Webhook (subscription lifecycle depends on it)
- Always include SDK initialization (WaffoConfig + Waffo instance) regardless of selection

## Step 4: Framework Selection (Webhook only)

If the developer selected Webhook, ask about their web framework.

**Recommend mainstream frameworks by language:**

| Language | Recommended | Also Supported |
|----------|------------|----------------|
| Node.js | Express | NestJS, Fastify |
| Java | Spring Boot | - |
| Go | Gin | Echo, Fiber, Chi |

Ask: "What web framework are you using? If you're not sure, I recommend [Express/Spring Boot/Gin] — it's the most widely used for [language]."

## Step 4.5: Subscription Event Selection (Conditional)

**Only when the developer selected both Subscription and Webhook in Step 3.**

Ask: "Subscription has several webhook events — which ones matter for your use case?"

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
   - `WaffoUnknownStatusError` — network errors on write operations (create, refund, cancel). The operation may or may not have succeeded. The developer must query status to confirm.

3. **Timestamp auto-injection**: The SDK automatically injects `requestedAt` / `orderRequestedAt` if not provided. No need to set these manually.

4. **merchantId auto-injection**: The SDK automatically adds `merchantId` to all requests from config.

5. **Webhook response**: The webhook handler returns a signed response. The developer must set `X-SIGNATURE` header and return `responseBody` as-is. Do not modify the response body.

6. **Webhook business logic pattern**: The webhook handler must NOT be left as TODO placeholders. For each notification type, implement the three-stage pattern:
   - **Stage 1 — Idempotency check**: Query the local order/subscription by its ID. If already in terminal status (success/failed/cancelled), skip processing and return success response.
   - **Stage 2 — Concurrency protection**: Lock the order (mutex, distributed lock, or DB row-level lock with `FOR UPDATE`) before processing to prevent duplicate webhooks from double-executing business logic.
   - **Stage 3 — Business execution in transaction**: Within a database transaction: update order status → execute business logic (e.g., add balance, activate subscription) → commit. If any step fails, rollback.

   Ask the developer what business logic to execute on payment success (e.g., "add quota to user", "activate subscription", "fulfill order"). Do NOT generate empty TODOs — generate the actual implementation based on the project's existing patterns (find how other payment providers handle webhook success).

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

### Business Validation References (MANDATORY — read before testing)

Before generating any test, read these reference files:
- `references/business-validation.md` — code check list (§1), business questions (§2), competitor reference (§3), passive verification checklist (§4), acceptance report template (§5)
- `references/sandbox-knowledge.md` — Sandbox-specific quirks: credit card refund webhook limitation (K024), subscription renewal simulation (K018), checkout selectors (K026), response format (K023), rate limiting (K027), exception trigger amounts

### Context Discovery (MANDATORY first step)

Before generating any test, read the project's code to understand:

1. **Routes**: Find Waffo-related HTTP endpoints (e.g., `router/`, `routes/`, `app.ts`)
2. **Controllers**: Understand request/response format, authentication requirements
3. **Webhook handler**: Understand what business logic runs on payment success/failure (e.g., recharge balance, update order status)
4. **Pay methods**: Read project config for contracted payment methods
5. **Credentials**: Check env vars, config files, database options for Sandbox credentials
6. **Feature scope**: Determine which features are integrated → map to applicable test items

Output a summary before proceeding:
```
Context Discovery:
  Order endpoint:    POST /api/waffo/pay (auth: JWT)
  Webhook endpoint:  POST /api/waffo/webhook (no auth, signature verified)
  Business logic:    Webhook success → RechargeWaffo() → add balance
  Pay methods:       CREDITCARD,DEBITCARD / APPLEPAY / GOOGLEPAY
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
| pay-method-coverage | **Every contracted card brand** tested with a full payment-success cycle. Use §1 test cards for each. Non-card methods (APPLEPAY, GOOGLEPAY) marked SKIP. |

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
payment-success → pay-method-coverage (repeat with ALL contracted card brands)
payment-success → refund-success → refund-inquiry, refund-webhook
subscription-create → subscription-inquiry, subscription-renewal, subscription-cancel
subscription-change → subscription-change-inquiry
```

### Playwright Checkout Protocol

When a test requires completing payment on the checkout page, follow `references/acceptance-criteria.md` §2 (Playwright Protocol). Key points:

- Use `pressSequentially` (slowly) for card fields, NOT `fill()`
- Wait for "Processing Payment..." to disappear
- Verify result page shows correct redirect URL in "Confirm" link
- Poll inquiry API for terminal status confirmation

### Pay Method Discovery

Before pay-method-coverage, enumerate **all** contracted pay methods from project config:
- **Card-based methods** (CREDITCARD, DEBITCARD) → map to test cards in `references/acceptance-criteria.md` §1. Execute a full payment-success cycle **once per testable card brand** — ALL of them, not just a minimum.
- **Non-card methods** (e-wallets, bank transfers, etc.) → create an order specifying that pay method, get the checkout URL, then open it with Playwright and check if the Sandbox checkout page provides a "simulate success" / "mock payment" button. If yes → click it to complete the test. If no simulation is available → SKIP with reason.
- **APPLEPAY / GOOGLEPAY** → SKIP. These require a real mobile device with Apple Pay / Google Pay configured. Inform the integrator: "APPLEPAY and GOOGLEPAY must be tested manually on a real device — create an order, open the checkout URL on your phone, and complete payment using the device's native payment flow."

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
| C2 | Pay method coverage | **All** contracted card brands tested? Non-testable methods documented? |
| C3 | Business logic verified | Was the project's actual behavior checked (not just API response)? |
| C4 | Redirect URLs verified | Were success/failure redirect URLs asserted from checkout result page? |

**Verdict:**
- All C1-C4 PASS → **FULL**
- Any PARTIAL → **CONDITIONAL** (list remediation steps)
- Any FAIL → **INCOMPLETE** (list what failed and why)

### Code Review — Passive Verification (MANDATORY after active tests)

After all active tests complete, perform a code review against the passive verification checklist in `references/business-validation.md` §4. This covers 15 exception handling scenarios (8 payment + 7 subscription) that are verified by reading code, not by running tests.

For each passive verification item:

1. **Read** the relevant code section (error handler, webhook signature check, request ID generation, etc.)
2. **Check** if the exception handling branch exists and implements the correct strategy
3. **Record** result: `COVERED` / `MISSING` / `PARTIAL` with the code file and line reference

Example:
```
Passive Verification (Code Review):
  Payment 1.3 (C0005 channel rejection)  : COVERED  — service/waffo_payment.go:45
  Payment 1.4 (A0011 idempotency)        : COVERED  — paymentRequestId uses uuid per request
  Payment 3.3 (webhook signature failure) : COVERED  — SDK HandleWebhook auto-rejects
  Subscription 1.8 (Unknown Status)       : MISSING  — no WaffoUnknownStatusError handler
```

Include the full Code Review results in the verification report under "Passive Verification" section.

### Verification Report

Generate report per `references/acceptance-criteria.md` §4 template. Include:
- Test item results (PASS/FAIL/SKIP per item, using descriptive names)
- Checklist results (C1-C4)
- Overall verdict (FULL / CONDITIONAL / INCOMPLETE)
- Failed items with details
- Skipped items with reasons

Print to console AND save to `integration-report-{YYYYMMDD}.txt` in project root.
