<!-- SPDX-FileCopyrightText: 2026 Sebastien Rousseau -->
<!-- SPDX-License-Identifier: Apache-2.0 OR MIT -->

# Roadmap

## Now

Audits a workspace, emits SARIF 2.1.0, fails on a configurable severity.

## Next

- **Publish to the GitHub Marketplace**, with a `v1` tag that moves.
- **Annotate only changed files** on a pull request. Auditing the whole tree
  and annotating all of it buries the finding the author just introduced.
- **A baseline file**, so a repository adopting this mid-life can fail on new
  findings without having to fix every existing one first. Without it the
  realistic adoption path is `fail-on: never`, which is adoption in name only.

## Not planned

- **Uploading anything.** The analysis happens in the runner. A security tool
  that sends your most sensitive prose to a third party has made a poor trade
  on your behalf.
