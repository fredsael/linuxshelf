import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

function loadStatichostConfig(): Record<string, string> {
  const source = readFileSync(
    new URL("../statichost.yml", import.meta.url),
    "utf8",
  );
  return parse(source) as Record<string, string>;
}

describe("statichost.yml", () => {
  it("uses a version-pinned build image", () => {
    const { image } = loadStatichostConfig();
    expect(image).toMatch(/^node:\d+\.\d+\.\d+$/);
  });

  it("runs a reproducible install and the package build script", () => {
    const { command } = loadStatichostConfig();
    expect(command).toBe("npm ci && npm run build");
  });

  it("publishes the Astro output directory", () => {
    const { public: publicDir } = loadStatichostConfig();
    expect(publicDir).toBe("dist");
  });
});
