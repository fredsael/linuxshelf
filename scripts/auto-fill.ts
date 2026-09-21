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

/** Fetch a JSON array, throwing on HTTP errors, timeouts or unexpected bodies. */
async function fetchJsonArray(
  url: string,
  headers: Record<string, string>,
  { fetchImpl = fetch, timeoutMs = 15000 }: FetchOptions = {}
): Promise<unknown[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as unknown;
    if (!Array.isArray(json)) throw new Error("unexpected response body");
    return json;
  } finally {
    clearTimeout(timer);
  }
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
    if (!version || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const existing = byVersion.get(version);
    if (!existing || date < existing.date) byVersion.set(version, { version, date });
  }
  return [...byVersion.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const GITHUB_PER_PAGE = 100;
const GITHUB_MAX_PAGES = 10;

export async function fetchGitHubReleases(
  repo: string,
  options: FetchOptions = {}
): Promise<GitHubRelease[] | null> {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {}),
  };
  try {
    const all: GitHubRelease[] = [];
    for (let page = 1; page <= GITHUB_MAX_PAGES; page += 1) {
      const url = `https://api.github.com/repos/${repo}/releases?per_page=${GITHUB_PER_PAGE}&page=${page}`;
      const json = await fetchJsonArray(url, headers, options);
      all.push(...(json as GitHubRelease[]));
      if (json.length < GITHUB_PER_PAGE) break;
    }
    return all;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  ! GitHub release lookup failed for "${repo}": ${message}`);
    return null;
  }
}

export function needsReleases(data: Record<string, unknown>): boolean {
  const repo = parseGitHubRepo(data.repository);
  if (!repo) return false;
  return !Array.isArray(data.releases) || data.releases.length === 0;
}

export function applyReleases(
  data: Record<string, unknown>,
  entries: Release[],
  force = false
): Release[] | null {
  if (entries.length === 0) return null;
  const existing = Array.isArray(data.releases) ? (data.releases as unknown[]) : [];
  if (existing.length > 0 && !force) return null;
  return entries;
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
  fetchImpl?: typeof fetch;
  delayMs?: number;
}

export async function runAutoFill({
  dir = contentDir,
  only,
  dryRun = false,
  force = false,
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
    const wantsReleases = repo !== undefined && (force || needsReleases(data));

    if (!needsFill(data) && !wantsReleases) {
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
      const githubReleases = await fetchGitHubReleases(repo!, { fetchImpl });
      const entries = githubReleases ? extractReleases(githubReleases) : [];
      const nextReleases = applyReleases(data, entries, force);
      if (nextReleases) {
        if (!dryRun) setQuotedReleases(doc, nextReleases);
        fields.push("releases");
      } else if (entries.length === 0) {
        console.warn(`  ! ${file}: no usable GitHub release data`);
      }
    } else if (force && repo === undefined) {
      console.warn(`  ! ${file}: no GitHub repository, cannot fill releases`);
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
  const projectIndex = args.indexOf("--project");
  const only = projectIndex >= 0 ? args[projectIndex + 1] : undefined;

  if (force && !only && !all) {
    console.error(
      "`--force` overwrites curated release lists; pass `--project <slug>` to refresh one program, or `--all` to refresh every program."
    );
    process.exit(1);
  }

  await runAutoFill({ dryRun, force, only });
}
