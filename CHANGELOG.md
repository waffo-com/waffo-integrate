# Changelog

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
