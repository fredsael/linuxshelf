import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyMissingFields,
  applyReleases,
  extractMetadata,
  extractReleases,
  fetchRepology,
  fetchGitHubStars,
  needsFill,
  needsReleases,
  parseGitHubRepo,
  runAutoFill,
  type GitHubRelease,
  type RepologyPackage,
} from "../scripts/auto-fill";
import { loadPrograms } from "../src/lib/programs";

const repologyResponse: RepologyPackage[] = [
  {
    repo: "debian_13",
    srcname: "neovim",
    binname: "neovim-doc",
    visiblename: "neovim-doc",
    version: "0.9.5",
    status: "outdated",
    licenses: ["Apache-2.0"],
  },
  {
    repo: "debian_13",
    srcname: "neovim",
    binname: "neovim",
    visiblename: "neovim",
    version: "0.9.5",
    status: "outdated",
    licenses: ["Apache-2.0", "Vim"],
  },
  {
    repo: "fedora_43",
    srcname: "neovim",
    binname: "neovim",
    visiblename: "neovim",
    version: "0.11.2",
    status: "newest",
    licenses: ["Apache-2.0 AND Vim"],
  },
  {
    repo: "opensuse_tumbleweed",
    srcname: "neovim",
    binname: "neovim",
    visiblename: "neovim",
    version: "0.11.4",
    status: "newest",
    licenses: ["Apache-2.0"],
  },
  {
    repo: "arch",
    srcname: "neovim",
    binname: "neovim",
    visiblename: "neovim",
    version: "0.12.5",
    status: "newest",
    licenses: ["Apache-2.0", "LicenseRef-vim"],
  },
];

const dirs: string[] = [];

function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "auto-fill-test-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const mockFetch = (response: unknown, ok = true, status = 200) =>
  vi.fn(
    async () =>
      ({
        ok,
        status,
        statusText: ok ? "OK" : "Not Found",
        json: async () => response,
      }) as Response
  );

describe("extractMetadata", () => {
  it("picks version, license, and package names from preferred distros", () => {
    const metadata = extractMetadata(repologyResponse);

    expect(metadata.version).toBe("0.12.5");
    expect(metadata.license).toBe("Apache-2.0 AND LicenseRef-vim");
    expect(metadata.packages).toEqual({
      apt: "neovim",
      dnf: "neovim",
      pacman: "neovim",
      zypper: "neovim",
    });
  });

  it("ignores secondary binary packages such as docs and language packs", () => {
    const metadata = extractMetadata([
      {
        repo: "debian_13",
        srcname: "neovim",
        binname: "neovim-lang",
        version: "0.9.5",
        status: "newest",
      },
      {
        repo: "debian_13",
        srcname: "neovim",
        binname: "neovim",
        version: "0.9.5",
        status: "newest",
      },
    ]);

    expect(metadata.version).toBe("0.9.5");
    expect(metadata.packages?.apt).toBe("neovim");
  });

  it("returns only what the API provides", () => {
    const metadata = extractMetadata([
      { repo: "arch", srcname: "thing", version: "2.0", status: "newest" },
    ]);

    expect(metadata.version).toBe("2.0");
    expect(metadata.license).toBeUndefined();
    expect(metadata.packages).toEqual({ pacman: "thing" });
  });

  it("returns an empty result for an empty response", () => {
    expect(extractMetadata([])).toEqual({});
  });
});

describe("applyMissingFields", () => {
  const metadata = {
    version: "2.0",
    license: "MIT",
    packages: { apt: "thing", pacman: "thing" },
  };

  it("fills blank fields", () => {
    const result = applyMissingFields(
      { version: "", license: "  ", packages: { apt: "", dnf: "" } },
      metadata
    );

    expect(result.changed).toBe(true);
    expect(result.data).toEqual({
      version: "2.0",
      license: "MIT",
      packages: { apt: "thing", dnf: "", pacman: "thing" },
    });
    expect(result.fields).toEqual([
      "version",
      "license",
      "packages.apt",
      "packages.pacman",
    ]);
  });

  it("never overwrites existing values", () => {
    const result = applyMissingFields(
      { version: "1.0", license: "GPL-3.0", packages: { apt: "pinned-name" } },
      metadata
    );

    expect(result.data).toEqual({
      version: "1.0",
      license: "GPL-3.0",
      packages: { apt: "pinned-name", pacman: "thing" },
    });
    expect(result.fields).toEqual(["packages.pacman"]);
  });

  it("leaves fully populated fields untouched", () => {
    const result = applyMissingFields(
      {
        version: "1.0",
        license: "GPL-3.0",
        packages: { apt: "pinned-name", pacman: "pinned-arch" },
      },
      metadata
    );

    expect(result.changed).toBe(false);
    expect(result.fields).toEqual([]);
  });
});

describe("needsFill", () => {
  it("is true when any auto-fillable field is blank", () => {
    expect(needsFill({ version: "" })).toBe(true);
    expect(needsFill({ version: "1.0", license: "MIT" })).toBe(true);
    expect(needsFill({ version: "1.0", license: "MIT", packages: {} })).toBe(true);
    expect(
      needsFill({ version: "1.0", license: "MIT", packages: { apt: "" } })
    ).toBe(true);
  });

  it("is false when everything is already filled", () => {
    expect(
      needsFill({
        version: "1.0",
        license: "MIT",
        latest_release: "2024-01-01",
        packages: { apt: "thing" },
      })
    ).toBe(false);
  });
});

describe("fetchRepology", () => {
  it("returns the parsed package list", async () => {
    const packages = await fetchRepology("neovim", {
      fetchImpl: mockFetch(repologyResponse) as unknown as typeof fetch,
    });

    expect(packages).toHaveLength(5);
    expect(packages?.[0].repo).toBe("debian_13");
  });

  it("returns null and warns on an HTTP error instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const packages = await fetchRepology("neovim", {
      fetchImpl: mockFetch({}, false, 404) as unknown as typeof fetch,
    });

    expect(packages).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("404"));
  });

  it("returns null on a network failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(fetchRepology("neovim", { fetchImpl: failing })).resolves.toBeNull();
  });
});

describe("parseGitHubRepo", () => {
  it("extracts owner/repo from plain, .git and trailing-slash URLs", () => {
    expect(parseGitHubRepo("https://github.com/neovim/neovim")).toBe("neovim/neovim");
    expect(parseGitHubRepo("https://github.com/neovim/neovim.git")).toBe("neovim/neovim");
    expect(parseGitHubRepo("https://github.com/neovim/neovim/")).toBe("neovim/neovim");
    expect(parseGitHubRepo("http://www.github.com/a/b/issues")).toBeUndefined();
  });

  it("returns undefined for non-GitHub or missing URLs", () => {
    expect(parseGitHubRepo("https://gitlab.com/foo/bar")).toBeUndefined();
    expect(parseGitHubRepo(undefined)).toBeUndefined();
  });
});

describe("extractReleases", () => {
  const release = (
    tag: string,
    published: string | null,
    flags: Partial<GitHubRelease> = {}
  ): GitHubRelease => ({
    tag_name: tag,
    published_at: published,
    draft: false,
    prerelease: false,
    ...flags,
  });

  it("keeps stable releases sorted by date with v-prefix stripped", () => {
    const entries = extractReleases([
      release("v0.10.0", "2024-01-30T12:00:00Z"),
      release("v0.11.0", "2025-02-01T12:00:00Z"),
    ]);

    expect(entries).toEqual([
      { version: "0.10.0", date: "2024-01-30" },
      { version: "0.11.0", date: "2025-02-01" },
    ]);
  });

  it("drops drafts, prereleases and undated entries", () => {
    const entries = extractReleases([
      release("v1.0.0", "2024-01-01T00:00:00Z", { draft: true }),
      release("v1.1.0", "2024-06-01T00:00:00Z", { prerelease: true }),
      release("v1.2.0", null, { created_at: null }),
      release("v1.3.0", "2024-08-01T00:00:00Z"),
    ]);

    expect(entries).toEqual([{ version: "1.3.0", date: "2024-08-01" }]);
  });

  it("deduplicates versions, keeping the earliest date", () => {
    const entries = extractReleases([
      release("v1.0.0", "2024-05-05T00:00:00Z"),
      release("1.0.0", "2024-01-01T00:00:00Z"),
    ]);

    expect(entries).toEqual([{ version: "1.0.0", date: "2024-01-01" }]);
  });

  it("only strips a v-prefix when a digit follows, keeping tags like vim-9.0 intact", () => {
    const entries = extractReleases([
      release("v0.10.0", "2024-01-30T12:00:00Z"),
      release("vim-9.0", "2024-06-01T12:00:00Z"),
    ]);

    expect(entries).toEqual([
      { version: "0.10.0", date: "2024-01-30" },
      { version: "vim-9.0", date: "2024-06-01" },
    ]);
  });
});

const routedFetch = (routes: [RegExp, unknown][]) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = routes.find(([pattern]) => pattern.test(url));
    if (!match) throw new Error(`unexpected fetch: ${url}`);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => match[1],
    } as Response;
  });

const filledProgram = `name: Filled Program
slug: filled-program
category: Utilities
description:
  short: A fully filled program.
  full: |
    ## What is it?
    Test fixture.
license: MIT
version: "2.0.0"
latest_release: "2024-01-01"
homepage: https://example.com/filled-program
repository: https://github.com/example/filled-program
packages:
  apt: filled-program
  dnf: filled-program
  pacman: filled-program
  zypper: filled-program
related: []
`;

describe("GitHub releases in runAutoFill", () => {
  const ghReleases = [
    { tag_name: "v2.0.0", published_at: "2024-01-01T00:00:00Z", draft: false, prerelease: false },
    { tag_name: "v2.1.0", published_at: "2024-06-01T00:00:00Z", draft: false, prerelease: true },
    { tag_name: "v1.0.0", published_at: "2023-01-01T00:00:00Z", draft: false, prerelease: false },
  ];

  it("fills releases when the list is absent", async () => {
    const dir = fixtureDir({ "filled-program.yaml": filledProgram });
    const fetchImpl = routedFetch([[/^https:\/\/api\.github\.com\//, ghReleases]]);

    const changed = await runAutoFill({
      dir,
      delayMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(changed).toBe(1);
    const program = loadPrograms(dir)[0];
    expect(program.releases).toEqual([
      { version: "1.0.0", date: "2023-01-01" },
      { version: "2.0.0", date: "2024-01-01" },
    ]);
  });

  it("writes release scalars quoted so a YAML 1.1 re-parse keeps them strings", async () => {
    const dir = fixtureDir({ "filled-program.yaml": filledProgram });
    const fetchImpl = routedFetch([
      [
        /^https:\/\/api\.github\.com\//,
        [
          { tag_name: "25.2", published_at: "2024-03-03T00:00:00Z", draft: false, prerelease: false },
          { tag_name: "v3.0.0", published_at: "2024-01-01T00:00:00Z", draft: false, prerelease: false },
        ],
      ],
    ]);

    await runAutoFill({
      dir,
      delayMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const raw = readFileSync(join(dir, "filled-program.yaml"), "utf8");
    expect(raw).toContain('version: "25.2"');
    expect(raw).toContain('date: "2024-03-03"');
    expect(loadPrograms(dir)[0].releases).toEqual([
      { version: "3.0.0", date: "2024-01-01" },
      { version: "25.2", date: "2024-03-03" },
    ]);
  });

  it("leaves an existing curated list untouched without --force", async () => {
    const dir = fixtureDir({
      "filled-program.yaml": `${filledProgram}releases:
  - version: "1.0.0"
    date: "2023-01-01"
`,
    });
    const fetchImpl = routedFetch([[/^https:\/\/api\.github\.com\//, ghReleases]]);

    const changed = await runAutoFill({
      dir,
      delayMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(changed).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(loadPrograms(dir)[0].releases).toEqual([
      { version: "1.0.0", date: "2023-01-01" },
    ]);
  });

  it("refreshes an existing list with --force", async () => {
    const dir = fixtureDir({
      "filled-program.yaml": `${filledProgram}releases:
  - version: "0.9.0"
    date: "2022-06-06"
`,
    });
    const fetchImpl = routedFetch([[/^https:\/\/api\.github\.com\//, ghReleases]]);

    const changed = await runAutoFill({
      dir,
      delayMs: 0,
      force: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(changed).toBe(1);
    expect(loadPrograms(dir)[0].releases).toHaveLength(2);
  });

  it("reports programs with no GitHub repository under --force", async () => {
    const dir = fixtureDir({ "blank-program.yaml": blankProgram });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const changed = await runAutoFill({
      dir,
      delayMs: 0,
      force: true,
      fetchImpl: routedFetch([[/^https:\/\/repology\.org\//, repologyResponse]]) as unknown as typeof fetch,
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no GitHub repository"));
    expect(loadPrograms(dir)[0].releases).toEqual([]);
    expect(changed).toBe(1);
  });
});

describe("fetchGitHubStars", () => {
  it("reads stargazers_count from the repository endpoint", async () => {
    const fetchImpl = routedFetch([
      [
        /^https:\/\/api\.github\.com\/repos\/example\/filled-program$/,
        { stargazers_count: 46123 },
      ],
    ]);

    const stars = await fetchGitHubStars("example/filled-program", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(stars).toBe(46123);
  });

  it("returns null when the request fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(
      fetchGitHubStars("example/filled-program", { fetchImpl: failing })
    ).resolves.toBeNull();
  });

  it("returns null when the response carries no star count", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = routedFetch([[
      /^https:\/\/api\.github\.com\/repos\//,
      { message: "Not Found" },
    ]]);

    await expect(
      fetchGitHubStars("example/gone", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toBeNull();
  });
});

describe("--stars in runAutoFill", () => {
  const starsRoute: [RegExp, unknown] = [
    /^https:\/\/api\.github\.com\/repos\/example\/filled-program$/,
    { stargazers_count: 46123 },
  ];

  it("fills the star count when absent", async () => {
    const dir = fixtureDir({ "filled-program.yaml": filledProgram });
    const fetchImpl = routedFetch([starsRoute]);

    const changed = await runAutoFill({
      dir,
      delayMs: 0,
      stars: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(changed).toBe(1);
    expect(loadPrograms(dir)[0].stars).toBe(46123);
  });

  it("overwrites an existing, stale star count", async () => {
    const dir = fixtureDir({
      "filled-program.yaml": `${filledProgram}stars: 999\n`,
    });
    const fetchImpl = routedFetch([starsRoute]);

    const changed = await runAutoFill({
      dir,
      delayMs: 0,
      stars: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(changed).toBe(1);
    expect(loadPrograms(dir)[0].stars).toBe(46123);
  });

  it("never touches stars without the --stars flag", async () => {
    const dir = fixtureDir({
      "filled-program.yaml": `${filledProgram}stars: 999\n`,
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = routedFetch([starsRoute]);

    await runAutoFill({
      dir,
      delayMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const urls = fetchImpl.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => /\/repos\/example\/filled-program$/.test(url))).toBe(false);
    expect(loadPrograms(dir)[0].stars).toBe(999);
  });

  it("skips programs whose repository is not on GitHub", async () => {
    const dir = fixtureDir({
      "filled-program.yaml": filledProgram.replace(
        "https://github.com/example/filled-program",
        "https://gitlab.com/example/filled-program"
      ),
    });
    const fetchImpl = routedFetch([]);

    const changed = await runAutoFill({
      dir,
      delayMs: 0,
      stars: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(changed).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(loadPrograms(dir)[0].stars).toBeUndefined();
  });

  it("clears a star count when the catalogued repository is no longer on GitHub", async () => {
    const dir = fixtureDir({
      "filled-program.yaml": `${filledProgram
        .replace(
          "https://github.com/example/filled-program",
          "https://gitlab.com/example/filled-program"
        )
        .trimEnd()}\nstars: 999\n`,
    });
    const fetchImpl = routedFetch([]);

    const changed = await runAutoFill({
      dir,
      delayMs: 0,
      stars: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(changed).toBe(1);
    expect(loadPrograms(dir)[0].stars).toBeUndefined();
  });
});

describe("applyReleases", () => {
  const entries = [
    { version: "1.0.0", date: "2023-01-01" },
    { version: "2.0.0", date: "2024-01-01" },
  ];

  it("returns the entries when the program has no releases list", () => {
    expect(applyReleases({}, entries)).toEqual(entries);
    expect(applyReleases({ releases: [] }, entries)).toEqual(entries);
  });

  it("refuses to overwrite an existing curated list without force", () => {
    const data = { releases: [{ version: "0.9.0", date: "2022-06-06" }] };
    expect(applyReleases(data, entries)).toBeNull();
    expect(applyReleases(data, entries, true)).toEqual(entries);
  });

  it("returns null when there is nothing to fill", () => {
    expect(applyReleases({}, [])).toBeNull();
  });
});

describe("needsReleases", () => {
  it("is true only for GitHub-backed programs without a releases list", () => {
    expect(needsReleases({ repository: "https://github.com/a/b" })).toBe(true);
    expect(needsReleases({ repository: "https://github.com/a/b", releases: [] })).toBe(true);
    expect(
      needsReleases({ repository: "https://github.com/a/b", releases: [{ version: "1", date: "2024-01-01" }] })
    ).toBe(false);
    expect(needsReleases({})).toBe(false);
    expect(needsReleases({ repository: "https://gitlab.com/a/b" })).toBe(false);
  });
});

const blankProgram = `name: Blank Program
slug: blank-program
category: Utilities
description:
  short: A program with no metadata yet.
  full: |
    ## What is it?
    Test fixture.
homepage: https://example.com/blank-program
license: ""
version: ""
packages: {}
related: []
`;

describe("runAutoFill", () => {
  it("fills blank metadata and leaves a valid program behind", async () => {
    const dir = fixtureDir({ "blank-program.yaml": blankProgram });

    const changed = await runAutoFill({
      dir,
      delayMs: 0,
      fetchImpl: mockFetch(repologyResponse) as unknown as typeof fetch,
    });

    expect(changed).toBe(1);
    const programs = loadPrograms(dir);
    expect(programs[0]).toMatchObject({
      license: "Apache-2.0 AND LicenseRef-vim",
      version: "0.12.5",
      packages: {
        apt: "neovim",
        dnf: "neovim",
        pacman: "neovim",
        zypper: "neovim",
      },
    });
  });

  it("does not query the API when nothing is blank", async () => {
    const dir = fixtureDir({
      "blank-program.yaml": blankProgram
        .replace('license: ""', "license: MIT")
        .replace('version: ""', 'version: "1.0"')
        .replace(
          "packages: {}",
          "packages:\n  apt: blank-program\n  dnf: blank-program\n  pacman: blank-program\n  zypper: blank-program\nlatest_release: \"2024-01-01\""
        ),
    });
    const fetchImpl = mockFetch(repologyResponse);

    const changed = await runAutoFill({
      dir,
      delayMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(changed).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("leaves the file unchanged when the API fails", async () => {
    const dir = fixtureDir({ "blank-program.yaml": blankProgram });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const before = readFileSync(join(dir, "blank-program.yaml"), "utf8");
    const failing = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const changed = await runAutoFill({ dir, delayMs: 0, fetchImpl: failing });

    expect(changed).toBe(0);
    expect(readFileSync(join(dir, "blank-program.yaml"), "utf8")).toBe(before);
  });
});
