---
name: waffo-integrate
description: Interactive guide for integrating Waffo Payment SDK into projects. Walks developers through selecting features (payments, refunds, subscriptions, webhooks), choosing language (Node.js/Java/Go), and generates production-ready integration code with Sandbox tests. Also runs automated acceptance test suites (Step 9) to verify integration correctness. Use this skill whenever the user mentions integrating Waffo SDK, adding payment functionality with Waffo, setting up Waffo webhooks, asks about Waffo SDK usage, or wants to run acceptance tests. Trigger phrases include "integrate waffo", "waffo sdk", "waffo payment", "接入waffo", "集成waffo", "接入支付", "waffo webhook setup", "run test cases", "acceptance testing", "验收测试", "跑测试用例", "UAT".
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
Step 7: Generate Sandbox tests
Step 8: Local end-to-end verification (if Webhook selected)
Step 9: Acceptance test execution (run full test case suite)
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
4. **Test files**

**IMPORTANT**: Before generating any code, read `references/api-contract.md` to verify required fields, enum values, and field types. This is the source of truth extracted from openapi.json — do not guess field names or assume which fields are optional.

Then use the language-specific reference files for code templates:
- Node.js: Read `references/node.md`
- Java: Read `references/java.md`
- Go: Read `references/go.md`

## Step 6: Write to Project

After the developer approves, write files to their project:

1. **Install SDK dependency** (run the appropriate package manager command)
2. **Create integration files** in a sensible project structure
3. **Show next steps** (configure credentials, set up webhook endpoint, etc.)

### SDK Installation

Dynamically fetch the latest version before installing:

**Node.js:**
```bash
npm view @anthropic-ai/waffo-node version  # get latest
npm install @waffo/waffo-node
```

**Java (Maven):**
Check Maven Central for latest version of `com.waffo:waffo-java`, then add to pom.xml.

**Go:**
```bash
go get github.com/waffo-com/waffo-go@latest
```

### File Structure

Adapt to the project's existing structure. If none exists, use these defaults:

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

## Step 7: Generate Tests

### Credential Detection

Check for Waffo credentials in this order:
1. Environment variables: `WAFFO_API_KEY`, `WAFFO_PRIVATE_KEY`, `WAFFO_PUBLIC_KEY`, `WAFFO_MERCHANT_ID`
2. Project config files (`.env`, `application.yml`, etc.)

### Test Strategy

**If credentials found:**
Generate integration tests that call Waffo Sandbox directly. Use `Environment.SANDBOX`. Each test should:
- Call the real API
- Assert `response.isSuccess()` with full diagnostic output on failure
- Print request IDs and response data for debugging

**If no credentials:**
Generate test stubs with environment variable guards:
```typescript
const HAS_CREDENTIALS = !!process.env.WAFFO_API_KEY;

describe('Waffo Payment', () => {
  (HAS_CREDENTIALS ? it : it.skip)('creates an order via Sandbox', async () => {
    // Real API call test — runs when credentials are configured
  });
});
```

Include a comment explaining how to configure credentials to enable the tests.

### Test Error Logging

Every API response assertion must include full diagnostic output before the assertion:
- Request identifiers (paymentRequestId, subscriptionRequest, etc.)
- Full response (code, message, data)

This is critical because Sandbox tests depend on external services — when they fail, you need the request ID to investigate.

---

## Step 8: Local End-to-End Verification

After code is written and tests pass, offer to run a full local verification if the developer selected **Webhook**. This proves the entire flow works: create order → pay → receive webhook callback.

Ask: "Want to verify the full payment + webhook flow locally? I'll set up a tunnel so Waffo can reach your local server."

### Prerequisites Check

1. **Local server running**: Check if the webhook port is listening (`lsof -i :PORT` or `curl http://localhost:PORT/health`). If not, guide the developer to start it.
2. **Credentials configured**: Verify Waffo credentials are available (env vars or config files).

### Tunnel Setup

Detect which tunnel tool is installed, in order of preference:

| Tool | Detection | Start Command | Get Public URL |
|------|-----------|---------------|----------------|
| cloudflared | `which cloudflared` | `cloudflared tunnel --url http://localhost:PORT` | Parse stdout for `https://*.trycloudflare.com` |
| ngrok | `which ngrok` | `ngrok http PORT` | `curl http://localhost:4040/api/tunnels` → `.tunnels[0].public_url` |

If neither is installed, show installation instructions for both and let the developer choose.

Start the tunnel in the background and capture the public URL.

### Verification Flow

```
1. Start tunnel → obtain public URL
2. Query payment methods: payMethodConfig().inquiry()
   → Display supported methods so the developer knows what's available
3. Create order:
   - notifyUrl = {tunnelUrl}/{webhookPath}
   - successRedirectUrl = {tunnelUrl}/verification-success
   - No payMethodType specified (let checkout page show all options)
4. Output checkoutUrl → developer opens it and completes payment manually
5. Poll order status: order().inquiry() every 3s, timeout 120s
   → Wait for orderStatus to change from PENDING
6. Verify webhook received:
   - ngrok: query inspection API at http://localhost:4040/api/requests/http
     → look for POST to webhookPath with 200 response
   - cloudflared: query the /waffo/last-webhook debug endpoint (see below)
7. Output verification report
8. Clean up: stop tunnel process
```

### Webhook Debug Endpoint (cloudflared only)

When cloudflared is the tunnel tool, generate a temporary debug endpoint in the developer's project that stores the last webhook received. This enables webhook verification without ngrok's inspection API.

**Node.js (Express):**
```typescript
// Temporary — remove after verification
let lastWebhook: any = null;
app.get('/waffo/last-webhook', (req, res) => res.json(lastWebhook));
// In webhook handler, add: lastWebhook = { receivedAt: new Date(), body, signature };
```

**Java (Spring Boot):**
```java
// Temporary — remove after verification
private static volatile String lastWebhook = null;
@GetMapping("/waffo/last-webhook")
public String lastWebhook() { return lastWebhook; }
// In webhook handler, add: lastWebhook = body;
```

**Go (Gin):**
```go
// Temporary — remove after verification
var lastWebhook atomic.Value
r.GET("/waffo/last-webhook", func(c *gin.Context) { c.String(200, lastWebhook.Load().(string)) })
// In webhook handler, add: lastWebhook.Store(string(body))
```

After verification completes, remind the developer to remove this debug endpoint.

### Subscription Verification (if Subscription selected)

After payment verification succeeds, continue with subscription-specific verification. This requires Playwright MCP for automating the management page.

**Prerequisites**: Playwright MCP must be available. If not, output the management URL and instruct the developer to click buttons manually.

#### Subscription Verification Flow

```
1. Create subscription:
   - notifyUrl = {tunnelUrl}/{webhookPath}
   - paymentInfo.productName = 'SUBSCRIPTION'
   - Use a short period (e.g., periodType='DAILY', periodInterval='1') for testing
2. Output checkoutUrl → developer completes initial payment manually
3. Poll subscription status: subscription().inquiry() every 3s, timeout 120s
   → Wait for subscriptionStatus = ACTIVE
4. Verify SUBSCRIPTION_STATUS_NOTIFICATION webhook received (status=ACTIVE)
5. Get management page: subscription().manage({ subscriptionRequest })
   → Obtain managementUrl from response
   → Sandbox environment returns URL with mock=true already included
6. Use Playwright to automate next period billing:
   a. Navigate to managementUrl
   b. Wait for page load
   c. Click "Next period payment success" button
   d. Wait for SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION webhook
   e. Query subscription to confirm still ACTIVE
7. Output subscription verification report
```

#### Management Page Automation (Playwright)

The Sandbox management page (with `mock=true`) shows two test buttons at the bottom:

| Button Text | Effect | Expected Webhook |
|------------|--------|-----------------|
| "Next period payment success" | Simulates successful period billing | `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION` |
| "Next period payment failed," | Simulates failed period billing | `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION` (with failure status) |

**Playwright automation steps:**

```
1. browser_navigate → managementUrl (Sandbox URL already includes mock=true)
2. browser_snapshot → verify page loaded with "Subscription Details" heading
3. browser_click → button "Next period payment success"
4. Wait 5-10s for webhook delivery
5. Verify webhook received (ngrok inspection API or /waffo/last-webhook)
6. subscription().inquiry() → confirm subscription still ACTIVE
```

#### Page Structure Reference

The management page contains:
- **Subscription Details**: product name, status (Active), price, next billing date
- **Cancel Subscription** button
- **Payment Method** section: list of saved payment methods
- **Billing History** section: table of past billing records
- **Mock buttons** (only with `mock=true`): "Next period payment success" and "Next period payment failed,"

### Verification Report

Output a clear summary. For payment-only verification:

```
┌─────────────────────────────────────────────┐
│        Waffo Payment Verification            │
├──────────────────┬──────────────────────────┤
│ Tunnel           │ ✅ cloudflared / ngrok    │
│ Create Order     │ ✅ acquiringOrderId=xxx   │
│ Checkout URL     │ https://...              │
│ Payment Status   │ ✅ PAY_SUCCESS            │
│ Webhook Received │ ✅ PAYMENT_NOTIFICATION   │
│ Signature Valid  │ ✅ 200 response returned  │
└──────────────────┴──────────────────────────┘
```

For subscription verification (appended to above):

```
┌─────────────────────────────────────────────┐
│      Waffo Subscription Verification         │
├──────────────────┬──────────────────────────┤
│ Create Sub       │ ✅ subscriptionId=xxx     │
│ Initial Payment  │ ✅ Completed via checkout │
│ Sub Status       │ ✅ ACTIVE                 │
│ Sub Webhook      │ ✅ SUBSCRIPTION_STATUS_NOTIFICATION │
│ Manage URL       │ ✅ Retrieved              │
│ Next Period      │ ✅ Triggered via Playwright│
│ Period Webhook   │ ✅ SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION │
└──────────────────┴──────────────────────────┘
```

If any step fails, show the failure reason and suggest fixes.

---

## Configuration Template

Always generate an SDK initialization module. The developer needs these credentials from the Waffo Dashboard:

| Config | Source | Required |
|--------|--------|----------|
| `apiKey` | Waffo Dashboard | Yes |
| `privateKey` | Merchant's RSA private key (PKCS8, Base64) | Yes |
| `waffoPublicKey` | Waffo's RSA public key (X509, Base64) | Yes |
| `environment` | `SANDBOX` for testing, `PRODUCTION` for live | Yes |
| `merchantId` | Waffo Dashboard | Yes |
| `connectTimeout` | Default 10000ms | No |
| `readTimeout` | Default 30000ms | No |

Recommend using environment variables for all secrets. Never hardcode credentials.

---

## Extended References

When the developer has questions beyond basic integration (troubleshooting, advanced patterns, status handling), point them to the relevant bundled reference files:

| Topic | Reference |
|-------|-----------|
| Field names, types, required/optional | Read `references/api-contract.md` |
| Status handling & webhook-driven state | Read `references/api-contract.md` § 7 "Status Handling Guide" |
| Node.js code patterns | Read `references/node.md` |
| Java code patterns | Read `references/java.md` |
| Go code patterns | Read `references/go.md` |
| FAQ, troubleshooting, best practices | Read `docs/INDEX.md` — knowledge base index with links to scenario-specific articles |

---

## Important Notes for Generated Code

1. **Response handling**: All SDK methods return `ApiResponse<T>`. Always check `isSuccess()` before accessing `getData()`.

2. **Error types**:
   - `WaffoError` — client-side errors (validation, config)
   - `WaffoUnknownStatusError` — network errors on write operations (create, refund, cancel). The operation may or may not have succeeded. The developer must query status to confirm.

3. **Timestamp auto-injection**: The SDK automatically injects `requestedAt` / `orderRequestedAt` if not provided. No need to set these manually.

4. **merchantId auto-injection**: The SDK automatically adds `merchantId` to all requests from config.

5. **Webhook response**: The webhook handler returns a signed response. The developer must set `X-SIGNATURE` header and return `responseBody` as-is. Do not modify the response body.

6. **Thread safety**: Recommend creating a single SDK instance and reusing it (singleton pattern).

7. **Request ID length**: `paymentRequestId`, `refundRequestId`, `subscriptionRequest` all have a **max length of 32 characters**. Do NOT use raw UUIDs (36 chars). Use UUID without dashes: `crypto.randomUUID().replace(/-/g, '')` (Node.js), `UUID.randomUUID().toString().replace("-", "")` (Java), `strings.ReplaceAll(uuid.New().String(), "-", "")` (Go).

8. **Required fields by merchant**: `userInfo.userTerminal` is required — values: `WEB` (PC/desktop browser), `APP` (mobile app, tablet), `WAP` (mobile browser), `SYSTEM` (server-to-server). Ask the developer what terminal type their users will use, and set the default accordingly. Also include `successRedirectUrl` for payment orders — most merchants require a redirect URL after payment.

9. **paymentInfo.productName**: Use `'ONE_TIME_PAYMENT'` for one-time orders and `'SUBSCRIPTION'` for subscriptions — these are the standard product name values recognized by Waffo.

10. **Subscription-specific field names**: Subscription create uses `currency` and `amount` (NOT `orderCurrency`/`orderAmount` used by order create). Required fields for subscription create: `subscriptionRequest`, `merchantSubscriptionId`, `currency`, `amount`, `notifyUrl`, `successRedirectUrl`, `productInfo` (with `description`, `periodType`, `periodInterval`), `userInfo` (with `userTerminal`), `goodsInfo` (with `goodsId`, `goodsName`, `goodsUrl`), `paymentInfo` (with `productName` and `payMethodType`).

11. **PeriodType values**: Valid values are `'DAILY'`, `'WEEKLY'`, `'MONTHLY'`. There is no `YEARLY`. Period interval is a string (e.g., `'1'`), not a number.

12. **manage() API**: `subscription().manage()` returns a `managementUrl` for the subscription management page. It only works when the subscription is `ACTIVE` (payment completed). Request requires `subscriptionRequest` or `subscriptionId`. The Sandbox management URL includes `mock=true` automatically.

13. **payMethodType is REQUIRED for subscriptions**: `paymentInfo.payMethodType` must be set for subscription create — without it the server returns A0003. Default to `'CREDITCARD,DEBITCARD,APPLEPAY,GOOGLEPAY'` (comma-separated string supporting multiple payment methods). This is different from `payMethodName` which is optional. Do NOT omit `payMethodType` or replace it with `payMethodName`.

---

## Step 9: Acceptance Test Execution

Run the full merchant integration acceptance test suite (65 test cases: 30 payment + 35 subscription) against Sandbox. Tests are executed by the AI in phases, with most cases fully automated.

**Trigger phrases**: "run test cases", "acceptance testing", "验收测试", "跑测试用例", "UAT"

### Entry Conditions

Step 9 can be entered two ways:

1. **After Step 8** — natural continuation after E2E verification
2. **Direct trigger** — merchant says "跑测试用例" on an already-integrated project

For direct entry, re-establish context first:
- Detect language (same as Step 1)
- Check for credentials (same as Step 7)
- Ask which product was integrated: ONE_TIME_PAYMENT / SUBSCRIPTION / both
- Ask which interfaces were integrated (Create Order, Inquiry, Cancel, Refund, Webhook, etc.)

### Reference Data

**Before executing any test, read `references/acceptance-tests.md`** — it contains:
- §1: Sandbox test card numbers (success/failure per card brand)
- §2: Magic amount table (amounts that trigger specific error codes)
- §3-§4: Full test case catalog with expected results
- §5: Phase execution dependencies
- §6: Playwright checkout automation protocol
- §7: Signature failure simulation protocol
- §8: Report template

### Test Execution Modes

| Mode | Description | Tool |
|------|------------|------|
| **API** | Direct SDK API call, assert response code/status | Generate & run standalone script |
| **Playwright** | Fill test card on checkout page, wait for payment result | Playwright MCP browser tools |
| **Webhook** | Verify notification received + signature valid | Check tunnel logs or debug endpoint |

### Execution Protocol

Execute phases **sequentially** — each phase may depend on results from previous phases.

**For each phase:**
1. Announce: "Phase {N}: {description} ({count} test cases)"
2. Generate a standalone executable script in the merchant's language for API-mode tests
3. Run the script and parse results
4. For Playwright-mode tests: use Playwright MCP to automate checkout
5. For Webhook-mode tests: verify webhook was received via tunnel inspection or debug endpoint
6. Output phase summary: PASS/FAIL/SKIP per test case

**Payment Phases** (if ONE_TIME_PAYMENT integrated):
```
Phase 1: API error scenarios (1.3-1.6, 4.4-4.5, 5.5-5.6) — magic amounts trigger error codes
Phase 2: Payment success (1.1) — Playwright fills success test card on checkout
Phase 3: Payment failure (1.2) — Playwright fills failure test card
Phase 4: Inquiry (2.1-2.3) — query orders from Phase 2/3
Phase 5: Cancel (4.1-4.3) — cancel tests using Phase 2's order
Phase 6: Payment webhooks (3.1-3.3) — verify notifications from Phase 2/3 + signature failure test
Phase 7: Refund (5.1-5.6, 6.1-6.4) — refund Phase 2's paid order
Phase 8: Refund webhooks (7.1-7.3) — verify refund notifications
```

**Subscription Phases** (if SUBSCRIPTION integrated):
```
Phase 9: Subscription error scenarios (S-1.5 to S-1.8)
Phase 10: Subscription payment (S-1.1, S-1.2) — Playwright checkout
Phase 11: Subscription inquiry (S-2.1 to S-2.3)
Phase 12: Subscription notifications (S-3.1 to S-3.5, S-4.1, S-4.4)
Phase 13: Next period billing (S-1.3, S-1.4, S-4.2, S-4.3) — Playwright on management page
Phase 14: Subscription cancel (S-5.1, S-5.6, S-5.7, S-3.3, S-3.4)
Phase 15: Order inquiry for subscription payments (S-6.1, S-6.2)
Phase 16: Subscription refund (reuse payment refund tests on subscription order)
```

### Scope Filtering

Only execute test cases for interfaces the merchant actually integrated:
- No Cancel interface → skip Phase 5 (4.1-4.5)
- No Refund interface → skip Phase 7-8 (5.x, 6.x, 7.x)
- No Webhook → skip Phase 6, 8 (3.x, 7.x) and all webhook verification in other phases
- No Subscription → skip Phase 9-16

For each contracted pay method, repeat Playwright checkout tests (Phase 2/3/10) with the corresponding test card from §1.

### Playwright Checkout Automation

When a test requires payment completion:
1. Create order/subscription via API → get checkout URL from `orderAction.webUrl` or `subscriptionAction.webUrl`
2. Use Playwright MCP: `browser_navigate` → `browser_snapshot` → `browser_fill_form` (card details from §1) → submit
3. `browser_wait_for` redirect to `successRedirectUrl` or `failedRedirectUrl`
4. Poll inquiry API every 3s until terminal status or 120s timeout

**If Playwright MCP unavailable**: Output the checkout URL + test card info, ask merchant to complete manually, then continue polling.

### Webhook Verification

For webhook test cases:
- **ngrok**: Query `http://localhost:4040/api/requests/http` to find matching POST requests
- **cloudflared**: Query the `/waffo/last-webhook` debug endpoint (from Step 8)
- **Signature failure test**: Use `curl` with forged `X-SIGNATURE` header (see §7 protocol)

### Acceptance Report

After all phases complete, generate the report per §8 template. Include:
- Test ID, scenario name, result (PASS/FAIL/SKIP), details
- Summary: passed/failed/skipped counts
- Failed case details with actual vs expected
- Skipped case reasons

Print to console AND save to `waffo-acceptance-report-{YYYYMMDD}.txt` in project root.
