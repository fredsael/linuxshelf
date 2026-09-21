import { describe, expect, it } from "vitest";
import { programSchema, type Program } from "../src/lib/schema";
import { buildTimeline, PX_PER_MONTH, PX_PER_YEAR } from "../src/lib/timeline";

const base = {
  name: "Timeline Program",
  slug: "timeline-program",
  category: "Utilities",
  description: { short: "Short.", full: "Full." },
  homepage: "https://example.com",
};

const program = (extra: Record<string, unknown>): Program =>
  programSchema.parse({ ...base, ...extra });

describe("buildTimeline", () => {
  it("plots real Releases when the list is populated", () => {
    const model = buildTimeline(
      program({
        first_release: "2019-05-05",
        releases: [
          { version: "1.0.0", date: "2020-06-15" },
          { version: "2.0.0", date: "2022-02-01" },
        ],
      })
    );

    expect(model).not.toBeNull();
    expect(model!.points).toHaveLength(2);
    expect(model!.points[0]).toMatchObject({ version: "1.0.0" });
    expect(model!.points[0].label).toBeUndefined();
    expect(model!.points[1].version).toBe("2.0.0");
    expect(model!.points[0].offsetPct).toBeLessThan(model!.points[1].offsetPct);
  });

  it("rounds the axis outward to whole year boundaries", () => {
    const model = buildTimeline(
      program({
        releases: [
          { version: "1.0.0", date: "2020-06-15" },
          { version: "2.0.0", date: "2022-02-01" },
        ],
      })
    );

    expect(model!.yearTicks.map((tick) => tick.label)).toEqual(["2020", "2021", "2022"]);
    expect(model!.yearTicks[0].offsetPct).toBeCloseTo(0);
    expect(model!.monthTicks).toHaveLength(36);
    expect(model!.yearWidthPx).toBe(3 * PX_PER_YEAR);
    expect(model!.monthWidthPx).toBe(36 * PX_PER_MONTH);
  });

  it("labels January with the year and other months with abbreviations", () => {
    const model = buildTimeline(
      program({
        releases: [
          { version: "1.0.0", date: "2020-01-10" },
          { version: "1.1.0", date: "2020-03-20" },
        ],
      })
    );

    expect(model!.monthTicks[0].label).toBe("Jan 2020");
    expect(model!.monthTicks[2].label).toBe("Mar");
  });

  it("places releases proportionally within the rounded range", () => {
    const model = buildTimeline(
      program({
        releases: [
          { version: "1.0.0", date: "2020-01-01" },
          { version: "2.0.0", date: "2020-12-31" },
        ],
      })
    );

    expect(model!.points[0].offsetPct).toBeCloseTo(0);
    expect(model!.points[1].offsetPct).toBeCloseTo(100);
  });

  it("falls back to first/latest date markers when there are no Releases", () => {
    const model = buildTimeline(
      program({ first_release: "2014-03-23", latest_release: "2025-12-05" })
    );

    expect(model!.points[0]).toMatchObject({ label: "First release" });
    expect(model!.points[0].version).toBeUndefined();
    expect(model!.points[1]).toMatchObject({ label: "Latest release" });
  });

  it("deduplicates markers that share one date", () => {
    const model = buildTimeline(
      program({ first_release: "2020-01-01", latest_release: "2020-01-01" })
    );

    expect(model!.points).toHaveLength(1);
    expect(model!.points[0].label).toBe("First release");
  });

  it("ignores marker dates that are not ISO", () => {
    const model = buildTimeline(program({ first_release: "2014", latest_release: "2025-12-05" }));

    expect(model!.points).toHaveLength(1);
    expect(model!.points[0].label).toBe("Latest release");
  });

  it("never mixes Releases with date markers", () => {
    const model = buildTimeline(
      program({
        first_release: "2000-01-01",
        latest_release: "2020-01-01",
        releases: [{ version: "1.0.0", date: "2010-06-15" }],
      })
    );

    expect(model!.points.every((point) => point.version !== undefined)).toBe(true);
  });

  it("assigns increasing lanes to points that share a date", () => {
    const model = buildTimeline(
      program({
        releases: [
          { version: "0.3.6", date: "2019-05-29" },
          { version: "0.3.7", date: "2019-05-29" },
          { version: "0.3.8", date: "2019-09-12" },
        ],
      })
    );

    expect(model!.points.map((point) => point.lane)).toEqual([0, 1, 0]);
  });

  it("returns null when nothing is plottable", () => {
    expect(buildTimeline(program({}))).toBeNull();
    expect(buildTimeline(program({ first_release: "spring 2014" }))).toBeNull();
  });
});
