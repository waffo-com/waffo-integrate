---
name: waffo-integrate
description: Use when integrating Waffo Payment SDK, adding Waffo payments/refunds/subscriptions/webhooks, generating Waffo SDK code, or running Waffo integration/UAT/acceptance tests through a project.
---

# Waffo SDK Integration Guide

Integrate Waffo Payment SDK into a project and verify the integration end-to-end through the project's own endpoints. Keep this file as the thin entrypoint; load references only when the step requires them.

## Source Priority

Use these sources in order:

1. Local `references/api-contract.md` for fields, enums, required parameters, and response shapes.
2. Live OpenAPI `https://waffo.com/docs/api-reference/openapi.json` when local contract may be stale.
3. Waffo docs index `https://waffo.com/docs/llms.txt` for specific Markdown doc pages.
4. Waffo docs full bundle `https://waffo.com/docs/llms-full.txt` for integration flow, Sandbox behavior, and acceptance context.
5. `https://waffo.com/docs/sitemap.xml` only to discover docs pages and modification time.

Do not use `https://waffo.com/llms.txt` or marketing pages as API-contract evidence.
产品/场景概念问题使用 `https://waffo.com/docs/en/essentials/product-overview`；字段级 API contract 仍以 OpenAPI/API Reference 为准。

## Flow

```
Step 1: Detect language and project status
Step 2: Select Waffo features and integration context
Step 3: Select webhook framework and subscription events
Step 4: Present code for review
Step 5: Write to project after approval and build
Step 6: Run full integration verification through project endpoints
```

## Reference Loading Map

| Need | Load |
|------|------|
| Wire fields, enum values, required params | `references/api-contract.md` |
| Generated-code guardrails and tricky Waffo rules | `references/code-generation-rules.md` |
| Node.js integration patterns | `references/node.md` |
| Java integration patterns | `references/java.md` |
| Go integration patterns | `references/go.md` |
| Python integration patterns | `references/python.md` |
| Step 6 verification protocol | `references/integration-verification.md` |
| Report template and official cases | `references/acceptance-criteria.md` |
| Sandbox quirks and simulator behavior | `references/sandbox-knowledge.md` |
| Passive business validation checklist | `references/business-validation.md` |
| 产品/场景选型解释 | `references/scenario-selection.md` |
| 客户可读术语和双语报告措辞 | `references/glossary.md` |
| 按症状排障和支持证据收集 | `references/troubleshooting.md` |

If local references and live docs disagree, prefer OpenAPI for wire contracts and note the discrepancy in the implementation/report.

## Step 1: Detect Language and Project Status

Detect before asking:

| Signal | Language |
|--------|----------|
| `package.json` with Node/TypeScript deps | Node.js |
| `pom.xml` or `build.gradle` | Java |
| `go.mod` | Go |
| `pyproject.toml`, `requirements.txt`, `Pipfile`, `uv.lock`, or `setup.py` | Python |

If ambiguous, ask for the language. Existing projects should reuse their layout and payment-provider patterns; new projects may use the default file structures in the language references.

## Step 2: Select Features and Context

Ask feature questions one at a time, in this order:

| Feature | Operations |
|---------|------------|
| Order Payment | `order().create()`, `order().inquiry()`, `order().cancel()`, `order().capture()` |
| Refund | `order().refund()`, `refund().inquiry()` |
| Subscription | `subscription().create()`, `subscription().inquiry()`, `subscription().cancel()`, `subscription().manage()`, `subscription().change()`, `subscription().changeInquiry()` |
| Merchant Config | `merchantConfig().inquiry()` |
| Payment Method Config | `payMethodConfig().inquiry()` |

Python uses snake_case for these method names (`change_inquiry`, `merchant_config`, `pay_method_config`, `on_payment`, `on_subscription_status`, etc.) and snake_case for `Waffo.from_env()` / `WaffoConfig`. Payload **dict keys remain camelCase** in every language because the SDK sends them through to the API verbatim.

Webhook is mandatory for payment integrations. Do not ask whether to add webhook; derive handlers from selected features:

| Selected Feature | Register Handlers |
|------------------|-------------------|
| Order Payment | `onPayment` |
| Refund | `onRefund` |
| Subscription | `onSubscriptionStatus`, `onSubscriptionPeriodChanged`, subscription-aware `onPayment` for `PAYMENT_NOTIFICATION` |
| Subscription Change | `onSubscriptionChange` |

When both order payment and subscription are integrated, route `PAYMENT_NOTIFICATION` by `paymentInfo.productName`: the one-time payment branch must not fulfill subscription payments, but subscription billing attempts/retries must still be handled or recorded and tested.

Ask these context questions when relevant:

| Topic | Decision Needed |
|-------|-----------------|
| User terminal | `WEB` or `APP`; if APP, ask external browser vs in-app WebView. APP requires `userTerminal=APP` and makes contracted WeChat Pay / Apple Pay required device tests. |
| Checkout selection | Integrator checkout passes `payMethodType`/`payMethodName`; Waffo checkout omits them and lets Waffo show methods. |
| Subscription mode | Payment-first suspends benefits during retry; service-first continues benefits during retry. |
| Subscription refund | Generate subscription refund code only if needed. |
| Currency mode | Single-currency may be hardcoded; multi-currency must accept currency as input. |
| iframe checkout | Add iframe config if used; Apple Pay cannot be used inside iframe. |
| Checkout expiry | `orderExpiredAt` must be UTC+0 ISO 8601; default is 4 hours. |

当开发者询问应选择哪种产品/场景/checkout mode，或询问这些上下文问题为什么重要时，先读取 `references/scenario-selection.md`。先解释取舍、默认建议和测试影响，再收集实现参数。

## Step 3: Framework and Event Selection

Since webhook is auto-included, ask for the web framework when order payment or subscription is selected:

| Language | Recommended | Also Supported |
|----------|-------------|----------------|
| Node.js | Express | NestJS, Fastify |
| Java | Spring Boot | - |
| Go | Gin | Echo, Fiber, Chi |
| Python | FastAPI | Flask, Django |

For subscription integrations, default to and test `SUBSCRIPTION_STATUS_NOTIFICATION`, `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION`, and `PAYMENT_NOTIFICATION`. Add `SUBSCRIPTION_CHANGE_NOTIFICATION` only when subscription upgrade/downgrade is integrated.

## Step 4: Present Code for Review

Before writing files, present complete code for:

1. SDK initialization.
2. Service layer for selected features.
3. Webhook route and registered handlers.
4. Tests: at least one test function per selected feature module.

Preview must show how these behaviors are handled:

| Area | Required Preview |
|------|------------------|
| Idempotency | Request IDs generated, persisted before Waffo write calls, and returned to callers |
| Unknown status | Same-key inquiry recovery for create/refund/cancel/subscription writes |
| Webhook | Signature verification, signed response, idempotency, locking, and business transaction |
| Persistence | `acquiringOrderID`, `refundRequestId`, `subscriptionRequest`, and `subscriptionID` storage where applicable |
| Redirects | Success, failed, and cancel URLs set for checkout flows |
| Pay methods | `payMethodType`/`payMethodName` behavior matches checkout ownership decision |

Before generating code, read:

- `references/api-contract.md` for wire contracts.
- `references/code-generation-rules.md` for generated-code guardrails.
- The language reference: `references/node.md`, `references/java.md`, `references/go.md`, or `references/python.md`.
- Online docs from `https://waffo.com/docs/llms.txt` only if local references are missing or likely stale.

Generated code must mirror existing payment integrations in the project (Stripe, PayPal, Creem, etc.) for route structure, config style, error handling, status transitions, fulfillment, refund revocation, and subscription lifecycle logic.

## Step 5: Write, Build, and Continue

After developer approval:

1. Install the SDK dependency using the language package manager.
2. Add files into the project's existing architecture; use default structures from language references only for new or empty projects.
3. Run the project's build/check command (`npm run build`, `mvn compile`, `go build ./...`, `python -m compileall .` or `ruff check && mypy`, etc.).
4. After build success, immediately start integration verification in the same response. Do not stop at “build passed” unless credentials, server, tunnel, or auth are missing.

SDK installation must use the current package version:

| Language | Action |
|----------|--------|
| Node.js | Check `npm view @waffo/waffo-node version`, then install `@waffo/waffo-node` |
| Java | Check Maven Central for `com.waffo:waffo-java`, then update the build file |
| Go | Run `go get github.com/waffo-com/waffo-go@latest` |
| Python | Check `pip index versions waffo` (or `https://pypi.org/pypi/waffo/json`), then install `waffo` (use `pip install --pre waffo` while it is a 0.x beta release) |

If dependency install requires network and fails because of sandboxing, request approval and retry instead of guessing a stale version.

If context is low, hand off with: `Step 7 requires a new session. Run 集成测试 or run integration tests to continue.`

## Step 6: Integration Verification

Read `references/integration-verification.md` for the full protocol. Verification MUST run through project endpoints, not direct SDK calls, and must complete every applicable acceptance item before release. Phasing is allowed; reporting is blocked until all phases complete and the report hard gate passes.

Phases:

| Phase | Coverage |
|-------|----------|
| A | Core order create, success, failure, create-error, webhook idempotency |
| B1 | Card pay-method coverage from `payMethodConfig().inquiry()` |
| B2 | Non-card coverage: e-wallet, VA/bank, OTC, special params, device-wallet manual/device tests |
| C1 | Refund success, inquiry, webhook |
| C2 | Subscription create, inquiry, renewal, cancel; notification tests for `SUBSCRIPTION_STATUS_NOTIFICATION`, `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION`, `PAYMENT_NOTIFICATION`; change/changeInquiry and `SUBSCRIPTION_CHANGE_NOTIFICATION` if upgrade/downgrade is integrated |
| D | Passive verification, skill compliance review, Waffo-team-facing report |

Before Phase A, output an Integration Test Plan Gate that maps the project's integrated Waffo features to required/optional tests. This gate is project-integration scoped, not an SDK release matrix. Fix the plan before execution if any required integrated-feature test is missing. If the developer or business owner gives a stricter coverage requirement, record `Coverage Basis: business-defined scope`; otherwise default to `Coverage Basis: minimum test set`.

The minimum pay-method set comes from active contracted methods returned by `payMethodConfig().inquiry()` and must include representatives for card, e-wallet/app-class, VA/bank, special params such as PIX/OVO, and device-wallet manual/device handling. This is a technical minimum coverage set, not an automatic business-acceptance verdict. List every contracted method in the final report.

`payMethodConfig().inquiry()` using the project's Sandbox credentials is mandatory before pay-method coverage and before a formal report can be generated. If active contracted methods cannot be retrieved, output `Verification Blocked Summary` instead of a formal report.

Checkpoint after each phase with a compact summary: tests run, PASS count, non-PASS items, order IDs created, and whether any dependent phase is blocked. Phase D may not start until all prior phases have final states.

## Failure Loop and Support Escalation

For every FAIL or PARTIAL item:

1. Classify as `FIXABLE_CODE`, `FIXABLE_INFRA`, `WAFFO_SUPPORT_REQUIRED`, `MANUAL_REQUIRED`, or `SKIP_WITH_REASON`.
2. Fix and re-run the failed test plus dependents, up to 3 attempts.
3. Do not record a failure without investigation.
4. If still unresolved after retries, prepare a Waffo support package and mark `WAFFO_SUPPORT_REQUIRED`.

Support package must include MID, environment, pay method, country/currency/amount, order/subscription/refund IDs, sanitized request payload, API error/inquiry status, page text or screenshot, timestamps, and retry/fix history.

在验证前或验证中遇到按症状排障的请求时，读取 `references/troubleshooting.md`。先按证据清单收集事实，再分类 blocker 或准备 Waffo support package。

## Report Requirements

The final report is for the Waffo technical team and should reflect integration completeness, not command history. If the user and AI primarily interacted in Chinese, write the report body in Chinese; otherwise use English. Keep API paths, event names, enum values, and code identifiers in English.

写客户可读中文或双语报告时，读取 `references/glossary.md` 并保持术语一致。API paths、SDK methods、field names、enum values、event names 保留原文。

Use the template in `references/acceptance-criteria.md`. Required report sections:

- Overview and Integration Configuration.
- Project Integration Surface: project endpoints, auth, webhook business logic, persistence.
- Webhook Delivery Evidence.
- Waffo APIs Exercised: actual SDK/API operations used.
- Active Test Results with split ID columns, including Request ID and Acquiring ID (A单).
- Subscription Event Coverage with separate rows for required subscription notifications.
- Parameter, Data Integrity, Integration Quality Radar, Pay Method Coverage, APP Terminal Assessment, Go-Live Readiness.
- Non-PASS Items with reason, evidence, IDs, and next step.
- Skill Compliance Review.
- Final outcome: `FULL`, `CONDITIONAL`, or `INCOMPLETE`.

Overview must include `Skill Version`, `Coverage Basis`, and `Report Eligibility`. If Waffo-side notification delivery evidence is unavailable, mark `Webhook Delivery Evidence` as `WAFFO_SIDE_UNVERIFIED` and explain that only project-side webhook handling was verified. Do not present that item as PASS.

Do not include `Commands Executed` in the main report. Keep command logs as internal run logs or CI artifacts. Include `Fixes Applied During Testing` only when it explains integration maturity; otherwise keep detailed fix attempts internal. Formal reports are only allowed after the report hard gate passes **and** the final outcome is `FULL` or `CONDITIONAL`. If the final outcome is `INCOMPLETE`, print `Verification Failed Summary` only and do not save `integration-report-{YYYYMMDD}.md`. If the report hard gate itself fails, print `Verification Blocked Summary` only and do not save the report.
