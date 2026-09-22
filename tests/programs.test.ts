import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ProgramValidationError,
  firstReleaseDate,
  latestRelease,
  latestReleaseDate,
  loadPrograms,
} from "../src/lib/programs";

const dirs: string[] = [];

function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "programs-test-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const otherProgram = `name: Other Program
slug: other
category: Utilities
description:
  short: Another program.
  full: Full description.
homepage: https://example.com/other
`;

const validProgram = `name: Test Program
slug: test-program
category: Text Editors
tags:
  - testing
description:
  short: A program used in tests.
  full: |
    ## What is it?
    A test fixture.
license: MIT
version: "1.2.3"
first_release: "2020-01-01"
latest_release: "2024-06-01"
homepage: https://example.com
repository: https://github.com/example/test-program
icon: "🧪"
packages:
  apt: test-program
related:
  - other
`;

describe("loadPrograms", () => {
  it("reads and validates YAML files into typed programs", () => {
    const dir = fixtureDir({
      "test-program.yaml": validProgram,
      "other.yaml": otherProgram,
    });

    const programs = loadPrograms(dir);

    expect(programs).toHaveLength(2);
    expect(programs.map((p) => p.slug)).toEqual(["other", "test-program"]);

    const program = programs.find((p) => p.slug === "test-program");
    expect(program).toMatchObject({
      name: "Test Program",
      category: "Text Editors",
      tags: ["testing"],
      license: "MIT",
      version: "1.2.3",
      packages: { apt: "test-program" },
      related: ["other"],
    });
    expect(program?.description.full).toContain("test fixture");
  });

  it("applies defaults for optional and auto-fillable fields", () => {
    const dir = fixtureDir({
      "other.yaml": otherProgram,
      "blank.yaml": `name: Blank
slug: blank
category: Utilities
description:
  short: Short.
  full: Full.
homepage: https://example.com/blank
related:
  - other
`,
    });

    const program = loadPrograms(dir).find((p) => p.slug === "blank");

    expect(program).toMatchObject({
      tags: [],
      license: "",
      version: "",
      packages: {},
    });
  });

  it("throws a descriptive error naming the file and field for missing fields", () => {
    const dir = fixtureDir({
      "broken.yaml": `slug: broken
category: Utilities
description:
  short: Short.
  full: Full.
homepage: https://example.com/broken
`,
    });

    expect(() => loadPrograms(dir)).toThrow(ProgramValidationError);
    expect(() => loadPrograms(dir)).toThrow(/broken\.yaml/);
    expect(() => loadPrograms(dir)).toThrow(/name/);
  });

  it("rejects unknown fields, catching typos", () => {
    const dir = fixtureDir({
      "typo.yaml": `name: Typo
slug: typo
category: Utilities
lisence: MIT
description:
  short: Short.
  full: Full.
homepage: https://example.com/typo
`,
    });

    expect(() => loadPrograms(dir)).toThrow(/lisence/);
  });

  it("rejects a slug that does not match the file name", () => {
    const dir = fixtureDir({
      "wrong-name.yaml": validProgram,
    });

    expect(() => loadPrograms(dir)).toThrow(/wrong-name\.yaml/);
    expect(() => loadPrograms(dir)).toThrow(/must match the file name/);
    expect(() => loadPrograms(dir)).toThrow(/test-program\.yaml/);
  });

  it("rejects related slugs that do not exist", () => {
    const dir = fixtureDir({
      "test-program.yaml": validProgram.replace("  - other", "  - ghost"),
      "other.yaml": otherProgram,
    });

    expect(() => loadPrograms(dir)).toThrow(/ghost/);
  });

  it("rejects malformed YAML with the file name", () => {
    const dir = fixtureDir({
      "bad.yaml": "name: [unclosed\n",
    });

    expect(() => loadPrograms(dir)).toThrow(/bad\.yaml/);
    expect(() => loadPrograms(dir)).toThrow(/could not parse YAML/);
  });
});

describe("star counts", () => {
  it("reads the optional stars field", () => {
    const dir = fixtureDir({
      "test-program.yaml": `${validProgram}stars: 46123\n`,
      "other.yaml": otherProgram,
    });

    const program = loadPrograms(dir).find((p) => p.slug === "test-program");
    expect(program?.stars).toBe(46123);
  });

  it("rejects a star count that does not attach to a catalogued repository", () => {
    const dir = fixtureDir({
      "starless.yaml": `name: Starless
slug: starless
category: Utilities
description:
  short: Short.
  full: Full.
homepage: https://example.com/starless
stars: 12
`,
    });

    expect(() => loadPrograms(dir)).toThrow(/starless\.yaml/);
    expect(() => loadPrograms(dir)).toThrow(/stars/);
  });

  it("rejects negative or fractional star counts", () => {
    const negative = fixtureDir({
      "test-program.yaml": `${validProgram}stars: -5\n`,
      "other.yaml": otherProgram,
    });
    expect(() => loadPrograms(negative)).toThrow(/stars/);

    const fractional = fixtureDir({
      "test-program.yaml": `${validProgram}stars: 1.5\n`,
      "other.yaml": otherProgram,
    });
    expect(() => loadPrograms(fractional)).toThrow(/stars/);
  });
});

describe("releases", () => {
  const withReleases = `name: Released
slug: released
category: Utilities
description:
  short: Short.
  full: Full.
homepage: https://example.com/released
version: "1.9.0"
latest_release: "2023-12-31"
releases:
  - version: "2.0.0"
    date: "2024-06-01"
  - version: "1.0.0"
    date: "2022-01-01"
`;

  it("defaults to an empty list when absent", () => {
    const dir = fixtureDir({ "other.yaml": otherProgram });
    expect(loadPrograms(dir)[0].releases).toEqual([]);
  });

  it("sorts releases by date ascending on load", () => {
    const dir = fixtureDir({ "released.yaml": withReleases });
    const program = loadPrograms(dir)[0];

    expect(program.releases.map((r) => r.version)).toEqual(["1.0.0", "2.0.0"]);
    expect(latestRelease(program)).toEqual({ version: "2.0.0", date: "2024-06-01" });
  });

  it("derives release dates from the releases list when present", () => {
    const dir = fixtureDir({ "released.yaml": withReleases });
    const program = loadPrograms(dir)[0];

    expect(firstReleaseDate(program)).toBe("2022-01-01");
    expect(latestReleaseDate(program)).toBe("2024-06-01");
  });

  it("falls back to explicit fields when there are no releases", () => {
    const dir = fixtureDir({
      "other.yaml": otherProgram,
      "plain.yaml": `name: Plain
slug: plain
category: Utilities
description:
  short: Short.
  full: Full.
homepage: https://example.com/plain
version: "1.2.3"
first_release: "2020-02-02"
latest_release: "2024-06-01"
`,
    });
    const program = loadPrograms(dir).find((p) => p.slug === "plain");

    expect(firstReleaseDate(program!)).toBe("2020-02-02");
    expect(latestReleaseDate(program!)).toBe("2024-06-01");
  });

  it("rejects a release with a non-ISO date or unknown key", () => {
    const dir = fixtureDir({
      "released.yaml": withReleases.replace("2024-06-01", "June 2024"),
    });
    expect(() => loadPrograms(dir)).toThrow(/releases\.0\.date/);

    const typoDir = fixtureDir({
      "released.yaml": withReleases.replace(
        'version: "2.0.0"',
        'version: "2.0.0"\n    notes: "surprise"'
      ),
    });
    expect(() => loadPrograms(typoDir)).toThrow(/releases\.0/);
  });
});
