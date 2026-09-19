<!-- SPDX-FileCopyrightText: 2026 Sebastien Rousseau -->
<!-- SPDX-License-Identifier: Apache-2.0 OR MIT -->

# agtmls-action

**Static security analysis for agent skills, as inline pull-request
annotations.**

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
  - uses: sebastienrousseau/agtmls-action@v1
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

## What it detects

| Rule class | Detects |
| :--- | :--- |
| `AGT-STEG` | Invisible code points — zero-width characters, bidirectional overrides, **variation selectors**, soft hyphens, the Unicode tag block |
| `AGT-INJ` | Instruction overrides and jailbreak phrasing |
| `AGT-EXEC` | Pipe-to-shell execution, credential access, reverse shells |
| `AGT-EXFIL` | Markdown image pingbacks that leak context on render |
| `AGT-CAP` | Frontmatter granting a tool the skill's own `safety_policy` denies |
| `AGT-POLICY` | A declared policy contradicted by the skill's prose, or absent entirely |

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

## How it runs

The analyzer is [`agtmls-core`](https://github.com/sebastienrousseau/agtmls-core)
compiled to WebAssembly, executed under Node. No Rust toolchain, no platform
matrix, no compile step, and the same rule set the CLI enforces — the rules are
data in `agtmls-spec`, loaded identically by every implementation.

Nothing is uploaded anywhere. The analysis happens in your runner.

## Licence

Apache-2.0 OR MIT.
