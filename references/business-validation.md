# Business Validation Guide

This file is loaded during **Step 7** (Integration Verification) only. It provides code review checklists, business questions, competitor reference guidance, and passive verification criteria.

---

## §1 Code Check List (Agent Auto-Infer, No Questions Needed)

Read the project's code and verify these items automatically:

| # | Check Item | How to Infer |
|---|-----------|-------------|
| 1 | Business operations after payment success | Read webhook handler's PAY_SUCCESS branch |
| 2 | Whether benefits are revoked after refund | Read REFUND_NOTIFICATION handler |
| 3 | Order association fields | Read DB model and webhook lookup logic |
| 4 | Amount unit and conversion logic | Read order creation endpoint's amount calculation code |
| 5 | Whether other payment channels exist | Search for existing payment handlers (Stripe/Creem/PayPal etc.) |
| 6 | Whether idempotency key is persisted before API request | Check insert and API call order |
| 7 | Whether original ID is used for query after network timeout | Check WaffoUnknownStatusError handling |
| 8 | Whether webhook response format is correct | SDK handles automatically; check custom implementations |
| 9 | Whether acquiringOrderID is stored | Check order create response handling |
| 10 | Whether local record is created after subscription create | Check subscription create handler |
| 11 | Whether refundRequestId is returned and persisted | Check refund handler return value |
| 12 | Whether all three redirect URLs are set | Check order/subscription create parameters |
| 13 | Whether App WebView restricts launching external apps/pages | Check if App integration exists |
| 14 | Whether iframe has referrer-policy and allow="payment" | Check if iframe integration exists |

---

## §2 Business Confirmation Questions (Read Code First, Ask Only If Unclear)

These questions should be answered by reading existing code, documentation, and competitor implementations first. Only ask the developer if the answer is not clear:

| # | Question | Why It Matters |
|---|---------|---------------|
| 1 | What is the source of truth for payment results? | MUST be webhook, NOT redirect. If code relies on redirect status, it's a bug. |
| 2 | How to handle benefits after subscription cancellation? | "Revoke immediately" vs "Revoke after current period ends" — affects cancel handler logic |
| 3 | Full refund or partial? How to calculate benefits after partial refund? | Partial refund benefit deduction logic is complex |
| 4 | How to handle WaffoUnknownStatusError? | Must NOT auto-close the order. Must query status to confirm. |
| 5 | How to handle subscription upgrade/downgrade price difference? | Pro-rata daily calculation vs take effect next period |

---

## §3 Competitor-First Reference

Before generating Waffo integration code, search the project for existing payment provider implementations (Stripe, Creem, PayPal, etc.) and analyze their patterns:

- **Amount calculation**: How amounts are converted, what precision is used
- **Webhook processing flow**: Idempotency check → lock → transaction pattern
- **Order status transitions**: What statuses exist, how they flow
- **Refund handling**: How refunds affect user benefits
- **Route organization and naming**: URL patterns, controller grouping

**Waffo integration MUST prioritize reusing existing patterns** to reduce integrator's cognitive load and avoid needing to ask many business questions.

---

## §4 Exception Handling Strategies + Passive Verification Checklist

### Four Unified Exception Handling Strategies

| Exception Type | Affected Cases | Handling Strategy | Verification Method |
|---------------|---------------|-------------------|-------------------|
| **Channel Rejection / System Unavailable** (C0001/C0005) | Payment 1.3, 1.5, 4.2, 5.5, 5.6; Subscription 1.5, 1.7, 5.6 | Show user-friendly message, guide retry or switch payment method. Reference existing competitor error handling in the system. | Passive: Review error handler code coverage |
| **Unknown Status** (E0001 / WaffoUnknownStatusError) | Payment 1.6, 4.5, 5.6; Subscription 1.8, 5.7 | Retry 3 times with same params → still fails → do NOT close order → show friendly message to switch payment method. Use Waffo inquiry result or webhook notification as source of truth. | Passive: Review WaffoUnknownStatusError handling logic |
| **Signature Verification Failed** | Payment 3.3, 7.3; Subscription 3.5, 4.4 | Do NOT process this notification, keep order status unchanged → query correct status via inquiry API. Payment/refund/subscription signature failure handling is unified. | Passive: Review webhook handler's signature failure branch |
| **Idempotency Conflict** (A0011) | Payment 1.4, 5.4; Subscription 1.6 | Do not actively construct test. Review code to check paymentRequestId/refundRequestId/subscriptionRequest generation logic (each must be independently generated, never reused). If A0011 appears during actual testing → that item fails. | Passive: Code review + observe during testing |

### Passive Verification Checklist — Payment (8 items)

| Case | Description | Code Review Check Point |
|------|-----------|----------------------|
| 1.3 | Channel rejection C0005 | Error handler returns user-friendly message for C0005 |
| 1.4 | Idempotency conflict A0011 | paymentRequestId is uniquely generated per request |
| 1.5 | System unavailable C0001 | Error handler returns user-friendly message for C0001 |
| 1.6 | Unknown Status E0001 | WaffoUnknownStatusError handler: retry → no close → inquiry |
| 3.3 | Webhook signature failure | Webhook handler rejects invalid signature, does not process |
| 4.2 | Cancel — channel rejection | Cancel error handler shows user-friendly message |
| 4.5 | Cancel — Unknown | Cancel WaffoUnknownStatusError handler: no close → inquiry |
| 5.4 | Refund idempotency conflict | refundRequestId is uniquely generated per request |
| 5.5 | Refund system unavailable | Refund error handler shows user-friendly message |
| 5.6 | Refund Unknown | Refund WaffoUnknownStatusError handler: no close → inquiry |
| 7.3 | Refund webhook signature failure | Webhook handler rejects invalid refund signature |

### Passive Verification Checklist — Subscription (7 items)

| Case | Description | Code Review Check Point |
|------|-----------|----------------------|
| 1.5 | Channel rejection | Subscription create error handler for C0005 |
| 1.6 | Idempotency conflict | subscriptionRequest is uniquely generated per request |
| 1.7 | System unavailable | Subscription create error handler for C0001 |
| 1.8 | Unknown Status | WaffoUnknownStatusError handler for subscription create |
| 3.5 | Subscription webhook signature failure | Webhook handler rejects invalid subscription signature |
| 4.4 | Payment notification signature failure | Webhook handler rejects invalid payment signature |
| 5.6 | Cancel system unavailable | Cancel error handler shows user-friendly message |
| 5.7 | Cancel Unknown | Cancel WaffoUnknownStatusError handler: no close → inquiry |

---

## §5 Integration Acceptance Report Template

After Step 7 completes, generate a formal acceptance report in **Markdown format**. See `references/acceptance-criteria.md` §4 for the full template.
