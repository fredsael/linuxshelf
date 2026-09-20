import { readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml, YAMLException } from "js-yaml";
import { programSchema, type Program } from "./schema";

export const contentDir = fileURLToPath(
  new URL("../../content/programs", import.meta.url)
);

export class ProgramValidationError extends Error {
  constructor(file: string, detail: string) {
    super(`Invalid program YAML in ${file}:\n${detail}`);
    this.name = "ProgramValidationError";
  }
}

function parseProgramFile(path: string): Program {
  const fileName = basename(path);

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, "utf8"));
  } catch (error) {
    const detail =
      error instanceof YAMLException
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    throw new ProgramValidationError(fileName, `could not parse YAML — ${detail}`);
  }

  const result = programSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new ProgramValidationError(fileName, detail);
  }

  const program = result.data;
  const expectedFile = `${program.slug}.yaml`;
  if (fileName !== expectedFile) {
    throw new ProgramValidationError(
      fileName,
      `slug "${program.slug}" must match the file name (expected ${expectedFile})`
    );
  }

  return program;
}

function validateRelations(programs: Program[]): void {
  const slugs = new Set(programs.map((p) => p.slug));
  for (const program of programs) {
    for (const related of program.related) {
      if (!slugs.has(related)) {
        throw new ProgramValidationError(
          `${program.slug}.yaml`,
          `related slug "${related}" does not match any program`
        );
      }
    }
    if (program.related.includes(program.slug)) {
      throw new ProgramValidationError(
        `${program.slug}.yaml`,
        "a program cannot be related to itself"
      );
    }
  }
}

export function loadPrograms(dir: string = contentDir): Program[] {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .sort();

  const programs = files.map((file) => parseProgramFile(join(dir, file)));
  validateRelations(programs);

  return programs.sort((a, b) => a.name.localeCompare(b.name));
}

export function findProgram(
  programs: Program[],
  slug: string
): Program | undefined {
  return programs.find((program) => program.slug === slug);
}
