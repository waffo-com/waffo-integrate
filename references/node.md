# Node.js Integration Templates

## Package

```
@waffo/waffo-node
```

## SDK Initialization

```typescript
// src/config/waffo.ts
import { Waffo, Environment } from '@waffo/waffo-node';

let waffoInstance: Waffo | null = null;

export function getWaffo(): Waffo {
  if (!waffoInstance) {
    waffoInstance = new Waffo({
      apiKey: process.env.WAFFO_API_KEY!,
      privateKey: process.env.WAFFO_PRIVATE_KEY!,
      waffoPublicKey: process.env.WAFFO_PUBLIC_KEY!,
      environment: process.env.NODE_ENV === 'production'
        ? Environment.PRODUCTION
        : Environment.SANDBOX,
      merchantId: process.env.WAFFO_MERCHANT_ID!,
    });
  }
  return waffoInstance;
}
```

Alternatively, use the built-in env loader:

```typescript
import { Waffo } from '@waffo/waffo-node';
const waffo = Waffo.fromEnv();
```

Environment variables for `fromEnv()`:
- `WAFFO_API_KEY`
- `WAFFO_PRIVATE_KEY`
- `WAFFO_PUBLIC_KEY`
- `WAFFO_ENVIRONMENT` (SANDBOX or PRODUCTION)
- `WAFFO_MERCHANT_ID`

---

## Order Payment Service

```typescript
// src/services/payment-service.ts
import { getWaffo } from '../config/waffo';
import { randomUUID } from 'crypto';

/** Generate a 32-char request ID (UUID without dashes, max length 32) */
function genRequestId(): string {
  return randomUUID().replace(/-/g, '');
}

export interface CreatePaymentInput {
  merchantOrderId: string;
  amount: string;
  currency: string;
  description: string;
  notifyUrl: string;
  successRedirectUrl: string;   // URL to redirect after payment
  userId: string;
  userEmail: string;
  userTerminal?: string;        // WEB | APP | WAP | SYSTEM (default: WEB)
  payMethodType?: string;       // e.g., 'CREDITCARD', 'EWALLET'
  payMethodName?: string;       // e.g., 'CC_VISA', 'DANA'
}

export async function createPayment(input: CreatePaymentInput) {
  const waffo = getWaffo();
  const response = await waffo.order().create({
    paymentRequestId: genRequestId(),
    merchantOrderId: input.merchantOrderId,
    orderCurrency: input.currency,
    orderAmount: input.amount,
    orderDescription: input.description,
    notifyUrl: input.notifyUrl,
    successRedirectUrl: input.successRedirectUrl,
    userInfo: {
      userId: input.userId,
      userEmail: input.userEmail,
      userTerminal: input.userTerminal || 'WEB',
    },
    paymentInfo: {
      productName: 'ONE_TIME_PAYMENT',
      ...(input.payMethodType && { payMethodType: input.payMethodType }),
      ...(input.payMethodName && { payMethodName: input.payMethodName }),
    },
  });

  if (!response.isSuccess()) {
    throw new Error(`Payment creation failed: ${response.getCode()} - ${response.getMessage()}`);
  }

  return response.getData();
}

export async function queryOrder(paymentRequestId: string) {
  const waffo = getWaffo();
  const response = await waffo.order().inquiry({ paymentRequestId });

  if (!response.isSuccess()) {
    throw new Error(`Order inquiry failed: ${response.getCode()} - ${response.getMessage()}`);
  }

  return response.getData();
}

export async function cancelOrder(paymentRequestId: string) {
  const waffo = getWaffo();
  const response = await waffo.order().cancel({ paymentRequestId });

  if (!response.isSuccess()) {
    throw new Error(`Order cancel failed: ${response.getCode()} - ${response.getMessage()}`);
  }

  return response.getData();
}

export async function captureOrder(paymentRequestId: string, merchantId: string, amount: string) {
  const waffo = getWaffo();
  const response = await waffo.order().capture({
    paymentRequestId,
    merchantId,
    captureAmount: amount,
  });

  if (!response.isSuccess()) {
    throw new Error(`Order capture failed: ${response.getCode()} - ${response.getMessage()}`);
  }

  return response.getData();
}
```

---

## Refund Service

```typescript
// src/services/refund-service.ts
import { getWaffo } from '../config/waffo';
import { v4 as uuidv4 } from 'uuid';

export async function refundOrder(
  acquiringOrderId: string,
  refundAmount: string,
  refundReason?: string,
) {
  const waffo = getWaffo();
  const response = await waffo.order().refund({
    refundRequestId: uuidv4(),
    acquiringOrderId,
    refundAmount,
    refundReason,
  });

  if (!response.isSuccess()) {
    throw new Error(`Refund failed: ${response.getCode()} - ${response.getMessage()}`);
  }

  return response.getData();
}

export async function queryRefund(refundRequestId: string) {
  const waffo = getWaffo();
  const response = await waffo.refund().inquiry({ refundRequestId });

  if (!response.isSuccess()) {
    throw new Error(`Refund inquiry failed: ${response.getCode()} - ${response.getMessage()}`);
  }

  return response.getData();
}
```

---

## Subscription Service

```typescript
// src/services/subscription-service.ts
import { getWaffo } from '../config/waffo';
import { v4 as uuidv4 } from 'uuid';

export interface CreateSubscriptionInput {
  merchantSubscriptionId: string;
  amount: string;
  currency: string;
  description: string;
  notifyUrl: string;
  userId: string;
  userEmail: string;
  userTerminal?: string;             // WEB | APP | WAP | SYSTEM (default: WEB)
  productId: string;
  productName: string;
  periodType: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  periodInterval: string;           // e.g., '1' for every period
  goodsUrl: string;
  successRedirectUrl: string;
}

export async function createSubscription(input: CreateSubscriptionInput) {
  const waffo = getWaffo();
  const response = await waffo.subscription().create({
    subscriptionRequest: uuidv4(),
    merchantSubscriptionId: input.merchantSubscriptionId,
    currency: input.currency,
    amount: input.amount,
    orderDescription: input.description,
    notifyUrl: input.notifyUrl,
    successRedirectUrl: input.successRedirectUrl,
    productInfo: {
      description: input.productName,
      periodType: input.periodType,
      periodInterval: input.periodInterval,
    },
    userInfo: {
      userId: input.userId,
      userEmail: input.userEmail,
      userTerminal: input.userTerminal || 'WEB',  // WEB for PC, APP for mobile/tablet
    },
    goodsInfo: {
      goodsId: input.productId,
      goodsName: input.productName,
      goodsUrl: input.goodsUrl,
    },
    paymentInfo: {
      productName: 'SUBSCRIPTION',
      payMethodType: 'CREDITCARD,DEBITCARD,APPLEPAY,GOOGLEPAY',
    },
  });

  if (!response.isSuccess()) {
    throw new Error(`Subscription creation failed: ${response.getCode()} - ${response.getMessage()}`);
  }

  return response.getData();
}

export async function querySubscription(subscriptionRequest: string) {
  const waffo = getWaffo();
  const response = await waffo.subscription().inquiry({ subscriptionRequest });

  if (!response.isSuccess()) {
    throw new Error(`Subscription inquiry failed: ${response.getCode()} - ${response.getMessage()}`);
  }

  return response.getData();
}

export async function cancelSubscription(subscriptionRequest: string) {
  const waffo = getWaffo();
  const response = await waffo.subscription().cancel({ subscriptionRequest });

  if (!response.isSuccess()) {
    throw new Error(`Subscription cancel failed: ${response.getCode()} - ${response.getMessage()}`);
  }

  return response.getData();
}

/**
 * Get subscription management URL.
 * Note: manage() only works when subscription is ACTIVE (after payment).
 */
export async function manageSubscription(subscriptionRequest: string) {
  const waffo = getWaffo();
  const response = await waffo.subscription().manage({ subscriptionRequest });

  if (!response.isSuccess()) {
    throw new Error(`Subscription manage failed: ${response.getCode()} - ${response.getMessage()}`);
  }

  const data = response.getData() as any;
  return data?.managementUrl;
}

export interface ChangeSubscriptionInput {
  originSubscriptionRequest: string;
  remainingAmount: string;
  currency: string;
  notifyUrl: string;
  userId: string;
  userEmail: string;
  userTerminal?: string;             // WEB | APP | WAP | SYSTEM (default: WEB)
  newProductName: string;
  periodType: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  periodInterval: string;
  newAmount: string;
}

export async function changeSubscription(input: ChangeSubscriptionInput) {
  const waffo = getWaffo();
  const response = await waffo.subscription().change({
    subscriptionRequest: uuidv4(),
    originSubscriptionRequest: input.originSubscriptionRequest,
    remainingAmount: input.remainingAmount,
    currency: input.currency,
    notifyUrl: input.notifyUrl,
    productInfoList: [{
      description: input.newProductName,
      periodType: input.periodType,
      periodInterval: input.periodInterval,
      amount: input.newAmount,
    }],
    userInfo: {
      userId: input.userId,
      userEmail: input.userEmail,
      userTerminal: input.userTerminal || 'WEB',
    },
    goodsInfo: {
      goodsId: 'subscription',
      goodsName: input.newProductName,
    },
    paymentInfo: {
      productName: 'SUBSCRIPTION',
    },
  });

  if (!response.isSuccess()) {
    throw new Error(`Subscription change failed: ${response.getCode()} - ${response.getMessage()}`);
  }

  return response.getData();
}
```

---

## Webhook Handler

### Express

```typescript
// src/webhooks/waffo-webhook.ts
import express from 'express';
import { getWaffo } from '../config/waffo';

const router = express.Router();

// Use raw body parser for webhook signature verification
router.post('/waffo/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const waffo = getWaffo();
    const body = req.body.toString();
    const signature = req.headers['x-signature'] as string;

    const handler = waffo.webhook()
      .onPayment((notification) => {
        const result = notification.result;

        // NOTE: If Subscription is also integrated, add this filter to skip subscription payments:
        // const productName = result?.paymentInfo?.productName;
        // if (productName === 'SUBSCRIPTION' || productName === 'MINI_PROGRAM_SUBSCRIPTION') {
        //   // Subscription payments are handled by onSubscriptionStatus / onSubscriptionPeriodChanged
        //   // If you need to handle failed orders during subscription billing, add logic here
        //   return;
        // }

        // Three-stage pattern: idempotency → lock → transaction
        // Stage 1: Find local order by paymentRequestId, skip if already terminal
        // Stage 2: Lock the order to prevent duplicate processing
        // Stage 3: In a DB transaction — update status + execute business logic
        //
        // Key fields: result.paymentRequestId, result.orderStatus, result.acquiringOrderId
        // PAY_SUCCESS → execute business logic (e.g., add balance/quota)
        // ORDER_CLOSE → mark order as expired/failed
        console.log(`Payment: paymentRequestId=${result?.paymentRequestId}, orderStatus=${result?.orderStatus}, acquiringOrderId=${result?.acquiringOrderId}`);
      })
      .onRefund((notification) => {
        // Three-stage pattern: idempotency → lock → transaction
        // IMPORTANT: Refund notification identifies orders by acquiringOrderId (NOT paymentRequestId).
        // You must have stored acquiringOrderId from the order create response to look up the local order.
        // Key fields: result.acquiringOrderId, result.refundStatus, result.refundRequestId
        // ORDER_FULLY_REFUNDED → mark order as refunded
        // ORDER_PARTIALLY_REFUNDED → update partial refund state
        const result = notification.result;
        console.log(`Refund: acquiringOrderId=${result?.acquiringOrderId}, refundStatus=${result?.refundStatus}, refundRequestId=${result?.refundRequestId}`);
      })
      .onSubscriptionStatus((notification) => {
        // Three-stage pattern: idempotency → lock → transaction
        // Look up local record by subscriptionRequest (must have been created during subscription create)
        // Key fields: result.subscriptionRequest, result.subscriptionStatus, result.subscriptionId
        // ACTIVE → activate subscription / grant access
        // MERCHANT_CANCELLED/USER_CANCELLED/EXPIRED/CLOSE → revoke access
        const result = notification.result;
        console.log(`Subscription status: subscriptionRequest=${result?.subscriptionRequest}, status=${result?.subscriptionStatus}, subscriptionId=${result?.subscriptionId}`);
      })
      .onSubscriptionPeriodChanged((notification) => {
        // Look up local record by subscriptionRequest
        // Record the renewal and extend user access for the next billing period
        const result = notification.result;
        console.log(`Subscription period changed: subscriptionRequest=${result?.subscriptionRequest}, subscriptionId=${result?.subscriptionId}`);
      })
      .onSubscriptionChange((notification) => {
        // Handle upgrade/downgrade result
        // Key fields: result.subscriptionChangeStatus, result.originSubscriptionRequest, result.subscriptionRequest
        const result = notification.result;
        console.log(`Subscription change: changeStatus=${result?.subscriptionChangeStatus}, subscriptionId=${result?.subscriptionId}`);
      });

    const webhookResult = await handler.handleWebhook(body, signature);

    res.setHeader('X-SIGNATURE', webhookResult.responseSignature);
    res.status(200).send(webhookResult.responseBody);
  }
);

export default router;
```

### NestJS

```typescript
// src/webhooks/waffo-webhook.controller.ts
import { Controller, Post, Req, Res, RawBodyRequest } from '@nestjs/common';
import { Request, Response } from 'express';
import { getWaffo } from '../config/waffo';

@Controller('waffo')
export class WaffoWebhookController {
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    const waffo = getWaffo();
    const body = req.rawBody?.toString() ?? '';
    const signature = req.headers['x-signature'] as string;

    const handler = waffo.webhook()
      .onPayment((notification) => {
        const result = notification.result;
        // NOTE: If Subscription is also integrated, add productName filter here
        // (skip 'SUBSCRIPTION' / 'MINI_PROGRAM_SUBSCRIPTION' — see Express template above)
        // Three-stage pattern: idempotency → lock → transaction
        // Key fields: result.paymentRequestId, result.orderStatus, result.acquiringOrderId
        console.log(`Payment: paymentRequestId=${result?.paymentRequestId}, orderStatus=${result?.orderStatus}`);
      })
      .onRefund((notification) => {
        // IMPORTANT: Refund identifies orders by acquiringOrderId, NOT paymentRequestId
        // Key fields: result.acquiringOrderId, result.refundStatus, result.refundRequestId
        const result = notification.result;
        console.log(`Refund: acquiringOrderId=${result?.acquiringOrderId}, refundStatus=${result?.refundStatus}`);
      });

    const result = await handler.handleWebhook(body, signature);

    res.setHeader('X-SIGNATURE', result.responseSignature);
    res.status(200).send(result.responseBody);
  }
}
```

### Fastify

```typescript
// src/webhooks/waffo-webhook.ts
import { FastifyInstance } from 'fastify';
import { getWaffo } from '../config/waffo';

export async function waffoWebhookRoute(fastify: FastifyInstance) {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => done(null, body),
  );

  fastify.post('/waffo/webhook', async (request, reply) => {
    const waffo = getWaffo();
    const body = request.body as string;
    const signature = request.headers['x-signature'] as string;

    const handler = waffo.webhook()
      .onPayment((notification) => {
        const result = notification.result;
        // NOTE: If Subscription is also integrated, add productName filter here
        // (skip 'SUBSCRIPTION' / 'MINI_PROGRAM_SUBSCRIPTION' — see Express template above)
        // Three-stage pattern: idempotency → lock → transaction
        // Key fields: result.paymentRequestId, result.orderStatus, result.acquiringOrderId
        console.log(`Payment: paymentRequestId=${result?.paymentRequestId}, orderStatus=${result?.orderStatus}`);
      })
      .onRefund((notification) => {
        // IMPORTANT: Refund identifies orders by acquiringOrderId, NOT paymentRequestId
        // Key fields: result.acquiringOrderId, result.refundStatus, result.refundRequestId
        const result = notification.result;
        console.log(`Refund: acquiringOrderId=${result?.acquiringOrderId}, refundStatus=${result?.refundStatus}`);
      });

    const result = await handler.handleWebhook(body, signature);

    reply.header('X-SIGNATURE', result.responseSignature);
    reply.status(200).send(result.responseBody);
  });
}
```

---

## Test Template (Sandbox Integration)

```typescript
// tests/payment.test.ts
import { describe, it, expect } from 'vitest';  // or jest
import { Waffo, Environment } from '@waffo/waffo-node';
import { v4 as uuidv4 } from 'uuid';

const HAS_CREDENTIALS = !!(
  process.env.WAFFO_API_KEY &&
  process.env.WAFFO_PRIVATE_KEY &&
  process.env.WAFFO_PUBLIC_KEY &&
  process.env.WAFFO_MERCHANT_ID
);

const conditionalIt = HAS_CREDENTIALS ? it : it.skip;

function createWaffo(): Waffo {
  return new Waffo({
    apiKey: process.env.WAFFO_API_KEY!,
    privateKey: process.env.WAFFO_PRIVATE_KEY!,
    waffoPublicKey: process.env.WAFFO_PUBLIC_KEY!,
    environment: Environment.SANDBOX,
    merchantId: process.env.WAFFO_MERCHANT_ID!,
  });
}

describe('Waffo Payment Integration', () => {
  conditionalIt('creates a payment order', async () => {
    const waffo = createWaffo();
    const paymentRequestId = uuidv4();

    const response = await waffo.order().create({
      paymentRequestId,
      merchantOrderId: `test-${Date.now()}`,
      orderCurrency: 'USD',
      orderAmount: '1.00',
      orderDescription: 'Integration test order',
      notifyUrl: 'https://example.com/webhook',
      userInfo: { userId: 'test-user', userEmail: 'test@example.com' },
      paymentInfo: { productName: 'Test' },
    });

    if (!response.isSuccess()) {
      console.error(`Create order failed: paymentRequestId=${paymentRequestId}, ` +
        `code=${response.getCode()}, message=${response.getMessage()}, ` +
        `data=${JSON.stringify(response.getData())}`);
    }
    expect(response.isSuccess()).toBe(true);

    const data = response.getData();
    expect(data?.acquiringOrderId).toBeTruthy();
    console.log(`Order created: acquiringOrderId=${data?.acquiringOrderId}`);
  });

  conditionalIt('queries an order', async () => {
    const waffo = createWaffo();
    const paymentRequestId = uuidv4();

    // Create first
    await waffo.order().create({
      paymentRequestId,
      merchantOrderId: `test-${Date.now()}`,
      orderCurrency: 'USD',
      orderAmount: '1.00',
      orderDescription: 'Test',
      notifyUrl: 'https://example.com/webhook',
      userInfo: { userId: 'test-user', userEmail: 'test@example.com' },
      paymentInfo: { productName: 'Test' },
    });

    // Then query
    const response = await waffo.order().inquiry({ paymentRequestId });

    if (!response.isSuccess()) {
      console.error(`Inquiry failed: paymentRequestId=${paymentRequestId}, ` +
        `code=${response.getCode()}, message=${response.getMessage()}`);
    }
    expect(response.isSuccess()).toBe(true);
  });
});
```

---

## Merchant Config & Payment Method Query

```typescript
// src/services/config-service.ts
import { getWaffo } from '../config/waffo';

export async function getMerchantConfig() {
  const waffo = getWaffo();
  const response = await waffo.merchantConfig().inquiry({});

  if (!response.isSuccess()) {
    throw new Error(`Merchant config inquiry failed: ${response.getCode()} - ${response.getMessage()}`);
  }

  return response.getData();
}

export async function getPaymentMethods() {
  const waffo = getWaffo();
  const response = await waffo.payMethodConfig().inquiry({});

  if (!response.isSuccess()) {
    throw new Error(`Pay method inquiry failed: ${response.getCode()} - ${response.getMessage()}`);
  }

  return response.getData();
}
```
