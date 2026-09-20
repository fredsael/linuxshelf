import { describe, expect, it } from "vitest";
import {
  deriveCategories,
  programsInCategory,
  slugify,
} from "../src/lib/categories";
import { makeProgram } from "./helpers";

describe("slugify", () => {
  it("turns category names into URL-safe slugs", () => {
    expect(slugify("Text Editors")).toBe("text-editors");
    expect(slugify("  Terminal   Emulators ")).toBe("terminal-emulators");
    expect(slugify("System Monitors")).toBe("system-monitors");
  });
});

describe("deriveCategories", () => {
  it("returns unique categories with correct counts, sorted by name", () => {
    const programs = [
      makeProgram({ slug: "a", name: "A", category: "Text Editors" }),
      makeProgram({ slug: "b", name: "B", category: "Text Editors" }),
      makeProgram({ slug: "c", name: "C", category: "File Managers" }),
      makeProgram({ slug: "d", name: "D", category: "Terminal Emulators" }),
      makeProgram({ slug: "e", name: "E", category: "Terminal Emulators" }),
      makeProgram({ slug: "f", name: "F", category: "Terminal Emulators" }),
    ];

    expect(deriveCategories(programs)).toEqual([
      { name: "File Managers", slug: "file-managers", count: 1 },
      { name: "Terminal Emulators", slug: "terminal-emulators", count: 3 },
      { name: "Text Editors", slug: "text-editors", count: 2 },
    ]);
  });

  it("returns an empty list when there are no programs", () => {
    expect(deriveCategories([])).toEqual([]);
  });
});

describe("programsInCategory", () => {
  it("filters programs by category slug", () => {
    const programs = [
      makeProgram({ slug: "a", category: "Text Editors" }),
      makeProgram({ slug: "b", category: "File Managers" }),
      makeProgram({ slug: "c", category: "Text Editors" }),
    ];

    expect(
      programsInCategory(programs, "text-editors").map((p) => p.slug)
    ).toEqual(["a", "c"]);
    expect(programsInCategory(programs, "nope")).toEqual([]);
  });
});
