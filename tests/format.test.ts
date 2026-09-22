import { describe, expect, it } from "vitest";
import { formatStars } from "../src/lib/format";

describe("formatStars", () => {
  it("shows counts below one thousand exactly", () => {
    expect(formatStars(0)).toBe("0");
    expect(formatStars(873)).toBe("873");
    expect(formatStars(999)).toBe("999");
  });

  it("abbreviates thousands with one decimal", () => {
    expect(formatStars(1000)).toBe("1k");
    expect(formatStars(1200)).toBe("1.2k");
    expect(formatStars(46123)).toBe("46.1k");
    expect(formatStars(99999)).toBe("99.9k");
  });

  it("drops the decimal from six-figure thousands", () => {
    expect(formatStars(100000)).toBe("100k");
    expect(formatStars(102345)).toBe("102k");
    expect(formatStars(999999)).toBe("999k");
  });

  it("abbreviates millions with one decimal", () => {
    expect(formatStars(1000000)).toBe("1M");
    expect(formatStars(1234567)).toBe("1.2M");
    expect(formatStars(46123456)).toBe("46.1M");
  });
});
