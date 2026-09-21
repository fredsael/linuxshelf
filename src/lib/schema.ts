import { z } from "zod";

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const releaseSchema = z
  .object({
    version: z.string().min(1, "release version is required"),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "release date must be YYYY-MM-DD"),
  })
  .strict();

export const programSchema = z
  .object({
    name: z.string().min(1, "name is required"),
    slug: z
      .string()
      .regex(slugPattern, "slug must be lowercase letters, numbers and dashes"),
    category: z.string().min(1, "category is required"),
    tags: z.array(z.string().min(1)).default([]),
    description: z.object({
      short: z.string().min(1, "description.short is required"),
      full: z.string().min(1, "description.full is required"),
    }),
    license: z.string().default(""),
    version: z.string().default(""),
    first_release: z.string().default(""),
    latest_release: z.string().default(""),
    releases: z.array(releaseSchema).default([]),
    homepage: z.string().url("homepage must be a valid URL"),
    repository: z.string().url("repository must be a valid URL").optional(),
    icon: z.string().optional(),
    repology: z.string().optional(),
    packages: z.record(z.string()).default({}),
    related: z.array(z.string().regex(slugPattern)).default([]),
  })
  .strict();

export type Program = z.infer<typeof programSchema>;
export type ProgramInput = z.input<typeof programSchema>;
export type Release = z.infer<typeof releaseSchema>;
