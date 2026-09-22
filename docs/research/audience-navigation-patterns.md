# Audience/intent navigation patterns in existing Linux software guides

Wayfinder research ticket: #7. Findings as accessed 2026-09-22. All claims are
grounded in the cited primary source (the site, spec, docs, or repository that
owns the claim). Feeds the Gaming Audience landing prototype and the later
catalog-expansion (proprietary software) policy decision.

## TL;DR

Nobody navigates by audience alone. The successful catalogs run a **plain
category or compatibility backbone with a thin, explicitly curated editorial
overlay** ("collections", "labs", "staff picks", "featured") on top of it.
Proprietary software is handled by **labeling and orthogonal trust signals**
(license filter, verification badge, compatibility tier, source-repo marker),
not by exclusion and not by hiding. Flat expert lists without editorial
ordering (Arch wiki) serve reference lookup, not newcomer onboarding.

## Resource-by-resource

### Flathub (https://flathub.org/)

**(a) Grouping.** The primary axes are functional AppStream categories
(Productivity, Graphics & Photography, Audio & Video, Networking, Developer
Tools, Science, System, Utilities, Games) plus algorithmic collections
(Trending, Popular, New, Updated). On top of these sit **editorial intent
sections**: "Staff Picks" ("Apps we love right now"), "Build Native Apps"
("Develop apps that feel at home on your system"), "On the go" ("Apps for your
Linux phones and tablets", backed by a `collection/mobile` page) — these are
audience/intent framings layered over the same categories, not new categories.
The Games block ("We ♥ Games — Games and apps to run your favorite titles")
tabs into **Games / Emulators / Game Launchers / Game Tools**, i.e. gaming as
an audience page mixes content and tooling but splits them by role. Every
section ends with a "More <X>" link into the full category. A "Verified"
collection and a FOSS-license tag collection (`/apps/collection/tag/foss`)
exist as filter axes. (https://flathub.org/)

**(b) Landing composition.** Hero carousel of individual apps with
one-line job blurbs ("Stay focused with strict limits", "Scrobble your
music"), an "App of the Day", then Staff Picks, then interleaved
category/intent rows of ~6–12 cards each. Ordering is curated (staff) mixed
with signals (trending/popular); previews are icon + name + one-liner, no
reviews, no numeric scores.

**(c) Proprietary handling.** Flathub hosts proprietary apps. Policy:
"All content hosted on Flathub must allow legal redistribution…
Non-redistributable sources must use extra-data source type"
(https://docs.flathub.org/docs/for-app-authors/requirements). Proprietary
apps using extra-data "shall specify x-checker-data key to be automatically
scanned for URL changes and new releases"
(https://github.com/flathub/flathub/wiki/App-Requirements). Emulation/translation
layers (Wine-packaged Windows apps) "will only be accepted if they are
submitted officially by upstream"
(https://docs.flathub.org/docs/for-app-authors/requirements). On the
visibility side, license is a **filter, not a ranking**: a FOSS-only tag
collection exists, and the "Only show Free Software" search filter was added
after a feature request (https://github.com/flathub-infra/website/issues/1365).
Crucially, **verification is orthogonal to licensing**: "Verification is the
process by which Flathub and developers confirm that an app is published by
the original developer or an authorized party", done via a domain-ownership
token (https://docs.flathub.org/docs/for-app-authors/verification);
unverified simply means "published on Flathub by the community or third
parties" (https://docs.flathub.org/docs/for-users/verification). So a
proprietary app can carry a strong trust badge without any public source repo.

### Fedora Labs (https://labs.fedoraproject.org/, https://fedoraproject.org/labs/games)

**(a) Grouping.** Three explicit axes, cleanly separated in one nav:
**Editions** ("flagship Fedora Linux variants for different uses"),
**Spins** (grouped by desktop environment — a system property), and
**Labs** ("curated bundles of purpose-driven software and content" — grouped
by topic/task: Astronomy, Design Suite, Games, Jam, Python Classroom,
Scientific, Security Lab). Audiences appear as *product names* (Jam is
literally framed "For audio enthusiasts and musicians") rather than as
category parents.

**(b) Landing composition.** The Labs index shows one tile per lab: name +
one-sentence purpose + screenshot. The Fedora Games Lab page is the model for
an Audience landing page: an intro that scopes expectations, then
**"Featured Applications"** — nine curated flagship entries, each with a
screenshot, a one-line job description, and an external "Learn More" link —
then a single download CTA for the whole curated bundle. Note the honest
scoping: "Not all the games available in Fedora are included on this lab, but
trying out this lab will give you a fair impression of Fedora's ability to
run great games." The recommended "distro" here is the curated bundle itself;
the recommendation is expressed as an installable collection, not a ranking.

**(c) Proprietary handling.** Fedora's distro-side policy excludes
non-redistributable software, so the Labs pages sidestep the question:
everything featured is "free and open source" by construction (the lab
descriptions say so, e.g. Design Suite's "suite of free and open source
creative tools"). Fedora is a data point for *excluding* proprietary software
entirely from curated surfaces — the opposite pole from Flathub.

### Arch wiki — List of applications (https://wiki.archlinux.org/title/List_of_applications)

**(a) Grouping.** Pure function/task category, split into subpages
(Documents, Internet, Multimedia, Science, Security, Utilities, Other), and
within each subpage further split **Console vs Graphical**. "This article is
a general list of applications sorted by category, as a reference for those
looking for packages." No audience framing, no ranking, no editorial picks —
an expert reference, not a newcomer funnel. Notably it punts on cross-ecosystem
discovery by linking out (Flathub, AppImageHub, Snapcraft, distro package
lists, AlternativeTo).

**(b) Landing composition.** None — the index page is a navigation bar plus
external links. This is what a no-curation catalog looks like: usable for
"find me a PDF slicer", useless for "I'm new, what should I try".

**(c) Proprietary handling.** The labeling pattern to steal: proprietary
entries stay inline in the functional list but are **labeled in the
description itself** ("Google Chrome — Proprietary web browser developed by
Google"; "Obsidian — Proprietary personal knowledge base…"), get **dedicated
subsections when they cluster** ("Proprietary Chromium spin-offs"), and each
entry carries a **source marker for its package origin** — a superscript
`AUR` when it only exists in the Arch User Repository, versus the official
repo (https://wiki.archlinux.org/title/List_of_applications/Internet,
https://wiki.archlinux.org/title/List_of_applications/Other). Information
about provenance is attached per-entry rather than gating inclusion.

### ProtonDB (https://www.protondb.com/, https://www.protondb.com/news/revised-report-flow-review)

**(a) Grouping / (b) composition.** For games, the organizing axis is not
genre or category but **compatibility state**: a tier per title (Native,
Platinum, Gold, Silver, Bronze, Borked) plus Deck verification percentages
(Verified/Playable/Unsupported) and a "Top 10 measured by peak concurrent
players". Landing surfaces are ranked lists keyed to what a gamer actually
asks ("what runs well", "what's popular", "what's trending").

**(c) Proprietary handling — the key external data point.** ProtonDB ranks
software with **no source repository at all**: the ranking axis is
community-reported factual compatibility data, and "Native" (a first-class
tier) just means a Linux build exists. Its 2018/2019 redesign is a documented
lesson: ProtonDB's own write-up explains they abandoned user-awarded medal
tiers because "some are perceived to be too generous with Platinum ratings"
and because aggregating individual grades produced meaningless averages ("One
platinum and one silver report … would convey a 'Gold' tier"); they replaced
it with structured factual reports from which tiers are *derived*. Stealable:
for Programs without a repository, compute signals from structured facts,
never from a single subjective score.

### ChooseLinux — a dead reference (and the live equivalent)

The ticket's `chooselinux.net` **does not resolve** (NXDOMAIN on 2026-09-22)
and has **zero Wayback Machine captures**
(http://archive.org/wayback/available?url=chooselinux.net). The similarly
named `chooselinux.com` survives only as a mid-2015 archive of an SEO link
farm — not a functional chooser
(http://web.archive.org/web/20150801074554/http://chooselinux.com/). The
conclusion is itself a finding: community-built single-purpose discovery
microsites decay completely within a few years.

The live exemplar of that genre is **ChooseDistro** (https://choosedistro.com/,
https://choosedistro.com/distro-finder): distros grouped by **difficulty tag
(beginner/intermediate/advanced) + use-case categories including Gaming and
"Beginner Friendly"**, a step-by-step wizard with "live predictions" that
update as you answer, side-by-side compare (max 3), and a **"Top 25
Distros" leaderboard with bare numeric scores** (e.g. 98, 77) whose
methodology is not surfaced on the page — a caution about numeric ranking
without an explained formula.

## Shortlist — patterns worth stealing

1. **Categories as backbone, audiences as editorial overlay.** Never make an
   Audience own categories: run curated collections/tags on top of the shared
   taxonomy (Flathub's Staff Picks / "Build Native Apps" / "On the go" over
   AppStream categories; Fedora Labs as purpose bundles over one repo). This
   matches LinuxShelf's CONTEXT.md definition ("An Audience does not own its
   Categories; the mapping is many-to-many").
2. **A small curated flagship set with one-line job blurbs, then a "More"
   exit into the full category.** Fedora Games' "Featured Applications"
   (9 picks, screenshot + one-liner) and Flathub's section-then-"More
   Productivity" rhythm. For the Gaming landing: a handful of hero Programs
   described by what you do with them, then a link to the full Games
   Category.
3. **Scope an audience page honestly.** "Not all the games available in
   Fedora are included on this lab" — an explicit disclaimer buys credibility
   for a small catalog and pre-empts "why isn't X here".
4. **Split audience sub-tabs by role, not genre.** Flathub's Games block
   tabs into Games / Emulators / Game Launchers / Game Tools: a gaming
   audience wants playable titles and the tooling to run them, kept
   distinguishable on one page.
5. **Label proprietary software in the description + attach a provenance
   marker per entry** (Arch wiki's "Proprietary …" phrasing and `AUR`
   superscript; Flathub's FOSS-only tag collection and license filter).
   Proprietary stays in the same functional lists; the label is the
   differentiator.
6. **Trust signals without a source repository exist and work.** Flathub
   verification proves *publisher identity* via domain ownership, orthogonal
   to licensing; ProtonDB tiers prove *does it run* from structured reports.
   For a Program with no catalogued repository (hence no Star count), a
   "verified publisher" or "runs on Linux / native build" style signal is the
   substitute ranking input.

## Shortlist — anti-patterns

1. **The undifferentiated expert wall.** Arch wiki's List of applications is
   the shape a catalog converges to with zero editorial ordering: great for
   lookup, it does not onboard anyone. A newcomer-facing site without a
   curated layer reproduces this.
2. **Self-graded numeric scores with no visible methodology.** ProtonDB
   abandoned user-awarded tiers for aggregation bias and inconsistent
   grading (its own post-mortem); ChooseDistro's unexplained 77/98 scores are
   the living version. If LinuxShelf ranks, derive from disclosed facts
   (Star count, Release cadence, package coverage), and say so.
3. **Audience-as-parent taxonomy.** No surveyed resource nests categories
   under personas; the ones that come closest (Fedora Labs) are curated
   bundles, not a taxonomy. An Audience that re-parents Categories breaks the
   many-to-many reality (a "Gaming" user also wants "Utilities").
4. **Betting discovery UX on volunteer microsites.** The ticket's own
   reference, chooselinux, is dead without a trace; catalog facts that only
   live on a rendering site rot. (Consistent with ADR-0001/0002's
   committed-data stance: keep the recommendation inputs durable.)
5. **Handling proprietary software by silence.** Either extreme is a trap:
   Fedora sidesteps (nothing proprietary is ever featured, so no labeling
   craft needed) and a naive "just list it" loses trust. The working middle
   is Flathub/Arch: include, label explicitly, filter on demand, and attach
   provenance.

## Implications for LinuxShelf

- **Gaming Audience landing prototype**: compose it like Fedora Games Lab +
  Flathub's Games block — an honest-scope intro sentence, a curated shortlist
  of flagship Programs with one-line intent blurbs, a sub-split of "games to
  play" vs "tools to run them" (launchers/emulators/compatibility), and a
  "More Games" exit into the Category. Categories remain shared.
- **Catalog-expansion policy (proprietary)**: decide the label/filter format
  (description prefix + badge, per Arch/Flathub) up front, and define what
  stands in for Star count when there is no catalogued repository — a
  provenance marker (which package/source it ships from) and/or a
  compatibility signal, never an unexplained score.

## Sources

- Flathub homepage, collections and categories — https://flathub.org/
- Flathub verification (authors) — https://docs.flathub.org/docs/for-app-authors/verification
- Flathub verified apps (users) — https://docs.flathub.org/docs/for-users/verification
- Flathub submission requirements (license/extra-data/Wine policy) — https://docs.flathub.org/docs/for-app-authors/requirements
- Flathub App Requirements wiki (historical extra-data/x-checker wording) — https://github.com/flathub/flathub/wiki/App-Requirements
- "Filter proprietary software" feature request — https://github.com/flathub-infra/website/issues/1365
- Fedora Labs index and definition — https://labs.fedoraproject.org/
- Fedora Games Lab (featured applications, scope disclaimer) — https://fedoraproject.org/labs/games
- Arch wiki List of applications (index) — https://wiki.archlinux.org/title/List_of_applications
- Arch wiki proprietary labeling/AUR markers — https://wiki.archlinux.org/title/List_of_applications/Internet , https://wiki.archlinux.org/title/List_of_applications/Other
- ProtonDB (tiers, top-10, deck percentages) — https://www.protondb.com/
- ProtonDB reporting-system redesign (tier methodology post-mortem) — https://www.protondb.com/news/revised-report-flow-review
- ChooseLinux dead-reference check — `getent hosts chooselinux.net` (NXDOMAIN), Wayback availability API (no captures); 2015 SEO snapshot of chooselinux.com — http://web.archive.org/web/20150801074554/http://chooselinux.com/
- ChooseDistro (live distro-finder genre: difficulty + use-case + wizard + top-25) — https://choosedistro.com/ , https://choosedistro.com/distro-finder
