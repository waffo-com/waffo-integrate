# 产品与场景选型指南

当开发者还在选择 Waffo 接入方式，或需要解释 `SKILL.md` Step 2 / Step 3 为什么要问这些问题时，加载本文件。本文件沉淀判断逻辑，不替代现有集成流程。

> 本文件所有选型项都遵循 `SKILL.md` 的 Question Policy：偏好类决策（终端、checkout selection、订阅模式、币种模式、iframe/设备钱包等）先问开发者；开发者答不上再从代码 / 既有集成核实并回给其确认，禁止静默假设。

## 选型链路

```
从商户场景出发
  |-> 判断功能范围
  |     |-> Order Payment
  |     |-> Refund
  |     '--> Subscription / Subscription Change
  |
  |-> 判断支付终端
  |     |-> WEB
  |     '--> APP
  |           |-> external browser
  |           '--> in-app WebView
  |
  |-> 判断 checkout 归属
  |     |-> Waffo checkout
  |     '--> integrator checkout
  |
  |-> 判断币种模式
  |     |-> single-currency
  |     '--> multi-currency
  |
  '--> 判断特殊场景
        |-> iframe checkout
        |-> device wallets
        '--> subscription benefit timing
```

## 功能范围选择

| 场景 | 推荐功能范围 | 集成说明 |
|---|---|---|
| 一次性购买、充值、积分、账单支付 | Order Payment + Webhook | webhook 是必需链路；redirect 结果不能作为支付最终事实。 |
| 商户系统需要退款 | Refund + Refund Webhook | 持久化 `refundRequestId`，并验证权益回滚。 |
| 会员、SaaS、周期扣费 | Subscription + Subscription Webhooks | 注册 status、period-changed、payment 通知；只有做升降级时才加 change event。 |
| 商户希望在管理台或测试里展示可用方式 | Merchant Config / Pay Method Config | 验收覆盖前仍必须执行 `payMethodConfig().inquiry()`。 |

## 支付终端选择

| 用户体验 | `userTerminal` | 必要处理 |
|---|---|---|
| 桌面或移动 Web 浏览器 | `WEB` | 标准 checkout 和浏览器支付测试。 |
| Native APP 外跳系统浏览器 | `APP` | APP 上下文仍可能影响支付方式可用性；WeChat Pay 可能成为必测项。 |
| Native APP 内嵌 WebView | `APP` | 必须评估设备钱包和 WeChat Pay 行为；有签约且 checkout 可用时，APP 相关测试成为必测项。 |

终端类型必须先向开发者询问确认，不能猜。若开发者无法回答，再从订单/订阅创建参数核实，并把核实结论回给开发者确认后再采用。

## Checkout 归属

| 选择 | 适合场景 | 实现影响 | 验收影响 |
|---|---|---|---|
| Waffo checkout | 快速接入，由 Waffo 托管支付方式选择页 | 通常不传 `payMethodType` / `payMethodName`，除非有意收窄方式。 | `payMethodConfig().inquiry()` 返回的活跃签约方式通常应在 checkout 可用，除非有渠道/设备限制。 |
| integrator checkout | 商户自己控制支付方式选择和 UX | 必须传正确的 `payMethodType` / `payMethodName`，并把用户选择持久化到本地订单。 | 需要把签约方式和项目实际传参交叉核对；被项目请求过滤掉的方法不算 checkout-available。 |

## 订阅模式

payment-first / service-first 区分两个层面：① 计费周期与催收（Waffo 官方口径）；② 重试期间的权益处理（handler 预期）。两个层面要一起向开发者解释清楚，只讲其中一面会造成误解。

| 模式 | 计费周期 & 催收（Waffo 官方口径） | 重试期间权益（handler 预期） | 例子（续费日 1 号，3 号扣款成功） |
|---|---|---|---|
| payment-first（支付优先） | 续费成功后**重置扣款周期**到实际扣款日；约定重试次数用尽仍失败后，**下一期不再扣款**。 | 支付重试未结束前**暂停权益**；续费/支付失败事件不能继续发放权益。 | 下期续费日变为 **3 号**。 |
| service-first（服务优先） | 续费成功后**不重置周期**，保持原扣款日；重试次数用尽仍失败后，**下一期继续扣款**。 | 重试窗口内**保留权益**；续费失败应记录风险与重试状态，而不是立刻回收权益。 | 下期续费日仍为 **1 号**。 |

> 续费重试次数与重试间隔是 Waffo 侧订阅合同配置（开发者参考页默认：含首次共 2 次、每天一次；间隔可配），不由集成代码决定。实际次数以商户合同为准——在报告中提示其与 Waffo 确认，不要在代码里假设。

订阅模式必须先向开发者询问确认，不能猜。若开发者无法回答，再从代码 / 产品文案 / 已有订阅供应商实现核实，并把核实结论回给开发者确认后再采用。

## 币种模式

| 模式 | 使用场景 | 代码预期 |
|---|---|---|
| Single-currency | 当前 Waffo 集成只卖一种币种。 | 固定配置可以接受，但所有入口必须一致。 |
| Multi-currency | 商户按用户选择或市场接收多币种。 | 币种必须作为输入、被校验、被持久化，并用于 inquiry/refund/reconciliation。 |

## iframe 与设备钱包

| 场景 | 风险 | 必要指引 |
|---|---|---|
| iframe checkout | 浏览器和钱包限制可能阻断支付方式。 | 配置可支持的 iframe policy，并在报告中写明 iframe 状态。 |
| Apple Pay | 不能在 iframe 内使用，通常需要真机/手动测试。 | 未完成真机测试时，标记 manual/device testing 并给出下一步。 |
| Google Pay | 通常依赖真实浏览器/设备前置条件。 | 除非当前 Sandbox 证据证明可自动化，否则按 device-wallet/manual 处理。 |
| APP 内 WeChat Pay | APP 上下文可能影响注册和测试要求。 | APP/WebView 场景下，有签约且 checkout 可用时视为必测。 |

## 在线文档使用

| 问题类型 | 优先来源 |
|---|---|
| 产品概念或大场景解释 | `https://waffo.com/docs/en/essentials/product-overview` |
| 不知道具体查哪一页或需要最新 topic 路由 | `https://waffo.com/docs/llms.txt` |
| API 字段、枚举、必填参数、响应结构 | 本地 `references/api-contract.md`，然后查 `https://waffo.com/docs/api-reference/openapi.json` |
| Sandbox、webhook、acceptance、go-live | 从 `https://waffo.com/docs/llms.txt` 或 `llms-full.txt` 发现具体页面 |

如果本地 reference 和在线 OpenAPI/开发者文档冲突，实现时优先使用在线 contract，并在报告里记录差异来源。

