# Enforcement：validator、manifest 与 Claude Code hook

Markdown 只能告诉 AI 应该怎样做，不能证明它真的做了。Waffo 集成同时使用以下三层约束：

| 层级 | 组成 | 能否机械阻断 |
|---|---|---|
| T1 | `SKILL.md` 的流程、问卷和报告规则 | 否 |
| T2 | `bin/waffo-verify.js` | 能；违规时返回非零退出码 |
| T3 | `bin/waffo-claude-hook.js` + Claude Code `PreToolUse` hook | 能；写入正式报告前执行 validator |

T2/T3 负责可机械验证的事实：feature 范围、必需 handler 注册、必答人工决策、当前轮测试证据、支付方式查询、阻塞项和报告资格。业务逻辑是否正确仍需测试和人工 review，不能由正则扫描证明。

## Manifest：`.waffo/integration-manifest.json`

在商户项目中维护该文件。它是 validator 的输入，不是 AI 的自由格式完成声明。validator 会从 `features` 重新推导必需 decision、handler 和 test，空数组不能缩小检查范围。

下面展示字段结构；数组内容必须按后续规则完整填写：

```json
{
  "schemaVersion": 1,
  "skillVersion": "1.5.0",
  "features": ["order"],
  "decisions": [
    {
      "id": "paymentSourceOfTruth",
      "status": "CONFIRMED_BY_HUMAN",
      "value": "webhook plus same-key inquiry",
      "evidence": {
        "source": "user_message",
        "quote": "支付结果以 webhook 为主，超时后用同一个 request ID inquiry"
      }
    }
  ],
  "currentRunId": "uat-20260803-01",
  "evidence": [
    {
      "id": "ev-phase-a-log",
      "runId": "uat-20260803-01",
      "kind": "test_log",
      "summary": "Phase A project-endpoint execution log",
      "capturedAt": "2026-08-03T10:00:00Z"
    }
  ],
  "phases": {
    "A": { "status": "PASS", "evidenceIds": ["ev-phase-a-log"] },
    "B1": { "status": "PASS", "evidenceIds": ["ev-card"] },
    "B2": { "status": "N/A", "reason": "no active non-card method" },
    "C1": { "status": "N/A", "reason": "refund not integrated" },
    "C2": { "status": "N/A", "reason": "subscription not integrated" },
    "D": { "status": "PASS", "evidenceIds": ["ev-quality"] }
  },
  "tests": [
    { "id": "payment-create", "status": "PASS", "evidenceIds": ["ev-payment-create"] }
  ],
  "payMethodInquiry": {
    "status": "PASS",
    "evidenceIds": ["ev-pay-method-inquiry"],
    "activeMethods": [{ "id": "CARD" }]
  },
  "payMethodCoverage": [
    { "methodId": "CARD", "status": "PASS", "evidenceIds": ["ev-card"] }
  ],
  "qualityFindings": [
    { "id": "webhookSignatureVerification", "riskLevel": "PASS", "evidenceIds": ["ev-quality"] }
  ],
  "blockers": [],
  "mustFix": [],
  "outcome": "FULL"
}
```

### Feature 与 handler

`features` 只能包含 `order`、`refund`、`subscription`、`subscriptionChange`。`subscriptionChange` 同时要求声明 `subscription`。

| Feature | validator 要求找到的可执行 SDK 注册调用 |
|---|---|
| `order` | `onPayment` / `on_payment` / `OnPayment` |
| `refund` | `onRefund` / `on_refund` / `OnRefund` |
| `subscription` | `onSubscriptionStatus`、`onSubscriptionPeriodChanged`、subscription-aware `onPayment` 的语言对应写法 |
| `subscriptionChange` | `onSubscriptionChange` / `on_subscription_change` / `OnSubscriptionChange` |

validator 会移除注释和字符串后再识别 `.handler(...)` 调用，并排除测试目录与测试文件。只在 checklist、注释、event 常量或测试夹具中出现 handler 名不会通过。

### 人工决策

所有集成都必须登记以下 decision ID：

- `paymentSourceOfTruth`
- `unknownStatusHandling`
- `userTerminal`
- `checkoutOwnership`
- `currencyMode`
- `iframeDeviceWalletHandling`
- `redirectBehavior`
- `goLiveQ1` 至 `goLiveQ8`
- `complianceExemption`

根据 feature 追加：

| Feature | 追加的 decision ID |
|---|---|
| `order` | `onPaymentBusinessLogic` |
| `refund` | `refundBenefitHandling`、`onRefundBusinessLogic` |
| `subscription` | `subscriptionMode`、`cancelBenefitTiming`、`subscriptionRetryConfig`、`onPaymentBusinessLogic`、`onSubscriptionStatusBusinessLogic`、`onSubscriptionPeriodChangedBusinessLogic` |
| `subscriptionChange` | `upgradeDowngradeProration`、`onSubscriptionChangeBusinessLogic` |

每项状态只能为：

- `CONFIRMED_BY_HUMAN`：必须包含明确 `value`，并把开发者原话写入 `evidence.quote`；`evidence.source` 固定为 `user_message`。
- `READ_FROM_CODE_PENDING_CONFIRMATION`：代码中找到了候选答案，但用户尚未确认。
- `UNRESOLVED`：当前无人回答。

后两种状态必须让受影响分支执行 `WAFFO_DECISION_REQUIRED` runtime stub，并使正式报告不可生成。它们不阻止继续完成与该决策无关的 SDK wiring、字段映射、handler 注册和持久化。

Claude hook 会把当前 Claude transcript 传给 validator。validator 必须在真实 `user` 消息中找到 `evidence.quote`，因此 AI 自己写入 `CONFIRMED_BY_HUMAN` 或伪造一段未出现过的回答会被阻断。Codex/Cursor 没有同等 transcript hook 时，只能校验 evidence 结构，不能认证回答者身份。

### 当前轮证据与报告资格

- `currentRunId` 标识本轮验证。
- `evidence` 每项必须包含 `id`、`runId`、`kind`、`summary`、`capturedAt`。
- `PASS`、`USED`、`CONDITIONAL` 及人工/支持类结果必须通过 `evidenceIds` 引用 `currentRunId` 下的证据；旧轮证据不能支撑本轮报告。
- `phases` 必须完整包含 `A`、`B1`、`B2`、`C1`、`C2`、`D`。`PASS`/`CONDITIONAL` 需要证据；`N/A`/`SKIPPED` 需要原因；`FAIL` 和非终态会阻断报告。
- `tests` 必须覆盖 validator 按 feature 推导的测试 ID。`FAIL`/`PARTIAL` 阻断报告；`MANUAL`、`WAFFO_SUPPORT_REQUIRED`、`SKIP_WITH_REASON`、`N/A` 必须有当前轮证据、原因和下一步，并把结果限制为 `CONDITIONAL`。
- `payMethodInquiry.status` 必须为 `PASS`；每个 `activeMethods` 条目必须出现在 `payMethodCoverage`。
- `qualityFindings` 必须包含 `webhookSignatureVerification`、`idempotencyAndLocking`、`unknownStatusRecovery`、`requestIdPersistence`、`refundEntitlementRollback`、`subscriptionEventRouting`、`appIframeCheckoutRisk`。`PASS` 需要当前轮证据；`N/A` 需要当前轮证据和原因；`MUST_FIX` 阻断报告。
- `blockers` 与 `mustFix` 必须存在；正式报告要求没有 OPEN blocker，且 `mustFix` 为空。
- 正式报告只接受 `FULL` 或 `CONDITIONAL`。`INCOMPLETE` 只能输出 Verification Blocked/Failed Summary。

## T2：运行 validator

从商户项目根目录执行：

```bash
node ~/.claude/skills/waffo-integrate/bin/waffo-verify.js .
node ~/.claude/skills/waffo-integrate/bin/waffo-verify.js . --gate report
```

退出码含义：`0` 表示通过；`1` 表示普通检查发现违规；`2` 表示 report write 被阻断。`--json` 可输出机器可读结果。

各宿主的常见 Skill 路径：Claude Code 使用 `~/.claude/skills/...`；Codex 使用 `~/.agents/skills/...` 或 `~/.codex/skills/...`；Cursor 使用 `./.cursor/skills/...`。

## T3：Claude Code hook

hook 是 opt-in 配置，安装器不会静默修改用户 settings。将以下内容合并到全局 `~/.claude/settings.json` 或商户项目 `.claude/settings.json`：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/skills/waffo-integrate/bin/waffo-claude-hook.js\""
          }
        ]
      }
    ]
  }
}
```

`waffo-claude-hook.js` 从 stdin 读取 Claude hook JSON。只有目标文件名匹配 `integration-report-{YYYYMMDD}.md` 时才运行 report gate；其他 Write/Edit 原样放行。它同时传入 `transcript_path`，用于认证 decision quote 确实来自用户消息。

Claude hook 只能拦截工具调用，不能拦截模型直接打印文字。Skill 因此仍要求在打印或保存报告前主动运行 `--gate report`；T3 提供的是文件写入层的机械保护。

## 可机械验证的边界

| 规则 | T2 | T3 |
|---|---|---|
| 空 feature、漏 decision、漏 phase/test/evidence | 检出 | 阻断报告写入 |
| 缺少实际 handler 注册 | 检出 | 阻断报告写入 |
| 注释/字符串伪造 handler | 检出 | 阻断报告写入 |
| Go/Java/Node/Python handler 命名差异 | 支持 | 支持 |
| 原始 36 字符 UUID request ID | 检出 | 阻断报告写入 |
| 人工回答是否来自当前 Claude 用户消息 | 无 transcript 时只能校验结构 | 通过 transcript 认证 |
| 业务逻辑和测试结果本身是否真实正确 | 需要 review/E2E | 需要 review/E2E |
