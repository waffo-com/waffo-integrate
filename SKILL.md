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

## Step 7: Integration Verification

Test the integration end-to-end **through the project's own endpoints**, not by calling the SDK directly. The acceptance criteria are fixed; the test implementation is dynamically generated based on the project's code.

**Trigger phrases**: "run test cases", "integration test", "集成测试", "验收测试", "跑测试用例", "UAT"

### Entry Conditions

Step 7 can be entered two ways:

1. **After Step 6** — natural continuation after writing integration code
2. **Direct trigger** — developer says "跑集成测试" on an already-integrated project

### Context Discovery (MANDATORY first step)

Before generating any test, read the project's code to understand:

1. **Routes**: Find Waffo-related HTTP endpoints (e.g., `router/`, `routes/`, `app.ts`)
2. **Controllers**: Understand request/response format, authentication requirements
3. **Webhook handler**: Understand what business logic runs on payment success/failure (e.g., recharge balance, update order status)
4. **Pay methods**: Read project config for contracted payment methods
5. **Credentials**: Check env vars, config files, database options for Sandbox credentials
6. **Feature scope**: Determine which features are integrated → map to applicable AC items

Output a summary before proceeding:
```
Context Discovery:
  Order endpoint:    POST /api/waffo/pay (auth: JWT)
  Webhook endpoint:  POST /api/waffo/webhook (no auth, signature verified)
  Business logic:    Webhook success → RechargeWaffo() → add balance
  Pay methods:       CREDITCARD,DEBITCARD / APPLEPAY / GOOGLEPAY
  Credentials:       Found in database options (Sandbox)
  Features:          Order Create + Webhook (no Cancel/Refund/Subscription)
  Applicable ACs:    AC-1 ~ AC-6
```

### Prerequisites

1. **Backend running**: Check if the project's server port is listening
2. **Tunnel**: Start cloudflared/ngrok for webhook delivery (detect which is installed)
3. **Credentials**: Verify Sandbox credentials are available
4. **Auth token**: If the project's order endpoint requires authentication, obtain a valid token (e.g., login via API, or ask the developer)

### Acceptance Criteria

Read `references/acceptance-criteria.md` for the full criteria definitions. The criteria are organized by feature:

**Core (all projects that integrate Order Payment + Webhook):**

| ID | Criteria | What to verify |
|----|----------|----------------|
| AC-1 | Order creation | Project endpoint creates order → returns checkout URL |
| AC-2 | Payment success | Playwright pays → webhook arrives → project executes business logic (e.g., balance added) |
| AC-3 | Payment failure | Playwright pays with failure card → webhook arrives → project does NOT execute business logic |
| AC-4 | Order creation failure | Trigger SDK error via project endpoint → project returns error, marks local order as failed |
| AC-5 | Webhook idempotency | Send same webhook notification twice → business logic executes only once |
| AC-6 | Multi-pay-method coverage | Each contracted card brand tested at least once for AC-2 |

**Refund (if integrated):**

| ID | Criteria | What to verify |
|----|----------|----------------|
| AC-7 | Refund success | Project refund endpoint → refund succeeds → order status updated |
| AC-8 | Refund inquiry | Project refund query endpoint → returns correct refund status |
| AC-9 | Refund webhook | Refund notification arrives → project updates order status |

**Subscription — basic (if integrated):**

| ID | Criteria | What to verify |
|----|----------|----------------|
| AC-10 | Subscription creation | Project endpoint creates subscription → Playwright pays → activation webhook → project handles |
| AC-11 | Subscription inquiry | Project subscription query endpoint → returns correct status |
| AC-12 | Renewal webhook | Next period notification arrives → project processes renewal |
| AC-13 | Subscription cancel | Project cancel endpoint → subscription cancelled → status updated |

**Subscription — change (if integrated):**

| ID | Criteria | What to verify |
|----|----------|----------------|
| AC-14 | Subscription change | Project change endpoint → change succeeds |
| AC-15 | Change inquiry | Project change query endpoint → returns correct change status |

### Test Execution

For each applicable AC item:

1. **Announce**: "Testing AC-{N}: {description}"
2. **Generate test approach** based on discovered project code (endpoint, auth, params)
3. **Execute** through the project's HTTP endpoint (NOT directly via SDK)
4. **Verify** the expected project behavior (check database state, API response, webhook processing)
5. **Record** result: PASS / FAIL with details

**Execution order matters** — some ACs depend on earlier results:
```
AC-1 (create order) → AC-2 (pay success) → AC-5 (webhook idempotency)
AC-1 → AC-3 (pay failure)
AC-1 → AC-4 (create failure)
AC-2 → AC-7 (refund, uses paid order)
AC-6 repeats AC-2 for each card brand
```

### Playwright Checkout Protocol

When a test requires completing payment on the checkout page, follow `references/acceptance-criteria.md` §2 (Playwright Protocol). Key points:

- Use `pressSequentially` (slowly) for card fields, NOT `fill()`
- Wait for "Processing Payment..." to disappear
- Verify result page shows correct redirect URL in "Confirm" link
- Poll inquiry API for terminal status confirmation

### Pay Method Discovery

Before AC-6, enumerate all contracted pay methods from project config:
- Card-based methods (CREDITCARD, DEBITCARD) → map to test cards in `references/acceptance-criteria.md` §1
- Non-card methods (APPLEPAY, GOOGLEPAY) → mark SKIP with reason
- Execute AC-2 once per testable card brand (minimum: CC_VISA + DC_VISA if both contracted)

### Business Logic Verification

For AC-2, AC-3, AC-5: after the webhook is processed, verify the project's business logic by checking actual state:

- **Database**: Query the project's database for order status, user balance, etc.
- **API**: Call the project's query endpoints to verify state changes
- **Logs**: Check backend logs for expected log entries

The specific checks depend on what Context Discovery found in the webhook handler code.

### Post-Execution Checklist

After all AC items are tested, evaluate:

| # | Check | Evaluate |
|---|-------|----------|
| C1 | All applicable ACs tested | Were any AC items skipped that should have been tested? |
| C2 | Pay method coverage | All contracted card brands tested? Non-testable methods documented? |
| C3 | Business logic verified | Was the project's actual behavior checked (not just API response)? |
| C4 | Redirect URLs verified | Were success/failure redirect URLs asserted from checkout result page? |

**Verdict:**
- All C1-C4 PASS → **FULL**
- Any PARTIAL → **CONDITIONAL** (list remediation steps)
- Any FAIL → **INCOMPLETE** (list what failed and why)

### Verification Report

Generate report per `references/acceptance-criteria.md` §3 template. Include:
- AC item results (PASS/FAIL/SKIP per item)
- Checklist results (C1-C4)
- Overall verdict (FULL / CONDITIONAL / INCOMPLETE)
- Failed items with details
- Skipped items with reasons

Print to console AND save to `integration-report-{YYYYMMDD}.txt` in project root.
