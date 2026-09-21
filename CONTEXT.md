# Linuxshelf

A catalog of terminal-linux programs, each described and tracked across its distribution packages and release history.

## Language

**Program**:
A piece of software catalogued in `content/programs/`, identified by its slug.
_Avoid_: App, application, tool, package

**Release**:
A published, versioned distribution of a Program with a publication date. The release timeline plots one point per Release.
_Avoid_: Version (as an event), build, tag

**Version**:
The version string identifying a Release, e.g. `"0.11.5"`. A Version alone has no date; it becomes a Release when paired with a publication date.
_Avoid_: Release (as a string)

**Date marker**:
A synthetic timeline point derived from the `first_release`/`latest_release` date fields when a Program has no Releases list. It carries a date but no Version, and is never mixed with real Releases.
_Avoid_: Release, pseudo-release
