<!-- SPDX-FileCopyrightText: 2026 Sebastien Rousseau -->
<!-- SPDX-License-Identifier: Apache-2.0 OR MIT -->

# ADR 0001 — The analyzer is vendored, not installed

**Status:** accepted · **Date:** 2026-09-19

## Context

A composite action runs the repository as-is. There is no install step unless
the action performs one, so the WebAssembly module must either be committed or
fetched at run time.

## Decision

`vendor/wasm` is committed. The action installs nothing.

## Consequences

**Good.** An analyzer that downloads its own implementation at audit time is a
strange thing to trust: the code doing the checking would arrive over the
network, from a registry, at the moment of the check. Vendoring also removes a
network dependency from a job that must work on a locked-down runner, and
makes cold start sub-second.

**Costly.** The committed module can fall behind, and a stale analyzer is the
worst kind — it still runs, still exits 0, and is simply blind to whatever was
fixed since, which is indistinguishable from a clean repository.

**The mitigation, and its first wrong form.** `check-vendor-fresh.mjs`
originally compared the committed bytes against a fresh build. That was wrong
twice over: two `wasm-opt` versions produce different bytes from identical
source, so it failed on a toolchain upgrade while saying nothing about the
rules; and it could not fail in the direction that matters, since a module can
be byte-identical to a build of the wrong commit. It now compares the rule ids
the module *enforces* against the rule files in `agtmls-spec`, and fires three
of them at their own examples — because rules being present is not the same as
rules working, which is exactly what happened when a generator doubled every
backslash and nothing matched.

## Alternatives rejected

**`npm install @agtmls/wasm` at run time.** Always current, and adds a
registry fetch to the critical path of a supply-chain tool.

**A Docker action.** Pins everything, and costs an image pull on every run for
a job that is otherwise sub-second.
