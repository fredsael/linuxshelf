export function orDash(value: string): string {
  const trimmed = value.trim();
  return trimmed === "" ? "—" : trimmed;
}

export function formatDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00Z`)
    : new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Abbreviated star count: exact under 1000, one decimal k up to 99,999,
 * decimal-less k up to 999,999, one decimal M beyond. Truncates, so a
 * displayed count never overstates the real one.
 */
export function formatStars(count: number): string {
  if (count >= 1_000_000) return trimZero(formatStarsUnit(count / 1_000_000, "M"));
  if (count >= 100_000) return `${Math.floor(count / 1000)}k`;
  if (count >= 1_000) return trimZero(formatStarsUnit(count / 1_000, "k"));
  return String(count);
}

function formatStarsUnit(value: number, suffix: string): string {
  const truncated = Math.floor(value * 10) / 10;
  return `${truncated.toFixed(1)}${suffix}`;
}

function trimZero(text: string): string {
  return text.replace(/\.0(?=[kM])/, "");
}
