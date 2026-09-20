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
