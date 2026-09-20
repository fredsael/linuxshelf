# 06: Auto-fill Pipeline

**What to build:** Standalone script that pulls missing metadata from Repology API.

**Blocked by:** 01-scaffold-content-layer

**Status:** done

- [x] Script reads all program YAML files
- [x] Queries Repology API for programs with blank `version`, `latest_release`, `license`, or `packages`
- [x] Only fills blank fields, never overwrites existing data
- [x] Writes changes back to YAML files
- [x] Handles API errors gracefully (logs warning, continues)
- [x] Can be run via `npm run auto-fill` or similar
