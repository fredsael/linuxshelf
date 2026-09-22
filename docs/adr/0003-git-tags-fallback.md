# Release history falls back to git tags, refreshed incrementally

ADR 0001 assumed a program's version history lives in GitHub Releases, but many long-running projects (ranger, for example) have never published a formal Release — their whole history exists only as bare git tags, which the `/releases` API does not return. auto-fill now falls back to `/tags` when `/releases` comes back empty, dating each tag from its tagged commit.

Two costs come with the fallback, each with a rule:

- **Request cost.** A full tag backfill is one request per tag (ranger: 49), so a catalog-wide run needs `GITHUB_TOKEN`. To keep regular runs at roughly one request per program, a program that already has releases is refreshed incrementally: only the newest page of releases/tags is fetched and dates are resolved only for versions not yet stored. The result is merged into the stored list; reusing `extractReleases` makes the merge idempotent. Tags that do not look like versions (`latest`) are skipped before their date is fetched; beta-shaped tags (`v1.9.0b6`) are kept — we do not guess prerelease status from tag names. More than 250 tags awaiting dates in one run aborts with a warning: such repositories tag every patch commit (vim: 6000+ tags), which would hammer the rate limit and plot a useless timeline; they are expected to carry curated `releases` lists instead.
- **Partial data.** Resolution can fail halfway (rate limit, moved repository). The timeline is complete or absent: if any fetch in a refresh fails, nothing is written and the program keeps its previous list.

The merge never drops or overwrites hand-curated entries, which replaces ADR 0001's "fill only when absent or empty" rule — under that rule a curated list could never gain new releases without `--force`. `--force` still rebuilds and replaces deliberately. Programs without a GitHub repository are unchanged and fall back to the date markers in ADR 0001.
