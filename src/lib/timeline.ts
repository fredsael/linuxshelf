import type { Program } from "./schema";

export const PX_PER_YEAR = 120;
export const PX_PER_MONTH = 64;

export interface TimelinePoint {
  /** ISO date (YYYY-MM-DD) of the release or marker. */
  date: string;
  /** Set for Releases only. */
  version?: string;
  /** Set for date markers only, e.g. "First release". */
  label?: string;
  /** Horizontal position along the track, 0–100 percent. */
  offsetPct: number;
  /** Vertical lane (0 = on the axis) so same-day points stay hoverable. */
  lane: number;
}

export interface TimelineTick {
  offsetPct: number;
  /** Year zoom: "2014". Month zoom: "Mar" or "Jan 2014" for January. */
  label: string;
}

export interface TimelineModel {
  points: TimelinePoint[];
  yearTicks: TimelineTick[];
  monthTicks: TimelineTick[];
  yearWidthPx: number;
  monthWidthPx: number;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function parseIso(value: string | undefined): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return undefined;
  const time = Date.parse(`${value.trim()}T00:00:00Z`);
  return Number.isNaN(time) ? undefined : time;
}

/**
 * Builds the geometry for a program's release timeline: real Releases when
 * the list is populated, otherwise first/latest date markers. Returns null
 * when there is nothing plottable.
 */
export function buildTimeline(program: Program): TimelineModel | null {
  const raw: Array<{ date: string; time: number; version?: string; label?: string }> = [];

  if (program.releases.length > 0) {
    for (const release of program.releases) {
      const time = parseIso(release.date);
      if (time === undefined) continue;
      raw.push({ date: release.date, time, version: release.version });
    }
  } else {
    const first = parseIso(program.first_release);
    const latest = parseIso(program.latest_release);
    if (first !== undefined) {
      raw.push({ date: program.first_release, time: first, label: "First release" });
    }
    if (latest !== undefined && latest !== first) {
      raw.push({ date: program.latest_release, time: latest, label: "Latest release" });
    }
  }

  if (raw.length === 0) return null;
  raw.sort((a, b) => a.time - b.time);

  const minTime = raw[0].time;
  const maxTime = raw[raw.length - 1].time;
  const startYear = new Date(minTime).getUTCFullYear();
  const endYear = new Date(maxTime).getUTCFullYear();

  const spanStart = Date.UTC(startYear, 0, 1);
  const spanEnd = Date.UTC(endYear, 11, 31);
  const spanMs = spanEnd - spanStart;
  const offset = (time: number) => ((time - spanStart) / spanMs) * 100;

  const laneByDate = new Map<string, number>();
  const points: TimelinePoint[] = raw.map((item) => {
    const lane = laneByDate.get(item.date) ?? 0;
    laneByDate.set(item.date, lane + 1);
    return {
      date: item.date,
      ...(item.version !== undefined ? { version: item.version } : {}),
      ...(item.label !== undefined ? { label: item.label } : {}),
      offsetPct: offset(item.time),
      lane,
    };
  });

  const yearTicks: TimelineTick[] = [];
  const monthTicks: TimelineTick[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    yearTicks.push({ offsetPct: offset(Date.UTC(year, 0, 1)), label: String(year) });
    for (let month = 0; month < 12; month += 1) {
      monthTicks.push({
        offsetPct: offset(Date.UTC(year, month, 1)),
        label: month === 0 ? `Jan ${year}` : MONTH_NAMES[month],
      });
    }
  }

  const yearCount = endYear - startYear + 1;
  return {
    points,
    yearTicks,
    monthTicks,
    yearWidthPx: yearCount * PX_PER_YEAR,
    monthWidthPx: yearCount * 12 * PX_PER_MONTH,
  };
}
