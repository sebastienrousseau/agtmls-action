<!-- SPDX-FileCopyrightText: 2026 Sebastien Rousseau -->
<!-- SPDX-License-Identifier: Apache-2.0 OR MIT -->

<h1 align="center">agtmls-action</h1>

<p align="center">
  Static security analysis for agent skills, as inline pull-request annotations.
</p>

<p align="center">
  <a href="https://github.com/sebastienrousseau/agtmls-action/actions"><img src="https://img.shields.io/github/actions/workflow/status/sebastienrousseau/agtmls-action/ci.yml?style=for-the-badge&logo=github" alt="Build" height="28" /></a>
  <a href="https://github.com/sebastienrousseau/agtmls-action#readme"><img src="https://img.shields.io/badge/docs-reference-blue.svg?style=for-the-badge&labelColor=555555&logo=markdown" alt="Docs" height="28" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/sebastienrousseau/agtmls-action"><img src="https://img.shields.io/ossf-scorecard/github.com/sebastienrousseau/agtmls-action?style=for-the-badge&label=OpenSSF%20Scorecard&logo=openssf" alt="OpenSSF Scorecard" height="28" /></a>
  <a href="LICENSE-APACHE"><img src="https://img.shields.io/badge/license-Apache--2.0%20OR%20MIT-blue.svg?style=for-the-badge" alt="License: Apache-2.0 OR MIT" height="28" /></a>
  <a href="https://github.com/sebastienrousseau/agtmls-action/blob/main/package.json"><img src="https://img.shields.io/badge/node-20%2B-93450a.svg?style=for-the-badge&logo=node.js" alt="Node 20+" height="28" /></a>
</p>

## Why this exists

Agent skills are instructions a model will follow. A skill with a hidden
instruction in it is not a bug report waiting to happen — it is a model doing
what it was told, by someone who was not you. This action reads every file a
skill ships and reports what it finds, as SARIF, so the findings land on the
diff rather than in a log nobody opens.

## What it will not do

- **It uploads nothing.** The analysis happens in your runner. A security tool
  that sends your most sensitive prose to a third party has made a poor trade
  on your behalf.
- **It installs nothing at run time.** The analyzer is vendored, because one
  that downloads its own implementation at audit time is a strange thing to
  trust. See [ADR 0001](docs/adr/0001-vendor-the-analyzer.md).
- **It does not fix anything.** It reports; `agtmls-lsp` offers the fixes.

## Usage

```yaml
permissions:
  contents: read
  security-events: write

steps:
  - uses: actions/checkout@v5
  - uses: sebastienrousseau/agtmls-action@v0.0.35
    id: audit
    with:
      path: .claude/skills
      fail-on: high
  - uses: github/codeql-action/upload-sarif@v4
    if: always()
    with:
      sarif_file: ${{ steps.audit.outputs.sarif-file }}
```

`if: always()` matters: you want the findings uploaded on the run that failed,
which is the run you care about.

### A summary comment on pull requests

With `comment: true`, a pull request gets one comment that says what the audit
found and which agent configuration the branch changes (`.claude/`,
`.mcp.json`, `CLAUDE.md`, `AGENTS.md`, `.codex/`, `opencode.json` and the
rest an agent loads on its next run, unread). It is edited in place on every
push, posted only when there is something to report, and turned into a clean
verdict when a later push fixes everything. A run the pull request has moved
past writes nothing, so an old run never overwrites a newer verdict; cancel
superseded runs with `concurrency` as well.

```yaml
on: pull_request

concurrency:
  group: agtmls-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write

steps:
  - uses: actions/checkout@v5
    with:
      fetch-depth: 0 # to list the agent configuration the branch changes
  - uses: sebastienrousseau/agtmls-action@v0.0.35
    with:
      comment: true
```

The comment, the annotations and the SARIF report carry each rule's message,
never the text it matched, so a planted secret or payload is not repeated
back into the pull request.

## What it detects

| Rule class | Detects |
| :--- | :--- |
| `AGT-STEG` | Invisible code points — zero-width characters, bidirectional overrides, **variation selectors**, soft hyphens, the Unicode tag block |
| `AGT-INJ` | Instruction overrides and jailbreak phrasing |
| `AGT-EXEC` | Pipe-to-shell execution, credential access, reverse shells |
| `AGT-EXFIL` | Markdown image pingbacks that leak context on render |
| `AGT-CAP` | Frontmatter granting a tool the skill's own `safety_policy` denies |
| `AGT-POLICY` | A declared policy contradicted by the skill's prose, or absent entirely |
| `AGT-HOOK`, `AGT-MCP` | Hooks that fetch, auto-approve, inject context or run ungated on every turn; MCP servers that are unpinned, over plain HTTP, or loaded from outside the repository |
| `AGT-SUPPLY`, `AGT-PERM` | Unpinned runners and plugin sources; approval prompts switched off or destructive commands pre-approved |
| `AGT-CI` | Workflows that run an agent or hand a secret to an action on a mutable ref, check out pull request code on an untrusted trigger, or open an agent to anyone |
| `AGT-PERSIST`, `AGT-INST`, `AGT-RENDER`, `AGT-SUPPRESS`, `AGT-ATTR` | Self-scheduling, `rm -rf` over agent directories, instructions hidden in comments or alt text, markers that silence other scanners, instructions to strip AI attribution |

Rules are matched against the **whitespace-normalised** document, so a payload
split across a newline does not walk past them. Every file is read, not only
Markdown: a malicious `verify.sh` next to a benign `SKILL.md` is the case this
exists for.

## Inputs

| Input | Default | Meaning |
| :--- | :--- | :--- |
| `path` | `.` | Directory to audit |
| `fail-on` | `high` | `critical` / `high` / `medium` / `low` / `never` |
| `sarif-file` | `agtmls.sarif` | Where to write the report |
| `rules` | *(embedded)* | An [`agtmls-spec`](https://github.com/sebastienrousseau/agtmls-spec) rules directory, to pin a specific rule set |
| `comment` | `false` | On a pull request, keep one summary comment updated in place |
| `github-token` | `${{ github.token }}` | Token for the comment; needs `pull-requests: write` |

## How it runs

The analyzer is [`agtmls-core`](https://github.com/sebastienrousseau/agtmls-core)
compiled to WebAssembly, executed under Node. No Rust toolchain, no platform
matrix, no compile step, and the same rule set the CLI enforces — the rules are
data in `agtmls-spec`, loaded identically by every implementation.

Nothing is uploaded anywhere. The analysis happens in your runner.

## Licence

Apache-2.0 OR MIT.
