# PHP Integration Templates

## Package

```
waffo/waffo-php
```

Requires PHP 8.0+ with the `curl`, `json`, and `openssl` extensions (as of `waffo/waffo-php` v0.2.0; v0.1.x required 8.2+). Install with:

```
composer require waffo/waffo-php
```

## PHP-specific notes

- **Method names are camelCase** (`->order()`, `->payMethodConfig()`, `->onPayment()`), the same as Node/Java/Go. Payload keys stay camelCase (`orderCurrency`, `subscriptionManagementUrl`) because the SDK forwards them to the API verbatim.
- **`ApiResponse` exposes public properties**, not getters: `$response->isSuccess()` is a method, but the payload is read as `$response->code`, `$response->message`, and `$response->data`. `data` is `mixed` (an associative array on success), so guard with `is_array(...)` before reading fields.
- **Environment**: pass `Environment::Sandbox` / `Environment::Production` (or the plain strings `'sandbox'` / `'production'` — `WaffoConfig` accepts `Environment|string`, not the uppercase `SANDBOX`/`PRODUCTION`). On v0.2.0 these are 8.0-safe polyfill constants on a `final class Environment`, **not a native `enum`** (native enums require PHP 8.1); usage is unchanged from v0.1.x (`->value` / `->name` / `baseUrl()` still work).
- **Unknown status** throws `Waffo\Exception\WaffoUnknownStatusError` (a subclass of `WaffoError`); recover with a same-key inquiry rather than blindly retrying the write.
- **v0.2.0 also exposes** `wallet()->inquiry(...)` (wallet balance/info) and `subscription()->update(...)` alongside `change()`/`changeInquiry()`; the published API surface (method names, named-arg `WaffoConfig`, `Environment::Sandbox`, public `ApiResponse` props) is otherwise identical to v0.1.x, so these templates compile unchanged against both.

## SDK Initialization

```php
// app/Waffo/WaffoFactory.php
<?php

declare(strict_types=1);

namespace App\Waffo;

use Waffo\Config\Environment;
use Waffo\Config\WaffoConfig;
use Waffo\Waffo;

/** Builds and caches a single Waffo client for the application. */
final class WaffoFactory
{
    private static ?Waffo $instance = null;

    public static function client(): Waffo
    {
        if (self::$instance === null) {
            self::$instance = new Waffo(new WaffoConfig(
                apiKey: self::env('WAFFO_API_KEY'),
                privateKey: self::env('WAFFO_PRIVATE_KEY'),
                waffoPublicKey: self::env('WAFFO_PUBLIC_KEY'),
                environment: getenv('APP_ENV') === 'production'
                    ? Environment::Production
                    : Environment::Sandbox,
                merchantId: self::env('WAFFO_MERCHANT_ID'),
            ));
        }

        return self::$instance;
    }

    private static function env(string $name): string
    {
        $value = getenv($name);
        if (!is_string($value) || $value === '') {
            throw new \RuntimeException("Missing required environment variable: {$name}");
        }

        return $value;
    }
}
```

Alternatively, use the built-in env loader — it reads `WAFFO_API_KEY`, `WAFFO_PRIVATE_KEY`, `WAFFO_PUBLIC_KEY`, `WAFFO_ENVIRONMENT` (`sandbox`/`production`), and `WAFFO_MERCHANT_ID`:

```php
// app/Waffo/WaffoFromEnv.php
<?php

declare(strict_types=1);

namespace App\Waffo;

use Waffo\Waffo;

final class WaffoFromEnv
{
    public static function client(): Waffo
    {
        return Waffo::fromEnvironment();
    }
}
```

Generate a 32-character request ID once per logical operation and reuse it for idempotent retries:

```php
// app/Waffo/RequestId.php
<?php

declare(strict_types=1);

namespace App\Waffo;

/** 32-char request ID (hex; max length 32) reused across idempotent retries. */
final class RequestId
{
    public static function generate(): string
    {
        return bin2hex(random_bytes(16));
    }
}
```

---

## Order Payment Service

```php
// app/Service/PaymentService.php
<?php

declare(strict_types=1);

namespace App\Service;

use App\Waffo\RequestId;
use App\Waffo\WaffoFactory;
use Waffo\Exception\WaffoUnknownStatusError;
use Waffo\Model\AbstractModel;
use Waffo\Response\ApiResponse;

final class PaymentService
{
    /**
     * Create a one-time payment order.
     *
     * @param array<string, mixed> $input
     */
    public function createPayment(array $input): array
    {
        $waffo = WaffoFactory::client();
        $paymentRequestId = RequestId::generate();

        // Persist $paymentRequestId locally BEFORE the write call so a retry reuses it.
        $paymentInfo = ['productName' => 'ONE_TIME_PAYMENT'];
        if (isset($input['payMethodType'])) {
            $paymentInfo['payMethodType'] = $input['payMethodType']; // e.g. CREDITCARD, EWALLET
        }
        if (isset($input['payMethodName'])) {
            $paymentInfo['payMethodName'] = $input['payMethodName']; // e.g. CC_VISA, DANA
        }

        $params = [
            'paymentRequestId' => $paymentRequestId,
            'merchantOrderId' => $input['merchantOrderId'],
            'orderCurrency' => $input['currency'],
            'orderAmount' => $input['amount'],
            'orderDescription' => $input['description'],
            'notifyUrl' => $input['notifyUrl'],
            // Rule 19: all three redirect URLs are required for checkout flows.
            'successRedirectUrl' => $input['successRedirectUrl'],
            'failedRedirectUrl' => $input['failedRedirectUrl'],
            'cancelRedirectUrl' => $input['cancelRedirectUrl'],
            'userInfo' => [
                'userId' => $input['userId'],
                'userEmail' => $input['userEmail'],
                'userTerminal' => $input['userTerminal'] ?? 'WEB', // WEB | APP
            ],
            'goodsInfo' => [
                'goodsId' => $input['goodsId'] ?? null,
                // Rule 21: goodsName always required; goodsUrl is the product/official page
                // (NOT an image). App-only merchants send appName instead of goodsUrl.
                'goodsName' => $input['goodsName'],
                'goodsUrl' => $input['goodsUrl'],
            ],
            'paymentInfo' => $paymentInfo,
        ];

        try {
            $response = $waffo->order()->create($params);
        } catch (WaffoUnknownStatusError) {
            // Unknown status: recover with a same-key inquiry instead of retrying blindly.
            $response = $waffo->order()->inquiry(['paymentRequestId' => $paymentRequestId]);
        }

        return $this->unwrap($response, 'Payment creation failed');
    }

    public function queryOrder(string $paymentRequestId): array
    {
        $response = WaffoFactory::client()->order()->inquiry(['paymentRequestId' => $paymentRequestId]);

        return $this->unwrap($response, 'Order inquiry failed');
    }

    public function cancelOrder(string $paymentRequestId): array
    {
        $waffo = WaffoFactory::client();
        try {
            $response = $waffo->order()->cancel(['paymentRequestId' => $paymentRequestId]);
        } catch (WaffoUnknownStatusError) {
            $response = $waffo->order()->inquiry(['paymentRequestId' => $paymentRequestId]);
        }

        return $this->unwrap($response, 'Order cancel failed');
    }

    /** Capture a pre-authorized payment; captureAmount must not exceed the authorized amount. */
    public function captureOrder(string $paymentRequestId, string $acquiringOrderId, string $captureAmount): array
    {
        $response = WaffoFactory::client()->order()->capture([
            'paymentRequestId' => $paymentRequestId,
            'acquiringOrderId' => $acquiringOrderId,
            'captureAmount' => $captureAmount,
        ]);

        return $this->unwrap($response, 'Order capture failed');
    }

    private function unwrap(ApiResponse $response, string $failureMessage): array
    {
        if (!$response->isSuccess()) {
            throw new \RuntimeException(
                sprintf('%s: %s - %s', $failureMessage, $response->code, $response->message ?? ''),
            );
        }

        // Successful `data` is an associative array (no schema) or a hydrated model
        // (schema present); normalize both to a plain array for predictable field access.
        $data = $response->data;
        if ($data instanceof AbstractModel) {
            return $data->toArray();
        }

        return is_array($data) ? $data : [];
    }
}
```

---

## Refund Service

```php
// app/Service/RefundService.php
<?php

declare(strict_types=1);

namespace App\Service;

use App\Waffo\RequestId;
use App\Waffo\WaffoFactory;
use Waffo\Exception\WaffoUnknownStatusError;
use Waffo\Model\AbstractModel;
use Waffo\Response\ApiResponse;

final class RefundService
{
    /**
     * @param string $refundNotifyUrl REQUIRED for REFUND_NOTIFICATION delivery — the refund does
     *   NOT fall back to the original order's notifyUrl; omit it and Waffo emits no refund webhook.
     */
    public function refundOrder(string $acquiringOrderId, string $refundAmount, string $refundNotifyUrl, string $refundReason): array
    {
        $waffo = WaffoFactory::client();
        $refundRequestId = RequestId::generate();

        $params = [
            'refundRequestId' => $refundRequestId,
            'acquiringOrderId' => $acquiringOrderId,
            'refundAmount' => $refundAmount,
            'refundNotifyUrl' => $refundNotifyUrl,
            'refundReason' => $refundReason, // required by the API
        ];

        try {
            $response = $waffo->order()->refund($params);
        } catch (WaffoUnknownStatusError) {
            $response = $waffo->refund()->inquiry(['refundRequestId' => $refundRequestId]);
        }

        return $this->unwrap($response, 'Refund failed');
    }

    public function queryRefund(string $refundRequestId): array
    {
        $response = WaffoFactory::client()->refund()->inquiry(['refundRequestId' => $refundRequestId]);

        return $this->unwrap($response, 'Refund inquiry failed');
    }

    private function unwrap(ApiResponse $response, string $failureMessage): array
    {
        if (!$response->isSuccess()) {
            throw new \RuntimeException(
                sprintf('%s: %s - %s', $failureMessage, $response->code, $response->message ?? ''),
            );
        }

        // Successful `data` is an associative array (no schema) or a hydrated model
        // (schema present); normalize both to a plain array for predictable field access.
        $data = $response->data;
        if ($data instanceof AbstractModel) {
            return $data->toArray();
        }

        return is_array($data) ? $data : [];
    }
}
```

---

## Subscription Service

```php
// app/Service/SubscriptionService.php
<?php

declare(strict_types=1);

namespace App\Service;

use App\Waffo\RequestId;
use App\Waffo\WaffoFactory;
use Waffo\Exception\WaffoUnknownStatusError;
use Waffo\Model\AbstractModel;
use Waffo\Response\ApiResponse;

final class SubscriptionService
{
    /**
     * Create a subscription. The description flows through productInfo.description; there is
     * no top-level order description on subscription create.
     *
     * @param array<string, mixed> $input
     */
    public function createSubscription(array $input): array
    {
        $waffo = WaffoFactory::client();
        $subscriptionRequest = RequestId::generate();

        $params = [
            'subscriptionRequest' => $subscriptionRequest,
            'merchantSubscriptionId' => $input['merchantSubscriptionId'],
            'currency' => $input['currency'],
            'amount' => $input['amount'],
            'notifyUrl' => $input['notifyUrl'],
            'successRedirectUrl' => $input['successRedirectUrl'],
            'failedRedirectUrl' => $input['failedRedirectUrl'],
            'cancelRedirectUrl' => $input['cancelRedirectUrl'],
            // Rule 26: management URL is required and the page must require login.
            'subscriptionManagementUrl' => $input['subscriptionManagementUrl'],
            'productInfo' => [
                'description' => $input['description'],
                'periodType' => $input['periodType'],       // DAILY | WEEKLY | MONTHLY
                'periodInterval' => $input['periodInterval'], // e.g. '1'
            ],
            'userInfo' => [
                'userId' => $input['userId'],
                'userEmail' => $input['userEmail'],
                'userTerminal' => $input['userTerminal'] ?? 'WEB', // WEB | APP
            ],
            'goodsInfo' => [
                'goodsId' => $input['productId'],
                'goodsName' => $input['productName'],
                'goodsUrl' => $input['goodsUrl'],
            ],
            'paymentInfo' => [
                'productName' => 'SUBSCRIPTION',
                'payMethodType' => 'CREDITCARD,DEBITCARD,APPLEPAY,GOOGLEPAY',
            ],
        ];

        try {
            $response = $waffo->subscription()->create($params);
        } catch (WaffoUnknownStatusError) {
            $response = $waffo->subscription()->inquiry(['subscriptionRequest' => $subscriptionRequest]);
        }

        return $this->unwrap($response, 'Subscription creation failed');
    }

    public function querySubscription(string $subscriptionRequest): array
    {
        $response = WaffoFactory::client()->subscription()->inquiry(['subscriptionRequest' => $subscriptionRequest]);

        return $this->unwrap($response, 'Subscription inquiry failed');
    }

    /** Cancel is keyed by the Waffo subscriptionId (from create/inquiry), NOT subscriptionRequest. */
    public function cancelSubscription(string $subscriptionId): array
    {
        $waffo = WaffoFactory::client();
        try {
            $response = $waffo->subscription()->cancel(['subscriptionId' => $subscriptionId]);
        } catch (WaffoUnknownStatusError) {
            // Reconcile with an inquiry; validate the recovery response before reading data.
            $response = $waffo->subscription()->inquiry(['subscriptionId' => $subscriptionId]);
        }

        return $this->unwrap($response, 'Subscription cancel failed');
    }

    /** manage() returns a management URL and only works once the subscription is ACTIVE. */
    public function manageSubscription(string $subscriptionRequest): array
    {
        $response = WaffoFactory::client()->subscription()->manage(['subscriptionRequest' => $subscriptionRequest]);

        return $this->unwrap($response, 'Subscription manage failed');
    }

    /**
     * Upgrade/downgrade an active subscription (proration handled by Waffo).
     *
     * @param array<string, mixed> $input
     */
    public function changeSubscription(array $input): array
    {
        $waffo = WaffoFactory::client();

        $params = [
            'subscriptionRequest' => RequestId::generate(),
            'originSubscriptionRequest' => $input['originSubscriptionRequest'],
            'remainingAmount' => $input['remainingAmount'],
            'currency' => $input['currency'],
            'notifyUrl' => $input['notifyUrl'],
            'productInfoList' => [[
                'description' => $input['newProductName'],
                'periodType' => $input['periodType'],
                'periodInterval' => $input['periodInterval'],
                'amount' => $input['newAmount'],
            ]],
            'userInfo' => [
                'userId' => $input['userId'],
                'userEmail' => $input['userEmail'],
                'userTerminal' => $input['userTerminal'] ?? 'WEB',
            ],
            'goodsInfo' => [
                'goodsId' => 'subscription',
                'goodsName' => $input['newProductName'],
            ],
            'paymentInfo' => ['productName' => 'SUBSCRIPTION'],
        ];

        try {
            $response = $waffo->subscription()->change($params);
        } catch (WaffoUnknownStatusError) {
            // change/inquiry requires BOTH originSubscriptionRequest AND the change's own
            // subscriptionRequest (both marked required in the OpenAPI); passing only the
            // origin fails validation with A0003 "subscriptionRequest must not be blank".
            $response = $waffo->subscription()->changeInquiry([
                'originSubscriptionRequest' => $input['originSubscriptionRequest'],
                'subscriptionRequest' => $params['subscriptionRequest'],
            ]);
        }

        return $this->unwrap($response, 'Subscription change failed');
    }

    private function unwrap(ApiResponse $response, string $failureMessage): array
    {
        if (!$response->isSuccess()) {
            throw new \RuntimeException(
                sprintf('%s: %s - %s', $failureMessage, $response->code, $response->message ?? ''),
            );
        }

        // Successful `data` is an associative array (no schema) or a hydrated model
        // (schema present); normalize both to a plain array for predictable field access.
        $data = $response->data;
        if ($data instanceof AbstractModel) {
            return $data->toArray();
        }

        return is_array($data) ? $data : [];
    }
}
```

---

## Merchant Config & Payment Method Query

```php
// app/Service/ConfigService.php
<?php

declare(strict_types=1);

namespace App\Service;

use App\Waffo\WaffoFactory;
use Waffo\Model\AbstractModel;
use Waffo\Response\ApiResponse;

final class ConfigService
{
    public function getMerchantConfig(): array
    {
        return $this->unwrap(
            WaffoFactory::client()->merchantConfig()->inquiry(),
            'Merchant config inquiry failed',
        );
    }

    /**
     * payMethodConfig().inquiry() is mandatory before pay-method coverage testing — it
     * returns the merchant's active contracted methods.
     */
    public function getPaymentMethods(): array
    {
        return $this->unwrap(
            WaffoFactory::client()->payMethodConfig()->inquiry(),
            'Pay method inquiry failed',
        );
    }

    private function unwrap(ApiResponse $response, string $failureMessage): array
    {
        if (!$response->isSuccess()) {
            throw new \RuntimeException(
                sprintf('%s: %s - %s', $failureMessage, $response->code, $response->message ?? ''),
            );
        }

        // Successful `data` is an associative array (no schema) or a hydrated model
        // (schema present); normalize both to a plain array for predictable field access.
        $data = $response->data;
        if ($data instanceof AbstractModel) {
            return $data->toArray();
        }

        return is_array($data) ? $data : [];
    }
}
```

---

## Webhook Handler

The webhook must pass the **unmodified** request body and the `X-SIGNATURE` header to
`$waffo->webhook()->...->handleWebhook($body, $signature)`, then return HTTP 200 with the
signed `responseBody` and `responseSignature` the SDK produces. Register `onPayment` for
payment notifications and route subscription payments by `paymentInfo.productName` — do not
rely on `onSubscriptionPayment` (it is only a fallback for `SUBSCRIPTION_STATUS_NOTIFICATION`).

### Framework-agnostic (plain PHP)

```php
// app/Webhook/waffo_webhook.php
<?php

declare(strict_types=1);

use App\Waffo\WaffoFactory;

$waffo = WaffoFactory::client();
$body = file_get_contents('php://input') ?: '';
$signature = $_SERVER['HTTP_X_SIGNATURE'] ?? null;

$result = $waffo->webhook()
    ->onPayment(static function (array $event): void {
        $result = is_array($event['result'] ?? null) ? $event['result'] : [];

        // If Subscription is also integrated, route subscription payments separately:
        //   $productName = $result['paymentInfo']['productName'] ?? null;
        //   if (in_array($productName, ['SUBSCRIPTION', 'MINI_PROGRAM_SUBSCRIPTION'], true)) {
        //       // record the subscription payment attempt/retry, then skip one-time fulfillment
        //       return;
        //   }

        // Three-stage pattern: idempotency -> lock -> transaction.
        // Key fields: result.paymentRequestId, result.orderStatus, result.acquiringOrderId
        // PAY_SUCCESS -> run fulfillment; ORDER_CLOSE -> mark expired/failed.
        error_log(sprintf(
            'Payment: paymentRequestId=%s orderStatus=%s acquiringOrderId=%s',
            $result['paymentRequestId'] ?? '',
            $result['orderStatus'] ?? '',
            $result['acquiringOrderId'] ?? '',
        ));
    })
    ->onRefund(static function (array $event): void {
        // IMPORTANT: refund notifications identify the order by acquiringOrderId
        // (NOT paymentRequestId) — persist acquiringOrderId at create time to look it up.
        $result = is_array($event['result'] ?? null) ? $event['result'] : [];
        error_log(sprintf(
            'Refund: acquiringOrderId=%s refundStatus=%s refundRequestId=%s',
            $result['acquiringOrderId'] ?? '',
            $result['refundStatus'] ?? '',
            $result['refundRequestId'] ?? '',
        ));
    })
    ->onSubscriptionStatus(static function (array $event): void {
        // Look up the local record by subscriptionRequest.
        // ACTIVE -> grant access; MERCHANT_CANCELLED/CHANNEL_CANCELLED/CLOSE -> revoke.
        $result = is_array($event['result'] ?? null) ? $event['result'] : [];
        error_log(sprintf(
            'Subscription status: subscriptionRequest=%s status=%s subscriptionId=%s',
            $result['subscriptionRequest'] ?? '',
            $result['subscriptionStatus'] ?? '',
            $result['subscriptionId'] ?? '',
        ));
    })
    ->onSubscriptionPeriodChanged(static function (array $event): void {
        // Record the renewal and extend access for the next billing period.
        $result = is_array($event['result'] ?? null) ? $event['result'] : [];
        error_log('Subscription period changed: subscriptionId=' . ($result['subscriptionId'] ?? ''));
    })
    ->onSubscriptionChange(static function (array $event): void {
        // Handle upgrade/downgrade result (SUCCESS or CLOSED).
        $result = is_array($event['result'] ?? null) ? $event['result'] : [];
        error_log('Subscription change: subscriptionId=' . ($result['subscriptionId'] ?? ''));
    })
    ->handleWebhook($body, $signature);

http_response_code(200);
header('Content-Type: application/json');
header('X-SIGNATURE: ' . $result->responseSignature);
echo $result->responseBody;
```

### Laravel

```php
// app/Webhook/routes_waffo.php
<?php

use App\Waffo\WaffoFactory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/waffo/webhook', function (Request $request) {
    $result = WaffoFactory::client()->webhook()
        ->onPayment(static function (array $event): void {
            // Three-stage pattern: idempotency -> lock -> transaction.
            // If Subscription is integrated, filter by paymentInfo.productName here.
        })
        ->onRefund(static function (array $event): void {
            // Refund identifies the order by acquiringOrderId, NOT paymentRequestId.
        })
        ->handleWebhook($request->getContent(), $request->header('X-SIGNATURE'));

    return response($result->responseBody, 200)
        ->header('Content-Type', 'application/json')
        ->header('X-SIGNATURE', $result->responseSignature);
});
```

### Symfony

```php
// app/Webhook/SymfonyWaffoController.php
<?php

use App\Waffo\WaffoFactory;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

final class SymfonyWaffoController
{
    public function webhook(Request $request): Response
    {
        $result = WaffoFactory::client()->webhook()
            ->onPayment(static function (array $event): void {
                // Three-stage pattern: idempotency -> lock -> transaction.
            })
            ->onRefund(static function (array $event): void {
                // Refund identifies the order by acquiringOrderId, NOT paymentRequestId.
            })
            ->handleWebhook($request->getContent(), $request->headers->get('X-SIGNATURE'));

        return new Response($result->responseBody, 200, [
            'Content-Type' => 'application/json',
            'X-SIGNATURE' => $result->responseSignature,
        ]);
    }
}
```

---

## Test Template (Sandbox Integration)

```php
// tests/PaymentTest.php
<?php

declare(strict_types=1);

namespace App\Tests;

use App\Waffo\RequestId;
use PHPUnit\Framework\TestCase;
use Waffo\Config\Environment;
use Waffo\Config\WaffoConfig;
use Waffo\Response\ApiResponse;
use Waffo\Waffo;

final class PaymentTest extends TestCase
{
    private function hasCredentials(): bool
    {
        foreach (['WAFFO_API_KEY', 'WAFFO_PRIVATE_KEY', 'WAFFO_PUBLIC_KEY', 'WAFFO_MERCHANT_ID'] as $name) {
            $value = getenv($name);
            if (!is_string($value) || $value === '') {
                return false;
            }
        }

        return true;
    }

    private function client(): Waffo
    {
        return new Waffo(new WaffoConfig(
            apiKey: (string) getenv('WAFFO_API_KEY'),
            privateKey: (string) getenv('WAFFO_PRIVATE_KEY'),
            waffoPublicKey: (string) getenv('WAFFO_PUBLIC_KEY'),
            environment: Environment::Sandbox,
            merchantId: (string) getenv('WAFFO_MERCHANT_ID'),
        ));
    }

    private function createSampleOrder(Waffo $waffo): ApiResponse
    {
        return $waffo->order()->create([
            'paymentRequestId' => RequestId::generate(),
            'merchantOrderId' => 'demo-' . time(),
            'orderCurrency' => 'USD',
            'orderAmount' => '1.00',
            'orderDescription' => 'Demo order - SDK connectivity check',
            'notifyUrl' => 'https://example.com/webhook',
            'successRedirectUrl' => 'https://example.com/success',
            'failedRedirectUrl' => 'https://example.com/failed',
            'cancelRedirectUrl' => 'https://example.com/cancel',
            'userInfo' => ['userId' => 'demo-user-001', 'userEmail' => 'demo-user-001@example.com', 'userTerminal' => 'WEB'],
            'goodsInfo' => ['goodsName' => 'Demo Goods', 'goodsUrl' => 'https://www.example.com/products/demo'],
            'paymentInfo' => ['productName' => 'ONE_TIME_PAYMENT'],
        ]);
    }

    public function testCreatesPaymentOrder(): void
    {
        if (!$this->hasCredentials()) {
            self::markTestSkipped('Waffo Sandbox credentials are not configured.');
        }

        $response = $this->createSampleOrder($this->client());
        self::assertTrue(
            $response->isSuccess(),
            sprintf('create failed: code=%s message=%s', $response->code, $response->message ?? ''),
        );

        $data = $response->data;
        $order = $data instanceof \Waffo\Model\AbstractModel ? $data->toArray() : (is_array($data) ? $data : []);
        self::assertNotEmpty($order['acquiringOrderId'] ?? null, 'acquiringOrderId missing');
    }

    public function testQueriesOrder(): void
    {
        if (!$this->hasCredentials()) {
            self::markTestSkipped('Waffo Sandbox credentials are not configured.');
        }

        $waffo = $this->client();
        $create = $this->createSampleOrder($waffo);
        self::assertTrue($create->isSuccess());

        $data = $create->data;
        $order = $data instanceof \Waffo\Model\AbstractModel ? $data->toArray() : (is_array($data) ? $data : []);
        $acquiringOrderId = (string) ($order['acquiringOrderId'] ?? '');
        $response = $waffo->order()->inquiry(['acquiringOrderId' => $acquiringOrderId]);
        self::assertTrue(
            $response->isSuccess(),
            sprintf('inquiry failed: code=%s message=%s', $response->code, $response->message ?? ''),
        );
    }
}
```
