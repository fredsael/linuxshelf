// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://linux-programs.vercel.app",
  output: "static",
  build: {
    format: "directory",
  },
});
