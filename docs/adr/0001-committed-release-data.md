# Release data is committed, refreshed by auto-fill

Program release history is stored in the program YAML (`releases:` list of `{version, date}`) and populated by extending `scripts/auto-fill.ts` to fetch stable GitHub Releases (`prerelease: false`, `draft: false`) into the repo — not fetched from the GitHub API at site build time. Committed data keeps builds offline-safe and free of API rate limits, at the cost of staleness: a timeline is only as fresh as the last auto-fill run.

Auto-fill fills `releases` only when absent or empty, so hand-curated lists are never overwritten; `--force` refreshes a chosen program deliberately. Programs without a GitHub repository (emacs, vim, nano) get no list and fall back to the synthetic first/latest date markers already in the schema.
