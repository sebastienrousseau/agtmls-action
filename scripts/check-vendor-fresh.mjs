#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Sebastien Rousseau
// SPDX-License-Identifier: Apache-2.0 OR MIT

/**
 * Fail if the vendored analyzer is stale.
 *
 * vendor/wasm is committed, so it can silently fall behind agtmls-core. A
 * stale analyzer is the worst kind: it still runs, still reports, still exits
 * 0, and is simply blind to whatever was fixed since. That is indistinguishable
 * from a clean repository unless something checks.
 *
 * Compares the digest of the committed module against a fresh build.
 * Requires a sibling agtmls-wasm checkout, or AGTMLS_WASM.
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.join(HERE, "..", "vendor", "wasm");
const TRACKED = ["agtmls_wasm.js", "agtmls_wasm_bg.wasm", "agtmls_wasm.d.ts"];

async function digestOf(dir) {
  const hash = createHash("sha256");
  for (const name of TRACKED) {
    hash.update(name);
    hash.update(await readFile(path.join(dir, name)));
  }
  return hash.digest("hex");
}

async function wasmDir() {
  if (process.env.AGTMLS_WASM) return process.env.AGTMLS_WASM;
  for (const candidate of ["../agtmls-wasm", "../../Rust/agtmls-wasm"]) {
    const resolved = path.join(HERE, "..", candidate);
    try {
      await readdir(path.join(resolved, "src"));
      return resolved;
    } catch {
      /* try the next */
    }
  }
  return null;
}

const wasm = await wasmDir();
if (!wasm) {
  console.error(
    "FAIL: agtmls-wasm not found. Set AGTMLS_WASM to a checkout of\n" +
      "      https://github.com/sebastienrousseau/agtmls-wasm.\n" +
      "      Refusing to skip: an unchecked vendored analyzer is exactly the\n" +
      "      thing this script exists to catch.",
  );
  process.exit(1);
}

const before = await digestOf(VENDOR);
await run("wasm-pack", ["build", "--target", "nodejs", "--release", "--out-dir", "pkg-node"], {
  cwd: wasm,
  maxBuffer: 32 * 1024 * 1024,
});
const after = await digestOf(path.join(wasm, "pkg-node"));

if (before !== after) {
  console.error(
    `FAIL: vendor/wasm is stale.\n  committed ${before}\n  rebuilt   ${after}\n\n` +
      "Rebuild and commit it; see vendor/wasm/README.md.",
  );
  process.exit(1);
}
console.log(`OK: vendor/wasm matches a fresh build (${before.slice(0, 16)}…)`);
