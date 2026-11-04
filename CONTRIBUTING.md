# Contributing to luci-app-netpath

Issues and pull requests are welcome. Security problems are the exception:
report those privately as described in [SECURITY.md](SECURITY.md), not in a
public issue.

Using a coding agent? Point it at [AGENTS.md](AGENTS.md); it holds the same
rules in a compact form.

## Before you send anything

- One feature or fix per pull request; no unrelated changes.
- No version bumps in a pull request (the maintainer bumps the version
  when a release is cut).
- `node --test tests/` and the security checks in [AGENTS.md](AGENTS.md)
  pass, and `dev/i18n/update.sh --check` passes.
- Screenshots, if any, from `--demo` mode of the replay only.

## Translations

Translations are especially welcome. The catalogue is
`luci-app-netpath/po/<lang>/netpath.po`, with its template in
`luci-app-netpath/po/templates/netpath.pot`. Add a language by copying
an existing catalogue, translating the `msgstr` lines, and running
`dev/i18n/update.sh` (it needs gettext; the check in CI fails if the
templates or catalogues are out of date). Do not translate the format
placeholders, and do not change the display format: a translated string
keeps the same `%s` / `%d` placeholders in the same order as the
original.

## Reporting a bug

Say which OpenWrt version and package version you run
(`apk list --installed | grep netpath` on 25.12, `opkg list-installed |
grep netpath` on 24.10), which theme you run it under, and what you
expected to see. A screenshot from the dashboard helps; a screenshot
from `--demo` mode is not needed for a bug report, but do not paste
real MAC addresses, hostnames or SSIDs from your own network into a
public issue — mask them first.

## The app stays theme-independent

The dashboard reads a theme only through `--v-*` custom properties,
each with a fallback, and its classes are `np-*` scoped under
`.np-app`. A change that only works under one theme, or that styles
the dashboard from a theme's internals, does not belong here. If you
are unsure, check it under Bootstrap first: run the replay without
`--theme-dir` (see [README.md](README.md)).
