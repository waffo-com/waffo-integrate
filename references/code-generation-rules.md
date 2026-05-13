# Code Generation Rules

Loaded from `SKILL.md` during Step 5 before generating Waffo integration code. These rules are intentionally kept outside the main skill body so the entrypoint stays thin.

## Source of Truth

Use this priority order when resolving API fields, enums, and request/response shapes:

1. Local `references/api-contract.md`, extracted from `openapi.json`.
2. Live OpenAPI: `https://waffo.com/docs/api-reference/openapi.json` when online refresh is needed.
3. Developer documentation pages listed from `https://waffo.com/docs/llms.txt`.
4. `https://waffo.com/docs/llms-full.txt` for broad flow, Sandbox, and acceptance context.

Do not use `https://waffo.com/llms.txt` or marketing/product pages as API evidence. They are useful for product positioning, not integration contracts.

## Required Exception Handling

Generated code MUST cover these four branches and align with the host project's existing payment-provider patterns:

1. Channel rejection / system unavailable (`C0001`/`C0005`) returns a user-friendly retry-or-switch-method message.
2. Unknown status (`E0001` / `WaffoUnknownStatusError`) retries/inquires with the same idempotency key and never blindly closes the order.
3. Webhook signature verification failure is ignored for business effects, then recovered through inquiry if needed.
4. Idempotency conflict (`A0011`) is prevented by independently generated request IDs per payment/refund/subscription request.

## Generated Code Guardrails

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

8. **Request ID length**: `paymentRequestId`, `refundRequestId`, `subscriptionRequest` all have a **max length of 32 characters**. Do NOT use raw UUIDs (36 chars). Use UUID without dashes: `crypto.randomUUID().replace(/-/g, '')` (Node.js), `UUID.randomUUID().toString().replace("-", "")` (Java), `strings.ReplaceAll(uuid.New().String(), "-", "")` (Go), `uuid.uuid4().hex` (Python).

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

21. **Goods compliance fields**: `goodsName` must always be provided. Additionally, provide compliance/risk-control identity via `goodsUrl` or `appName`. If the merchant does not have an App, do **not** invent `appName`; provide `goodsUrl` instead. Default assumption: the merchant is **not** a premium/qualified merchant and cannot omit both `goodsUrl` and `appName`. Only mark an exemption when the user or Waffo explicitly confirms premium merchant exemption. `goodsUrl` must be a product detail page or official website URL, NOT an image URL. `appName` is only for App merchants and must be the app's listed name on App Store / Google Play, not an internal package ID or placeholder.

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

32. **Subscription PAYMENT_NOTIFICATION**: If subscription is integrated, register and test `PAYMENT_NOTIFICATION` for the first subscription payment or a renewal payment attempt. The one-time payment fulfillment branch must not process subscription billing; route by `paymentInfo.productName` and handle or record the subscription payment attempt separately.
