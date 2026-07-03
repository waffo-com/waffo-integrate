# waffo-integrate

An AI coding skill for Codex, Claude Code, and Cursor that guides developers through integrating the [Waffo Payment SDK](https://github.com/waffo-com/waffo-sdk) into their projects and then verifying the integration end to end.

## Install

### One command (npm)

```bash
# Auto-detect: installs to Codex, Claude Code, and/or Cursor if detected
npx @waffo/waffo-integrate

# Or specify target explicitly
npx @waffo/waffo-integrate --codex
npx @waffo/waffo-integrate --agents
npx @waffo/waffo-integrate --claude
npx @waffo/waffo-integrate --cursor
```

### Codex

The npm installer now writes to the live Codex skill roots when they are present:

- `~/.agents/skills/waffo-integrate`
- `~/.codex/skills/waffo-integrate`
- `~/.Codex/skills/waffo-integrate`

### Claude Code only

```bash
claude /install-skill waffo-com/waffo-integrate
```

### Cursor post-install

After running `npx @waffo/waffo-integrate --cursor`, add to your `.cursorrules` (or `.cursor/rules/waffo-integrate.mdc`):

```
When the user asks to integrate Waffo SDK, read and follow the instructions in .cursor/skills/waffo-integrate/SKILL.md.
Load reference files from .cursor/skills/waffo-integrate/references/ as directed by SKILL.md.
```

### Manual (any AI coding assistant)

Copy the `SKILL.md` and `references/` directory into your project. Point your AI assistant to read `SKILL.md` when integrating Waffo SDK.

## What it does

A guided integration flow with Step 7 verification:

1. **Detects language** — Node.js / Java / Go / Python (auto-detect or ask)
2. **Checks project status** — existing project or new scaffold
3. **Selects features** — payments, refunds, subscriptions (webhook auto-derived)
4. **Picks framework** — Express, Spring Boot, Gin, FastAPI, etc.
5. **Previews code** — shows complete integration code for review
6. **Writes to project** — installs SDK dependency + generates files
7. **Verifies integration** — phased end-to-end testing with Markdown acceptance report

### Built-in safeguards

Built-in protocol and contract rules prevent common integration mistakes:

- UUID request IDs exceeding 32-character limit
- Subscription field name confusion (`currency` vs `orderCurrency`)
- Missing required fields (`payMethodType`, `userTerminal`, `goodsInfo`)
- Invalid enum values (`YEARLY` is not a valid `periodType`)
- Webhook Content-Type not set (`text/plain` instead of `application/json`)
- All 5 webhook handlers must implement three-stage pattern (idempotency + lock + transaction)
- All 7 write operations must catch `WaffoUnknownStatusError`
- Refund currency must match original order currency
- Currency parameterization for multi-currency projects

### Integration verification (Step 7)

Phased Step 7 execution with automatic fix-and-retry:

- **Phase A** — Core tests: order-create, payment-success/failure, webhook-idempotency
- **Phase B1/B2** — Pay method coverage: card + non-card (minimum test set from API discovery)
- **Phase C1** — Refund tests
- **Phase C2** — Subscription lifecycle tests
- **Phase D** — Integration Quality Radar / 集成质量雷达（passive code review）+ Go-Live questionnaire + report hard gate + Markdown report

Key verification safeguards:

- `payMethodConfig().inquiry()` is mandatory before pay-method coverage or formal reporting
- final report generation is fail-closed behind a report hard gate
- `Verification Blocked Summary` is used instead of a formal report when required phases or evidence are missing
- `Webhook Delivery Evidence` distinguishes project-side evidence from Waffo-side evidence
- `Integration Quality Radar` 将被动代码审查风险表达成客户可读的检查项、发现、风险级别和建议
- report overview includes `Skill Version`, `Coverage Basis`, and `Report Eligibility`

### Progressive disclosure

Only the main `SKILL.md` is loaded initially. Language-specific templates, verification protocol, and reference files are loaded on demand, saving tokens.

```
waffo-integrate/
├── SKILL.md                              # Thin entrypoint + verification/report requirements
├── references/
│   ├── api-contract.md                   # Field definitions + status handling
│   ├── node.md                           # Node.js/TypeScript templates
│   ├── java.md                           # Java/Spring Boot templates
│   ├── go.md                             # Go templates
│   ├── python.md                         # Python (FastAPI/Flask/Django) templates
│   ├── integration-verification.md       # Step 7 verification protocol
│   ├── acceptance-criteria.md            # Test cards, Playwright scripts, report template
│   ├── sandbox-knowledge.md              # Sandbox quirks (K024-K030)
│   ├── business-validation.md            # Integration Quality Radar + passive verification
│   ├── scenario-selection.md             # 产品/场景选型取舍
│   ├── glossary.md                       # 客户可读术语
│   └── troubleshooting.md                # 按症状排障指南
├── docs/
│   └── INDEX.md                          # Knowledge base index + remote fallback
└── evals/
    └── evals.json                        # 16 eval scenarios, 61 assertions
```

## Evaluation coverage

The repo currently defines 16 eval scenarios and 61 assertions for Anthropic's official [skill-creator](https://github.com/anthropics/claude-code/tree/main/plugins/skill-creator) plugin:

| Eval | Scenario | Assertions | Result |
|------|----------|-----------|--------|
| 1 | Node.js payment + refund | 4 | Defined |
| 2 | Node.js subscription | 5 | Defined |
| 3 | Java Spring Boot webhook | 5 | Defined |
| 4 | Go integration verification | 7 | Defined |
| 5 | Go full features (webhook auto-derive) | 4 | Defined |
| 6 | Node.js payment only (no subscription filter) | 3 | Defined |
| 7 | Subscription event selection guidance | 3 | Defined |
| 8 | Python FastAPI payment + refund + webhook | 7 | Defined |
| 9 | Block direct report generation without verification | 3 | Defined |
| 10 | Require direct SDK pay-method inquiry when no helper exists | 2 | Defined |
| 11 | Keep proxy/local webhook evidence from being mislabeled PASS | 2 | Defined |
| 12 | Block formal report for INCOMPLETE outcome | 3 | Defined |
| 13 | APP WebView 场景选型说明 | 3 | Defined |
| 14 | Webhook 排障证据收集 | 3 | Defined |
| 15 | Integration Quality Radar 报告段落 | 4 | Defined |
| 16 | 在线文档来源优先级 | 3 | Defined |

## Requirements

- Codex, [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Cursor](https://cursor.sh), or any AI coding assistant that can read markdown instructions
- A Waffo merchant account (for Sandbox testing)

## License

MIT
