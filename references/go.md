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

		cfg := &config.WaffoConfig{
			APIKey:         os.Getenv("WAFFO_API_KEY"),
			PrivateKey:     os.Getenv("WAFFO_PRIVATE_KEY"),
			WaffoPublicKey: os.Getenv("WAFFO_PUBLIC_KEY"),
			MerchantID:     os.Getenv("WAFFO_MERCHANT_ID"),
			Environment:    env,
		}

		instance = waffogo.New(cfg)
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
	MerchantOrderID    string
	Amount             string
	Currency           string
	Description        string
	NotifyURL          string
	SuccessRedirectURL string
	UserID             string
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

	params := &order.CreateOrderParams{
		PaymentRequestID:   genRequestID(),
		MerchantOrderID:    input.MerchantOrderID,
		OrderCurrency:      input.Currency,
		OrderAmount:        input.Amount,
		OrderDescription:   input.Description,
		NotifyURL:          input.NotifyURL,
		SuccessRedirectURL: input.SuccessRedirectURL,
		UserInfo: &order.UserInfo{
			UserID:       input.UserID,
			UserEmail:    input.UserEmail,
			UserTerminal: userTerminal,
		},
		PaymentInfo: &order.PaymentInfo{
			ProductName:   "ONE_TIME_PAYMENT",
			PayMethodType: input.PayMethodType,
			PayMethodName: input.PayMethodName,
		},
	}

	resp, err := client.Order().Create(ctx, params, nil)
	if err != nil {
		return nil, fmt.Errorf("create payment error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("create payment failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	return resp.GetData(), nil
}

func QueryOrder(ctx context.Context, paymentRequestID string) (*order.InquiryOrderData, error) {
	client := GetClient()

	resp, err := client.Order().Inquiry(ctx, &order.InquiryOrderParams{
		PaymentRequestID: paymentRequestID,
	}, nil)
	if err != nil {
		return nil, fmt.Errorf("inquiry error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("inquiry failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	return resp.GetData(), nil
}

func CancelOrder(ctx context.Context, paymentRequestID string) (*order.CancelOrderData, error) {
	client := GetClient()

	resp, err := client.Order().Cancel(ctx, &order.CancelOrderParams{
		PaymentRequestID: paymentRequestID,
	}, nil)
	if err != nil {
		return nil, fmt.Errorf("cancel error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("cancel failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	return resp.GetData(), nil
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

func RefundOrder(ctx context.Context, acquiringOrderID, refundAmount, refundReason, notifyURL string) (*order.RefundOrderData, error) {
	client := GetClient()

	params := &order.RefundOrderParams{
		RefundRequestID:  strings.ReplaceAll(uuid.New().String(), "-", ""),
		AcquiringOrderID: acquiringOrderID,
		RefundAmount:     refundAmount,
		RefundReason:     refundReason,
		NotifyURL:        notifyURL,
	}

	resp, err := client.Order().Refund(ctx, params, nil)
	if err != nil {
		return nil, fmt.Errorf("refund error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("refund failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	return resp.GetData(), nil
}

func QueryRefund(ctx context.Context, refundRequestID string) (*refund.InquiryRefundData, error) {
	client := GetClient()

	resp, err := client.Refund().Inquiry(ctx, &refund.InquiryRefundParams{
		RefundRequestID: refundRequestID,
	}, nil)
	if err != nil {
		return nil, fmt.Errorf("refund inquiry error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("refund inquiry failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	return resp.GetData(), nil
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
	MerchantSubscriptionID string
	Amount                 string
	Currency               string
	Description            string
	NotifyURL              string
	SuccessRedirectURL     string
	UserID                 string
	UserEmail              string
	UserTerminal           string // WEB | APP | WAP | SYSTEM (default: WEB)
	PeriodType             string // DAILY, WEEKLY, MONTHLY
	PeriodInterval         string
	GoodsID                string
	GoodsName              string
	GoodsURL               string
	PayMethodType          string // default: "CREDITCARD,DEBITCARD,APPLEPAY,GOOGLEPAY"
}

func CreateSubscription(ctx context.Context, input CreateSubscriptionInput) (*subscription.CreateSubscriptionData, error) {
	client := GetClient()

	userTerminal := input.UserTerminal
	if userTerminal == "" {
		userTerminal = "WEB"
	}

	payMethodType := input.PayMethodType
	if payMethodType == "" {
		payMethodType = "CREDITCARD,DEBITCARD,APPLEPAY,GOOGLEPAY"
	}

	params := &subscription.CreateSubscriptionParams{
		SubscriptionRequest:    strings.ReplaceAll(uuid.New().String(), "-", ""),
		MerchantSubscriptionID: input.MerchantSubscriptionID,
		Currency:               input.Currency,
		Amount:                 input.Amount,
		NotifyURL:              input.NotifyURL,
		SuccessRedirectURL:     input.SuccessRedirectURL,
		ProductInfo: &subscription.ProductInfo{
			Description:    input.Description,
			PeriodType:     input.PeriodType,
			PeriodInterval: input.PeriodInterval,
		},
		GoodsInfo: &subscription.SubscriptionGoodsInfo{
			GoodsID:   input.GoodsID,
			GoodsName: input.GoodsName,
			GoodsURL:  input.GoodsURL,
		},
		UserInfo: &subscription.SubscriptionUserInfo{
			UserID:       input.UserID,
			UserEmail:    input.UserEmail,
			UserTerminal: userTerminal,
		},
		PaymentInfo: &subscription.SubscriptionPaymentInfo{
			ProductName:   "SUBSCRIPTION",
			PayMethodType: payMethodType,
		},
	}

	resp, err := client.Subscription().Create(ctx, params, nil)
	if err != nil {
		return nil, fmt.Errorf("create subscription error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("create subscription failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	return resp.GetData(), nil
}

func QuerySubscription(ctx context.Context, subscriptionRequest string) (*subscription.InquirySubscriptionData, error) {
	client := GetClient()

	resp, err := client.Subscription().Inquiry(ctx, &subscription.InquirySubscriptionParams{
		SubscriptionRequest: subscriptionRequest,
	}, nil)
	if err != nil {
		return nil, fmt.Errorf("inquiry error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("inquiry failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	return resp.GetData(), nil
}

func CancelSubscription(ctx context.Context, subscriptionID string) (*subscription.CancelSubscriptionData, error) {
	client := GetClient()

	resp, err := client.Subscription().Cancel(ctx, &subscription.CancelSubscriptionParams{
		SubscriptionID: subscriptionID,
	}, nil)
	if err != nil {
		return nil, fmt.Errorf("cancel error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("cancel failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	return resp.GetData(), nil
}

// ManageSubscription returns a management URL for the subscription.
// Only works when the subscription is ACTIVE.
func ManageSubscription(ctx context.Context, subscriptionRequest string) (string, error) {
	client := GetClient()

	resp, err := client.Subscription().Manage(ctx, &subscription.ManageSubscriptionParams{
		SubscriptionRequest: subscriptionRequest,
	}, nil)
	if err != nil {
		return "", fmt.Errorf("manage error: %w", err)
	}

	if !resp.IsSuccess() {
		return "", fmt.Errorf("manage failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	return resp.GetData().ManagementURL, nil
}

// ChangeSubscription upgrades or downgrades an existing subscription.
func ChangeSubscription(ctx context.Context, originSubscriptionRequest string, input CreateSubscriptionInput) (*subscription.ChangeSubscriptionData, error) {
	client := GetClient()

	userTerminal := input.UserTerminal
	if userTerminal == "" {
		userTerminal = "WEB"
	}

	payMethodType := input.PayMethodType
	if payMethodType == "" {
		payMethodType = "CREDITCARD,DEBITCARD,APPLEPAY,GOOGLEPAY"
	}

	params := &subscription.ChangeSubscriptionParams{
		SubscriptionRequest:       strings.ReplaceAll(uuid.New().String(), "-", ""),
		OriginSubscriptionRequest: originSubscriptionRequest,
		Currency:                  input.Currency,
		NotifyURL:                 input.NotifyURL,
		SuccessRedirectURL:        input.SuccessRedirectURL,
		ProductInfoList: []subscription.SubscriptionChangeProductInfo{
			{
				Description:    input.Description,
				PeriodType:     input.PeriodType,
				PeriodInterval: input.PeriodInterval,
				Amount:         input.Amount,
			},
		},
		MerchantInfo: &subscription.SubscriptionMerchantInfo{},
		UserInfo: &subscription.SubscriptionUserInfo{
			UserID:       input.UserID,
			UserEmail:    input.UserEmail,
			UserTerminal: userTerminal,
		},
		GoodsInfo: &subscription.SubscriptionGoodsInfo{
			GoodsID:   input.GoodsID,
			GoodsName: input.GoodsName,
			GoodsURL:  input.GoodsURL,
		},
		PaymentInfo: &subscription.SubscriptionPaymentInfo{
			ProductName:   "SUBSCRIPTION",
			PayMethodType: payMethodType,
		},
	}

	resp, err := client.Subscription().Change(ctx, params, nil)
	if err != nil {
		return nil, fmt.Errorf("change subscription error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("change subscription failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	return resp.GetData(), nil
}

func ChangeInquiry(ctx context.Context, originSubscriptionRequest, subscriptionRequest string) (*subscription.ChangeInquiryData, error) {
	client := GetClient()

	resp, err := client.Subscription().ChangeInquiry(ctx, &subscription.ChangeInquiryParams{
		OriginSubscriptionRequest: originSubscriptionRequest,
		SubscriptionRequest:       subscriptionRequest,
	}, nil)
	if err != nil {
		return nil, fmt.Errorf("change inquiry error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("change inquiry failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	return resp.GetData(), nil
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
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/waffo-com/waffo-go/core"
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
			OnPayment(func(n *core.PaymentNotification) {
				// NOTE: If Subscription is also integrated, add this filter to skip subscription payments:
				// if n.Result.PaymentInfo != nil {
				//     pn := n.Result.PaymentInfo.ProductName
				//     if pn == "SUBSCRIPTION" || pn == "MINI_PROGRAM_SUBSCRIPTION" {
				//         // Subscription payments are handled by onSubscriptionStatus / onSubscriptionPeriodChanged
				//         // If you need to handle failed orders during subscription billing, add logic here
				//         return
				//     }
				// }

				// Three-stage pattern: idempotency → lock → transaction
				// Stage 1: Find local order by paymentRequestID, skip if already terminal
				// Stage 2: Lock the order (mutex or DB row lock) to prevent duplicate processing
				// Stage 3: In a DB transaction — update status + execute business logic
				//
				// Key fields: n.Result.PaymentRequestID, n.Result.OrderStatus, n.Result.AcquiringOrderID
				// PAY_SUCCESS → execute business logic (e.g., add balance/quota)
				// ORDER_CLOSE → mark order as expired/failed
				log.Printf("Payment notification: paymentRequestID=%s, orderStatus=%s, acquiringOrderID=%s",
					n.Result.PaymentRequestID, n.Result.OrderStatus, n.Result.AcquiringOrderID)
			}).
			OnRefund(func(n *core.RefundNotification) {
				// Three-stage pattern: idempotency → lock → transaction
				// IMPORTANT: Refund notification identifies orders by acquiringOrderID (NOT paymentRequestID).
				// You must have stored acquiringOrderID from the order create response to look up the local order.
				// Key fields: n.Result.AcquiringOrderID, n.Result.RefundStatus, n.Result.RefundRequestID
				// ORDER_FULLY_REFUNDED → mark order as refunded
				// ORDER_PARTIALLY_REFUNDED → update partial refund state
				log.Printf("Refund notification: acquiringOrderID=%s, refundStatus=%s, refundRequestID=%s",
					n.Result.AcquiringOrderID, n.Result.RefundStatus, n.Result.RefundRequestID)
			}).
			OnSubscriptionStatus(func(n *core.SubscriptionStatusNotification) {
				// Three-stage pattern: idempotency → lock → transaction
				// Look up local record by subscriptionRequest (must have been created during subscription create)
				// Key fields: n.Result.SubscriptionRequest, n.Result.SubscriptionStatus, n.Result.SubscriptionID
				// ACTIVE → activate subscription / grant access
				// MERCHANT_CANCELLED/USER_CANCELLED/EXPIRED/CLOSE → revoke access
				log.Printf("Subscription status: subscriptionRequest=%s, status=%s, subscriptionID=%s",
					n.Result.SubscriptionRequest, n.Result.SubscriptionStatus, n.Result.SubscriptionID)
			}).
			OnSubscriptionPeriodChanged(func(n *core.SubscriptionPeriodChangedNotification) {
				// Look up local record by subscriptionRequest
				// Record the renewal and extend user access for the next billing period
				log.Printf("Subscription period changed: subscriptionRequest=%s, subscriptionID=%s",
					n.Result.SubscriptionRequest, n.Result.SubscriptionID)
			}).
			OnSubscriptionChange(func(n *core.SubscriptionChangeNotification) {
				// Handle upgrade/downgrade result
				// Key fields: n.Result.SubscriptionChangeStatus, n.Result.OriginSubscriptionRequest, n.Result.SubscriptionRequest
				log.Printf("Subscription change: changeStatus=%s, subscriptionID=%s",
					n.Result.SubscriptionChangeStatus, n.Result.SubscriptionID)
			})

		webhookResult := handler.HandleWebhook(string(body), signature)

		c.Header("X-SIGNATURE", webhookResult.ResponseSignature)
		c.Header("Content-Type", "application/json")
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
	"log"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/waffo-com/waffo-go/core"
)

func WebhookEchoHandler(c echo.Context) error {
	client := GetClient()

	body, err := io.ReadAll(c.Request().Body)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "failed to read body"})
	}

	signature := c.Request().Header.Get("X-SIGNATURE")

	handler := client.Webhook().
		OnPayment(func(n *core.PaymentNotification) {
			// NOTE: If Subscription is also integrated, uncomment this filter:
			// pn := n.Result.PaymentInfo.ProductName
			// if pn == "SUBSCRIPTION" || pn == "MINI_PROGRAM_SUBSCRIPTION" { return }
			log.Printf("Payment: status=%s", n.Result.OrderStatus)
		}).
		OnRefund(func(n *core.RefundNotification) {
			log.Printf("Refund: status=%s", n.Result.RefundStatus)
		})

	webhookResult := handler.HandleWebhook(string(body), signature)

	c.Response().Header().Set("X-SIGNATURE", webhookResult.ResponseSignature)
	c.Response().Header().Set("Content-Type", "application/json")
	return c.String(http.StatusOK, webhookResult.ResponseBody)
}
```

### Fiber

```go
// internal/waffo/webhook_fiber.go
package waffo

import (
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/waffo-com/waffo-go/core"
)

func WebhookFiberHandler(c *fiber.Ctx) error {
	client := GetClient()

	body := string(c.Body())
	signature := c.Get("X-SIGNATURE")

	handler := client.Webhook().
		OnPayment(func(n *core.PaymentNotification) {
			// NOTE: If Subscription is also integrated, uncomment this filter:
			// pn := n.Result.PaymentInfo.ProductName
			// if pn == "SUBSCRIPTION" || pn == "MINI_PROGRAM_SUBSCRIPTION" { return }
			log.Printf("Payment: status=%s", n.Result.OrderStatus)
		}).
		OnRefund(func(n *core.RefundNotification) {
			log.Printf("Refund: status=%s", n.Result.RefundStatus)
		})

	webhookResult := handler.HandleWebhook(body, signature)

	c.Set("X-SIGNATURE", webhookResult.ResponseSignature)
	c.Set("Content-Type", "application/json")
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

	cfg := &config.WaffoConfig{
		APIKey:         os.Getenv("WAFFO_API_KEY"),
		PrivateKey:     os.Getenv("WAFFO_PRIVATE_KEY"),
		WaffoPublicKey: os.Getenv("WAFFO_PUBLIC_KEY"),
		MerchantID:     os.Getenv("WAFFO_MERCHANT_ID"),
		Environment:    config.Sandbox,
	}

	return waffogo.New(cfg)
}

func genTestRequestID() string {
	return strings.ReplaceAll(uuid.New().String(), "-", "")
}

func TestCreateOrder(t *testing.T) {
	client := newTestClient(t)
	ctx := context.Background()
	paymentRequestID := genTestRequestID()

	params := &order.CreateOrderParams{
		PaymentRequestID:   paymentRequestID,
		MerchantOrderID:    "test-go-" + uuid.New().String()[:8],
		OrderCurrency:      "USD",
		OrderAmount:        "1.00",
		OrderDescription:   "Go integration test order",
		NotifyURL:          "https://example.com/webhook",
		SuccessRedirectURL: "https://example.com/success",
		UserInfo: &order.UserInfo{
			UserID:       "test-user",
			UserEmail:    "test@example.com",
			UserTerminal: "WEB",
		},
		PaymentInfo: &order.PaymentInfo{
			ProductName: "ONE_TIME_PAYMENT",
		},
	}

	resp, err := client.Order().Create(ctx, params, nil)
	if err != nil {
		t.Fatalf("Create order error: paymentRequestID=%s, err=%v", paymentRequestID, err)
	}

	if !resp.IsSuccess() {
		t.Fatalf("Create order failed: paymentRequestID=%s, code=%s, msg=%s, data=%+v",
			paymentRequestID, resp.GetCode(), resp.GetMessage(), resp.GetData())
	}

	data := resp.GetData()
	if data.AcquiringOrderID == "" {
		t.Fatal("AcquiringOrderID is empty")
	}

	// Use FetchRedirectURL() to get the checkout URL
	redirectURL := data.FetchRedirectURL()
	t.Logf("Order created: acquiringOrderID=%s, redirectURL=%s", data.AcquiringOrderID, redirectURL)
}

func TestQueryOrder(t *testing.T) {
	client := newTestClient(t)
	ctx := context.Background()
	paymentRequestID := genTestRequestID()

	// Create first
	_, err := client.Order().Create(ctx, &order.CreateOrderParams{
		PaymentRequestID:   paymentRequestID,
		MerchantOrderID:    "test-go-" + uuid.New().String()[:8],
		OrderCurrency:      "USD",
		OrderAmount:        "1.00",
		OrderDescription:   "Test",
		NotifyURL:          "https://example.com/webhook",
		SuccessRedirectURL: "https://example.com/success",
		UserInfo:           &order.UserInfo{UserID: "test-user", UserEmail: "test@example.com", UserTerminal: "WEB"},
		PaymentInfo:        &order.PaymentInfo{ProductName: "ONE_TIME_PAYMENT"},
	}, nil)
	if err != nil {
		t.Fatalf("Create order error: %v", err)
	}

	// Then query
	resp, err := client.Order().Inquiry(ctx, &order.InquiryOrderParams{
		PaymentRequestID: paymentRequestID,
	}, nil)
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
)

func GetMerchantConfig(ctx context.Context) (*merchant.InquiryMerchantConfigData, error) {
	client := GetClient()

	resp, err := client.MerchantConfig().Inquiry(ctx, &merchant.InquiryMerchantConfigParams{}, nil)
	if err != nil {
		return nil, fmt.Errorf("merchant config error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("merchant config failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	return resp.GetData(), nil
}

func GetPaymentMethods(ctx context.Context) (*merchant.InquiryPayMethodConfigData, error) {
	client := GetClient()

	resp, err := client.PayMethodConfig().Inquiry(ctx, &merchant.InquiryPayMethodConfigParams{}, nil)
	if err != nil {
		return nil, fmt.Errorf("pay method error: %w", err)
	}

	if !resp.IsSuccess() {
		return nil, fmt.Errorf("pay method failed: code=%s, msg=%s",
			resp.GetCode(), resp.GetMessage())
	}

	return resp.GetData(), nil
}
```
