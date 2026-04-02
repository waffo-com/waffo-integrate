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

2. **Checkout pay method selection**: "Do users select payment method on YOUR checkout page, or on Waffo's checkout page?"
   - **Integrator's checkout** → must pass `payMethodType` and/or `payMethodName` in order create
   - **Waffo's checkout** → do NOT pass `payMethodType`/`payMethodName`, let user choose on Waffo page

3. **Subscription mode** *(only if Subscription selected)*: "When subscription renewal fails, what should happen?"
   - **Payment-first**: Suspend benefits during retry period. On success, next period starts from success date. On permanent failure, stop retrying.
   - **Service-first**: Continue providing service during retry period. Keep retrying in subsequent cycles.

4. **Subscription refund** *(only if Subscription selected)*: "Do you need to refund subscription payments?"
   - Yes → generate refund-related code for subscriptions
   - No → skip subscription refund code

5. **Pricing currency**: "Is your pricing single-currency (e.g., always USD) or multi-currency (different currencies based on user's country)?"
   - **Single-currency** → hardcode `orderCurrency` / `currency` in code (e.g., `"USD"`)
   - **Multi-currency** → `orderCurrency` / `currency` must be a parameter passed by the caller, NOT hardcoded. Generate code that accepts currency as input.
   - Follow-up: "Which currencies do you need to support?" (for test coverage in Step 7)
   - Note: Waffo checkout automatically displays payment methods available for the given currency — the skill does NOT need to map currency → payment methods.

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

9. **Required fields by merchant**: `userInfo.userTerminal` is required — values: `WEB` (PC/desktop browser), `APP` (mobile app, tablet). Ask the developer what terminal type their users will use, and set the default accordingly. Also include `successRedirectUrl` for payment orders — most merchants require a redirect URL after payment.

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

30. **Currency parameterization**: If the developer answered "multi-currency" in Step 3 Q5, `orderCurrency` (for orders) and `currency` (for subscriptions) MUST be function parameters, NOT hardcoded values. Waffo checkout automatically displays payment methods available for the given currency — the code does not need to handle currency→payment-method mapping.

31. **Refund currency must match order currency**: The refund `orderCurrency` and `orderAmount` must use the **original order's currency**, not the project's internal accounting currency. For example, if a user paid in IDR, the refund must also be in IDR — even if the project internally tracks revenue in USD.

---

## Step 7: Integration Verification

Read `references/integration-verification.md` for the complete verification protocol.

**Trigger phrases**: "run test cases", "integration test", "集成测试", "验收测试", "跑测试用例", "UAT"

**Entry**: After Step 6 (natural continuation) or direct trigger on an already-integrated project.

**Phases**: A (core tests) → B1 (card) → B2 (non-card) → C1 (refund) → C2 (subscription) → D (passive verification + report)

**Also reads**: `references/acceptance-criteria.md` (test cards, Playwright scripts, report template), `references/sandbox-knowledge.md` (Sandbox quirks K024-K030), `references/business-validation.md` (passive verification checklist)
