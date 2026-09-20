import type { Program } from "./schema";

export const distros = {
  apt: {
    label: "Ubuntu / Debian",
    command: (pkg: string) => `sudo apt install ${pkg}`,
  },
  dnf: {
    label: "Fedora",
    command: (pkg: string) => `sudo dnf install ${pkg}`,
  },
  pacman: {
    label: "Arch",
    command: (pkg: string) => `sudo pacman -S ${pkg}`,
  },
  zypper: {
    label: "openSUSE",
    command: (pkg: string) => `sudo zypper install ${pkg}`,
  },
} as const;

export type DistroId = keyof typeof distros;

export interface InstallTab {
  id: DistroId;
  label: string;
  command: string;
}

export function buildInstallTabs(
  program: Pick<Program, "packages">
): InstallTab[] {
  return (Object.keys(distros) as DistroId[])
    .filter((id) => {
      const pkg = program.packages[id];
      return typeof pkg === "string" && pkg.trim().length > 0;
    })
    .map((id) => ({
      id,
      label: distros[id].label,
      command: distros[id].command(program.packages[id].trim()),
    }));
}
