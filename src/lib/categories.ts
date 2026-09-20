import type { Program } from "./schema";

export interface Category {
  name: string;
  slug: string;
  count: number;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function deriveCategories(programs: Program[]): Category[] {
  const byName = new Map<string, number>();
  for (const program of programs) {
    byName.set(program.category, (byName.get(program.category) ?? 0) + 1);
  }

  return [...byName.entries()]
    .map(([name, count]) => ({ name, slug: slugify(name), count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function programsInCategory(
  programs: Program[],
  categorySlug: string
): Program[] {
  return programs.filter((program) => slugify(program.category) === categorySlug);
}
