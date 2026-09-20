import { programSchema, type Program } from "../src/lib/schema";

export function makeProgram(overrides: Record<string, unknown> = {}): Program {
  return programSchema.parse({
    name: "Example",
    slug: "example",
    category: "Utilities",
    description: { short: "Short description.", full: "Full description." },
    homepage: "https://example.com",
    ...overrides,
  });
}
