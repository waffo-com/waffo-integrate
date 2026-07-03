# 排障手册

当开发者报告具体症状、错误、失败验收项或 Sandbox 行为异常时，加载本文件。先从症状出发收集证据，再分类阻塞原因，最后再决定是否改代码。

## 排障协议

1. 识别症状和受影响功能：payment、refund、subscription、webhook、checkout、pay method、config 或 Sandbox。
2. 按匹配章节收集证据。
3. 在判断根因前，先检查项目代码和当前 inquiry 状态。
4. 将问题分类为 `FIXABLE_CODE`、`FIXABLE_INFRA`、`WAFFO_SUPPORT_REQUIRED`、`MANUAL_REQUIRED` 或 `SKIP_WITH_REASON`。
5. 如果要修代码，遵守 integration verification 的 Loop Mode，并重跑失败项及其依赖项。

## Webhook 收不到或业务状态未更新

| 维度 | 排查内容 |
|---|---|
| 典型症状 | 支付结果页成功但本地订单仍是 pending；inquiry 已成功但权益未发放；服务端没有 webhook 日志。 |
| 证据清单 | `paymentRequestId`、`acquiringOrderID`、`notifyUrl`、order inquiry 结果、server access logs、webhook handler logs、webhook response status/body/headers、tunnel/proxy URL。 |
| 常见原因 | `notifyUrl` 不是公网 HTTPS；tunnel 过期；webhook 路由被鉴权拦住；验签失败但静默丢弃；框架返回错误 `Content-Type`；SDK 验签后业务事务失败。 |
| 下一步 | 校验当前 `notifyUrl`，确认路由鉴权，检查 webhook 响应头，轮询 order inquiry，再根据 Sandbox 能力决定等待或 replay webhook。 |

不能只凭 proxy replay 或本地日志把 Waffo-side delivery 标成已验证。没有一手 Waffo 投递证据时，使用 `PROJECT_SIDE_VERIFIED` 或 `WAFFO_SIDE_UNVERIFIED`。

## Checkout 页面卡住或支付表单失败

| 维度 | 排查内容 |
|---|---|
| 典型症状 | checkout 不加载、表单校验不过、结果页一直 processing、浏览器自动化找不到字段。 |
| 证据清单 | Checkout URL、页面文本/截图、可见字段和按钮、选择的 pay method、country/currency/amount、`userTerminal`、iframe 状态、浏览器/设备。 |
| 常见原因 | 终端或 iframe 上下文错误；缺少 OVO phone、PIX CPF 等特殊参数；checkout 被 `payMethodType` 过滤；页面标签本地化；卡字段需要 sequential typing。 |
| 下一步 | 在分类前先 inspect 页面，记录可见控件，处理本地化标签，使用 batch Playwright protocol，并轮询 inquiry 确认最终状态。 |

## 支付方式不展示

| 维度 | 排查内容 |
|---|---|
| 典型症状 | 已签约方式在 checkout 不可见；pay-method coverage 无法开始。 |
| 证据清单 | `payMethodConfig().inquiry()` 结果、active status、country/currency、项目 order create payload、`payMethodType`、`payMethodName`、checkout 页面方式列表。 |
| 常见原因 | 支付方式未激活；币种/国家不匹配；integrator checkout 请求过滤了方法；APP/设备钱包限制；Sandbox 无模拟器。 |
| 下一步 | 将活跃签约方式与项目 payload 交叉核对；只有请求 payload 能证明被过滤时，才标记 `not checkout-available - filtered by payMethodType (K029)`。 |

## 退款失败

| 维度 | 排查内容 |
|---|---|
| 典型症状 | Refund API 被拒、退款一直 pending、退款 webhook 不到、权益没有回滚。 |
| 证据清单 | 原支付 request/acquiring IDs、已支付来源方式、refund request payload、`refundRequestId`、refund inquiry 结果、webhook 日志、本地权益状态。 |
| 常见原因 | Sandbox 不支持当前来源方式退款；退款币种/金额不匹配；`refundRequestId` 未持久化；e-wallet 退款规则和卡不同。 |
| 下一步 | 有已支付 e-wallet 来源时，优先用 e-wallet 做 refund-webhook；同类失败后继续试同类替代；只有没有已支付 e-wallet 来源时才 fallback 到 card。 |

## 订阅事件缺失或路由错误

| 维度 | 排查内容 |
|---|---|
| 典型症状 | 订阅已激活但续费未处理；`PAYMENT_NOTIFICATION` 把订阅支付当成一次性支付发权益；change event 没处理。 |
| 证据清单 | `subscriptionRequest`、`subscriptionId`、management URL、event type、webhook payload summary、registered handlers、本地订阅状态。 |
| 常见原因 | 缺少 `onSubscriptionPeriodChanged`；`PAYMENT_NOTIFICATION` 没按 `paymentInfo.productName` 路由；未做升降级却注册 change handler；本地记录在外部调用后才创建。 |
| 下一步 | 明确核对订阅事件测试行，检查 handler 注册，并确认一次性支付 fulfilment 不处理订阅支付通知。 |

## Unknown Status 或 Timeout

| 维度 | 排查内容 |
|---|---|
| 典型症状 | SDK 抛出 `WaffoUnknownStatusError`；API timeout；本地订单状态不确定。 |
| 证据清单 | 原始 request ID、request payload、本地持久化记录时间、匹配 inquiry response、retry history。 |
| 常见原因 | request ID 在外部调用后才入库；重试用了新 key；代码在 timeout 后自动关单；缺少 inquiry recovery。 |
| 下一步 | 用同一个 request ID 做 inquiry recovery；本地状态保持非终态，直到 inquiry/webhook 确认终态；重试次数遵守 `business-validation.md`。 |

## 在线文档兜底

当本地手册没有覆盖症状时：

| 需要 | 来源 |
|---|---|
| 最新文档页面发现 | `https://waffo.com/docs/llms.txt` |
| API 字段或枚举事实 | `https://waffo.com/docs/api-reference/openapi.json` |
| 产品/场景解释 | `https://waffo.com/docs/en/essentials/product-overview` |
| 全量文档包 | `https://waffo.com/docs/llms-full.txt` |

如果在线文档影响诊断或下一步动作，需要在最终回答或支持包中写明来源。

