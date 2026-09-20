import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseDocument } from "yaml";
import { contentDir } from "../src/lib/programs";
import type { DistroId } from "../src/lib/install";

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

export async function fetchRepology(
  project: string,
  { fetchImpl = fetch, timeoutMs = 15000 }: FetchOptions = {}
): Promise<RepologyPackage[] | null> {
  const url = `https://repology.org/api/v1/project/${encodeURIComponent(project)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "linux-programs-explorer/1.0 (auto-fill script)",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as unknown;
    if (!Array.isArray(json)) throw new Error("unexpected response body");
    return json as RepologyPackage[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  ! Repology lookup failed for "${project}": ${message}`);
    return null;
  } finally {
    clearTimeout(timer);
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RunOptions {
  dir?: string;
  only?: string;
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
  delayMs?: number;
}

export async function runAutoFill({
  dir = contentDir,
  only,
  dryRun = false,
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

    if (!needsFill(data)) {
      console.log(`  = ${file}: nothing to fill`);
      continue;
    }

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

    if (!metadata) {
      console.warn(`  ! ${file}: no usable Repology data, leaving unchanged`);
      continue;
    }

    const { data: next, changed, fields } = applyMissingFields(data, metadata);
    if (!changed) continue;

    if (dryRun) {
      console.log(`  + ${file}: would fill ${fields.join(", ")} (dry run)`);
    } else {
      for (const field of fields) {
        const value = field.split(".").reduce<unknown>(
          (acc, key) =>
            acc && typeof acc === "object"
              ? (acc as Record<string, unknown>)[key]
              : undefined,
          next
        );
        doc.setIn(field.split("."), value);
      }
      writeFileSync(path, doc.toString());
      console.log(`  + ${file}: filled ${fields.join(", ")}`);
    }
    changedCount += 1;
  }

  console.log(
    `\n${changedCount} file(s) ${dryRun ? "to update" : "updated"}, ${lookupCount} Repology lookup(s).`
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
  const projectIndex = args.indexOf("--project");
  const only = projectIndex >= 0 ? args[projectIndex + 1] : undefined;

  await runAutoFill({ dryRun, only });
}
