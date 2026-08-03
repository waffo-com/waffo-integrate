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

## Question Policy (applies to all steps)

Never assume an integration value and proceed silently. Separate two classes of unknowns:

- **Preference decisions the developer owns** — features, user terminal, checkout selection, subscription mode, currency mode, iframe/device-wallet handling, per-handler webhook business rules, redirect behavior, and every business-confirmation question in `references/business-validation.md` §2. **Ask the developer first.** If they cannot answer, verify against the project's existing code/config, present the concrete value you found, and get their confirmation before using it — reading code is evidence for a confirmation, not a substitute for it.
- **Facts that live in code** — e.g. the source of truth for payment results, whether `userTerminal` is actually passed, whether currency is actually hardcoded, and the audit items in `references/business-validation.md` §1 Code Check List. **Read the code first** and report the finding for confirmation; do not gate a bug-detection audit on a verbal answer that could be wrong.

Exempt from asking: which language/framework the repo uses (auto-detect; the framework generation target is still confirmed per Step 3) and the §1 Code Check List audit of already-written code.

## 可执行约束层

本 Skill 随安装包提供 `bin/waffo-verify.js`。Markdown 负责说明流程，validator 负责检查可以机械核对的集成事实。每次集成都必须完成两项动作：

1. 在商户项目生成并持续更新 `.waffo/integration-manifest.json`，schema 见 `docs/enforcement.md`。manifest 必须记录 feature、人工 decision、当前轮 evidence、phase、test、支付方式覆盖、质量检查、blocker、`MUST_FIX` 和 outcome。
2. 写完代码后以及输出任何报告前，在项目根目录运行 `node <skill-dir>/bin/waffo-verify.js .`。所有 `ERROR` 清零后才能继续；正式报告还必须运行 `node <skill-dir>/bin/waffo-verify.js . --gate report`。

Claude Code 可选配 `bin/waffo-claude-hook.js`：它在 Write/Edit 正式报告前机械运行 report gate，并从 transcript 认证人工回答原话。Cursor/Codex 没有同等 hook 时，主动运行 validator 是当前宿主的约束上限。完整配置见 `docs/enforcement.md`。

## 必需 Handler 清单

必须从选定 feature 重新推导 webhook handler/event；不得使用 AI 自己简化的 checklist，也不得原样信任外部传入的残缺 checklist：

| Feature selected | Required handlers | Required notification events (Step 6) |
|---|---|---|
| Order Payment | `onPayment` | `PAYMENT_NOTIFICATION` |
| Refund | `onRefund` | `REFUND_NOTIFICATION` |
| Subscription | `onSubscriptionStatus`, `onSubscriptionPeriodChanged`, subscription-aware `onPayment` | `SUBSCRIPTION_STATUS_NOTIFICATION`, `SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION`, `PAYMENT_NOTIFICATION` |
| Subscription Change (upgrade/downgrade) | `onSubscriptionChange` | `SUBSCRIPTION_CHANGE_NOTIFICATION` |

Step 4 展示代码前和 Step 6 报告前，都要把必需集合与项目中的实际 SDK 注册调用逐项核对。`waffo-verify` 会忽略 manifest 自报的 handler、移除注释和字符串，并按 `features` 独立扫描 Node/Java/Go/Python 注册调用；缺少任一 handler 都会阻断正式报告。

## 人工决策登记

影响资金或权益的 decision 由开发者决定，AI 不得代答。依赖该决策的代码开始前，每项都必须达到 `CONFIRMED_BY_HUMAN`，并在 `evidence.quote` 逐字记录开发者回答；从代码读到的候选答案只能标记为 `READ_FROM_CODE_PENDING_CONFIRMATION`。必答 ID 及 feature 映射以 `docs/enforcement.md` 为准，覆盖以下主题：

- Subscription mode (payment-first vs service-first) — explain both the billing-cycle/dunning axis and the benefit axis
- The five business-confirmation questions in `references/business-validation.md` §2 (payment source-of-truth, cancel-benefit timing, full/partial refund benefit, `WaffoUnknownStatusError` handling, upgrade/downgrade proration)
- Per-handler business logic (`onPayment` / `onRefund` / `onSubscription*` fulfillment and revoke rules)
- `userTerminal`, checkout ownership, currency mode, iframe/device-wallet handling, redirect behavior
- Go-Live Q1–Q8, compliance exemption (`goodsUrl` / `appName`), subscription retry config

**无人回答时执行 BLOCK-and-stub。** 开发者离线、睡觉或要求自主继续时，AI 仍然不能选择默认答案。此时按以下方式推进：

1. 继续完成不依赖该 decision 的 SDK wiring、`create`/`inquiry`/`cancel`、字段映射、32 字符 request ID、handler 注册和持久化。
2. 在受影响分支写入会明确失败的 `WAFFO_DECISION_REQUIRED` runtime stub，例如 `throw new Error('WAFFO_DECISION_REQUIRED: subscription mode unconfirmed')`。
3. 在 manifest 将该项记为 `UNRESOLVED`，并登记 OPEN blocker。
4. 将 outcome 设为 `INCOMPLETE`，只允许输出 Verification Blocked/Failed Summary。

Claude hook 会在当前 transcript 的真实 `user` 消息中查找每个 `CONFIRMED_BY_HUMAN` 的 `evidence.quote`。AI 自己写入确认状态、伪造回答或遗漏整个 decision 数组都会被阻断。没有 transcript hook 的宿主只能校验 evidence 结构，不能机械认证回答者身份。

## 报告保存准入

打印或保存 `integration-report-{YYYYMMDD}.md` 前必须执行 `node <skill-dir>/bin/waffo-verify.js . --gate report`。validator 必须确认：

- feature 非空，必需 handler 是实际 SDK 注册调用，必答 decision 完整且已由用户确认；
- A、B1、B2、C1、C2、D 全部终态，必需 test 完整；
- 每个 PASS/USED/CONDITIONAL 结果以及 tests/quality 中的 N/A 结果引用当前 `currentRunId` 的 evidence；每个 PASS/USED test 按 `docs/enforcement.md` 的映射记录真实 `identifiers`；
- `payMethodConfig().inquiry()` 成功，每个 active method 都有 coverage；
- Quality Radar 必需项完整，没有 `MUST_FIX`、OPEN blocker 或 live `WAFFO_DECISION_REQUIRED` stub；
- outcome 为 `FULL` 或 `CONDITIONAL`，且与测试和质量结果一致。

任一条件不满足时，只输出 Verification Blocked/Failed Summary，不打印正式报告正文，也不写报告文件。完整 schema 和 hook 配置见 `docs/enforcement.md`；报告格式见 `references/acceptance-criteria.md` §4。

## Reference Loading Map

| Need | Load |
|------|------|
| Executable enforcement: manifest schema, verify script, opt-in hook | `docs/enforcement.md` |
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

Webhook is mandatory for payment integrations. Do not ask whether to add webhook; derive the handler set from the canonical **必需 Handler 清单** (top of this file) — it is the single source of truth, and the required-vs-registered result must be recorded in `.waffo/integration-manifest.json`.

When both order payment and subscription are integrated, route `PAYMENT_NOTIFICATION` by `paymentInfo.productName`: the one-time payment branch must not fulfill subscription payments, but subscription billing attempts/retries must still be handled or recorded and tested.

Ask these context questions when relevant:

| Topic | Decision Needed |
|-------|-----------------|
| User terminal | `WEB` or `APP`; if APP, ask external browser vs in-app WebView. APP requires `userTerminal=APP` and makes contracted WeChat Pay / Apple Pay required device tests. |
| Checkout selection | Integrator checkout passes `payMethodType`/`payMethodName`; Waffo checkout omits them and lets Waffo show methods. |
| Subscription mode | Two axes — (1) billing cycle & dunning once retries are exhausted, (2) benefits during the retry window; payment-first and service-first differ on both. Explain both to the developer. Full comparison, date example, and retry-config note: `references/scenario-selection.md`. |
| Subscription refund | Generate subscription refund code only if needed. |
| Currency mode | Single-currency may be hardcoded; multi-currency must accept currency as input. |
| iframe checkout | Add iframe config if used; Apple Pay cannot be used inside iframe. |
| Checkout expiry | `orderExpiredAt` must be UTC+0 ISO 8601; default is 4 hours. |

当开发者询问应选择哪种产品/场景/checkout selection，或询问这些上下文问题为什么重要时，先读取 `references/scenario-selection.md`。先解释取舍、默认建议和测试影响，再收集实现参数。

## Step 3: Framework and Event Selection

Since webhook is auto-included, ask for the web framework when order payment or subscription is selected:

| Language | Recommended | Also Supported |
|----------|-------------|----------------|
| Node.js | Express | NestJS, Fastify |
| Java | Spring Boot | - |
| Go | Gin | Echo, Fiber, Chi |
| Python | FastAPI | Flask, Django |

For subscription event coverage, use the required events from the canonical **Required Handler Manifest** (top of this file); add `SUBSCRIPTION_CHANGE_NOTIFICATION` only when subscription upgrade/downgrade is integrated. Do not restate a different set here.

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
| 持久化 | 在适用场景持久化 `acquiringOrderId`、`refundRequestId`、`subscriptionRequest` 和 `subscriptionId` |
| Redirects | Success, failed, and cancel URLs set for checkout flows |
| Pay methods | `payMethodType`/`payMethodName` behavior matches checkout selection decision |

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
4. Emit or update `.waffo/integration-manifest.json`, then run `node <skill-dir>/bin/waffo-verify.js .` in the project root. Treat every `ERROR` as a blocker — fix the code (missing required handler, `UNRESOLVED` decision without a `WAFFO_DECISION_REQUIRED` stub, 36-char request ID, field contamination) and re-run until clean.
5. After build success and a clean checker run, immediately start integration verification in the same response. Do not stop at “build passed” unless credentials, server, tunnel, or auth are missing.

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

Read `references/integration-verification.md` for the full protocol. Verification MUST run through project endpoints, not direct SDK calls, and must complete every applicable acceptance item before release. Phasing is allowed; reporting is blocked until all phases complete and the report hard gate passes. Apply the Question Policy (top of this file) to every business-confirmation question: ask preference decisions, and audit facts-in-code rather than accepting a verbal answer.

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

Before Phase D writes any report, run `node <skill-dir>/bin/waffo-verify.js . --gate report`. A non-zero (exit 2) result blocks the report per the **Report Save Gate** — resolve the reported blockers, update `.waffo/integration-manifest.json`, and re-run until it passes.

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
