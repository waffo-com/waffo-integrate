# Waffo Integration Knowledge Base

Extended documentation for common scenarios, troubleshooting, and best practices when integrating Waffo Payment SDK.

> **For AI assistants**: When a developer's question is not covered by `SKILL.md` or `references/`, search this index for relevant articles and read the linked document. If the local index also has no answer, use the **Remote Fallback** section below to search the latest online version.

---

## References

| Topic | Document | Description |
|-------|----------|-------------|
| Acceptance Criteria | [../references/acceptance-criteria.md](../references/acceptance-criteria.md) | 固定验收标准、Playwright checkout protocol、blocked/failed summary 和正式报告模板 |
| Product and scenario selection | [../references/scenario-selection.md](../references/scenario-selection.md) | feature、checkout、terminal、subscription mode、iframe、currency 的选择规则 |
| Glossary | [../references/glossary.md](../references/glossary.md) | 客户可读回复和验收报告使用的中英文术语 |
| Troubleshooting | [../references/troubleshooting.md](../references/troubleshooting.md) | 按症状排障、证据收集和支持分类 |

## FAQ

| Topic | Document | Description |
|-------|----------|-------------|
| Which checkout mode should I use? | [../references/scenario-selection.md](../references/scenario-selection.md#checkout-归属) | 对比 Waffo checkout 和 integrator checkout |
| Should APP WebView pass `WEB` or `APP`? | [../references/scenario-selection.md](../references/scenario-selection.md#支付终端选择) | 终端选择以及设备钱包测试影响 |
| What terminology should reports use? | [../references/glossary.md](../references/glossary.md) | 报告和支持包中的标准中英文术语 |

## Troubleshooting

| Symptom | Document | Description |
|---------|----------|-------------|
| Webhook not received or business not updated | [../references/troubleshooting.md](../references/troubleshooting.md#webhook-收不到或业务状态未更新) | 支付成功但项目状态未更新时的证据清单和常见原因 |
| Checkout page stuck or payment form fails | [../references/troubleshooting.md](../references/troubleshooting.md#checkout-页面卡住或支付表单失败) | 页面检查、本地化字段、iframe/设备风险和 inquiry 检查 |
| Pay method not displayed | [../references/troubleshooting.md](../references/troubleshooting.md#支付方式不展示) | 将签约方式与项目 `payMethodType` / `payMethodName` 过滤条件交叉核对 |
| Refund fails | [../references/troubleshooting.md](../references/troubleshooting.md#退款失败) | 退款证据、e-wallet 来源优先级和 inquiry/webhook 检查 |
| Subscription event missing or misrouted | [../references/troubleshooting.md](../references/troubleshooting.md#订阅事件缺失或路由错误) | handler 注册和 `PAYMENT_NOTIFICATION` 路由检查 |

## Best Practices

| Topic | Document | Description |
|-------|----------|-------------|
| Integration Quality Radar | [../references/business-validation.md](../references/business-validation.md#4-exception-handling-strategies--integration-quality-radar) | 将被动代码审查表达为客户可读的风险雷达表 |
| Product/scenario selection | [../references/scenario-selection.md](../references/scenario-selection.md) | 收集实现参数前先解释方案取舍 |
| Online docs source priority | [../references/scenario-selection.md](../references/scenario-selection.md#在线文档使用) | 说明何时使用 Product Overview、`llms.txt`、OpenAPI 和 `llms-full.txt` |

---

## Remote Fallback

When the local knowledge base does not cover a developer's issue, fetch the latest version from the remote repository. This ensures developers get up-to-date answers even if their local skill installation is outdated.

**Step 1**: Fetch the latest remote INDEX.md and scan for matching articles:
```
WebFetch: https://raw.githubusercontent.com/waffo-com/waffo-integrate/main/docs/INDEX.md
```
Search the fetched index for keywords matching the developer's question (error codes, feature names, symptoms).

**Step 2**: If a matching article is found, fetch its content:
```
WebFetch: https://raw.githubusercontent.com/waffo-com/waffo-integrate/main/docs/{path-from-index}
```

**Step 3**: If no article matches in the index, search the docs directory listing for related files:
```
WebFetch: https://api.github.com/repos/waffo-com/waffo-integrate/contents/docs?ref=main
```
Scan filenames for keyword matches, then fetch the most relevant file.

**When to use remote fallback**:
- Developer encounters an error code not documented locally (e.g., new error code added after their skill version)
- Local FAQ/Troubleshooting/Best Practices sections do not cover the issue
- Developer asks about a feature or scenario not covered by bundled references

---

## Contributing

To add a new article:

1. Create a `.md` file in the appropriate subdirectory (`faq/`, `troubleshooting/`, `best-practices/`)
2. Add an entry to the table above with a link and one-line description
3. Submit a PR
