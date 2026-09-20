# Spec: Linux Programs Explorer Website

**Status:** ready-for-agent
**Created:** 2026-09-11

---

## Problem Statement

New Linux users face a fragmented landscape when discovering software. Package managers list thousands of packages with terse metadata, blog posts go out of date, and there's no single place to browse curated, comparable information about Linux programs organized by category. Users exploring Linux don't know what they're looking for yet — they need to browse, compare, and discover, not search for a known target.

## Solution

A static website that presents Linux programs organized into flat categories, with rich descriptions, metadata pulled from package managers, and install commands for major distributions. The site is built with Astro, deployed on Vercel, and designed for exploratory browsing — a clean category grid homepage leads users into categories, then into program detail pages with everything they need to evaluate and install a program.

Content is hybrid: program metadata (version, license, release dates, package names) is auto-pulled from Repology and distro APIs, while descriptions are hand-authored using a consistent template. Each program lives as a single YAML file in the repo, keeping everything version-controlled and easy to review.

## User Stories

### Homepage & Navigation

1. As a visitor, I want to see a clean homepage with a grid of categories so that I can start exploring Linux programs without knowing what I'm looking for.
2. As a visitor, I want each category card to show the category name and program count so that I can gauge which areas interest me.
3. As a visitor, I want a search bar on the homepage so that I can jump directly to a program if I know its name.
4. As a visitor, I want the site to load instantly so that I don't lose patience and leave.
5. As a visitor, I want the site to work on mobile so that I can browse from my phone.
6. As a visitor, I want the site to be accessible (keyboard navigable, screen reader friendly) so that everyone can use it.

### Category Pages

7. As a visitor, I want to click a category and see all programs in that category listed so that I can compare options within a domain.
8. As a visitor, I want each program in the list to show its name, short description, license, and latest version so that I can quickly scan and narrow down.
9. As a visitor, I want to click a program card to navigate to its detail page.

### Program Detail Pages

10. As a visitor, I want to see the program name, logo/icon, and short description immediately so that I understand what it is within seconds.
11. As a visitor, I want to see the category and tags as badges so that I understand the program's context and can discover related categories.
12. As a visitor, I want to see the latest version, first release date, and latest release date so that I know how mature and actively maintained the program is.
13. As a visitor, I want to see a homepage link and repository link as prominent buttons so that I can visit the upstream project.
14. As a visitor, I want to see install commands for Ubuntu/Debian, Fedora, Arch, and openSUSE in a tabbed code block so that I can copy the right command for my distro.
15. As a visitor, I want a copy button on each install command so that I can paste it into my terminal without selecting text.
16. As a visitor, I want unavailable distro tabs to be dimmed or hidden so that I'm not confused by missing packages.
17. As a visitor, I want a full description below the fold that follows a consistent template (What is it, Why use it, Key features, How it compares) so that I get structured, comparable information.
18. As a visitor, I want to see related programs at the bottom of the detail page so that I can discover alternatives.
19. As a visitor, I want the related programs to link to their detail pages so that I can jump between comparable programs.
20. As a visitor, I want the page URL to be clean and predictable (e.g., `/programs/neovim`) so that I can share or bookmark it.

### Search

21. As a visitor, I want to type in the search bar and see instant results so that I can find a program quickly.
22. As a visitor, I want search to match program names, descriptions, and tags so that I can find programs even with partial information.
23. As a visitor, I want search to work offline (client-side) so that it's fast and doesn't depend on a server.
24. As a visitor, I want a keyboard shortcut (`/`) to focus the search bar so that I can search without reaching for the mouse.

### Data & Content

25. As a maintainer, I want each program to be a single YAML file so that I can add, edit, or review changes in a single diff.
26. As a maintainer, I want the YAML to follow a defined schema so that the build fails fast on typos or missing fields.
27. As a maintainer, I want an auto-fill script that pulls version, license, latest release date, and package names from Repology so that I don't have to manually track upstream releases.
28. As a maintainer, I want the auto-fill script to only fill blank fields and never overwrite hand-written content so that my descriptions aren't lost.
29. As a maintainer, I want the auto-fill script to run on a schedule (weekly cron or GitHub Action) so that metadata stays current without manual effort.
30. As a maintainer, I want full descriptions to be written using a consistent template (What is it, Why use it, Key features, How it compares) so that all programs have comparable, structured descriptions.
31. As a maintainer, I want descriptions to be AI-drafted and human-edited so that I can produce high-quality content at scale.
32. As a maintainer, I want the `related` field in YAML to reference slugs so that cross-linking is resolved at build time.

### Build & Deploy

33. As a maintainer, I want the build to validate all YAML against the schema before generating pages so that broken content never ships.
34. As a maintainer, I want the build to generate category index pages automatically from the program data so that I don't have to maintain category pages by hand.
35. As a maintainer, I want Pagefind to run as a post-build step so that search works on the static site.
36. As a maintainer, I want deploys to Vercel triggered by git push so that shipping is effortless.
37. As a maintainer, I want automatic preview deploys on PRs so that I can review changes before merging.

### Visual Design

38. As a visitor, I want a monochrome base (black/white/gray) with one bold accent color so that the site feels clean and modern.
39. As a visitor, I want consistent typography — a clean sans-serif for body text, monospace for code blocks — so that the site is easy to read.
40. As a visitor, I want program icons/logos where available with an emoji fallback so that category and program cards are visually distinct.

## Implementation Decisions

### Content Layer (Seam 1)

- Each program is a single YAML file in `content/programs/<slug>.yaml`.
- The `category` field is a flat string in the YAML (e.g., `"Text Editors"`). Categories are derived from the union of all program categories — there is no separate category definition file.
- The YAML schema includes: `name`, `slug`, `category`, `tags` (array), `description.short`, `description.full` (markdown), `license`, `version`, `first_release`, `latest_release`, `homepage`, `repository`, `icon`, `packages` (object keyed by distro), `related` (array of slugs).
- A TypeScript loader module reads all YAML files, validates them against the schema, and returns typed program objects.
- Build fails if any YAML file is invalid or missing required fields.

### Page Generation (Seam 2)

- Three Astro page templates: homepage (`index.astro`), category listing (`category/[slug].astro`), program detail (`program/[slug].astro`).
- Homepage renders a grid of category cards. Each category is derived from the unique `category` values across all programs. Card shows category name, program count, and links to the category page.
- Category page lists all programs in that category as cards showing: name, short description, license, latest version.
- Program detail page has two zones:
  - **Above the fold:** name, icon, short description, category badge, tags, version, release dates, homepage/repo buttons, tabbed install commands (apt/dnf/pacman/zypper) with copy button.
  - **Below the fold:** full description (rendered markdown), related programs list with links.
- Install command tabs are generated from the `packages` object. Tabs for distros where the package name is absent are hidden.
- Related programs are resolved from the `related` slug array at build time.

### Search (Seam 3)

- Pagefind is installed as a post-build step (`npx pagefind --site dist`).
- The search bar component uses Pagefind's JavaScript API.
- Keyboard shortcut `/` focuses the search bar (standard pattern).
- Search indexes program names, short descriptions, full descriptions, tags, and categories.

### Auto-fill Pipeline (Seam 4)

- A standalone TypeScript/Node script (`scripts/auto-fill.ts`) reads all program YAML files.
- For each program, it checks if `version`, `latest_release`, `license`, or `packages` fields are blank.
- It queries the Repology API (`https://repology.org/api/v1/project/<slug>`) to fill missing fields.
- It writes back to the YAML file only if changes were made.
- The script is run manually or via a weekly GitHub Action / cron job. It is NOT part of the Astro build pipeline.

### Visual Design

- Monochrome base: `#000000`/`#ffffff`/`#1a1a1a`/`#f5f5f5` with one accent color (TBD at implementation, e.g., `#00d4ff` cyan).
- Typography: Inter or similar sans-serif for body, JetBrains Mono or Fira Code for code blocks.
- Program icons: SVG files in `public/icons/<slug>.svg` with emoji fallback if file is missing.
- Mobile-responsive layout using Astro's built-in CSS support (no UI framework needed for v1).

### Repository Structure

- Single `content/programs/` directory for all program YAML files.
- `src/pages/` for Astro page templates.
- `src/components/` for Astro components (ProgramCard, CategoryCard, InstallTabs, SearchBar, Header).
- `src/layouts/` for base HTML layout.
- `src/lib/` for TypeScript utilities (program loader, category derivation).
- `public/icons/` for program SVG icons.
- `scripts/` for the auto-fill pipeline.

### Hosting

- Vercel deployment, triggered by git push to main.
- Astro framework with static output (no SSR).

## Testing Decisions

- **Good tests verify external behavior, not implementation details.**
- The content loader should be tested with valid YAML (returns correct typed objects) and invalid YAML (throws descriptive errors).
- The category derivation should be tested: given a set of programs with various categories, it returns the correct unique categories with correct counts.
- The install tab rendering should be tested: given a program with partial packages, it shows only the correct distro tabs.
- The auto-fill script should be tested with mocked API responses: it fills blank fields, does not overwrite existing fields, and handles API errors gracefully.
- Page generation is best verified via Astro's built-in build step — a successful build with valid content is the primary integration test.
- No prior art exists — this is a greenfield project.

## Out of Scope

- **Window Managers category** — deferred to v2. The WM ecosystem (config files, rice culture, compositors) requires a richer page structure than other categories.
- **Community features** — user accounts, submissions, corrections, moderation. v1 is read-only.
- **Dark mode / light mode toggle** — v1 ships monochrome. Theme toggle is v2.
- **User personalization** — bookmarking, "my toolkit" lists, favorites.
- **Multi-language support** — English only for v1.
- **Analytics** — not in v1 scope, can be added trivially via Vercel later.
- **CMS or admin UI** — all content lives in YAML files, edited via git.
- **Automated description generation in the build** — descriptions are pre-authored, not generated at build time.

## Further Notes

- The target audience is people exploring Linux — they may not know what they're looking for. The UX should favor browsing and discovery over search.
- Program data quality varies across distros. The auto-fill script should gracefully handle missing fields from Repology (some packages have no description, no license, etc.).
- The `related` field is manually curated — it cannot be reliably auto-generated because "related" is a judgment call, not a metadata lookup.
- The YAML schema should be the single source of truth for what data a program has. Adding a new field means updating the schema, the loader, the templates, and the auto-fill script.
