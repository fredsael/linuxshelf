# LinuxShelf

A static website for browsing and comparing curated Linux programs by
category — descriptions, licenses, versions, and install commands for
Ubuntu/Debian, Fedora, Arch, and openSUSE.

Built with [Astro](https://astro.build) and searched client-side with
[Pagefind](https://pagefind.app). Published at [linuxshelf.com](https://linuxshelf.com).

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Astro dev server |
| `npm run build` | Build the static site and run Pagefind over `dist/` |
| `npm run preview` | Preview the built site locally |
| `npm test` | Run the Vitest suite |
| `npm run auto-fill` | Fill blank metadata from the Repology API |
| `npm run auto-fill -- --dry-run` | Show what auto-fill would change |
| `npm run auto-fill -- --project neovim` | Auto-fill a single program |

## Content

Every program is one YAML file in `content/programs/<slug>.yaml`. The file
name must match the `slug` field. Categories are derived from the `category`
fields — there is no separate category file.

```yaml
name: Neovim
slug: neovim
category: Text Editors
tags: [modal editing, lua]
description:
  short: One-sentence summary.
  full: |
    ## What is it?
    ...
    ## Why use it?
    ...
    ## Key features
    - ...
    ## How it compares
    ...
license: Apache-2.0
version: "0.11.5"
first_release: "2014-03-23"
latest_release: "2025-12-05"
homepage: https://neovim.io
repository: https://github.com/neovim/neovim
icon: "🟩"
packages:
  apt: neovim
  dnf: neovim
  pacman: neovim
  zypper: neovim
related: [vim, helix]
```

The loader validates every file against the schema at build time and fails
the build with a descriptive error when a field is missing, misspelled, or
a `related` slug does not exist. `license`, `version`, `latest_release`, and
`packages` may be left blank; the auto-fill pipeline fills them from
Repology without touching fields that are already populated. `packages`
entries left blank are hidden from the install tabs.

A program icon can be an SVG at `public/icons/<slug>.svg`; otherwise the
`icon` field (typically an emoji) is rendered as a fallback.

## Auto-fill pipeline

`npm run auto-fill` (see `scripts/auto-fill.ts`) reads each YAML file,
queries `https://repology.org/api/v1/project/<slug>` only when one of
`version`, `latest_release`, `license`, or `packages` is blank, and writes
the file back only if something changed. API failures are logged and
skipped, never fatal. The GitHub Action in
`.github/workflows/auto-fill.yml` runs it weekly and opens a pull request.

`npm run auto-fill -- --stars` additionally refreshes each program's
`stars:` count from its catalogued GitHub repository. Unlike curated
fields, an existing count is always overwritten, and a count left behind
when a repository moves off GitHub is cleared
(see `docs/adr/0002-committed-star-counts.md`).

Repology does not expose release dates, so `latest_release` is only filled
when the API response happens to include one; it usually needs a manual
edit or a future upstream source.

Each run also refreshes the `releases:` timeline of GitHub-backed programs:
new stable releases are merged into the existing list, so hand-curated
entries are never overwritten. Repositories that publish no formal GitHub
releases (ranger, for example) fall back to bare git tags, dated by their
tagged commits; a full backfill costs one request per tag, so run with
`GITHUB_TOKEN` set. Later refreshes fetch only the newest page and resolve
dates just for versions not yet stored (see
`docs/adr/0003-git-tags-fallback.md`). Programs whose tag history is too
large to date — repositories tagging every patch commit, like vim — set
`skip_releases: true` in their YAML to opt out of the lookup entirely and
keep the first/latest date markers; `--force` rebuilds a program's list
from scratch and replaces curated entries deliberately.
