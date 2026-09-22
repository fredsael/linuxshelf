# Research: package/release data availability for proprietary GUI software

Wayfinder research ticket: fredsael/linuxshelf#8.
Findings date: 2026-09-22. All non-repology endpoints were probed live on that date;
repology.org facts are cited to its own source tree and project pages (repology.org
was unreachable from this network, see Caveats).

Scope: what happens to LinuxShelf's data axes — per-distro package names
(`packages:` via `scripts/auto-fill.ts`), version/license/latest_release (Repology),
and release history (`releases:` via GitHub) — if the catalog admits proprietary
GUI programs (Google Chrome, Steam, Discord, Spotify).

## a) Repology

1. **Repology does not track Flathub or the Snap Store.** Its own
   "Not supported repositories" doc lists both: *flathub — "No usable data. Also
   Repology does not support self-contained blobs like flatpaks, which require
   versions of all bundled components to be considered"* and *snapcraft — "API
   requires authorization, no usable data…"*.
   Source: https://repology.org/docs/not_supported (template read from the
   repology source tree, `repology-webapp/templates/docs/not_supported.html` at
   https://github.com/repology/repology-rs; linked issues
   https://github.com/repology/repology-updater/issues/363 and
   https://github.com/repology/repology-updater/issues/627).
   → A refresher can never get flatpak/snap versions or dates **through Repology**;
   it would have to call Flathub's and Canonical's APIs directly (see b).

2. **Repology does have projects for the proprietary names**, but only rows for
   repositories that actually package them. Per project pages
   (https://repology.org/project/google-chrome/versions,
   https://repology.org/project/discord/versions,
   https://repology.org/project/spotify/versions):
   - `google-chrome`: ~64 rows, all unofficial/other-platform (AUR, Homebrew Casks,
     KaOS, Exherbo, FreeBSD, Chocolatey, Scoop, Npackd, Wikidata…). No
     Debian/Ubuntu/Fedora/openSUSE/Arch official rows.
   - `spotify`: AUR, Gentoo, Exherbo, nixpkgs, Chocolatey, Scoop, SlackBuilds… No
     official Debian/Ubuntu/Fedora/openSUSE/Arch rows.
   - `discord`: Arch Linux (official), plus Gentoo, nixpkgs, PackMan openSUSE,
     RPM Fusion Fedora, AOSC… **RPM Fusion and PackMan are tracked by Repology but
     are not official distro repos**, and `auto-fill.ts`'s repo predicates
     (`apt` = debian*/ubuntu*, `dnf` = fedora*, `zypper` = opensuse*, `pacman` =
     arch — scripts/auto-fill.ts:41-46) do not match them, so they would not fill
     `packages:` entries.
3. Consequence for the existing auto-fill flow: `needsFill()` triggers a Repology
   lookup independent of the `repository` field (scripts/auto-fill.ts:610-639), so a
   proprietary program with *any* Repology row (even AUR-only) can still get
   `version` / `license` / `latest_release` filled (extractMetadata picks the
   newest-ranked package regardless of repo, scripts/auto-fill.ts:96-132), while
   `packages:` stays empty unless an official-arch repo row exists. Caveat: the
   discord version values on the cached Repology page (0.0.122) disagree with
   Arch's live package (1.0.159), i.e. Repology page data lags and its project
   normalization for this name mixes the proprietary client with other
   "discord"-named projects — treat its numbers for proprietary apps as low
   confidence.

## b) Flathub and Snap Store APIs

### Flathub

1. **Proprietary apps are on Flathub and its current requirements do not ban
   proprietary licenses** — the task premise ("Flathub policy restricts
   proprietary") is outdated. All four subjects exist:
   `com.google.Chrome`, `com.spotify.Client`, `com.discordapp.Discord`,
   `com.valvesoftware.Steam`, each with `project_license: LicenseRef-proprietary`
   / `is_free_license: false` in the API (verified live,
   https://flathub.org/api/v2/appstream/com.google.Chrome etc.).
   Third-party submissions are explicitly allowed *"as long as the application's
   license and terms of use do not block it"* —
   https://docs.flathub.org/docs/for-app-authors/submission. The inclusion
   rules — https://docs.flathub.org/docs/for-app-authors/requirements — restrict
   categories (thin web wrappers, console apps, Wine-based ports, EOL software),
   not license type. All four subjects are community/third-party packages (none is
   published by the vendor), which is the actual quality caveat.
2. **The v2 API exposes dated releases**: `GET https://flathub.org/api/v2/appstream/{app_id}`
   returns AppStream metadata whose `releases` array holds `{version, timestamp, type}` —
   verified live for all four apps (Chrome 153.0.8010.52 → 2026-09-18, …).
   Implementation: `backend/app/routes/apps.py` in https://github.com/flathub/website
   ("returns the full appstream data including … releases").
3. **But it is a rolling window, not a history**: the published repo metadata
   https://dl.flathub.org/repo/appstream/x86_64/appstream.xml.gz carries only ~4
   recent `<release>` entries per app (checked in the full 2026-09-22 file). Good
   for `latest_release`/current version, not for a `releases:` timeline.
   Timestamps are *Flathub build publication dates*, a few days behind upstream at
   worst, and for some apps the "version" is the wrapper's, not the client's:
   Steam's flatpak releases read 1.0.0.85 (2025-08-19) while the client itself is
   updated in-app and silently.
4. Extras: RSS feeds of last-published dates exist —
   `GET https://flathub.org/api/v2/feed/recently-updated` (HTTP 200 verified;
   source `backend/app/routes/feed.py`, fields `last_updated_at` /
   `initial_release_at`).

### Snap Store

1. **Proprietary is unrestricted** (Canonical store terms aside): verified live via
   `GET https://api.snapcraft.io/api/v1/snaps/details/{name}` with headers
   `X-Ubuntu-Series: 16` (+ `X-Ubuntu-Device-Channel: stable`): `spotify`
   (publisher **Spotify** — official!), `discord` (publisher Snapcrafters),
   `steam` (publisher Canonical), all `license: Proprietary`, `confinement: strict`.
2. **Current version + dates are exposed, history is not.** The v2 endpoint
   `GET https://api.snapcraft.io/v2/snaps/info/{name}` (header
   `Snap-Device-Series: 16`) returns per-channel `version`, `revision`,
   `created-at` (upload) and `released-at` (promotion) — verified for `spotify`
   (latest/stable 1.2.95.453.g0eeebbed, rev 99, 2026-08-12). S1 details add
   `date_published` (first release ever: 2017-08-01 for spotify) and
   `last_updated`. There is **no public per-revision history endpoint**
   (`/v2/snaps/spotify/revisions` and similar → 404; full history lives in the
   publisher dashboard, which matches Repology's "API requires authorization"
   complaint). A `changelog` field exists on S1 details but is empty for all
   three snaps checked.
3. **Google Chrome has no snap**: `snapcraft.io/chrome` and `snapcraft.io/googlechrome`
   return 404 (verified 2026-09-22), and the store search API finds no Chrome snap;
   Google ships .deb/.rpm instead.

## c) How programs without a repository work today

The schema already tolerates it — proprietary apps need no schema change:

- `repository` is `.optional()` and `stars` is `.optional()`, with a superRefine
  rule that `stars` must attach to a catalogued `repository`
  (src/lib/schema.ts:33-52).
- The GitHub release fetcher only runs when `repository` parses as a **github.com**
  URL (`parseGitHubRepo`, `wantsReleases` — scripts/auto-fill.ts:264-270, 597-599),
  so a program with no/other-URL repository simply never gets auto-filled
  `releases:`; ADR 0001 documents the fallback: *"Programs without a GitHub
  repository (emacs, vim, nano) get no list and fall back to the synthetic
  first/latest date markers already in the schema"*
  (docs/adr/0001-committed-release-data.md). Hand-curated `releases:` lists are
  protected from overwrite; `skip_releases: true` (in schema, used by vim) opts a
  program out of refresh entirely.
- The timeline UI (`src/lib/timeline.ts` via the committed `releases:` list) and the
  install tabs (`src/lib/install.ts`, driven purely by `packages:`) both degrade
  gracefully to empty. `packages:` only has the four apt/dnf/pacman/zypper keys —
  there are **no flatpak/snap install axes today**.

## d) Realistic authoritative release-date sources per program

| Program | Verdict | Sources (primary unless noted) |
|---|---|---|
| Google Chrome | **Full dated history, machine-readable, official** | Google's VersionHistory API: `GET https://versionhistory.googleapis.com/v1/chrome/platforms/linux/channels/stable/versions/all/releases` returns every stable release with `serving.startTime` (392 releases for linux/stable at probe time; doc https://developer.chrome.com/docs/web-platform/versionhistory/reference). Also `last-known-good-versions.json` from the Chrome team's GitHub org (current per channel): https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json; and Google's official apt repo (current version only, index holds no history): https://dl.google.com/linux/chrome/deb/dists/stable/main/binary-amd64/Packages |
| Steam | **Dated *update* history official, but version identity is fuzzy** | Valve's public Web API (no auth): `GET https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=593110` — "Steam Client Update - September 1st" posts with unix dates (verified). Client *build IDs* appear in post bodies, not titles; the packaged "version" (1.0.0.87) is the launcher/bootstrapper, not the client (https://repo.steampowered.com/steam/). A timeline of Steam "versions" would be a timeline of launcher releases or of update posts — a modeling decision, not a data lookup. |
| Discord | **No version-keyed official feed** | Official but prose: dated Changelog / Patch Notes posts on the Discord blog (https://discord.com/blog/discord-update-march-24-2026-changelog, https://discord.com/blog/discord-patch-notes-april-6-2026 …) — not keyed to desktop package versions. Current version only from the official download redirect: `https://discord.com/api/download?platform=linux&format=tar.gz` → …/apps/linux/**1.0.159**/… (verified 302). Discord's old apt repo (dl.discordapp.net/apps/linux) is dead (GCS AccessDenied). Version→date mappings exist only in community trackers (secondary: e.g. https://github.com/wavedevgit/discord-versions) or as packaging-side proxies (Flathub release dates 1.0.158/2026-09-14, verified live). |
| Spotify | **Weakest: no official per-version changelog at all** | Spotify staff, official community forum: *"At the moment, we're not able to provide you with a changelog for the app's updates"* (https://community.spotify.com/t5/Desktop-Windows/Changelog-Release-Notes/td-p/5084193, 2020; still no changelog feed found as of 2026-09-22). Official apt repo exposes current version + repo refresh date only: https://repository.spotify.com/dists/stable/Release. Dated version discovery otherwise: Flathub `releases` (tracks upstream versions 1.2.86→1.2.95 with publish dates, verified live), Snap Store current revision, or distro packager histories (Gentoo `media-sound/spotify` https://packages.gentoo.org/packages/media-sound/spotify, AUR) — all one step removed from upstream. Beware aggregator sites that self-label sample/AI-generated data (e.g. whatsnew.fyi). |

## Bottom line

Per program × data axis: available / not available / where (as of 2026-09-22).

| Program | Distro packages (apt/dnf/pacman/zypper) | Flatpak | Snap | Release history (`releases:`) |
|---|---|---|---|---|
| Google Chrome | ✗ official archives (Google's own .deb/.rpm repo only, current ver.) | ✓ `com.google.Chrome`, current+last ~4 dated | ✗ not in store | ✓ **official dated full history** (VersionHistory API) |
| Steam | partial: pacman ✓ (arch/multilib `steam` 1.0.0.87), apt ✓ (Ubuntu multiverse + Debian `steam-installer`; launcher ver.), dnf ✗, zypper ✗ | ✓ `com.valvesoftware.Steam`, wrapper versions, sparse (last 2 dates in 2025) | ✓ `steam` (Canonical), current+dates per channel | ~ official dated *update posts* (ISteamNews), no version-keyed feed |
| Discord | partial: pacman ✓ (arch `discord`), dnf ✗ official (RPM Fusion tracked by Repology but not mapped by auto-fill), apt ✗, zypper ✗ (PackMan only) | ✓ `com.discordapp.Discord`, last ~4 dated (1.0.158/2026-09-14) | ✓ `discord` (Snapcrafters), current+dates | ✗ no version-keyed official feed; blog posts not versioned |
| Spotify | ✗ official archives (Gentoo/AUR/nixpkgs only) | ✓ `com.spotify.Client`, last ~4 dated, upstream version numbers | ✓ `spotify` (**official** publisher), current+dates | ✗ officially none; Flathub/snap/distro dates are proxies |

Implications for the refresher, stated as facts:
- A flathub/snap source would add *"current version + last few publish dates"* per
  app via simple unauthenticated JSON APIs, but never a full timeline — the
  history axis for proprietary apps is only machine-readable for Chrome today.
- Repology contributes little for these four: it explicitly excludes both
  universal-package formats, and the four programs are largely absent from the
  official distro repos that Repology does track.
- The schema/install layer already supports no-repository / no-history programs
  (c), so the gap is about *data sourcing policy* per program, not about missing
  fields. Adding `flatpak`/`snap` as new `packages:` keys would be the schema-side
  counterpart if the catalog policy goes that way (install.ts has a fixed
  four-distro registry today, src/lib/install.ts:3-20).

## Caveats

- repology.org was unreachable from this network (resolver returns 127.0.0.1 even
  via public DoH); its facts above come from Repology's own source templates
  (GitHub) and search-engine caches of its project pages, which may lag. Verify
  the four project pages before relying on specific version numbers.
- All API probes are point-in-time (2026-09-22) against production endpoints;
  response shapes (Flathub v2, Snapcraft S1/S2) are documented in the open-source
  repos cited and are reasonably stable, but headers/fields (e.g. Snapcraft's
  `Snap-Device-Series`) are worth pinning in any implementation.
