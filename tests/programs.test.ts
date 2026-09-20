import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ProgramValidationError,
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
