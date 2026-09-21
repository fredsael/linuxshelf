// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://linuxshelf.com",
  output: "static",
  build: {
    format: "directory",
  },
});
