<!-- SPDX-FileCopyrightText: 2026 Sebastien Rousseau -->
<!-- SPDX-License-Identifier: Apache-2.0 OR MIT -->

# Changelog

## [Unreleased]

### Added

- `comment: true` keeps one summary comment on a pull request, marked
  `<!-- agtmls-audit -->` and edited in place: the findings by severity, a
  table of up to 20, and the agent configuration the branch changes (the
  list `agtmls audit --changed-agent-config` watches). It is posted only
  when there is something to report, turned into a clean verdict when a
  later push fixes everything, edits only a bot's comment, and is skipped
  when the pull request's head has moved past the run's. A failed API call
  is a warning; the exit code stays the audit's. `github-token` input.
- Tests that the SARIF report never repeats the text a rule matched.

### Changed

- The vendored analyzer is rebuilt from agtmls-wasm 0.0.6 on agtmls-spec
  main (b5a6954): 57 rules, up from 39, with the agent-configuration and
  `AGT-CI` workflow rules. `check-vendor-fresh.mjs` failed against spec main
  from the moment AGT-MCP-002 merged there.

## [0.0.3] - 2026-11-15

### Changed

- `KEYS.asc` trusts a second maintainer signing key,
  `SHA256:kIOPAavp1TCEauTr1tTIN3cv+tSs6F9m/4lZjuM9tqk`, so release tags can
  be signed on either maintainer machine. Each key line now carries its
  fingerprint for out-of-band checks.
- CI's `github/codeql-action/upload-sarif` moves to v4.39.3 (Dependabot #8);
  this branch's earlier group bump had left it at v4.38.3, behind main.

### Fixed (release tooling)

- The GitHub release is titled `agtmls-action 0.0.3`; `release.yml` titled
  it with the bare tag (`v0.0.2`), against the release page format.

## [0.0.2] - 2026-10-11

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
