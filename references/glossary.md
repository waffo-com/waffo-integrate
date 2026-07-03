# Waffo 术语表

当需要写客户可读回复、双语验收报告或支持排障包时，加载本文件。API 路径、SDK 方法名、字段名、枚举值、错误码和事件名必须保留英文原文。

## 使用规则

| 规则 | 说明 |
|---|---|
| API 标识符 | 不翻译 `order().create()`、`payMethodConfig().inquiry()`、`paymentRequestId`、`acquiringOrderID`、`PAYMENT_NOTIFICATION` 等标识符。 |
| 中文报告 | 业务标签优先用中文；必要时在括号中保留 API 标识符。 |
| 英文报告 | 使用英文术语；只有受众熟悉时才保留 “A单” 这类中文团队简称。 |
| 证据标签 | 使用 `references/acceptance-criteria.md` 中定义的证据状态；不能给未验证证据自造 PASS 标签。 |

## 核心术语

| 中文 | English | 说明 |
|---|---|---|
| Waffo SDK 集成 | Waffo SDK integration | 商户系统内的项目级 SDK 集成。 |
| 项目端接口 | project endpoint | 商户项目自己的 HTTP/RPC 入口，不是 Waffo API。 |
| Waffo API | Waffo API | 项目通过 SDK/API 调用的外部 Waffo 能力。 |
| 一次性支付 | one-time payment | API product name 可出现为 `ONE_TIME_PAYMENT`。 |
| 订阅 | subscription | 周期性扣款产品。 |
| 退款 | refund | 退款操作和退款通知链路。 |
| 商户 | merchant | 接入 Waffo 的客户/集成方。 |
| MID | MID / merchant ID | 报告中保持 `MID` 大写。 |
| Sandbox 环境 | Sandbox environment | 测试环境。 |
| 生产环境 | production environment | 线上真实交易环境。 |

## ID 与证据

| 中文 | English | API / 报告标识 |
|---|---|---|
| 支付请求 ID | payment request ID | `paymentRequestId` |
| A单 / 收单订单号 | acquiring order ID (A单) | `acquiringOrderID` |
| 商户订单号 | merchant order ID | `merchantOrderId` |
| 退款请求 ID | refund request ID | `refundRequestId` |
| 订阅请求 ID | subscription request | `subscriptionRequest` |
| 订阅 ID | subscription ID | `subscriptionID` / `subscriptionId`，以 SDK/API 返回为准 |
| 变更请求 / 变更键 | change request / change key | `subscription().change()` 的证据键 |
| webhook 到达证据 | webhook delivery evidence | `PROJECT_SIDE_VERIFIED`、`WAFFO_SIDE_VERIFIED`、`WAFFO_SIDE_UNVERIFIED` |
| 支付方式覆盖 | pay method coverage | 来自 `payMethodConfig().inquiry()` 的覆盖矩阵。 |
| 验收证据包 | evidence bundle | ID、截图、请求摘要、inquiry 结果、webhook 日志等。 |

## 操作术语

| 中文 | English | SDK/API Reference |
|---|---|---|
| 创建订单 | create order | `order().create()` / `POST /api/v1/order/create` |
| 查询订单 | inquire order | `order().inquiry()` / `POST /api/v1/order/inquiry` |
| 取消订单 | cancel order | `order().cancel()` / `POST /api/v1/order/cancel` |
| 发起退款 | create refund | `order().refund()` / `POST /api/v1/order/refund` |
| 查询退款 | inquire refund | `refund().inquiry()` / `POST /api/v1/refund/inquiry` |
| 创建订阅 | create subscription | `subscription().create()` |
| 查询订阅 | inquire subscription | `subscription().inquiry()` |
| 取消订阅 | cancel subscription | `subscription().cancel()` |
| 管理订阅 | manage subscription | `subscription().manage()` |
| 订阅变更 | subscription change | `subscription().change()` |
| 查询订阅变更 | subscription change inquiry | `subscription().changeInquiry()` |
| 查询商户配置 | merchant config inquiry | `merchantConfig().inquiry()` |
| 查询支付方式配置 | pay method config inquiry | `payMethodConfig().inquiry()` |

## Checkout 与终端

| 中文 | English | 说明 |
|---|---|---|
| Waffo checkout | Waffo checkout | Waffo 托管支付方式选择和 checkout 页面。 |
| 集成方 checkout | integrator checkout | 商户自己选择支付方式，并传 `payMethodType` / `payMethodName`。 |
| 支付终端 | user terminal | `userTerminal`: `WEB` 或 `APP`。 |
| APP 外跳浏览器 | APP external browser | APP 用系统浏览器打开 checkout URL。 |
| APP 端内 WebView | APP in-app WebView | `userTerminal=APP`；可能需要设备钱包测试。 |
| iframe checkout | iframe checkout | 需要 iframe 配置；Apple Pay 不能在 iframe 内使用。 |
| 多币种 | multi-currency | 订单/订阅按输入币种处理并持久化。 |
| 单币种 | single-currency | 币种由项目配置固定。 |

## 验证结论

| 中文 | English | 用法 |
|---|---|---|
| 完整通过 | `FULL` | 所有必测主动/被动检查通过。 |
| 有条件通过 | `CONDITIONAL` | 非阻塞缺口有证据和后续动作。 |
| 未完成 | `INCOMPLETE` | 必测主动/被动检查失败或仍未解决。 |
| 验证阻塞摘要 | Verification Blocked Summary | hard gate 缺证据时使用，不生成正式报告。 |
| 验证失败摘要 | Verification Failed Summary | 最终结论为 `INCOMPLETE` 时使用，不生成正式报告。 |
| 集成质量雷达 | Integration Quality Radar | 面向客户的被动代码审查和上线风险视图。 |

## 质量雷达词汇

| 中文 | English | 状态词 |
|---|---|---|
| 检查项 | check item | 被审查的风险点。 |
| 检查锚点 | review anchor | 需要查看的代码或配置位置。 |
| 当前发现 | finding | 当前代码或测试证据显示的事实。 |
| 风险级别 | risk level | `PASS`、`MUST_FIX`、`SHOULD_FIX`、`MONITOR`、`N/A`。 |
| 建议 | recommendation | 具体修复或下一步动作。 |

