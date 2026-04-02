# Java Integration Templates

## Dependency

**Maven:**
```xml
<dependency>
    <groupId>com.waffo</groupId>
    <artifactId>waffo-java</artifactId>
    <version>${latest}</version>
</dependency>
```

**Gradle:**
```groovy
implementation 'com.waffo:waffo-java:${latest}'
```

---

## SDK Initialization

### Spring Boot Configuration

```java
// src/main/java/com/example/config/WaffoConfiguration.java
package com.example.config;

import com.waffo.Waffo;
import com.waffo.types.config.Environment;
import com.waffo.types.config.WaffoConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class WaffoConfiguration {

    @Value("${waffo.api-key}")
    private String apiKey;

    @Value("${waffo.private-key}")
    private String privateKey;

    @Value("${waffo.public-key}")
    private String waffoPublicKey;

    @Value("${waffo.merchant-id}")
    private String merchantId;

    @Value("${waffo.environment:SANDBOX}")
    private String environment;

    @Bean
    public Waffo waffo() {
        WaffoConfig config = WaffoConfig.builder()
                .apiKey(apiKey)
                .privateKey(privateKey)
                .waffoPublicKey(waffoPublicKey)
                .merchantId(merchantId)
                .environment("PRODUCTION".equals(environment)
                        ? Environment.PRODUCTION
                        : Environment.SANDBOX)
                .build();
        return new Waffo(config);
    }
}
```

**application.yml:**
```yaml
waffo:
  api-key: ${WAFFO_API_KEY}
  private-key: ${WAFFO_PRIVATE_KEY}
  public-key: ${WAFFO_PUBLIC_KEY}
  merchant-id: ${WAFFO_MERCHANT_ID}
  environment: SANDBOX
```

### Plain Java (no framework)

```java
import com.waffo.Waffo;
import com.waffo.types.config.Environment;
import com.waffo.types.config.WaffoConfig;

public class WaffoFactory {
    private static volatile Waffo instance;

    public static Waffo getInstance() {
        if (instance == null) {
            synchronized (WaffoFactory.class) {
                if (instance == null) {
                    WaffoConfig config = WaffoConfig.builder()
                            .apiKey(System.getenv("WAFFO_API_KEY"))
                            .privateKey(System.getenv("WAFFO_PRIVATE_KEY"))
                            .waffoPublicKey(System.getenv("WAFFO_PUBLIC_KEY"))
                            .merchantId(System.getenv("WAFFO_MERCHANT_ID"))
                            .environment(Environment.SANDBOX)
                            .build();
                    instance = new Waffo(config);
                }
            }
        }
        return instance;
    }
}
```

---

## Payment Service

```java
// src/main/java/com/example/service/PaymentService.java
package com.example.service;

import com.waffo.Waffo;
import com.waffo.types.ApiResponse;
import com.waffo.types.iso.CurrencyCode;
import com.waffo.types.order.*;
import com.waffo.types.payment.ProductName;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class PaymentService {

    private final Waffo waffo;

    /** Generate a 32-char request ID (UUID without dashes, max length 32) */
    private static String genRequestId() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    public PaymentService(Waffo waffo) {
        this.waffo = waffo;
    }

    public CreateOrderData createPayment(String merchantOrderId, String amount,
                                          CurrencyCode currency, String description,
                                          String notifyUrl, String successRedirectUrl,
                                          String userId, String userEmail) {
        CreateOrderParams params = CreateOrderParams.builder()
                .paymentRequestId(genRequestId())
                .merchantOrderId(merchantOrderId)
                .orderCurrency(currency)
                .orderAmount(amount)
                .orderDescription(description)
                .notifyUrl(notifyUrl)
                .successRedirectUrl(successRedirectUrl)
                .userInfo(UserInfo.builder()
                        .userId(userId)
                        .userEmail(userEmail)
                        .userTerminal(UserTerminalType.WEB)
                        .build())
                .paymentInfo(PaymentInfo.builder()
                        .productName(ProductName.ONE_TIME_PAYMENT)
                        .build())
                .build();

        ApiResponse<CreateOrderData> response = waffo.order().create(params);

        if (!response.isSuccess()) {
            throw new RuntimeException("Payment creation failed: " +
                    response.getCode() + " - " + response.getMessage().orElse(""));
        }

        return response.getData().orElseThrow();
    }

    public InquiryOrderData queryOrder(String paymentRequestId) {
        InquiryOrderParams params = InquiryOrderParams.builder()
                .paymentRequestId(paymentRequestId)
                .build();

        ApiResponse<InquiryOrderData> response = waffo.order().inquiry(params);

        if (!response.isSuccess()) {
            throw new RuntimeException("Order inquiry failed: " +
                    response.getCode() + " - " + response.getMessage().orElse(""));
        }

        return response.getData().orElseThrow();
    }

    public CancelOrderData cancelOrder(String paymentRequestId) {
        CancelOrderParams params = CancelOrderParams.builder()
                .paymentRequestId(paymentRequestId)
                .build();

        ApiResponse<CancelOrderData> response = waffo.order().cancel(params);

        if (!response.isSuccess()) {
            throw new RuntimeException("Order cancel failed: " +
                    response.getCode() + " - " + response.getMessage().orElse(""));
        }

        return response.getData().orElseThrow();
    }
}
```

---

## Refund Service

```java
// src/main/java/com/example/service/RefundService.java
package com.example.service;

import com.waffo.Waffo;
import com.waffo.types.ApiResponse;
import com.waffo.types.order.RefundOrderParams;
import com.waffo.types.order.RefundOrderData;
import com.waffo.types.refund.InquiryRefundParams;
import com.waffo.types.refund.InquiryRefundData;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class RefundService {

    private final Waffo waffo;

    public RefundService(Waffo waffo) {
        this.waffo = waffo;
    }

    public RefundOrderData refundOrder(String acquiringOrderId,
                                        String refundAmount, String refundReason) {
        RefundOrderParams params = RefundOrderParams.builder()
                .refundRequestId(UUID.randomUUID().toString().replace("-", ""))
                .acquiringOrderId(acquiringOrderId)
                .refundAmount(refundAmount)
                .refundReason(refundReason)
                .build();

        ApiResponse<RefundOrderData> response = waffo.order().refund(params);

        if (!response.isSuccess()) {
            throw new RuntimeException("Refund failed: " +
                    response.getCode() + " - " + response.getMessage().orElse(""));
        }

        return response.getData().orElseThrow();
    }

    public InquiryRefundData queryRefund(String refundRequestId) {
        InquiryRefundParams params = InquiryRefundParams.builder()
                .refundRequestId(refundRequestId)
                .build();

        ApiResponse<InquiryRefundData> response = waffo.refund().inquiry(params);

        if (!response.isSuccess()) {
            throw new RuntimeException("Refund inquiry failed: " +
                    response.getCode() + " - " + response.getMessage().orElse(""));
        }

        return response.getData().orElseThrow();
    }
}
```

---

## Subscription Service

```java
// src/main/java/com/example/service/SubscriptionService.java
package com.example.service;

import com.waffo.Waffo;
import com.waffo.types.ApiResponse;
import com.waffo.types.iso.CurrencyCode;
import com.waffo.types.payment.SubscriptionProductName;
import com.waffo.types.subscription.*;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class SubscriptionService {

    private final Waffo waffo;

    public SubscriptionService(Waffo waffo) {
        this.waffo = waffo;
    }

    public CreateSubscriptionData createSubscription(String merchantSubscriptionId,
                                                      String amount, CurrencyCode currency,
                                                      String description, String notifyUrl,
                                                      String successRedirectUrl,
                                                      String failedRedirectUrl,
                                                      String cancelRedirectUrl,
                                                      String subscriptionManagementUrl,
                                                      String userId, String userEmail,
                                                      String productId, String productName,
                                                      String goodsId, String goodsName,
                                                      String goodsUrl) {
        CreateSubscriptionParams params = CreateSubscriptionParams.builder()
                .subscriptionRequest(UUID.randomUUID().toString().replace("-", ""))
                .merchantSubscriptionId(merchantSubscriptionId)
                .currency(currency)
                .amount(amount)
                .notifyUrl(notifyUrl)
                .successRedirectUrl(successRedirectUrl)
                .failedRedirectUrl(failedRedirectUrl)
                .cancelRedirectUrl(cancelRedirectUrl)
                .subscriptionManagementUrl(subscriptionManagementUrl)
                .productInfo(ProductInfo.builder()
                        .productId(productId)
                        .productName(productName)
                        .description(description)
                        .periodType(PeriodType.MONTHLY)
                        .periodInterval("1")
                        .build())
                .goodsInfo(SubscriptionGoodsInfo.builder()
                        .goodsId(goodsId)
                        .goodsName(goodsName)
                        .goodsUrl(goodsUrl)
                        .build())
                .userInfo(SubscriptionUserInfo.builder()
                        .userId(userId)
                        .userEmail(userEmail)
                        .userTerminal(SubscriptionUserTerminalType.WEB)  // WEB for PC, APP for mobile/tablet
                        .build())
                .paymentInfo(SubscriptionPaymentInfo.builder()
                        .productName(SubscriptionProductName.SUBSCRIPTION)
                        .payMethodType("CREDITCARD,DEBITCARD,APPLEPAY,GOOGLEPAY")
                        .build())
                .build();

        ApiResponse<CreateSubscriptionData> response = waffo.subscription().create(params);

        if (!response.isSuccess()) {
            throw new RuntimeException("Subscription creation failed: " +
                    response.getCode() + " - " + response.getMessage().orElse(""));
        }

        return response.getData().orElseThrow();
    }

    public InquirySubscriptionData querySubscription(String subscriptionRequest) {
        InquirySubscriptionParams params = InquirySubscriptionParams.builder()
                .subscriptionRequest(subscriptionRequest)
                .build();

        ApiResponse<InquirySubscriptionData> response = waffo.subscription().inquiry(params);

        if (!response.isSuccess()) {
            throw new RuntimeException("Subscription inquiry failed: " +
                    response.getCode() + " - " + response.getMessage().orElse(""));
        }

        return response.getData().orElseThrow();
    }

    public CancelSubscriptionData cancelSubscription(String subscriptionRequest) {
        CancelSubscriptionParams params = CancelSubscriptionParams.builder()
                .subscriptionRequest(subscriptionRequest)
                .build();

        ApiResponse<CancelSubscriptionData> response = waffo.subscription().cancel(params);

        if (!response.isSuccess()) {
            throw new RuntimeException("Subscription cancel failed: " +
                    response.getCode() + " - " + response.getMessage().orElse(""));
        }

        return response.getData().orElseThrow();
    }

    /**
     * Get the management URL for an ACTIVE subscription.
     * manage() only works when subscription status is ACTIVE.
     *
     * @param subscriptionId the subscription ID (or use subscriptionRequest instead)
     */
    public String manageSubscription(String subscriptionId) {
        ManageSubscriptionParams params = ManageSubscriptionParams.builder()
                .subscriptionId(subscriptionId)
                .build();

        ApiResponse<ManageSubscriptionData> response = waffo.subscription().manage(params);

        if (!response.isSuccess()) {
            throw new RuntimeException("Subscription manage failed: " +
                    response.getCode() + " - " + response.getMessage().orElse(""));
        }

        return response.getData().orElseThrow().getManagementUrl();
    }
}
```

---

## Webhook Controller (Spring Boot)

```java
// src/main/java/com/example/controller/WaffoWebhookController.java
package com.example.controller;

import com.waffo.Waffo;
import com.waffo.core.WebhookHandler;
import com.waffo.core.WebhookHandler.WebhookResult;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/waffo")
public class WaffoWebhookController {

    private final Waffo waffo;

    public WaffoWebhookController(Waffo waffo) {
        this.waffo = waffo;
    }

    @PostMapping("/webhook")
    public ResponseEntity<String> handleWebhook(
            @RequestBody String body,
            @RequestHeader("X-SIGNATURE") String signature) {

        WebhookHandler handler = waffo.webhook()
                .onPayment(notification -> {
                    var result = notification.getResult();

                    // NOTE: If Subscription is also integrated, add this filter to skip subscription payments:
                    // if (result.getPaymentInfo() != null) {
                    //     String productName = result.getPaymentInfo().getProductName();
                    //     if ("SUBSCRIPTION".equals(productName) || "MINI_PROGRAM_SUBSCRIPTION".equals(productName)) {
                    //         // Subscription payments handled by onSubscriptionStatus / onSubscriptionPeriodChanged
                    //         // If you need to handle failed orders during subscription billing, add logic here
                    //         return;
                    //     }
                    // }

                    // Three-stage pattern: idempotency → lock → transaction
                    // Stage 1: Find local order by paymentRequestId, skip if already terminal
                    // Stage 2: Lock the order to prevent duplicate processing
                    // Stage 3: In a DB transaction — update status + execute business logic
                    //
                    // Key fields: result.getPaymentRequestId(), result.getOrderStatus(), result.getAcquiringOrderId()
                    // PAY_SUCCESS → execute business logic (e.g., add balance/quota)
                    // ORDER_CLOSE → mark order as expired/failed
                    System.out.printf("Payment: paymentRequestId=%s, orderStatus=%s, acquiringOrderId=%s%n",
                            result.getPaymentRequestId(), result.getOrderStatus(), result.getAcquiringOrderId());
                })
                .onRefund(notification -> {
                    // Three-stage pattern: idempotency → lock → transaction
                    // IMPORTANT: Refund notification identifies orders by acquiringOrderId (NOT paymentRequestId).
                    // You must have stored acquiringOrderId from the order create response to look up the local order.
                    // Key fields: result.getAcquiringOrderId(), result.getRefundStatus(), result.getRefundRequestId()
                    // ORDER_FULLY_REFUNDED → mark order as refunded
                    // ORDER_PARTIALLY_REFUNDED → update partial refund state
                    var result = notification.getResult();
                    System.out.printf("Refund: acquiringOrderId=%s, refundStatus=%s, refundRequestId=%s%n",
                            result.getAcquiringOrderId(), result.getRefundStatus(), result.getRefundRequestId());
                })
                .onSubscriptionStatus(notification -> {
                    // Three-stage pattern: idempotency → lock → transaction
                    // Look up local record by subscriptionRequest (must have been created during subscription create)
                    // Key fields: result.getSubscriptionRequest(), result.getSubscriptionStatus(), result.getSubscriptionId()
                    // ACTIVE → activate subscription / grant access
                    // MERCHANT_CANCELLED/USER_CANCELLED/EXPIRED/CLOSE → revoke access
                    var result = notification.getResult();
                    System.out.printf("Subscription status: subscriptionRequest=%s, status=%s, subscriptionId=%s%n",
                            result.getSubscriptionRequest(), result.getSubscriptionStatus(), result.getSubscriptionId());
                })
                .onSubscriptionPeriodChanged(notification -> {
                    // Look up local record by subscriptionRequest
                    // Record the renewal and extend user access for the next billing period
                    var result = notification.getResult();
                    System.out.printf("Subscription period changed: subscriptionRequest=%s, subscriptionId=%s%n",
                            result.getSubscriptionRequest(), result.getSubscriptionId());
                })
                .onSubscriptionChange(notification -> {
                    // Handle upgrade/downgrade result
                    // Key fields: result.getSubscriptionChangeStatus(), result.getOriginSubscriptionRequest(), result.getSubscriptionRequest()
                    var result = notification.getResult();
                    System.out.printf("Subscription change: changeStatus=%s, subscriptionId=%s%n",
                            result.getSubscriptionChangeStatus(), result.getSubscriptionId());
                });

        WebhookResult webhookResult = handler.handleWebhook(body, signature);

        return ResponseEntity.ok()
                .header("X-SIGNATURE", webhookResult.getResponseSignature())
                .header("Content-Type", "application/json")
                .body(webhookResult.getResponseBody());
    }
}
```

---

## Test Template (Sandbox Integration)

```java
// src/test/java/com/example/WaffoIntegrationTest.java
package com.example;

import com.waffo.Waffo;
import com.waffo.types.ApiResponse;
import com.waffo.types.config.Environment;
import com.waffo.types.config.WaffoConfig;
import com.waffo.types.iso.CurrencyCode;
import com.waffo.types.order.*;
import com.waffo.types.payment.ProductName;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "WAFFO_API_KEY", matches = ".+")
class WaffoIntegrationTest {

    private static Waffo waffo;

    @BeforeAll
    static void setup() {
        WaffoConfig config = WaffoConfig.builder()
                .apiKey(System.getenv("WAFFO_API_KEY"))
                .privateKey(System.getenv("WAFFO_PRIVATE_KEY"))
                .waffoPublicKey(System.getenv("WAFFO_PUBLIC_KEY"))
                .merchantId(System.getenv("WAFFO_MERCHANT_ID"))
                .environment(Environment.SANDBOX)
                .build();
        waffo = new Waffo(config);
    }

    private static String genRequestId() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    @Test
    void testCreateOrder() {
        String paymentRequestId = genRequestId();

        CreateOrderParams params = CreateOrderParams.builder()
                .paymentRequestId(paymentRequestId)
                .merchantOrderId("test-" + System.currentTimeMillis())
                .orderCurrency(CurrencyCode.USD)
                .orderAmount("1.00")
                .orderDescription("Integration test order")
                .notifyUrl("https://example.com/webhook")
                .successRedirectUrl("https://example.com/success")
                .userInfo(UserInfo.builder()
                        .userId("test-user")
                        .userEmail("test@example.com")
                        .userTerminal(UserTerminalType.WEB)
                        .build())
                .paymentInfo(PaymentInfo.builder()
                        .productName(ProductName.ONE_TIME_PAYMENT)
                        .build())
                .build();

        ApiResponse<CreateOrderData> response = waffo.order().create(params);

        assertTrue(response.isSuccess(), String.format(
                "Create order failed:\n  [Request] paymentRequestId=%s\n  [Response] Code=%s, Message=%s, Data=%s",
                paymentRequestId,
                response.getCode(),
                response.getMessage().orElse("(none)"),
                response.getData().orElse(null)));

        assertNotNull(response.getData().orElseThrow().getAcquiringOrderId());
    }

    @Test
    void testQueryOrder() {
        String paymentRequestId = genRequestId();

        // Create first
        waffo.order().create(CreateOrderParams.builder()
                .paymentRequestId(paymentRequestId)
                .merchantOrderId("test-" + System.currentTimeMillis())
                .orderCurrency(CurrencyCode.USD)
                .orderAmount("1.00")
                .orderDescription("Test")
                .notifyUrl("https://example.com/webhook")
                .successRedirectUrl("https://example.com/success")
                .userInfo(UserInfo.builder().userId("test-user").userEmail("test@example.com").userTerminal(UserTerminalType.WEB).build())
                .paymentInfo(PaymentInfo.builder().productName(ProductName.ONE_TIME_PAYMENT).build())
                .build());

        // Then query
        ApiResponse<InquiryOrderData> response = waffo.order().inquiry(
                InquiryOrderParams.builder().paymentRequestId(paymentRequestId).build());

        assertTrue(response.isSuccess(), String.format(
                "Inquiry failed:\n  [Request] paymentRequestId=%s\n  [Response] Code=%s, Message=%s",
                paymentRequestId,
                response.getCode(),
                response.getMessage().orElse("(none)")));
    }
}
```

---

## Merchant Config & Payment Method Query

```java
// src/main/java/com/example/service/ConfigService.java
package com.example.service;

import com.waffo.Waffo;
import com.waffo.types.ApiResponse;
import com.waffo.types.merchant.InquiryMerchantConfigParams;
import com.waffo.types.merchant.InquiryMerchantConfigData;
import com.waffo.types.merchant.InquiryPayMethodConfigParams;
import com.waffo.types.merchant.InquiryPayMethodConfigData;
import org.springframework.stereotype.Service;

@Service
public class ConfigService {

    private final Waffo waffo;

    public ConfigService(Waffo waffo) {
        this.waffo = waffo;
    }

    public InquiryMerchantConfigData getMerchantConfig() {
        ApiResponse<InquiryMerchantConfigData> response =
                waffo.merchantConfig().inquiry(InquiryMerchantConfigParams.builder().build());

        if (!response.isSuccess()) {
            throw new RuntimeException("Merchant config inquiry failed: " +
                    response.getCode() + " - " + response.getMessage().orElse(""));
        }

        return response.getData().orElseThrow();
    }

    public InquiryPayMethodConfigData getPaymentMethods() {
        ApiResponse<InquiryPayMethodConfigData> response =
                waffo.payMethodConfig().inquiry(InquiryPayMethodConfigParams.builder().build());

        if (!response.isSuccess()) {
            throw new RuntimeException("Pay method inquiry failed: " +
                    response.getCode() + " - " + response.getMessage().orElse(""));
        }

        return response.getData().orElseThrow();
    }
}
```
