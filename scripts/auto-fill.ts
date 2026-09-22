import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseDocument, Scalar, YAMLMap, type Document } from "yaml";
import { contentDir } from "../src/lib/programs";
import type { DistroId } from "../src/lib/install";
import type { Release } from "../src/lib/schema";

export interface RepologyPackage {
  repo: string;
  subrepo?: string;
  srcname?: string;
  binname?: string;
  visiblename?: string;
  binnames?: string[];
  version?: string;
  status?: string;
  licenses?: string[];
  license?: string;
  date?: string;
  latest_release?: string;
  updated?: string;
}

export interface ExtractedMetadata {
  version?: string;
  license?: string;
  latest_release?: string;
  packages?: Partial<Record<DistroId, string>>;
}

export interface GitHubRelease {
  tag_name: string;
  name?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string | null;
  created_at?: string | null;
}

const DISTRO_REPOS: Record<DistroId, (repo: string) => boolean> = {
  apt: (repo) => repo.startsWith("debian") || repo.startsWith("ubuntu"),
  dnf: (repo) => repo.startsWith("fedora"),
  pacman: (repo) => repo === "arch",
  zypper: (repo) => repo.startsWith("opensuse"),
};

const repoRank = (repo: string): number => {
  if (repo === "arch") return 1;
  if (repo === "fedora_rawhide") return 2;
  if (repo.startsWith("fedora_")) return 3;
  if (repo === "debian_unstable") return 4;
  if (repo.startsWith("debian_")) return 5;
  if (repo.startsWith("ubuntu_")) return 6;
  if (repo.startsWith("opensuse")) return 7;
  return 100;
};

const SECONDARY_BINARY = /-(doc|docs|lang|data|debug|dbg|dev|devel|static|completion)s?$/i;

const isPrimaryPackage = (pkg: RepologyPackage): boolean => {
  const binary = pkg.binname ?? pkg.visiblename ?? "";
  if (!binary) return true;
  if (pkg.srcname && binary === pkg.srcname) return true;
  return !SECONDARY_BINARY.test(binary);
};

const packageName = (pkg: RepologyPackage): string | undefined =>
  pkg.binname?.trim() ||
  pkg.binnames?.find((name) => name.trim())?.trim() ||
  pkg.visiblename?.trim() ||
  pkg.srcname?.trim();

const byPreference = (a: RepologyPackage, b: RepologyPackage): number => {
  const newestA = a.status === "newest" ? 0 : 1;
  const newestB = b.status === "newest" ? 0 : 1;
  return newestA - newestB || repoRank(a.repo) - repoRank(b.repo);
};

const licenseOf = (pkg: RepologyPackage | undefined): string | undefined => {
  if (!pkg) return undefined;
  const list = pkg.licenses?.map((value) => value.trim()).filter(Boolean);
  if (list && list.length > 0) return list.join(" AND ");
  const single = pkg.license?.trim();
  return single || undefined;
};

const dateOf = (pkg: RepologyPackage | undefined): string | undefined => {
  if (!pkg) return undefined;
  const raw = (pkg.latest_release ?? pkg.date ?? pkg.updated ?? "").trim();
  if (!raw) return undefined;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(raw);
  return match ? match[0] : undefined;
};

export function extractMetadata(
  packages: RepologyPackage[]
): ExtractedMetadata {
  const primary = packages.filter(isPrimaryPackage);
  const pool = primary.length > 0 ? primary : packages;
  const sorted = [...pool].sort(byPreference);
  const chosen = sorted[0];

  const metadata: ExtractedMetadata = {};

  const version = chosen?.version?.trim();
  if (version) metadata.version = version;

  const license = licenseOf(chosen) ?? licenseOf(sorted.find((p) => licenseOf(p)));
  if (license) metadata.license = license;

  const release = dateOf(chosen);
  if (release) metadata.latest_release = release;

  const resolvedPackages: Partial<Record<DistroId, string>> = {};
  for (const [distro, matches] of Object.entries(DISTRO_REPOS) as [
    DistroId,
    (repo: string) => boolean,
  ][]) {
    const candidate = pool
      .filter((pkg) => matches(pkg.repo))
      .sort(byPreference)
      .map(packageName)
      .find((name): name is string => Boolean(name));
    if (candidate) resolvedPackages[distro] = candidate;
  }
  if (Object.keys(resolvedPackages).length > 0) {
    metadata.packages = resolvedPackages;
  }

  return metadata;
}

export interface ApplyResult {
  data: Record<string, unknown>;
  changed: boolean;
  fields: string[];
}

const isBlank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "");

export function applyMissingFields(
  data: Record<string, unknown>,
  metadata: ExtractedMetadata
): ApplyResult {
  const next: Record<string, unknown> = { ...data };
  const fields: string[] = [];

  for (const field of ["version", "license", "latest_release"] as const) {
    const value = metadata[field];
    if (value && isBlank(next[field])) {
      next[field] = value;
      fields.push(field);
    }
  }

  const existingPackages =
    next.packages && typeof next.packages === "object"
      ? { ...(next.packages as Record<string, unknown>) }
      : {};

  for (const [distro, name] of Object.entries(metadata.packages ?? {})) {
    if (name && isBlank(existingPackages[distro])) {
      existingPackages[distro] = name;
      fields.push(`packages.${distro}`);
    }
  }

  if (Object.keys(existingPackages).length > 0) {
    next.packages = existingPackages;
  }

  return { data: next, changed: fields.length > 0, fields };
}

export function needsFill(data: Record<string, unknown>): boolean {
  if (["version", "license", "latest_release"].some((field) => isBlank(data[field]))) {
    return true;
  }
  const packages = data.packages;
  if (isBlank(packages)) return true;
  if (packages && typeof packages === "object") {
    const values = Object.values(packages as Record<string, unknown>);
    if (values.length === 0 || values.some((value) => isBlank(value))) return true;
  }
  return false;
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const USER_AGENT = "linuxshelf/1.0 (auto-fill script)";

/** Fetch a JSON body, throwing on HTTP errors or timeouts. */
async function fetchJson(
  url: string,
  headers: Record<string, string>,
  { fetchImpl = fetch, timeoutMs = 15000 }: FetchOptions = {}
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a JSON array, throwing on unexpected bodies. */
async function fetchJsonArray(
  url: string,
  headers: Record<string, string>,
  options: FetchOptions = {}
): Promise<unknown[]> {
  const json = await fetchJson(url, headers, options);
  if (!Array.isArray(json)) throw new Error("unexpected response body");
  return json;
}

export async function fetchRepology(
  project: string,
  options: FetchOptions = {}
): Promise<RepologyPackage[] | null> {
  const url = `https://repology.org/api/v1/project/${encodeURIComponent(project)}`;
  try {
    const json = await fetchJsonArray(
      url,
      { Accept: "application/json", "User-Agent": USER_AGENT },
      options
    );
    return json as RepologyPackage[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  ! Repology lookup failed for "${project}": ${message}`);
    return null;
  }
}

/** A Repology project name may differ from our slug; try the lookup names in order. */
export function lookupNames(data: Record<string, unknown>): string[] {
  const names: string[] = [];
  const candidates = [
    data.repology,
    data.slug,
    typeof data.name === "string" ? data.name.toLowerCase().replace(/\s+/g, "-") : undefined,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() && !names.includes(candidate.trim())) {
      names.push(candidate.trim());
    }
  }
  return names;
}

export function parseGitHubRepo(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  const match = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?(?:[#?].*)?$/i
    .exec(url.trim());
  if (!match) return undefined;
  return `${match[1]}/${match[2]}`;
}

/** Strip a v-prefix only when a digit follows, so tags like vim-9.0 survive. */
export function normalizeReleaseVersion(tag: string): string {
  return tag.trim().replace(/^v(?=\d)/i, "");
}

export function extractReleases(releases: GitHubRelease[]): Release[] {
  const byVersion = new Map<string, Release>();
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const version = normalizeReleaseVersion(release.tag_name ?? "");
    const date = (release.published_at ?? release.created_at ?? "").slice(0, 10);
    if (!version || !/\d/.test(version) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const existing = byVersion.get(version);
    if (!existing || date < existing.date) byVersion.set(version, { version, date });
  }
  return [...byVersion.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const GITHUB_PER_PAGE = 100;
const GITHUB_MAX_PAGES = 10;

function githubHeaders(): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {}),
  };
}

export async function fetchGitHubStars(
  repo: string,
  options: FetchOptions = {}
): Promise<number | null> {
  try {
    const json = (await fetchJson(
      `https://api.github.com/repos/${repo}`,
      githubHeaders(),
      options
    )) as { stargazers_count?: unknown };
    const count = json?.stargazers_count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new Error("no star count in response");
    }
    return count;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  ! GitHub star lookup failed for "${repo}": ${message}`);
    return null;
  }
}

/** Fetch a paginated GitHub array endpoint, newest items first, up to maxPages. Throws on failure. */
async function fetchGitHubPages<T>(
  url: (page: number) => string,
  maxPages: number,
  options: FetchOptions = {}
): Promise<T[]> {
  const headers = githubHeaders();
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const json = await fetchJsonArray(url(page), headers, options);
    all.push(...(json as T[]));
    if (json.length < GITHUB_PER_PAGE) break;
  }
  return all;
}

async function fetchGitHubReleases(
  repo: string,
  options: FetchOptions = {},
  maxPages = GITHUB_MAX_PAGES
): Promise<GitHubRelease[] | null> {
  try {
    return await fetchGitHubPages<GitHubRelease>(
      (page) => `https://api.github.com/repos/${repo}/releases?per_page=${GITHUB_PER_PAGE}&page=${page}`,
      maxPages,
      options
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  ! GitHub release lookup failed for "${repo}": ${message}`);
    return null;
  }
}

interface GitHubTag {
  name: string;
}

interface GitHubCommit {
  commit?: {
    committer?: { date?: string };
    author?: { date?: string };
  };
}

async function fetchGitHubTagNames(
  repo: string,
  options: FetchOptions = {},
  maxPages = GITHUB_MAX_PAGES
): Promise<string[]> {
  const tags = await fetchGitHubPages<GitHubTag>(
    (page) => `https://api.github.com/repos/${repo}/tags?per_page=${GITHUB_PER_PAGE}&page=${page}`,
    maxPages,
    options
  );
  return tags.map((tag) => tag.name);
}

/** Tags carry no date of their own, so resolve the tagged commit. Throws on failure. */
async function fetchTagDate(repo: string, tag: string, options: FetchOptions = {}): Promise<string> {
  const url = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(tag)}`;
  const json = (await fetchJson(url, githubHeaders(), options)) as GitHubCommit;
  const date = json?.commit?.committer?.date ?? json?.commit?.author?.date;
  if (!date) throw new Error(`no date for tag "${tag}"`);
  return date;
}

/** Reshape a stored Release as an API record so extractReleases can dedupe and sort it. */
const asGitHubRelease = (release: Release): GitHubRelease => ({
  tag_name: release.version,
  published_at: `${release.date}T00:00:00Z`,
});

/**
 * Append genuinely new versions to the stored list. Stored entries always win:
 * a fetched version already stored is dropped, and a refresh that finds nothing
 * new returns `stored` untouched, in its original order.
 */
function mergeHistories(stored: Release[], fetched: Release[]): Release[] {
  const storedVersions = new Set(stored.map((release) => normalizeReleaseVersion(release.version)));
  const fresh = fetched.filter((release) => !storedVersions.has(normalizeReleaseVersion(release.version)));
  if (fresh.length === 0) return stored;
  return extractReleases([...stored.map(asGitHubRelease), ...fresh.map(asGitHubRelease)]);
}

const KNOWN_STOP_MARGIN = 3;

/**
 * Repositories that tag every patch commit (vim: 6000+ tags) would blow the
 * rate limit and render a useless timeline; they get curated `releases` lists
 * instead.
 */
const MAX_TAG_DATES = 250;

/** Tags like "latest" or "nightly-build" are not versions and get no timeline point. */
const isVersionLike = (tag: string): boolean => /^\d/.test(normalizeReleaseVersion(tag));

/**
 * GitHub lists tags newest-first, but releases can be backported to old
 * branches, so keep scanning past the first known tag until several known
 * tags follow in a row.
 */
function unknownTags(stored: Release[], tagNames: string[]): string[] {
  const known = new Set(stored.map((release) => release.version));
  const fresh: string[] = [];
  let consecutiveKnown = 0;
  for (const name of tagNames) {
    if (known.has(normalizeReleaseVersion(name))) {
      consecutiveKnown += 1;
      if (consecutiveKnown >= KNOWN_STOP_MARGIN) break;
    } else {
      consecutiveKnown = 0;
      fresh.push(name);
    }
  }
  return fresh;
}

/**
 * The release history for a GitHub-backed program: formal Releases when the
 * repository publishes them, otherwise plain git Tags resolved to dates via
 * their tagged commits. With a non-empty `stored` list it only fetches the
 * newest page and resolves dates for versions not stored yet, merging the
 * result with `stored`. Returns null when the history could not be fetched
 * completely — callers keep whatever they already have. A full tag backfill
 * costs one request per tag, so prefer running with GITHUB_TOKEN set.
 */
export async function fetchReleaseHistory(
  repo: string,
  stored: Release[],
  options: FetchOptions & { force?: boolean } = {}
): Promise<Release[] | null> {
  const incremental = !options.force && stored.length > 0;
  const maxPages = incremental ? 1 : GITHUB_MAX_PAGES;
  const githubReleases = await fetchGitHubReleases(repo, options, maxPages);
  if (githubReleases === null) return null;
  const fetched = extractReleases(githubReleases);
  if (fetched.length > 0) {
    return incremental ? mergeHistories(stored, fetched) : fetched;
  }

  try {
    const tagNames = (await fetchGitHubTagNames(repo, options, maxPages)).filter(isVersionLike);
    const pending = incremental ? unknownTags(stored, tagNames) : tagNames;
    if (pending.length > MAX_TAG_DATES) {
      console.warn(
        `  ! GitHub tag lookup for "${repo}": too many tags (${pending.length}) to resolve in one run, skipping`
      );
      return null;
    }
    const records: GitHubRelease[] = [];
    for (const name of pending) {
      records.push({ tag_name: name, published_at: await fetchTagDate(repo, name, options) });
    }
    const tagEntries = extractReleases(records);
    if (!incremental) return tagEntries.length > 0 ? tagEntries : null;
    return mergeHistories(stored, tagEntries);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  ! GitHub tag lookup failed for "${repo}": ${message}`);
    return null;
  }
}

/**
 * Well-formed releases already stored in the program YAML, or null when the
 * list exists but holds entries this script cannot represent — such files are
 * left entirely alone rather than silently rewritten without those entries.
 */
function storedReleases(data: Record<string, unknown>): Release[] | null {
  if (!Array.isArray(data.releases)) return [];
  const valid = data.releases.flatMap((entry) => {
    const release = entry as Partial<Release> | null;
    if (
      typeof release?.version === "string" &&
      typeof release?.date === "string" &&
      DATE_LIKE.test(release.date)
    ) {
      return [{ version: release.version, date: release.date }];
    }
    return [];
  });
  return valid.length === data.releases.length ? valid : null;
}

function sameReleases(a: Release[], b: Release[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, index) => entry.version === b[index].version && entry.date === b[index].date)
  );
}

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * js-yaml follows YAML 1.1 and parses bare YYYY-MM-DD scalars as Date
 * objects, so any string that could be misread on re-parse is quoted.
 */
function quotedString(value: unknown): Scalar {
  const node = new Scalar(typeof value === "string" ? value : String(value));
  node.type = "QUOTE_DOUBLE";
  return node;
}

function setQuotedField(doc: Document, path: string[], value: unknown): void {
  const needsQuotes = typeof value === "string" && (DATE_LIKE.test(value) || Number.isFinite(Number(value)));
  doc.setIn(path, needsQuotes ? quotedString(value) : value);
}

function setQuotedReleases(doc: Document, releases: Release[]): void {
  const node = doc.createNode(releases);
  if (node instanceof YAMLMap) throw new Error("expected a sequence node");
  for (const entry of node.items) {
    if (entry instanceof YAMLMap) {
      for (const pair of entry.items) {
        if (pair.value instanceof Scalar) pair.value.type = "QUOTE_DOUBLE";
      }
    }
  }
  doc.setIn(["releases"], node);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RunOptions {
  dir?: string;
  only?: string;
  dryRun?: boolean;
  force?: boolean;
  stars?: boolean;
  fetchImpl?: typeof fetch;
  delayMs?: number;
}

export async function runAutoFill({
  dir = contentDir,
  only,
  dryRun = false,
  force = false,
  stars = false,
  fetchImpl,
  delayMs = 1000,
}: RunOptions = {}): Promise<number> {
  const target = only ? `${only.replace(/\.ya?ml$/, "")}.yaml` : null;
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .filter((file) => !target || file === target)
    .sort();

  let changedCount = 0;
  let lookupCount = 0;

  for (const file of files) {
    const path = join(dir, file);
    const doc = parseDocument(readFileSync(path, "utf8"));
    const data = doc.toJS() as Record<string, unknown> | null;
    if (!data || typeof data !== "object") {
      console.warn(`  ! Skipping ${file}: not a YAML mapping`);
      continue;
    }

    const repo = parseGitHubRepo(data.repository);
    const wantsReleases = repo !== undefined;
    const wantsStars = stars && repo !== undefined;
    const wantsStarsClear = stars && repo === undefined && data.stars !== undefined;

    if (!needsFill(data) && !wantsReleases && !wantsStars && !wantsStarsClear) {
      console.log(`  = ${file}: nothing to fill`);
      continue;
    }

    const fields: string[] = [];

    if (needsFill(data)) {
      let metadata: ExtractedMetadata | null = null;
      for (const project of lookupNames(data)) {
        if (lookupCount > 0) await sleep(delayMs);
        lookupCount += 1;
        console.log(`  → ${file}: querying Repology for "${project}"`);
        const response = await fetchRepology(project, { fetchImpl });
        if (response) {
          metadata = extractMetadata(response);
          break;
        }
      }

      if (metadata) {
        const applied = applyMissingFields(data, metadata);
        for (const field of applied.fields) {
          const value = field.split(".").reduce<unknown>(
            (acc, key) =>
              acc && typeof acc === "object"
                ? (acc as Record<string, unknown>)[key]
                : undefined,
            applied.data
          );
          if (!dryRun) setQuotedField(doc, field.split("."), value);
        }
        fields.push(...applied.fields);
      } else {
        console.warn(`  ! ${file}: no usable Repology data`);
      }
    }

    if (wantsReleases) {
      if (lookupCount > 0) await sleep(delayMs);
      lookupCount += 1;
      console.log(`  → ${file}: querying GitHub for "${repo}"`);
      const stored = storedReleases(data);
      if (stored === null) {
        console.warn(`  ! ${file}: releases list is malformed, leaving it untouched`);
      } else {
        const next = await fetchReleaseHistory(repo!, stored, { force, fetchImpl });
        if (next === null) {
          console.warn(`  ! ${file}: no usable GitHub release data`);
        } else if (!sameReleases(stored, next)) {
          if (!dryRun) setQuotedReleases(doc, next);
          fields.push("releases");
        }
      }
    } else if (force && repo === undefined) {
      console.warn(`  ! ${file}: no GitHub repository, cannot fill releases`);
    }

    if (wantsStars) {
      if (lookupCount > 0) await sleep(delayMs);
      lookupCount += 1;
      console.log(`  → ${file}: fetching GitHub stars for "${repo}"`);
      const count = await fetchGitHubStars(repo!, { fetchImpl });
      if (count === null) {
        console.warn(`  ! ${file}: no usable GitHub star data`);
      } else if (count !== data.stars) {
        if (!dryRun) setQuotedField(doc, ["stars"], count);
        fields.push("stars");
      }
    }

    if (wantsStarsClear) {
      console.log(`  → ${file}: repository is not on GitHub, clearing stale stars`);
      if (!dryRun) doc.deleteIn(["stars"]);
      fields.push("stars");
    }

    if (fields.length === 0) continue;

    if (dryRun) {
      console.log(`  + ${file}: would fill ${fields.join(", ")} (dry run)`);
    } else {
      writeFileSync(path, doc.toString({ lineWidth: 0 }));
      console.log(`  + ${file}: filled ${fields.join(", ")}`);
    }
    changedCount += 1;
  }

  console.log(
    `\n${changedCount} file(s) ${dryRun ? "to update" : "updated"}, ${lookupCount} lookup(s).`
  );
  return changedCount;
}

const isDirectRun = (): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
};

if (isDirectRun()) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const all = args.includes("--all");
  const stars = args.includes("--stars");
  const projectIndex = args.indexOf("--project");
  const only = projectIndex >= 0 ? args[projectIndex + 1] : undefined;

  if (force && !only && !all) {
    console.error(
      "`--force` overwrites curated release lists; pass `--project <slug>` to refresh one program, or `--all` to refresh every program."
    );
    process.exit(1);
  }

  await runAutoFill({ dryRun, force, stars, only });
}
