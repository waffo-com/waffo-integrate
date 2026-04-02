# Waffo Integration Knowledge Base

Extended documentation for common scenarios, troubleshooting, and best practices when integrating Waffo Payment SDK.

> **For AI assistants**: When a developer's question is not covered by `SKILL.md` or `references/`, search this index for relevant articles and read the linked document. If the local index also has no answer, use the **Remote Fallback** section below to search the latest online version.

---

## References

| Topic | Document | Description |
|-------|----------|-------------|
| Acceptance Criteria | [../references/acceptance-criteria.md](../references/acceptance-criteria.md) | 15 acceptance criteria (AC-1~AC-15) for project-level integration verification |

## FAQ

| Topic | Document | Description |
|-------|----------|-------------|
| _Coming soon_ | | |

<!-- Example:
| Subscription billing retry | [faq/subscription-retry.md](faq/subscription-retry.md) | How Waffo handles failed recurring payments and retry logic |
| Apple Pay integration | [faq/applepay-setup.md](faq/applepay-setup.md) | Domain verification, merchant ID setup, and sandbox testing |
-->

## Troubleshooting

| Symptom | Document | Description |
|---------|----------|-------------|
| _Coming soon_ | | |

<!-- Example:
| A0003 error on subscription create | [troubleshooting/a0003-missing-fields.md](troubleshooting/a0003-missing-fields.md) | Required fields that openapi.json doesn't mark as required |
| Webhook not received | [troubleshooting/webhook-not-received.md](troubleshooting/webhook-not-received.md) | Common causes: URL not public, signature mismatch, firewall |
-->

## Best Practices

| Topic | Document | Description |
|-------|----------|-------------|
| _Coming soon_ | | |

<!-- Example:
| Idempotency design | [best-practices/idempotency.md](best-practices/idempotency.md) | Request ID generation, retry strategy, deduplication |
| Multi-currency checkout | [best-practices/multi-currency.md](best-practices/multi-currency.md) | orderCurrency vs userCurrency, FX handling |
-->

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
- Local FAQ/Troubleshooting/Best Practices sections show "Coming soon"
- Developer asks about a feature or scenario not covered by bundled references

---

## Contributing

To add a new article:

1. Create a `.md` file in the appropriate subdirectory (`faq/`, `troubleshooting/`, `best-practices/`)
2. Add an entry to the table above with a link and one-line description
3. Submit a PR
