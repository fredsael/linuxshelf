import { describe, expect, it } from "vitest";
import { buildInstallTabs } from "../src/lib/install";
import { makeProgram } from "./helpers";

describe("buildInstallTabs", () => {
  it("builds a command for every available distro, in stable order", () => {
    const program = makeProgram({
      packages: {
        apt: "neovim",
        dnf: "neovim",
        pacman: "neovim",
        zypper: "neovim",
      },
    });

    expect(buildInstallTabs(program)).toEqual([
      { id: "apt", label: "Ubuntu / Debian", command: "sudo apt install neovim" },
      { id: "dnf", label: "Fedora", command: "sudo dnf install neovim" },
      { id: "pacman", label: "Arch", command: "sudo pacman -S neovim" },
      { id: "zypper", label: "openSUSE", command: "sudo zypper install neovim" },
    ]);
  });

  it("hides distros with no package and keeps partial sets in order", () => {
    const program = makeProgram({
      packages: {
        pacman: "yazi",
        apt: "yazi",
      },
    });

    expect(buildInstallTabs(program)).toEqual([
      { id: "apt", label: "Ubuntu / Debian", command: "sudo apt install yazi" },
      { id: "pacman", label: "Arch", command: "sudo pacman -S yazi" },
    ]);
  });

  it("ignores blank package names", () => {
    const program = makeProgram({
      packages: {
        apt: "foot",
        dnf: "",
        pacman: "   ",
      },
    });

    expect(buildInstallTabs(program)).toEqual([
      { id: "apt", label: "Ubuntu / Debian", command: "sudo apt install foot" },
    ]);
  });

  it("returns no tabs when no packages are known", () => {
    expect(buildInstallTabs(makeProgram())).toEqual([]);
  });

  it("uses distro-specific package names", () => {
    const program = makeProgram({ packages: { dnf: "vim-enhanced" } });

    expect(buildInstallTabs(program)).toEqual([
      { id: "dnf", label: "Fedora", command: "sudo dnf install vim-enhanced" },
    ]);
  });
});
