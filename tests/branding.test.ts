import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("site branding", () => {
  it("uses linuxshelf.com as the canonical site URL", () => {
    const config = read("../astro.config.mjs");
    expect(config).toContain('site: "https://linuxshelf.com"');
  });

  it("shows LinuxShelf as the brand in the header", () => {
    const header = read("../src/components/Header.astro");
    expect(header).toContain("LinuxShelf");
    expect(header).not.toContain("linux-programs");
  });

  it("uses LinuxShelf in the default page title and footer", () => {
    const layout = read("../src/layouts/BaseLayout.astro");
    expect(layout).toContain("LinuxShelf");
    expect(layout).not.toContain("Linux Programs Explorer");
  });

  it("suffixes category and program page titles with LinuxShelf", () => {
    for (const page of [
      "../src/pages/categories/[slug].astro",
      "../src/pages/programs/[slug].astro",
    ]) {
      const source = read(page);
      expect(source).toContain("LinuxShelf");
      expect(source).not.toContain("Linux Programs Explorer");
    }
  });

  it("has no stale old-name references in tracked source", () => {
    const sources = [
      "../package.json",
      "../README.md",
      "../scripts/auto-fill.ts",
      "../src/pages/index.astro",
    ];
    for (const source of sources.map(read)) {
      expect(source).not.toMatch(/linux-programs|Linux Programs Explorer|vercel/i);
    }
  });
});
