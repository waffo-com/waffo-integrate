# waffo-integrate

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill that guides developers through integrating the [Waffo Payment SDK](https://github.com/waffo-com/waffo-sdk) into their projects via interactive Q&A.

## Install

### One command (npm)

```bash
# Auto-detect: installs to Claude Code and/or Cursor if detected
npx @waffo/waffo-integrate

# Or specify target explicitly
npx @waffo/waffo-integrate --claude
npx @waffo/waffo-integrate --cursor
```

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

An 7-step interactive wizard that:

1. **Detects language** — Node.js / Java / Go (auto-detect or ask)
2. **Checks project status** — existing project or new scaffold
3. **Selects features** — payments, refunds, subscriptions (webhook auto-derived)
4. **Picks framework** — Express, Spring Boot, Gin, etc.
5. **Previews code** — shows complete integration code for review
6. **Writes to project** — installs SDK dependency + generates files
7. **Verifies integration** — phased end-to-end testing with Markdown acceptance report

### Built-in safeguards

31 API contract rules prevent common integration mistakes:

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

Phased test execution with automatic fix-and-retry:

- **Phase A** — Core tests: order-create, payment-success/failure, webhook-idempotency
- **Phase B1/B2** — Pay method coverage: card + non-card (minimum test set from API discovery)
- **Phase C1** — Refund tests
- **Phase C2** — Subscription lifecycle tests
- **Phase D** — Passive verification (21 code review items) + Go-Live questionnaire + Markdown report

Active checklist (C1-C8) + 21 passive verification items + Sandbox knowledge base (K024-K030).

### Progressive disclosure

Only the main SKILL.md is loaded initially (~380 lines). Language-specific templates, verification protocol, and reference files are loaded on demand, saving tokens.

```
waffo-integrate/
├── SKILL.md                              # Integration flow + 31 rules (~380 lines)
├── references/
│   ├── api-contract.md                   # Field definitions + status handling
│   ├── node.md                           # Node.js/TypeScript templates
│   ├── java.md                           # Java/Spring Boot templates
│   ├── go.md                             # Go templates
│   ├── integration-verification.md       # Step 7 verification protocol
│   ├── acceptance-criteria.md            # Test cards, Playwright scripts, report template
│   ├── sandbox-knowledge.md              # Sandbox quirks (K024-K030)
│   └── business-validation.md            # Passive verification checklist
├── docs/
│   └── INDEX.md                          # Knowledge base index + remote fallback
└── evals/
    └── evals.json                        # 6 eval scenarios, 26 assertions
```

## Evaluation results

Built and tested with Anthropic's official [skill-creator](https://github.com/anthropics/claude-code/tree/main/plugins/skill-creator) plugin. 6 scenarios, 26 assertions:

| Eval | Scenario | Assertions | Result |
|------|----------|-----------|--------|
| 1 | Node.js payment + refund | 4 | PASS |
| 2 | Node.js subscription | 5 | PASS |
| 3 | Java Spring Boot webhook | 5 | PASS |
| 4 | Go integration verification | 5 | PASS |
| 5 | Go full features (webhook auto-derive) | 4 | PASS |
| 6 | Node.js payment only (no subscription filter) | 3 | PASS |

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Cursor](https://cursor.sh), or any AI coding assistant that can read markdown instructions
- A Waffo merchant account (for Sandbox testing)

## License

MIT
