# Waffo API Contract Reference

Source: `openapi.json` (authoritative). All field names are camelCase JSON.

## Response Envelope

All responses: `{ code: string, msg: string, data: <DataSchema> }`

---

## 1. Order Module

### Order Create — `POST /api/v1/order/create`

**Request** (`AcqOrderCreateRequest`):
- `paymentRequestId`: string (required) — max 32, idempotent key
- `merchantOrderId`: string (required) — max 64
- `orderCurrency`: string (required) — max 12, e.g. "IDR"
- `orderAmount`: string (required) — max 24
- `userCurrency`: string — max 12, cross-currency only
- `orderDescription`: string (required) — max 128
- `orderRequestedAt`: string/date-time (required)
- `orderExpiredAt`: string/date-time
- `successRedirectUrl`: string — max 512
- `failedRedirectUrl`: string — max 512
- `cancelRedirectUrl`: string — max 512
- `notifyUrl`: string (required) — max 256
- `extendInfo`: string — max 128, JSON
- `merchantInfo`: MerchantInfo (required)
- `userInfo`: OrderUserInfo (required)
- `goodsInfo`: OrderGoodsInfo
- `paymentInfo`: OrderPaymentInfo (required)
- `cardInfo`: CardInfo
- `paymentTokenData`: string — max 8192, ApplePay/GooglePay
- `riskData`: OrderRiskData
- `addressInfo`: OrderAddressInfo

**Response** (`AcqOrderCreatedResponse`):
- `paymentRequestId`: string (required)
- `merchantOrderId`: string (required)
- `acquiringOrderId`: string (required)
- `orderStatus`: string (required) — "PAY_IN_PROGRESS" | "AUTHORIZATION_REQUIRED" | "AUTHED_WAITING_CAPTURE" | "PAY_SUCCESS" | "ORDER_CLOSE"
- `orderAction`: string — JSON with actionType, webUrl, deeplinkUrl, actionData

### Order Inquiry — `POST /api/v1/order/inquiry`

**Request** (`AcqOrderInquiryRequest`): provide one of:
- `paymentRequestId`: string
- `acquiringOrderId`: string

**Response** (`AcqOrderInquiry`):
- `paymentRequestId`: string (required)
- `merchantOrderId`: string (required)
- `acquiringOrderId`: string (required)
- `orderStatus`: string (required) — same enum as Create
- `orderAction`: string
- `orderCurrency`: string (required)
- `orderAmount`: string (required)
- `finalDealAmount`: string (required)
- `orderDescription`: string (required)
- `merchantInfo`: MerchantInfo
- `userInfo`: OrderUserInfo
- `goodsInfo`: OrderGoodsInfo
- `paymentInfo`: OrderPaymentInfo
- `addressInfo`: OrderAddressInfo
- `orderRequestedAt`: string
- `orderExpiredAt`: string
- `orderUpdatedAt`: string
- `orderCompletedAt`: string
- `refundExpiryAt`: string
- `cancelRedirectUrl`: string
- `orderFailedReason`: string — JSON
- `extendInfo`: string
- `userCurrency`: string
- `subscriptionInfo`: SubscriptionInfo

### Order Cancel — `POST /api/v1/order/cancel`

**Request** (`AcqOrderCancelRequest`): provide paymentRequestId or acquiringOrderId:
- `paymentRequestId`: string — max 32
- `acquiringOrderId`: string — max 32
- `merchantId`: string (required) — max 64
- `orderRequestedAt`: string/date-time (required)

**Response** (`AcqOrderCancelResponse`):
- `paymentRequestId`: string (required)
- `merchantOrderId`: string (required)
- `acquiringOrderId`: string (required)
- `orderStatus`: string (required) — "ORDER_CLOSE"

---

## 2. Refund Module

### Order Refund — `POST /api/v1/order/refund`

**Request** (`AcqOrderRefundRequest`):
- `refundRequestId`: string (required) — max 32, idempotent key
- `acquiringOrderId`: string (required) — max 32
- `merchantRefundOrderId`: string — max 64
- `merchantId`: string (required) — max 64
- `requestedAt`: string/date-time (required)
- `refundAmount`: string (required) — min 1 char
- `refundReason`: string (required) — max 256
- `refundNotifyUrl`: string — max 256
- `extendInfo`: string — max 128, JSON
- `refundSource`: string
- `userInfo`: RefundOrderUserInfo

**Response** (`AcqOrderRefundResponse`):
- `refundRequestId`: string (required)
- `merchantRefundOrderId`: string
- `acquiringOrderId`: string (required)
- `acquiringRefundOrderId`: string (required)
- `refundAmount`: string (required)
- `refundStatus`: string (required) — "REFUND_IN_PROGRESS" | "ORDER_PARTIALLY_REFUNDED" | "ORDER_FULLY_REFUNDED" | "ORDER_REFUND_FAILED"
- `remainingRefundAmount`: string (required)
- `refundSource`: string (required) — "MERCHANT" | "RDR" | "ETHOCA"

### Refund Inquiry — `POST /api/v1/refund/inquiry`

**Request** (`AcqOrderRefundInquiryRequest`): provide one of:
- `refundRequestId`: string
- `acquiringRefundOrderId`: string

**Response** (`AcqOrderRefundInquiry`):
- `refundRequestId`: string (required)
- `merchantRefundOrderId`: string
- `acquiringOrderId`: string (required)
- `acquiringRefundOrderId`: string (required)
- `origPaymentRequestId`: string (required)
- `refundAmount`: string (required)
- `refundStatus`: string (required) — same enum as Refund
- `refundReason`: string (required)
- `refundRequestedAt`: string (required)
- `refundUpdatedAt`: string (required)
- `refundFailedReason`: string — JSON
- `extendInfo`: string
- `userCurrency`: string
- `finalDealAmount`: string (required)
- `remainingRefundAmount`: string (required)
- `userInfo`: RefundOrderUserInfo
- `refundCompletedAt`: string
- `refundSource`: string — "MERCHANT" | "RDR" | "ETHOCA"

---

## 3. Subscription Module

> **IMPORTANT**: Subscription uses `currency`/`amount`; Order uses `orderCurrency`/`orderAmount`. Subscription uses `requestedAt`; Order uses `orderRequestedAt`.

### Subscription Create — `POST /api/v1/subscription/create`

**Request** (`AcqSubscriptionCreateRequest`):
- `subscriptionRequest`: string (required) — max 32, idempotent key
- `merchantSubscriptionId`: string (required) — max 64
- `currency`: string (required) — max 12
- `amount`: string (required) — max 24
- `userCurrency`: string — max 12
- `productInfo`: ProductInfo (required)
- `merchantInfo`: MerchantInfo (required)
- `userInfo`: UserInfo (required)
- `goodsInfo`: GoodsInfo
- `addressInfo`: AddressInfo
- `paymentInfo`: PaymentInfo (required — productName, payMethodName required)
- `requestedAt`: string/date-time (required)
- `successRedirectUrl`: string (required) — max 512
- `failedRedirectUrl`: string (required) — max 512
- `cancelRedirectUrl`: string (required) — max 512
- `notifyUrl`: string (required) — max 256
- `subscriptionManagementUrl`: string (required) — max 256
- `extendInfo`: string — max 256, JSON
- `orderExpiredAt`: string/date-time
- `riskData`: RiskData
- `acqAgreement`: MerchantAcqProductAgreementEntity

**Response** (`AcqSubscriptionCreateResponse`):
- `subscriptionRequest`: string
- `merchantSubscriptionId`: string
- `subscriptionId`: string
- `payMethodSubscriptionId`: string
- `subscriptionStatus`: string — "AUTHORIZATION_REQUIRED" | "IN_PROGRESS" | "ACTIVE" | "CLOSE" | "MERCHANT_CANCELLED" | "USER_CANCELLED" | "CHANNEL_CANCELLED" | "EXPIRED"
- `subscriptionAction`: string — JSON with webUrl

### Subscription Inquiry — `POST /api/v1/subscription/inquiry`

**Request** (`SubscriptionInquiryRequest`):
- `subscriptionRequest`: string — max 32
- `subscriptionId`: string — max 64
- `paymentDetails`: integer — 0 (default) or 1

**Response** (`SubscriptionInquiryResponse`):
- `subscriptionRequest`: string
- `merchantSubscriptionId`: string
- `subscriptionId`: string
- `payMethodSubscriptionId`: string
- `subscriptionStatus`: string — same enum as Create
- `subscriptionAction`: string
- `currency`: string
- `userCurrency`: string
- `amount`: string
- `productInfo`: ProductInfo
- `merchantInfo`: MerchantInfo
- `userInfo`: UserInfo
- `paymentInfo`: PaymentInfo
- `requestedAt`: string
- `updatedAt`: string
- `failedReason`: string — JSON
- `subscriptionManagementUrl`: string
- `extendInfo`: string
- `paymentDetails`: PaymentDetail[]
- `goodsInfo`: GoodsInfo
- `addressInfo`: AddressInfo

### Subscription Cancel — `POST /api/v1/subscription/cancel`

**Request** (`SubscriptionCancelRequest`):
- `subscriptionId`: string (required) — max 64
- `merchantId`: string (required) — max 64
- `requestedAt`: string/date-time (required)

**Response** (`SubscriptionCancelResponse`):
- `merchantSubscriptionId`: string
- `subscriptionRequest`: string
- `subscriptionId`: string
- `orderStatus`: string — "CLOSE" | "MERCHANT_CANCELLED" | "CHANNEL_CANCELLED" | "EXPIRED"

### Subscription Manage — `POST /api/v1/subscription/manage`

**Request** (`SubscriptionManageRequest`):
- `subscriptionId`: string — max 64
- `subscriptionRequest`: string — max 64

**Response** (`SubscriptionManageResponse`):
- `subscriptionRequest`: string
- `merchantSubscriptionId`: string
- `subscriptionId`: string
- `managementUrl`: string
- `expiredAt`: string — ISO 8601
- `subscriptionStatus`: string — same status enum

### Subscription Change — `POST /api/v1/subscription/change`

**Request** (`SubscriptionChangeRequest`):
- `subscriptionRequest`: string (required) — max 32, NEW subscription request id
- `merchantSubscriptionId`: string — max 64
- `originSubscriptionRequest`: string (required) — max 32
- `remainingAmount`: string (required) — max 24
- `currency`: string (required) — max 12
- `userCurrency`: string — max 12
- `requestedAt`: string/date-time (required)
- `successRedirectUrl`: string — max 256
- `failedRedirectUrl`: string — max 256
- `notifyUrl`: string (required) — max 256
- `cancelRedirectUrl`: string — max 512
- `subscriptionManagementUrl`: string — max 256
- `extendInfo`: string — max 256, JSON
- `orderExpiredAt`: string/date-time
- `productInfoList`: ChangeProductInfo[] (required) — minItems 1
- `merchantInfo`: ChangeMerchantInfo (required)
- `userInfo`: ChangeUserInfo (required)
- `goodsInfo`: ChangeGoodsInfo (required)
- `addressInfo`: ChangeAddressInfo
- `paymentInfo`: ChangePaymentInfo (required — productName required)
- `riskData`: ChangeRiskData

**Response** (`SubscriptionChangeResponse`):
- `originSubscriptionRequest`: string
- `subscriptionRequest`: string
- `merchantSubscriptionId`: string
- `subscriptionChangeStatus`: string — "IN_PROGRESS" | "AUTHORIZATION_REQUIRED" | "SUCCESS" | "CLOSED"
- `subscriptionAction`: string
- `subscriptionId`: string (required)

### Subscription Change Inquiry — `POST /api/v1/subscription/change/inquiry`

**Request** (`SubscriptionChangeInquiryRequest`):
- `originSubscriptionRequest`: string (required) — max 32
- `subscriptionRequest`: string (required) — max 32

**Response** (`SubscriptionChangeInquiryResponse`): mirrors change request fields plus status — see openapi.json for full field list.

---

## 4. Config Module

### Merchant Config Inquiry — `POST /api/v1/merchantconfig/inquiry`

**Request**: `merchantId`: string (required) — max 64

**Response** (`AcqMerchantConfigInquiryResponse`):
- `merchantId`: string (required)
- `totalDailyLimit`: string — JSON `{"currency":"value"}`
- `remainingDailyLimit`: string — JSON
- `transactionLimit`: string — JSON

### Pay Method Config Inquiry — `POST /api/v1/paymethodconfig/inquiry`

**Request**: `merchantId`: string (required) — max 64

**Response** (`PayMethodConfigInquiryResponse`):
- `merchantId`: string (required)
- `payMethodDetails`: PayMethodDetail[] (required)

---

## 5. Shared Schemas

### MerchantInfo
- `merchantId`: string (required) — max 64
- `subMerchantId`: string — max 64

### UserInfo (Subscription)
- `userId`: string (required) — max 64
- `userEmail`: string (required) — max 64
- `userPhone`: string — max 16
- `userFirstName`: string — max 64
- `userLastName`: string — max 64
- `userCreatedAt`: string — max 24

### OrderUserInfo (`AcqOrderMerchantUserInfo`)
- `userId`: string (required) — max 64
- `userEmail`: string (required) — max 64
- `userTerminal`: string (required) — "WEB" | "APP" | "IN_WALLET_APP" | "IN_MINI_PROGRAM", max 32
- `userPhone`: string — max 30
- `userCountryCode`: string — max 3
- `userFirstName`: string — max 64
- `userLastName`: string — max 64
- `userBrowserIp`: string — max 128, required for direct card
- `userAgent`: string — max 256, required for direct card
- `userCreatedAt`: string
- `userReceiptUrl`: string — read-only in inquiry

### ProductInfo (Subscription)
- `description`: string (required) — max 128
- `periodType`: string (required) — "DAILY" | "WEEKLY" | "MONTHLY", max 12
- `periodInterval`: string (required) — max 12
- `numberOfPeriod`: string — max 24
- `trialPeriodAmount`: string — max 24, must be > 0
- `numberOfTrialPeriod`: string — max 12
- `trialPeriodType`: string — "DAILY" | "WEEKLY" | "MONTHLY"
- `trialPeriodInterval`: string — max 12
- `startDateTime`: string — max 24 (inquiry response only)
- `endDateTime`: string — max 24 (inquiry response only)
- `nextPaymentDateTime`: string — max 24 (inquiry response only)
- `currentPeriod`: string — max 24 (inquiry response only)

### ChangeProductInfo (in productInfoList[])
Same as ProductInfo but adds:
- `amount`: string (required) — max 12

### PaymentInfo (Subscription)
- `productName`: string (required) — "SUBSCRIPTION" | "MINI_PROGRAM_SUBSCRIPTION", max 32
- `payMethodType`: string — "EWALLET" | "CREDITCARD" | "DEBITCARD", max 16
- `payMethodName`: string (required) — max 24
- `payMethodProperties`: string — max 256, JSON
- `payMethodResponse`: string — max 256, read-only
- `payMethodUserAccountType`: string — "EMAIL" | "PHONE_NO" | "ACCOUNT_ID", max 24
- `payMethodUserAccountNo`: string — max 64
- `payMethodPublicUid`: string — max 128
- `payMethodUserAccessToken`: string — max 128

### OrderPaymentInfo (`AcqOrderPaymentInfo`)
- `productName`: string (required) — "ONE_TIME_PAYMENT" | "DIRECT_PAYMENT", max 32
- `payMethodType`: string — "EWALLET" | "ONLINE_BANKING" | "DIGITAL_BANKING" | "OTC" | "CREDITCARD" | "DEBITCARD", max 256
- `payMethodName`: string — max 256
- `payMethodProperties`: string — max 1024, JSON
- `payMethodResponse`: string — read-only
- `userPaymentAccessToken`: string — max 256, for ONE_CLICK_PAYMENT
- `payMethodUserAccountNo`: string — max 64
- `payMethodUserAccountType`: string — max 24
- `payOption`: string — read-only: "BALANCE" | "DEBIT_CARD" | "CREDIT_CARD"
- `cashierLanguage`: string — max 24, IETF BCP 47
- `cashierAppearance`: string — JSON theme config
- `payMethodCountry`: string — max 3
- `captureMode`: string — max 24
- `merchantInitiatedMode`: string — "scheduled" | "unscheduled", max 24

### GoodsInfo (Subscription)
- `goodsId`: string
- `goodsName`: string
- `goodsCategory`: string
- `goodsUrl`: string
- `appName`: string
- `skuName`: string
- `goodsUniquePrice`: string
- `goodsQuantity`: integer

### OrderGoodsInfo (`AcqOrderGoodsInfo`)
- `goodsId`: string — max 128
- `goodsName`: string (required) — max 64
- `skuName`: string — max 32
- `goodsUniquePrice`: string — max 16
- `goodsQuantity`: integer
- `goodsCategory`: string — max 32
- `goodsUrl`: string (required) — max 128
- `appName`: string (required) — max 32

### AddressInfo
- `address`: string
- `city`: string
- `region`: string
- `postcode`: string
- `addressCountryCode`: string

### CardInfo (`AcqCardInfo`)
- `cardNumber`: string (required) — 14-24 chars
- `cardExpiryYear`: integer (required) — 4 digits, min 2024
- `cardExpiryMonth`: integer (required) — 1-12
- `cardCvv`: string (required) — 3-4 chars
- `cardHolderName`: string (required) — max 128
- `threeDsDecision`: string — "3DS_FORCE" | "3DS_ATTEMPT" | "NO_3DS"

### SubscriptionInfo (in Order Inquiry response)
- `subscriptionId`: string (required)
- `period`: string (required)
- `merchantRequest`: string (required)
- `subscriptionRequest`: string (required)

### PaymentDetail (in Subscription Inquiry response)
- `acquiringOrderId`: string
- `orderCurrency`: string
- `orderAmount`: string
- `orderStatus`: string — "PAY_SUCCESS" | "ORDER_CLOSE"
- `orderUpdatedAt`: string
- `period`: string

### PayMethodDetail (in PayMethod Config response)
- `productName`: string (required) — "ONE_TIME_PAYMENT" | "DIRECT_PAYMENT"
- `payMethodName`: string (required)
- `country`: string (required)
- `currentStatus`: string (required) — "1" (available) | "0" (unavailable)
- `fixedMaintenanceRules`: FixedMaintenanceRule[] (required)
- `fixedMaintenanceTimezone`: string (required)

### RefundOrderUserInfo
- `userType`: string (required) — "INDIVIDUAL" | "BUSINESS"
- `userFirstName`: string — max 64
- `userMiddleName`: string — max 64
- `userLastName`: string — max 64
- `nationality`: string — max 3
- `userEmail`: string — max 64
- `userPhone`: string — max 16
- `userBirthDay`: string — max 12
- `userIDType`: string — max 24
- `userIDNumber`: string — max 64
- `userIDIssueDate`: string — max 12, dd/mm/yyyy
- `userIDExpiryDate`: string — max 12, dd/mm/yyyy
- `userBankInfo`: RefundOrderUserBankInfo

### RefundOrderUserBankInfo
- `bankAccountNo`: string — max 64
- `bankCode`: string — max 64
- `bankName`: string — max 64
- `bankCity`: string — max 64
- `bankBranch`: string — max 64

### RiskData (Subscription — all required)
- `userType`: string — "Individual" | "Agent" | "Institution" | "Internal"
- `userCategory`: string — "Member" | "Non-Member"
- `userLegalName`: string — max 128
- `userDisplayName`: string — max 128
- `userRegistrationIp`: string — max 24
- `userLastSeenIp`: string — max 24
- `userIsNew`: string — "Yes" | "No"
- `userIsFirstPurchase`: string — "Yes" | "No"

### OrderRiskData (Order — all optional, same fields as RiskData)

---

## 6. Field Name Gotchas

| Concept | Order API field | Subscription API field |
|---------|----------------|----------------------|
| Currency | `orderCurrency` | `currency` |
| Amount | `orderAmount` | `amount` |
| Request time | `orderRequestedAt` | `requestedAt` |
| Request ID | `paymentRequestId` | `subscriptionRequest` |
| Waffo ID | `acquiringOrderId` | `subscriptionId` |
| Merchant ID field | nested in `merchantInfo` | nested in `merchantInfo` (or top-level `merchantId` for cancel) |
| Redirect URLs | optional | `successRedirectUrl`, `failedRedirectUrl`, `cancelRedirectUrl` all required for create |
| GoodsInfo required fields | `goodsName`, `goodsUrl`, `appName` | none (all optional) |
| UserInfo required fields | `userId`, `userEmail`, `userTerminal` | `userId`, `userEmail` |
| PaymentInfo productName | "ONE_TIME_PAYMENT" / "DIRECT_PAYMENT" | "SUBSCRIPTION" / "MINI_PROGRAM_SUBSCRIPTION" |

---

## 7. Status Handling Guide

### Order Statuses

| Status | Meaning | Recommended Action |
|--------|---------|-------------------|
| `PAY_IN_PROGRESS` | Payment processing | Wait for webhook or poll via `order().inquiry()` |
| `AUTHORIZATION_REQUIRED` | User must complete 3DS or redirect | Redirect user to `orderAction.webUrl` |
| `AUTHED_WAITING_CAPTURE` | Pre-auth completed, awaiting capture | Call `order().capture()` when ready to settle |
| `PAY_SUCCESS` | Payment completed | Fulfill the order |
| `ORDER_CLOSE` | Payment failed or expired | Show failure to user, allow retry with new `paymentRequestId` |

### Refund Statuses

| Status | Meaning | Recommended Action |
|--------|---------|-------------------|
| `REFUND_IN_PROGRESS` | Refund processing | Wait for `REFUND_NOTIFICATION` webhook |
| `ORDER_FULLY_REFUNDED` | Full refund completed | Update order state, notify user |
| `ORDER_PARTIALLY_REFUNDED` | Partial refund completed | Update refund balance, allow further refunds |
| `ORDER_REFUND_FAILED` | Refund rejected | Check `refundFailedReason`, may need manual intervention |

### Subscription Statuses

| Status | Meaning | Recommended Action |
|--------|---------|-------------------|
| `AUTHORIZATION_REQUIRED` | User must complete initial payment | Redirect to `subscriptionAction.webUrl` |
| `IN_PROGRESS` | Subscription being set up | Wait for webhook or poll via `subscription().inquiry()` |
| `ACTIVE` | Subscription active and billing | Enable entitlements; `manage()` API available |
| `CLOSE` | Creation failed or closed | Treat as terminal failure |
| `MERCHANT_CANCELLED` | Merchant initiated cancellation | Disable renewal, keep access until period end |
| `USER_CANCELLED` | User cancelled via management page | Disable renewal, keep access until period end |
| `CHANNEL_CANCELLED` | Payment channel cancelled (e.g. card expired) | Notify user, prompt to update payment method |
| `EXPIRED` | All billing periods completed | Remove entitlements |

### Subscription Change Statuses

| Status | Meaning | Recommended Action |
|--------|---------|-------------------|
| `IN_PROGRESS` | Change processing | Keep current plan active until confirmed |
| `AUTHORIZATION_REQUIRED` | User must authorize new payment | Redirect to `subscriptionAction.webUrl` |
| `SUCCESS` | Plan change completed | Activate new plan, deactivate old |
| `CLOSED` | Change failed | Keep original plan unchanged |

### Unknown Status / Timeout Handling

When an API call times out or returns a network error on a **write operation** (create, refund, cancel):

1. **Do NOT treat it as failure** — the operation may have succeeded server-side
2. **Do NOT retry with a new request ID** — this would create a duplicate operation
3. **Query the status** — use the corresponding inquiry API with the same request ID
4. **Trust the webhook** — if a webhook arrives before you query, it is the source of truth
