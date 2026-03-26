# Integration Acceptance Criteria

This file defines the **fixed acceptance criteria** for Waffo SDK integration verification.
The criteria define WHAT to verify; test implementation is dynamically generated based on each project's code.

---

## §1 Sandbox Test Cards

All test cards use: **Expiry: 12/2029, CVV: 123, Cardholder: TEST USER**

| Pay Method | Success Card | Failure Card |
|-----------|-------------|-------------|
| CC_VISA | 4576750000000110 | 4576750000000220 |
| CC_MASTER | 2226900000000110 | 2226900000000220 |
| CC_JCB | 3528000000000214 | 3528000000120006 |
| CC_AMEX | 3400000000000216 | 340000000200027 |
| DC_VISA | 4001700000000110 | 4001700000000220 |
| DC_MASTER | 2226930000000110 | 2226930000000220 |
| DC_JCB | 3088850000000116 | 3088850000200004 |
| DC_AMEX | 340034000100009 | 340034000400003 |

---

## §2 Playwright Checkout Protocol

When a test requires completing payment on the checkout page:

1. **Navigate**: `browser_navigate` to the checkout URL
2. **Wait**: `browser_wait_for` the payment form to load
3. **Snapshot**: `browser_snapshot` to identify form structure
4. **Select card type**: If there's a card type selector, click the appropriate card brand tab
5. **Fill card details** — use `pressSequentially` (slowly) for each field, NOT `fill()`, because the checkout page has custom input handlers that `fill()` may bypass:
   - Click field → type card number slowly (§1 test card matching the pay method)
   - Click expiry field → type `1229` slowly (auto-formats to `12/29`)
   - Click CVV field → type `123` slowly
   - Click cardholder name field → type `TEST USER` slowly
6. **Snapshot before submit**: Verify all fields show expected values. If any field is empty or shows validation errors, re-fill that field.
7. **Submit**: Click the Pay button
8. **Wait for result page**: `browser_wait_for` "Processing Payment..." text to disappear (do NOT wait for URL redirect — Waffo shows an intermediate result page)
9. **Verify result page**: `browser_snapshot` — the page shows either:
   - **Success**: heading "Payment Successful", amount, order ID, and a "Confirm" link with `href` = `successRedirectUrl`
   - **Failure**: heading "Payment Failed", error message, and a "Confirm" link with `href` = `failedRedirectUrl`
10. **Assert redirect URL**: Extract the "Confirm" link's `href` from the snapshot and assert it matches the expected redirect URL.
11. **Poll inquiry**: Call SDK inquiry API every 3s until terminal status or 120s timeout

**Important**: Waffo checkout does NOT auto-redirect after payment. It shows an intermediate result page with a "Confirm" link.

**If Playwright MCP is not available**: Output the checkout URL and test card info, ask developer to complete payment manually, then continue with API polling.

---

## §3 Acceptance Criteria

### Core — Order Payment + Webhook (all projects)

| ID | Criteria | How to verify |
|----|----------|---------------|
| AC-1 | **Order creation** | Call project's order creation endpoint (with valid auth) → response contains checkout URL. Verify a local order record was created in the project's database with pending status. |
| AC-2 | **Payment success** | Use checkout URL from AC-1 → Playwright fills success test card (§1) → wait for terminal status. Verify: (1) order status updated to success in project database, (2) business logic executed (e.g., balance increased, credits added), (3) redirect URL correct on result page. |
| AC-3 | **Payment failure** | Create new order via project endpoint → Playwright fills failure test card (§1) → wait for terminal status. Verify: (1) order status updated to failed in project database, (2) business logic NOT executed (e.g., balance unchanged), (3) redirect URL correct on result page. |
| AC-4 | **Order creation failure** | Call project's order creation endpoint with invalid params (e.g., amount below minimum, or missing required fields) → Verify project returns user-friendly error message and local order is marked as failed (not left in pending). |
| AC-5 | **Webhook idempotency** | After AC-2 completes, replay the same webhook notification to the project's webhook endpoint (use the same payload captured from AC-2 or reconstruct it). Verify business logic does NOT execute a second time (e.g., balance doesn't increase again). |
| AC-6 | **Multi-pay-method coverage** | Repeat AC-2 for each contracted card brand. Minimum: one credit card + one debit card if both contracted. Non-card methods (APPLEPAY, GOOGLEPAY) marked as SKIP with reason. |

### Refund (if project integrates refund)

| ID | Criteria | How to verify |
|----|----------|---------------|
| AC-7 | **Refund success** | Call project's refund endpoint on a paid order from AC-2 → refund succeeds. Verify order/refund status updated in project database. |
| AC-8 | **Refund inquiry** | Call project's refund query endpoint → returns correct refund status matching AC-7 result. |
| AC-9 | **Refund webhook** | After AC-7, verify refund notification was received by project's webhook endpoint and project updated status accordingly. |

### Subscription — basic (if project integrates subscription)

| ID | Criteria | How to verify |
|----|----------|---------------|
| AC-10 | **Subscription creation + activation** | Call project's subscription creation endpoint → Playwright pays → activation webhook arrives → project handles activation (e.g., starts subscription record). |
| AC-11 | **Subscription inquiry** | Call project's subscription query endpoint → returns correct subscription status (ACTIVE after AC-10). |
| AC-12 | **Renewal webhook** | Trigger next period billing via Sandbox management page (Playwright clicks "Next period payment success") → period notification arrives → project processes renewal. |
| AC-13 | **Subscription cancel** | Call project's cancel endpoint → subscription cancelled. Verify status updated in project database. |

### Subscription — change (if project integrates subscription change)

| ID | Criteria | How to verify |
|----|----------|---------------|
| AC-14 | **Subscription change** | Call project's subscription change endpoint → change succeeds. Verify status updated. |
| AC-15 | **Change inquiry** | Call project's change query endpoint → returns correct change status. |

### Execution Dependencies

```
AC-1 → AC-2 → AC-5 (idempotency uses AC-2's webhook)
AC-1 → AC-3
AC-4 (independent)
AC-2 → AC-6 (repeat with different cards)
AC-2 → AC-7 → AC-8, AC-9
AC-10 → AC-11, AC-12, AC-13
AC-14 → AC-15
```

---

## §4 Report Template

```
╔═══════════════════════════════════════════════════════════════╗
║              Integration Verification Report                  ║
║  Project: {project name}                                      ║
║  Date: {date}                                                 ║
║  Features: {Order Payment, Webhook, Refund, Subscription...}  ║
║  Pay Methods Contracted: {full list}                          ║
║  Pay Methods Tested: {tested list}                            ║
╠═══════╦═══════════════════════════════╦════════╦══════════════╣
║ ID    ║ Criteria                      ║ Result ║ Details      ║
╠═══════╬═══════════════════════════════╬════════╬══════════════╣
║ AC-1  ║ Order creation                ║ PASS   ║ checkout URL ║
║ AC-2  ║ Payment success (CC_VISA)     ║ PASS   ║ balance +100 ║
║ AC-3  ║ Payment failure (CC_VISA)     ║ PASS   ║ balance unch ║
║ AC-4  ║ Order creation failure        ║ PASS   ║ error msg ok ║
║ AC-5  ║ Webhook idempotency           ║ PASS   ║ no double    ║
║ AC-6  ║ Multi-pay-method              ║ PARTIAL║ see below    ║
║ ...   ║ ...                           ║ ...    ║ ...          ║
╠═══════╩═══════════════════════════════╩════════╩══════════════╣
║ Checklist:                                                    ║
║   C1 All applicable ACs tested  : PASS                        ║
║   C2 Pay method coverage         : PARTIAL — APPLEPAY skipped ║
║   C3 Business logic verified     : PASS                       ║
║   C4 Redirect URLs verified      : PASS                       ║
╠═══════════════════════════════════════════════════════════════╣
║ Verdict: CONDITIONAL                                          ║
╠═══════════════════════════════════════════════════════════════╣
║ Pay Method Coverage:                                          ║
║   CC_VISA      TESTED (AC-2)                                  ║
║   DC_VISA      TESTED (AC-6)                                  ║
║   APPLEPAY     SKIP — no Sandbox test card                    ║
║   GOOGLEPAY    SKIP — no Sandbox test card                    ║
║ Remediation:                                                  ║
║   C2 — Non-card methods cannot be automated in Sandbox        ║
╚═══════════════════════════════════════════════════════════════╝
```

**Verdict rules:**
- **FULL**: All C1-C4 are PASS → integration fully verified
- **CONDITIONAL**: Any PARTIAL → report lists what remains
- **INCOMPLETE**: Any FAIL → must fix before go-live
