# Go Integration Templates

## Module

```
github.com/waffo-com/waffo-go
```

Install:
```bash
go get github.com/waffo-com/waffo-go@latest
```

---

## SDK Initialization

```go
// internal/waffo/client.go
package waffo

import (
	"os"
	"sync"

	waffogo "github.com/waffo-com/waffo-go"
	"github.com/waffo-com/waffo-go/config"
)

var (
	instance *waffogo.Waffo
	once     sync.Once
)

func GetClient() *waffogo.Waffo {
	once.Do(func() {
		env := config.Sandbox
		if os.Getenv("WAFFO_ENVIRONMENT") == "PRODUCTION" {
			env = config.Production
		}

		cfg := config.WaffoConfig{
			ApiKey:         os.Getenv("WAFFO_API_KEY"),
			PrivateKey:     os.Getenv("WAFFO_PRIVATE_KEY"),
			WaffoPublicKey: os.Getenv("WAFFO_PUBLIC_KEY"),
			MerchantId:     os.Getenv("WAFFO_MERCHANT_ID"),
			Environment:    env,
		}

		instance = waffogo.NewWaffo(cfg)
	})
	return instance
}
```

---

## Order Payment

```go
// internal/waffo/payment.go
package waffo

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/waffo-com/waffo-go/types/order"
)

type CreatePaymentInput struct {
	MerchantOrderId    string
	Amount             string
	Currency           string
	Description        string
	NotifyUrl          string
	SuccessRedirectUrl string
	UserId             string
	UserEmail          string
	UserTerminal       string // WEB | APP | WAP | SYSTEM (default: WEB)
	PayMethodType      string // optional: "CREDITCARD", "EWALLET"
	PayMethodName      string // optional: "CC_VISA", "DANA"
}

// genRequestID generates a 32-char request ID (UUID without dashes, max length 32)
func genRequestID() string {
	return strings.ReplaceAll(uuid.New().String(), "-", "")
}

func CreatePayment(ctx context.Context, input CreatePaymentInput) (*order.CreateOrderData, error) {
	client := GetClient()

	userTerminal := input.UserTerminal
	if userTerminal == "" {
		userTerminal = "WEB"
	}

	params := order.CreateOrderParams{
		PaymentRequestId:   genRequestID(),
		MerchantOrderId:    input.MerchantOrderId,
		OrderCurrency:      input.Currency,
		OrderAmount:        input.Amount,
		OrderDescription:   input.Description,
		NotifyUrl:          input.NotifyUrl,
		SuccessRedirectUrl: input.SuccessRedirectUrl,
		UserInfo: &order.UserInfo{
			UserId:       input.UserId,
			UserEmail:    input.UserEmail,
			UserTerminal: userTerminal,
		},
		PaymentInfo: &order.PaymentInfo{
			ProductName:   "ONE_TIME_PAYMENT",
			PayMethodType: input.PayMethodType,
			PayMethodName: input.PayMethodName,
		},
	}

	resp, err := client.Order().Create(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("create payment error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("create payment failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	data := resp.GetData()
	return &data, nil
}

func QueryOrder(ctx context.Context, paymentRequestId string) (*order.InquiryOrderData, error) {
	client := GetClient()

	resp, err := client.Order().Inquiry(ctx, order.InquiryOrderParams{
		PaymentRequestId: paymentRequestId,
	})
	if err != nil {
		return nil, fmt.Errorf("inquiry error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("inquiry failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	data := resp.GetData()
	return &data, nil
}

func CancelOrder(ctx context.Context, paymentRequestId string) (*order.CancelOrderData, error) {
	client := GetClient()

	resp, err := client.Order().Cancel(ctx, order.CancelOrderParams{
		PaymentRequestId: paymentRequestId,
	})
	if err != nil {
		return nil, fmt.Errorf("cancel error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("cancel failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	data := resp.GetData()
	return &data, nil
}
```

---

## Refund

```go
// internal/waffo/refund.go
package waffo

import (
	"context"
	"fmt"

	"strings"

	"github.com/google/uuid"
	"github.com/waffo-com/waffo-go/types/order"
	"github.com/waffo-com/waffo-go/types/refund"
)

func RefundOrder(ctx context.Context, origPaymentRequestId, refundAmount, refundReason string) (*order.RefundOrderData, error) {
	client := GetClient()

	params := order.RefundOrderParams{
		RefundRequestId:      strings.ReplaceAll(uuid.New().String(), "-", ""),
		OrigPaymentRequestId: origPaymentRequestId,
		RefundAmount:         refundAmount,
		RefundReason:         refundReason,
	}

	resp, err := client.Order().Refund(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("refund error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("refund failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	data := resp.GetData()
	return &data, nil
}

func QueryRefund(ctx context.Context, refundRequestId string) (*refund.InquiryRefundData, error) {
	client := GetClient()

	resp, err := client.Refund().Inquiry(ctx, refund.InquiryRefundParams{
		RefundRequestId: refundRequestId,
	})
	if err != nil {
		return nil, fmt.Errorf("refund inquiry error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("refund inquiry failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	data := resp.GetData()
	return &data, nil
}
```

---

## Subscription

```go
// internal/waffo/subscription.go
package waffo

import (
	"context"
	"fmt"

	"strings"

	"github.com/google/uuid"
	"github.com/waffo-com/waffo-go/types/subscription"
)

type CreateSubscriptionInput struct {
	MerchantSubscriptionId string
	Amount                 string
	Currency               string
	Description            string
	NotifyUrl              string
	UserId                 string
	UserEmail              string
	ProductId              string
	ProductName            string
	PeriodType             string // DAILY, WEEKLY, MONTHLY
	PeriodInterval         string
	GoodsId                string
	GoodsName              string
	GoodsUrl               string
	SuccessRedirectUrl     string
}

func CreateSubscription(ctx context.Context, input CreateSubscriptionInput) (*subscription.CreateSubscriptionData, error) {
	client := GetClient()

	params := subscription.CreateSubscriptionParams{
		SubscriptionRequest:    strings.ReplaceAll(uuid.New().String(), "-", ""),
		MerchantSubscriptionId: input.MerchantSubscriptionId,
		Currency:               input.Currency,
		Amount:                 input.Amount,
		OrderDescription:       input.Description,
		NotifyUrl:              input.NotifyUrl,
		SuccessRedirectUrl:     input.SuccessRedirectUrl,
		ProductInfo: &subscription.ProductInfo{
			ProductId:      input.ProductId,
			ProductName:    input.ProductName,
			Description:    input.Description,
			PeriodType:     input.PeriodType,
			PeriodInterval: input.PeriodInterval,
		},
		GoodsInfo: &subscription.GoodsInfo{
			GoodsId:   input.GoodsId,
			GoodsName: input.GoodsName,
			GoodsUrl:  input.GoodsUrl,
		},
		UserInfo: &subscription.UserInfo{
			UserId:       input.UserId,
			UserEmail:    input.UserEmail,
			UserTerminal: input.UserTerminal, // WEB for PC, APP for mobile/tablet
		},
		PaymentInfo: &subscription.PaymentInfo{
			ProductName:   "SUBSCRIPTION",
			PayMethodType: "CREDITCARD,DEBITCARD,APPLEPAY,GOOGLEPAY",
		},
	}

	resp, err := client.Subscription().Create(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("create subscription error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("create subscription failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	data := resp.GetData()
	return &data, nil
}

func QuerySubscription(ctx context.Context, subscriptionRequest string) (*subscription.InquirySubscriptionData, error) {
	client := GetClient()

	resp, err := client.Subscription().Inquiry(ctx, subscription.InquirySubscriptionParams{
		SubscriptionRequest: subscriptionRequest,
	})
	if err != nil {
		return nil, fmt.Errorf("inquiry error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("inquiry failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	data := resp.GetData()
	return &data, nil
}

func CancelSubscription(ctx context.Context, subscriptionRequest string) (*subscription.CancelSubscriptionData, error) {
	client := GetClient()

	resp, err := client.Subscription().Cancel(ctx, subscription.CancelSubscriptionParams{
		SubscriptionRequest: subscriptionRequest,
	})
	if err != nil {
		return nil, fmt.Errorf("cancel error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("cancel failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	data := resp.GetData()
	return &data, nil
}

// ManageSubscription returns a management URL for the subscription.
// Only works when the subscription is ACTIVE.
func ManageSubscription(ctx context.Context, subscriptionRequest string) (string, error) {
	client := GetClient()

	params := subscription.ManageSubscriptionParams{
		SubscriptionRequest: subscriptionRequest,
	}

	resp, err := client.Subscription().Manage(ctx, params)
	if err != nil {
		return "", fmt.Errorf("manage error: %w", err)
	}

	if !resp.IsSuccess() {
		return "", fmt.Errorf("manage failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	managementURL := resp.GetData().ManagementURL
	return managementURL, nil
}
```

---

## Webhook Handler

### Gin

```go
// internal/waffo/webhook.go
package waffo

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

func WebhookHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		client := GetClient()

		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read body"})
			return
		}

		signature := c.GetHeader("X-SIGNATURE")

		handler := client.Webhook().
			OnPayment(func(notification map[string]interface{}) {
				result, _ := notification["result"].(map[string]interface{})
				// TODO: Update your order status in database
				_ = result
			}).
			OnRefund(func(notification map[string]interface{}) {
				result, _ := notification["result"].(map[string]interface{})
				// TODO: Update your refund status in database
				_ = result
			}).
			OnSubscriptionStatus(func(notification map[string]interface{}) {
				result, _ := notification["result"].(map[string]interface{})
				// TODO: Update your subscription status in database
				_ = result
			}).
			OnSubscriptionPeriodChanged(func(notification map[string]interface{}) {
				result, _ := notification["result"].(map[string]interface{})
				// TODO: Record billing period result
				_ = result
			}).
			OnSubscriptionChange(func(notification map[string]interface{}) {
				result, _ := notification["result"].(map[string]interface{})
				// TODO: Handle subscription upgrade/downgrade
				_ = result
			})

		webhookResult := handler.HandleWebhook(string(body), signature)

		c.Header("X-SIGNATURE", webhookResult.ResponseSignature)
		c.String(http.StatusOK, webhookResult.ResponseBody)
	}
}
```

### Echo

```go
// internal/waffo/webhook_echo.go
package waffo

import (
	"io"
	"net/http"

	"github.com/labstack/echo/v4"
)

func WebhookEchoHandler(c echo.Context) error {
	client := GetClient()

	body, err := io.ReadAll(c.Request().Body)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "failed to read body"})
	}

	signature := c.Request().Header.Get("X-SIGNATURE")

	handler := client.Webhook().
		OnPayment(func(notification map[string]interface{}) {
			// TODO: Handle payment
		}).
		OnRefund(func(notification map[string]interface{}) {
			// TODO: Handle refund
		})

	webhookResult := handler.HandleWebhook(string(body), signature)

	c.Response().Header().Set("X-SIGNATURE", webhookResult.ResponseSignature)
	return c.String(http.StatusOK, webhookResult.ResponseBody)
}
```

### Fiber

```go
// internal/waffo/webhook_fiber.go
package waffo

import (
	"github.com/gofiber/fiber/v2"
)

func WebhookFiberHandler(c *fiber.Ctx) error {
	client := GetClient()

	body := string(c.Body())
	signature := c.Get("X-SIGNATURE")

	handler := client.Webhook().
		OnPayment(func(notification map[string]interface{}) {
			// TODO: Handle payment
		}).
		OnRefund(func(notification map[string]interface{}) {
			// TODO: Handle refund
		})

	webhookResult := handler.HandleWebhook(body, signature)

	c.Set("X-SIGNATURE", webhookResult.ResponseSignature)
	return c.SendString(webhookResult.ResponseBody)
}
```

---

## Test Template (Sandbox Integration)

```go
// internal/waffo/waffo_test.go
package waffo_test

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	waffogo "github.com/waffo-com/waffo-go"
	"github.com/waffo-com/waffo-go/config"
	"github.com/waffo-com/waffo-go/types/order"
)

func hasCredentials() bool {
	return os.Getenv("WAFFO_API_KEY") != "" &&
		os.Getenv("WAFFO_PRIVATE_KEY") != "" &&
		os.Getenv("WAFFO_PUBLIC_KEY") != "" &&
		os.Getenv("WAFFO_MERCHANT_ID") != ""
}

func newTestClient(t *testing.T) *waffogo.Waffo {
	t.Helper()
	if !hasCredentials() {
		t.Skip("Waffo credentials not configured, skipping Sandbox test")
	}

	cfg := config.WaffoConfig{
		ApiKey:         os.Getenv("WAFFO_API_KEY"),
		PrivateKey:     os.Getenv("WAFFO_PRIVATE_KEY"),
		WaffoPublicKey: os.Getenv("WAFFO_PUBLIC_KEY"),
		MerchantId:     os.Getenv("WAFFO_MERCHANT_ID"),
		Environment:    config.Sandbox,
	}

	return waffogo.NewWaffo(cfg)
}

func genRequestID() string {
	return strings.ReplaceAll(uuid.New().String(), "-", "")
}

func TestCreateOrder(t *testing.T) {
	client := newTestClient(t)
	ctx := context.Background()
	paymentRequestID := genRequestID()

	params := order.CreateOrderParams{
		PaymentRequestId:   paymentRequestID,
		MerchantOrderId:    "test-go-" + uuid.New().String()[:8],
		OrderCurrency:      "USD",
		OrderAmount:        "1.00",
		OrderDescription:   "Go integration test order",
		NotifyUrl:          "https://example.com/webhook",
		SuccessRedirectUrl: "https://example.com/success",
		UserInfo: &order.UserInfo{
			UserId:       "test-user",
			UserEmail:    "test@example.com",
			UserTerminal: "WEB",
		},
		PaymentInfo: &order.PaymentInfo{
			ProductName: "ONE_TIME_PAYMENT",
		},
	}

	resp, err := client.Order().Create(ctx, params)
	if err != nil {
		t.Fatalf("Create order error: paymentRequestID=%s, err=%v", paymentRequestID, err)
	}

	if !resp.IsSuccess() {
		t.Fatalf("Create order failed: paymentRequestID=%s, code=%s, msg=%s, data=%+v",
			paymentRequestID, resp.GetCode(), resp.GetMessage(), resp.GetData())
	}

	data := resp.GetData()
	if data.AcquiringOrderId == "" {
		t.Fatal("AcquiringOrderId is empty")
	}
	t.Logf("Order created: acquiringOrderId=%s", data.AcquiringOrderId)
}

func TestQueryOrder(t *testing.T) {
	client := newTestClient(t)
	ctx := context.Background()
	paymentRequestID := genRequestID()

	// Create first
	_, err := client.Order().Create(ctx, order.CreateOrderParams{
		PaymentRequestId:   paymentRequestID,
		MerchantOrderId:    "test-go-" + uuid.New().String()[:8],
		OrderCurrency:      "USD",
		OrderAmount:        "1.00",
		OrderDescription:   "Test",
		NotifyUrl:          "https://example.com/webhook",
		SuccessRedirectUrl: "https://example.com/success",
		UserInfo:           &order.UserInfo{UserId: "test-user", UserEmail: "test@example.com", UserTerminal: "WEB"},
		PaymentInfo:        &order.PaymentInfo{ProductName: "ONE_TIME_PAYMENT"},
	})
	if err != nil {
		t.Fatalf("Create order error: %v", err)
	}

	// Then query
	resp, err := client.Order().Inquiry(ctx, order.InquiryOrderParams{
		PaymentRequestId: paymentRequestID,
	})
	if err != nil {
		t.Fatalf("Inquiry error: paymentRequestID=%s, err=%v", paymentRequestID, err)
	}

	if !resp.IsSuccess() {
		t.Fatalf("Inquiry failed: paymentRequestID=%s, code=%s, msg=%s",
			paymentRequestID, resp.GetCode(), resp.GetMessage())
	}
}
```

---

## Merchant Config & Payment Method Query

```go
// internal/waffo/config_query.go
package waffo

import (
	"context"
	"fmt"

	"github.com/waffo-com/waffo-go/types/merchant"
	"github.com/waffo-com/waffo-go/types/paymethod"
)

func GetMerchantConfig(ctx context.Context) (*merchant.InquiryMerchantConfigData, error) {
	client := GetClient()

	resp, err := client.MerchantConfig().Inquiry(ctx, merchant.InquiryMerchantConfigParams{})
	if err != nil {
		return nil, fmt.Errorf("merchant config error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("merchant config failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	data := resp.GetData()
	return &data, nil
}

func GetPaymentMethods(ctx context.Context) (*paymethod.InquiryPayMethodConfigData, error) {
	client := GetClient()

	resp, err := client.PayMethodConfig().Inquiry(ctx, paymethod.InquiryPayMethodConfigParams{})
	if err != nil {
		return nil, fmt.Errorf("pay method error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("pay method failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	data := resp.GetData()
	return &data, nil
}
```
