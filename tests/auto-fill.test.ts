import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyMissingFields,
  extractMetadata,
  fetchRepology,
  needsFill,
  runAutoFill,
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
