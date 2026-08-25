# Changelog

## [Unreleased]

### Added

- **Report renderer** (`waffo-verify . --emit report`) — the acceptance report is now a deterministic projection of an already-validated `.waffo/integration-manifest.json` instead of a hand-typed re-rendering of the same data. Fixed labels, column sets, status vocabulary, the `Parameter Check`/`Data Integrity Check` item lists and the contracted-method list live in `bin/waffo-verify.js`; the manifest supplies evidence text only. Rendering is gated exactly like saving is — a blocked gate produces no stdout at all, since rendered text is a copy-paste source. `Skill Compliance Review` is now computed from what the gate proved rather than self-declared.
- **`schemaVersion` 2** — carries what rendering needs: a `report` block (project/date/SDK version/environment/MID/coverage basis, integration configuration, project surface, webhook delivery, APIs exercised, parameter and data-integrity details, APP terminal, Go-Live answers, `notes`, fixes, remediation), `tests[].details`, `payMethodCoverage[].country`/`.type`, and the four text fields on `qualityFindings[]`. Validated at the report gate rather than in the advisory scan, so a mid-integration `waffo-verify .` stays usable. **`schemaVersion` 1 keeps its existing gate-only behaviour** — in-flight integrations are never blocked by a renderer they have not migrated to.
- **Hook byte-compare gate** — for `schemaVersion` 2 projects the Claude hook compares the written report against `--emit report` byte for byte, reports the first differing line on mismatch, refuses `Edit` of a rendered report outright, and rejects a file name whose date contradicts `report.date`.
- **`report.notes`** — a first-class home for verification topology, stubbed upstreams and environment caveats, rendered as a quote block under Overview. Previously this content had nowhere to go and was appended ad hoc.
- Evals 31–35: reproduce the conditions that produced each observed drift — being asked to compose the report by hand, to write an invented `PASS*` status, to drop the `Non-PASS Items` identifier columns, to merge pay methods into shared rows, and to soften a mechanical compliance criterion into a self-declaration.

### Changed

- **`skillVersion` is verified, not self-declared.** The validator reads its own `package.json` (`bin/` lives inside the skill package, so this is necessarily the running release) and compares strictly with `manifest.skillVersion`; a mismatch is an ERROR and therefore blocks the report gate. The gate pass message and the scan header now name the running version so integrators know what to fill in. Previously the field was only checked for non-emptiness, which made the `Skill Version` row in every report unverifiable.
- `SKILL.md`, `references/acceptance-criteria.md`, `docs/enforcement.md` and `README.md` state the rendering contract explicitly: on `schemaVersion` 2 the report is emitted, not written; dropping columns, inventing status words, merging pay-method rows and trimming the fixed checklists are all rejected. The manifest example is upgraded to `schemaVersion` 2.

### Fixed

- Closed the gap between "the gate validated the data" and "the delivered report reflects it". An audit of a real merchant report found eight drifts in the hand-typed Markdown, three of which the manifest layer already prevented: an invented `PASS*` status (rejected by the `tests[].status` whitelist), a `Non-PASS Items` table stripped of all four identifier columns (required per `TEST_IDENTIFIER_REQUIREMENTS`), and 50 contracted methods merged into 39 rows with one method name disappearing entirely (`payMethodCoverage` requires a row per active method). Six of the eight are now structurally impossible; extra test rows beyond the required set remain allowed, since covering more official cases is not drift.

## [1.5.1] - 2026-08-04

### Fixed

- **Order-create templates now consistently send `goodsInfo` and all three redirect URLs** (Node/Java/Go/Python). Service and Sandbox test templates are both covered by deterministic checks for every create call, preventing `failedRedirectUrl`/`cancelRedirectUrl` or risk-control identity fields from silently disappearing (Rules 19/21 and verification check C6).
- **Java subscription template now compiles against `waffo-java` 3.0.0.** Removed the non-existent `ProductInfo.productId(...)`/`.productName(...)` builder calls — the subscription `ProductInfo` type has neither (verified via `javap`); the description now flows to `productInfo.description`. Fixed `cancelSubscription` to use the real `CancelSubscriptionParams.subscriptionId(...)` (the SDK cancel builder has no `subscriptionRequest`). Added the missing checked-exception handling: every write call (`order().create/cancel/refund`, `subscription().create/cancel`) now wraps `WaffoUnknownStatusException` with same-id inquiry recovery (services) or declares `throws` (tests). The full `java.md` now compiles clean — 7 files, main + test.
- **Node/Go/Python subscription-create** now send the schema-required `subscriptionManagementUrl` plus `failedRedirectUrl`/`cancelRedirectUrl`, drop the non-contract top-level `orderDescription` (Node/Python), and route the description to `productInfo.description` instead of mis-using `productName`.
- **`cancelSubscription` now keys by `subscriptionId` in all languages.** Every typed SDK (`waffo-node`/`waffo-go`/`waffo-java`) requires `subscriptionId` for cancel — the Node/Python/Java templates were passing `subscriptionRequest` (Go was already correct). Surfaced by the new Node `tsc` pass in the compile harness.
- **Subscription-cancel recovery now validates inquiry responses before reading data.** Java and Python no longer treat a failed reconciliation inquiry as success; Python also normalizes normal and recovered outcomes to the stable service-layer key `subscriptionStatus`.
- **Test templates** no longer emit `test@example.com` / `test-user@example.com` (Rule 22) or the invalid `productName: 'Test'` value, and now include the schema-required `userTerminal` plus a minimal `goodsInfo` (aligns with verification check C6).
- **Stale `userTerminal` enum comments** (`WEB | APP | WAP | SYSTEM`) corrected to `WEB | APP` in Node/Go — `WAP`/`SYSTEM` were removed back in v1.2.0.
- **`api-contract.md` drift vs live OpenAPI**: subscription redirect URLs and `paymentInfo.payMethodName` re-annotated as schema-optional (with the practical `A0003`/Rule-19 requirements called out); order/subscription `goodsInfo` marked schema-optional/business-required, and subscription `goodsInfo` correctly noted as requiring `goodsId`+`goodsName` when present.
- **Step-numbering drift** (`Step 7` → `Step 6`, `Step 5` → `Step 4`, `Step 3 Q5` → the Step 2 currency-mode question, Pay Method Discovery re-pointed to `integration-verification.md`) across SKILL.md/README/references now matches the canonical 6-step Flow; `Rule 22` gains a Sandbox-vs-production caveat.

### Added

- Evals 28–30: regression guards for order-create `goodsInfo`+three-redirects, the Java subscription compiling against the SDK (no phantom `ProductInfo` fields, checked-exception handled), and subscription-create rejecting the non-contract `orderDescription`.
- **Template compile harness** (`tests/compile-templates.mjs` + `tests/harness/*`) — extracts each language's `references/*.md` code blocks and compiles them against pinned Waffo SDKs (Java `javac`, Node `tsc`, Go `go build`, Python `py_compile` + `mypy` against `waffo==0.4.0b0`), plus deterministic contract assertions. Node now compiles the Sandbox test template as well as `src`, including its `vitest` types. Wired into `npm test` (`test:unit` / `test:templates` split) and a CI workflow (`.github/workflows/ci.yml`) that runs all four in `--strict` mode. This mechanically catches template↔SDK drift (phantom fields, wrong methods, unhandled checked exceptions, missing required fields) — the class of defect that previously shipped undetected because nothing compiled the templates.

## [1.5.0] - 2026-08-03

### Added

- **Executable enforcement layer** (`bin/waffo-verify.js`) — a shipped checker (not just prose) that runs against the merchant project and exits non-zero on violations. It owns the canonical Feature→Required-Handler map and re-derives the required set itself (it does not trust the agent's checklist), greps the project for each handler registration, flags raw 36-char request IDs and order/subscription currency-key contamination, and enforces a report save-gate. Zero runtime dependencies.
- **`docs/enforcement.md`** — the enforcement contract: `.waffo/integration-manifest.json` schema, T2 (agent runs the checker) usage, and an opt-in T3 Claude Code hook (`--gate report`, exit 2) that mechanically blocks writing an acceptance report until the gate passes. Documents the cross-platform ceiling (Cursor/Codex have no blocking hook) and what each tier can and cannot catch.
- **`SKILL.md` hard gates**: Required Handler Manifest (single canonical feature→handler source of truth), Human-Decision Gate Register with an explicit **BLOCK-and-stub** unattended terminal behavior (unconfirmed money-affecting decisions emit a runtime-failing `WAFFO_DECISION_REQUIRED` stub, never a silent default — while the decision-independent scaffolding is still generated and only the gated branch is stubbed, not the whole task), and a Report Save Gate. Steps 2/3/5/6 now defer to these instead of restating scattered sets.
- Evals 20–27: adversarial scenarios that reproduce the real failure *conditions* — unattended silent-default of subscription mode, a handed-in checklist that omits `onSubscriptionPeriodChanged`, soft pressure to emit a report on an incomplete run, unattended fabrication of handler business logic and device-wallet PASS, unknown-status retry pressure, and the Node request-ID / currency-contamination gaps.

### Fixed

- **`references/node.md` shipped code that violated its own rule**: the refund, subscription, and test templates generated request IDs with raw `uuidv4()` (36 chars) despite the file's own 32-char limit (the order-create path was already correct). All now use the 32-char dash-stripped `genRequestId()` pattern.
- 修复 report gate 的 fail-open：空 feature/decision/phase、`INCOMPLETE` outcome、缺少当前轮证据、支付方式覆盖、OPEN blocker 和 `MUST_FIX` 现在都会阻断正式报告。
- handler 扫描改为识别移除注释和字符串后的实际 SDK 注册调用，并覆盖 Node、Java、Go、Python 命名；注释伪造不再通过，合法 Go handler 不再误报。
- Claude Code hook 改为从 stdin 读取官方 hook JSON，覆盖 `Write|Edit`，并使用 `transcript_path` 核对人工 decision quote 是否真实来自用户消息。
- request ID 检查新增 `randomUUID()`、`UUID.randomUUID()`、`uuid.uuid4()` 和 Go UUID 的原始 36 字符写法。
- 修复 validator 的注释 tokenizer 按语言区分：`#` 只在 Python/Ruby/PHP 视为注释，不再误伤 JS/TS 私有字段（`this.#x`）而漏报同一行的 handler 注册；`//`、`/* */` 不再在 Python/Ruby 中被误当注释；Ruby/PHP 反引号命令字符串也不会伪造 handler 注册。
- report gate 的必需 test ID 对齐 `references/acceptance-criteria.md` §3 词汇（`order-create`、`order-create-error`、`subscription-renewal` 等），取代之前未文档化且与 skill 其余部分冲突的 `payment-create`/`payment-inquiry`/`payment-webhook`；完整清单和示例列入 `docs/enforcement.md`，pay-method 覆盖仍由 `payMethodInquiry`/`payMethodCoverage` 单独校验。
- report gate 要求每个 `PASS`/`USED` test 按场景提交具体业务 `identifiers`；例如 `subscription-event-period-changed` 必须包含 `subscriptionRequest` 和 `subscriptionId`，仅有 `acquiringOrderId` 不能通过。支付方式覆盖的成功结果必须包含 `paymentRequestId` 和 `acquiringOrderId`，占位值会被拒绝。
- `tests/waffo-verify.test.js` 增补回归：JS 私有字段、Python/Ruby/PHP tokenizer、test-ID 词汇、业务 ID、全 feature 报告和支付方式证据校验（共 24 项）。

### Changed

- `code-generation-rules.md` Guardrail 6 and `business-validation.md` §2 now reference the Human-Decision Gate Register and use the runtime-failing `WAFFO_DECISION_REQUIRED` marker instead of a passive `// ACTION REQUIRED` comment.
- `bin/install.js` now also installs `bin/waffo-verify.js` and `bin/waffo-claude-hook.js` alongside the Markdown instructions.
- 新增 `tests/waffo-verify.test.js`，用可执行 fixture 覆盖 report fail-open、注释伪造 handler、Go handler、人工决策、UUID 和 hook transcript 认证。

## [1.4.4] - 2026-07-17

### Added

- **Question Policy** (`SKILL.md`, top-level, applies to all steps): never assume an integration value — ask the developer for preference decisions first; for facts that live in code, audit the code and confirm the finding; confirm any inferred value before using it. Language/framework detection and the `business-validation.md` §1 code-audit checklist stay exempt.
- Subscription-mode guidance now describes **both axes** — billing cycle & dunning (payment-first resets the billing anchor to the actual payment date and stops charging once retries are exhausted; service-first keeps the original anchor and keeps charging) and benefits during the retry window — with a worked date example (`references/scenario-selection.md`).
- "Subscription retry policy" row in the acceptance report template; documented that renewal retry count/interval is a Waffo-side subscription contract config (default 2 attempts including the first, once per day), not integration code.
- Evals 17–19 covering ask-first (no silent default of subscription mode), the two-axis payment-first/service-first definition, and retry-is-contract-config.

### Changed

- Reconciled `business-validation.md` §2 with §3: prefer proposing an answer from an existing payment-provider integration and confirming it, cold-asking only as a last resort.
- Standardized on the term "checkout selection" across `SKILL.md`, references, and docs (previously "checkout mode" / "checkout ownership").
- Included `CHANGELOG.md` in the published npm package; added `.idea/` and the local integration-test sandbox to `.gitignore`.

## [1.4.3] - 2026-07-03

### Added

- Added customer-facing skill knowledge references: `references/glossary.md`, `references/scenario-selection.md`, and `references/troubleshooting.md`.
- Added online documentation source priority guidance, including when to use Waffo Product Overview, `llms.txt`, OpenAPI, and `llms-full.txt`.
- Expanded eval coverage to 16 scenarios and 61 assertions.

### Changed

- Updated Step 7 reporting language around Integration Quality Radar, acceptance evidence, report hard gates, and customer-readable non-PASS handling.
- Updated README and docs index to surface the new knowledge-base references.
- Upgraded the publish workflow to Node.js 24.

### Fixed

- Fixed the publish workflow internal-link check so Markdown links with `#anchor` fragments are handled correctly.

## [1.4.2] - 2026-06-04

### Changed

- Prepared the package for Node.js 24 publish workflow compatibility.

## [1.4.1] - 2026-06-03

### Fixed

- Added npm publish diagnostics to make failed release runs easier to triage.
- Improved installer and verification details carried forward from the 1.4.0 release line.

## [1.4.0] - 2026-05-13

### Added

- **Python language support** — full template `references/python.md` (~600 lines) covering SDK init, order create/inquiry/cancel/capture, refund + refund inquiry, subscription create/inquiry/cancel/manage/change/change_inquiry, and webhook handlers for FastAPI, Flask, and Django
- **PyPI package install** — Step 5 SDK installation table now includes `waffo` (use `pip install --pre waffo` while it is 0.x beta)
- **Python project detection** — Step 1 detects `pyproject.toml`, `requirements.txt`, `Pipfile`, `uv.lock`, or `setup.py`
- **Framework matrix** — Python row: FastAPI (recommended), Flask, Django
- **Python rebuild block** — `integration-verification.md` adds uvicorn / flask / Django runserver rebuild commands
- **Rule 8 (Request ID length)** — `uuid.uuid4().hex` added as the Python 32-char idiom
- **Eval #8** — Python FastAPI payment + refund + webhook scenario with 7 assertions covering PyPI package, 32-char `uuid.uuid4().hex` request IDs, camelCase payload keys vs snake_case method names, `WaffoUnknownStatusError` recovery, FastAPI raw-body webhook reading, and `Content-Type: application/json` + `X-SIGNATURE` response headers
- **Python pitfalls section** — 10 Python-specific traps (payload keys stay camelCase, `uuid4().hex` not `str(uuid4())`, raw webhook body across frameworks, Content-Type default, thread-safe singleton across Gunicorn workers, etc.)

## [1.3.1] - 2026-05-10

### Fixed

- Strengthened non-card Sandbox failure loops so methods stuck in `AUTHORIZATION_REQUIRED` must inspect checkout inputs, checkboxes, localized buttons, and simulator controls before being reported as non-PASS.
- Added OVO checkout guidance for required phone input, `Bayar`, and `Payment succeeded` Sandbox simulation.
- Tightened refund webhook verification to prefer paid e-wallet sources, continue across e-wallet alternatives when refund rules reject a method, and avoid falling back to card refunds while an e-wallet source is available.

## [1.3.0] - 2026-04-24

### Added

- **APP Terminal Assessment** (Q6-Q8) — detect whether merchant has mobile APP, how it loads checkout (WebView / external browser), and whether `userTerminal=APP` is passed correctly
- **APP-mandatory payment methods** — if merchant has APP, WeChat Pay and Apple Pay become REQUIRED test items (not MANUAL/SKIP)
- **QR code testing protocol** — generate QR code from checkout URL via `qrencode` for real device testing (Apple Pay, Google Pay, WeChat Pay)
- **Subscription notification event descriptions** — detailed trigger scenarios for SUBSCRIPTION_STATUS_NOTIFICATION, SUBSCRIPTION_PERIOD_CHANGED_NOTIFICATION, and PAYMENT_NOTIFICATION
- **Selection guide** — PERIOD_CHANGED vs PAYMENT_NOTIFICATION decision matrix
- **Integration Configuration section** in report template — records userTerminal, checkout mode, currency mode, subscription mode, selected notification events
- **Subscription Event Coverage section** in report template — maps each event type to test cases with PASS/FAIL status
- **Order ID traceability** — Active Test Results and Pay Method Coverage tables now include Order ID column
- **Standardized skip reason vocabulary** — redundant, not checkout-available, sandbox limitation, requires real device
- **Eval #7** — subscription event selection guidance (3 critical assertions)

### Changed

- **APP Terminal Notes** replaced with comprehensive **APP Terminal Assessment** section (always present, not conditional)
- **Step 3 Q1** expanded with APP follow-up questions (WebView vs external browser) and code generation implications
- **Context Discovery** expanded to item 9 (integration configuration) + Q6-Q8 (APP terminal)

## [1.2.1] - 2026-04-02

### Added

- Auto-create GitHub Release on tag push (CI workflow)
- CHANGELOG.md
- Updated README.md for v1.2.0 features

## [1.2.0] - 2026-04-02

### Added

- **Step 7: Integration Verification** — phased test execution protocol (A → B1 → B2 → C1 → C2 → D)
  - Phase A: core payment tests (order-create, payment-success/failure, webhook-idempotency)
  - Phase B1/B2: pay method coverage split into card and non-card
  - Phase C1: refund tests
  - Phase C2: subscription lifecycle tests
  - Phase D: passive verification (21 items) + Markdown report generation
- **Pay method API discovery** — `payMethodConfig().inquiry()` as source of truth for contracted methods
- **Pay method simplification rules** — minimum test set selection (per-country-per-type, app-class, special-params, card, VA)
- **payMethodType cross-check** (K029) — detect mismatch between contracted and checkout-available methods
- **Go-Live Questionnaire** (Q1-Q5) — HTTP timeout, DNS TTL, server region, WeChat Pay domain, Apple Pay + iframe
- **Active checklist C1-C8** — test execution, pay method coverage, business logic, redirect URLs, Content-Type, parameter quality, data persistence, orderExpiredAt
- **Passive verification** — 11 payment + 8 subscription + 2 data safety checks with Loop Mode fix for MISSING/PARTIAL items
- **Sandbox knowledge base** — K024 (refund via e-wallet), K018 (subscription renewal), K026 (checkout selectors), K023 (webhook Content-Type), K027/K028 (rate limiting), K029 (payMethodType), K030 (management page DOM)
- **Subscription Batch Mode** — separate Playwright script for multi-step subscription checkout flow
- **Webhook auto-derive** — webhook is mandatory, not a separate feature question
- **Rule 6 expansion** — per-handler business logic guidance for all 5 notification handlers + ACTION REQUIRED fallback
- **Rule 30** — currency parameterization (single vs multi-currency)
- **Rule 31** — refund currency must match original order currency
- **Content-Type header** — added to all webhook response templates (Go/Node/Java)
- **Markdown report template** — replaced ASCII box-drawing format
- **Business validation layer** — code review checklist, business questions, competitor reference
- **6 eval scenarios** with 26 assertions (all passing)

### Changed

- **Progressive disclosure** — extracted Step 7 to `references/integration-verification.md` (SKILL.md: 783 → 381 lines)
- **userTerminal** — removed WAP and SYSTEM options, only WEB and APP
- **Phase C split** — Refund (C1) and Subscription (C2) as independent phases
- **Phase B split** — Card (B1) and Non-card (B2) as independent phases

### Fixed

- Pay button selector strict mode conflict (Google Pay / Apple Pay buttons)
- Payment failure "Processing" intermediate state timeout
- K023 misleading claim that SDK auto-handles Content-Type
- Removed Google Pay from Go-Live questionnaire (Waffo checkout handles it)
- Report output changed from `.txt` to `.md`

## [1.1.0] - 2026-03-16

### Added

- Subscription integration guide (create, inquiry, cancel, manage, change)
- Subscription webhook events (status, period changed, change)
- 5 new Important Notes (10-14) for subscription pitfalls

### Changed

- Bumped version to 1.1.0

## [1.0.0] - 2026-03-13

### Added

- Initial release
- 8-step interactive integration wizard
- Node.js, Java, Go language support
- 9 Important Notes for API contract rules
- npm installer with Claude Code / Cursor auto-detection
