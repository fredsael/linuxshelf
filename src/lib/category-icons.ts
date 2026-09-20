import { slugify } from "./categories";

export const categoryIcons: Record<string, string> = {
  "text-editors": "📝",
  "terminal-emulators": "🖥️",
  "file-managers": "📂",
  "system-monitors": "📊",
};

export function categoryIcon(name: string): string {
  return categoryIcons[slugify(name)] ?? "🧩";
}
