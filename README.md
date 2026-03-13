# waffo-integrate

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill that guides developers through integrating the [Waffo Payment SDK](https://github.com/waffo-com/waffo-sdk) into their projects via interactive Q&A.

## Install

### One command (npm)

```bash
# Auto-detect: installs to Claude Code and/or Cursor if detected
npx waffo-integrate

# Or specify target explicitly
npx waffo-integrate --claude
npx waffo-integrate --cursor
```

### Claude Code only

```bash
claude /install-skill waffo-com/waffo-integrate
```

### Cursor post-install

After running `npx waffo-integrate --cursor`, add to your `.cursorrules` (or `.cursor/rules/waffo-integrate.mdc`):

```
When the user asks to integrate Waffo SDK, read and follow the instructions in .cursor/skills/waffo-integrate/SKILL.md.
Load reference files from .cursor/skills/waffo-integrate/references/ as directed by SKILL.md.
```

### Manual (any AI coding assistant)

Copy the `SKILL.md` and `references/` directory into your project. Point your AI assistant to read `SKILL.md` when integrating Waffo SDK.

## What it does

An 8-step interactive wizard that:

1. **Detects language** — Node.js / Java / Go (auto-detect or ask)
2. **Checks project status** — existing project or new scaffold
3. **Selects features** — payments, refunds, subscriptions, webhooks, config queries
4. **Picks framework** — Express, Spring Boot, Gin, etc.
5. **Previews code** — shows complete integration code for review
6. **Writes to project** — installs SDK dependency + generates files
7. **Generates tests** — Sandbox integration tests (or stubs if no credentials)
8. **Verifies locally** — tunnel setup + end-to-end payment + webhook verification

### Built-in safeguards

13 API contract rules prevent common integration mistakes:

- UUID request IDs exceeding 32-character limit
- Subscription field name confusion (`currency` vs `orderCurrency`)
- Missing required fields (`payMethodType`, `userTerminal`, `goodsInfo`)
- Invalid enum values (`YEARLY` is not a valid `periodType`)
- Incorrect SDK initialization patterns (e.g. non-existent `fromProperties()` in Java)

### Progressive disclosure

Only the main SKILL.md is loaded initially (~450 lines). Language-specific templates and the API contract reference are loaded on demand, saving tokens.

```
waffo-integrate/
├── SKILL.md                  # Integration flow + 13 rules
├── references/
│   ├── api-contract.md       # Field definitions + status handling guide
│   ├── node.md               # Node.js/TypeScript templates
│   ├── java.md               # Java/Spring Boot templates
│   └── go.md                 # Go templates
└── evals/
    └── evals.json            # Evaluation test cases
```

## Evaluation results

Built and tested with Anthropic's official [skill-creator](https://github.com/anthropics/claude-code/tree/main/plugins/skill-creator) plugin. 3 iterations of A/B testing (with skill vs without skill), 3 scenarios, 16 assertions:

| Metric | With Skill | Without Skill |
|--------|-----------|---------------|
| Pass rate | **100%** (16/16) | 75% (12/16) |
| Avg time | 128s | 192s (**-33%**) |
| Avg tokens | 58.8k | 66.3k (**-11%**) |

Consistent failure patterns without the skill across all 3 iterations:
- Subscription missing `goodsInfo` (3/3 rounds)
- Subscription missing `payMethodType` (3/3 rounds)
- Java using non-existent `WaffoConfig.fromProperties()` (3/3 rounds)

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Cursor](https://cursor.sh), or any AI coding assistant that can read markdown instructions
- A Waffo merchant account (for Sandbox testing)

## License

MIT
