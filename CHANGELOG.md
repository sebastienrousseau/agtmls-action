<!-- SPDX-FileCopyrightText: 2026 Sebastien Rousseau -->
<!-- SPDX-License-Identifier: Apache-2.0 OR MIT -->

# Changelog

## Unreleased

### Added

- Composite action auditing agent skills and emitting SARIF 2.1.0, so findings
  land as inline pull-request annotations rather than in a log.
- `fail-on` threshold, `path`, and outputs for `findings`, `blocking` and
  `sarif-file`.
- The analyzer is `agtmls-core` compiled to WebAssembly and **vendored**, not
  installed: a composite action runs the repository as-is, and an analyzer
  that fetches its own implementation at audit time is a strange thing to
  trust. `scripts/check-vendor-fresh.mjs` fails CI if the committed module
  does not match a fresh build — a stale analyzer still runs, still exits 0,
  and is simply blind to whatever was fixed since.
- Refuses to report a clean result when the module has zero rules embedded.
  Zero findings from an unarmed analyzer looks exactly like a clean repo.
- Five end-to-end tests against real fixtures, including a malicious
  `setup.sh` beside a benign `SKILL.md` — the case an analyzer that reads only
  Markdown misses and reports as green.
- CI runs the action against its own fixtures and asserts the malicious one
  still fails. A tool that never reports anything passes every test that only
  checks it runs.
