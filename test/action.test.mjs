// SPDX-FileCopyrightText: 2026 Sebastien Rousseau
// SPDX-License-Identifier: Apache-2.0 OR MIT

/**
 * End-to-end tests for the action.
 *
 * These run the real runner against real fixtures, because the failure that
 * matters is not "the function returns a list" -- it is "the action reported
 * a clean result on a repository that was not clean". A malicious setup.sh
 * beside a benign SKILL.md is exactly the case an analyzer that reads only
 * Markdown misses, and reports as green.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(HERE, "..", "src", "run.mjs");

async function audit(fixture, failOn = "high") {
  const out = await mkdtemp(path.join(tmpdir(), "agtmls-action-"));
  const sarifFile = path.join(out, "agtmls.sarif");
  let code = 0;
  try {
    await run("node", [RUNNER], {
      env: {
        ...process.env,
        INPUT_PATH: path.join(HERE, "fixtures", fixture),
        INPUT_FAIL_ON: failOn,
        INPUT_SARIF_FILE: sarifFile,
        GITHUB_OUTPUT: path.join(out, "output"),
      },
    });
  } catch (error) {
    code = error.code ?? 1;
  }
  const sarif = JSON.parse(await readFile(sarifFile, "utf8"));
  await rm(out, { recursive: true, force: true });
  return { code, sarif };
}

test("a malicious script beside a benign SKILL.md is detected", async () => {
  const { code, sarif } = await audit("evil");
  const rules = sarif.runs[0].results.map((r) => r.ruleId);
  assert.ok(rules.includes("AGT-EXEC-001"), `expected AGT-EXEC-001, got ${rules}`);
  const hit = sarif.runs[0].results.find((r) => r.ruleId === "AGT-EXEC-001");
  assert.match(
    hit.locations[0].physicalLocation.artifactLocation.uri,
    /setup\.sh$/,
    "the finding must point at the script, not at SKILL.md",
  );
  assert.equal(hit.level, "error");
  assert.equal(code, 1, "a HIGH finding must fail the job at fail-on: high");
});

test("a benign skill produces no findings and passes", async () => {
  const { code, sarif } = await audit("clean");
  assert.equal(sarif.runs[0].results.length, 0, "false positive on benign input");
  assert.equal(code, 0);
});

test("fail-on: never reports findings without failing", async () => {
  const { code, sarif } = await audit("evil", "never");
  assert.ok(sarif.runs[0].results.length > 0, "findings must still be reported");
  assert.equal(code, 0, "fail-on: never must not fail the job");
});

test("SARIF declares every embedded rule, with a help link", async () => {
  const { sarif } = await audit("clean");
  const rules = sarif.runs[0].tool.driver.rules;
  assert.ok(rules.length >= 15, `expected the full rule set, got ${rules.length}`);
  for (const rule of rules) {
    assert.match(rule.id, /^AGT-[A-Z]+-\d{3}$/);
    assert.match(rule.helpUri, /agtmls-spec/);
  }
});

test("an invalid fail-on is a usage error, not a silent default", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "agtmls-action-"));
  let code = 0;
  try {
    await run("node", [RUNNER], {
      env: { ...process.env, INPUT_PATH: HERE, INPUT_FAIL_ON: "sometimes",
             INPUT_SARIF_FILE: path.join(out, "s.sarif") },
    });
  } catch (error) {
    code = error.code ?? 1;
  }
  await rm(out, { recursive: true, force: true });
  assert.equal(code, 2, "usage errors must exit 2");
});

test("SARIF and annotations carry the rule's message, never the text it matched", async () => {
  const { sarif } = await audit("evil", "never");
  const serialised = JSON.stringify(sarif);
  assert.ok(sarif.runs[0].results.length > 0);
  assert.ok(!serialised.includes("attacker.example"), "a matched URL leaked into the SARIF report");
  assert.ok(!serialised.includes("curl -s"), "a matched command leaked into the SARIF report");
});

test("a summary comment that cannot be posted is a warning, never a different exit code", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "agtmls-action-"));
  let code = 0;
  let stdout = "";
  try {
    ({ stdout } = await run("node", [RUNNER], {
      env: { ...process.env, INPUT_PATH: path.join(HERE, "fixtures", "clean"), INPUT_FAIL_ON: "high",
             INPUT_SARIF_FILE: path.join(out, "s.sarif"), INPUT_COMMENT: "true", INPUT_GITHUB_TOKEN: "t",
             GITHUB_EVENT_PATH: path.join(out, "absent.json"), GITHUB_REPOSITORY: "o/r" },
    }));
  } catch (error) {
    code = error.code ?? 1;
    stdout = error.stdout;
  }
  await rm(out, { recursive: true, force: true });
  assert.equal(code, 0);
  assert.match(stdout, /::warning::AgtMLS could not post its summary comment/);
});


test("the README's usage examples pin a tag that exists: this release", async () => {
  const root = path.join(HERE, "..");
  const { version } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const readme = await readFile(path.join(root, "README.md"), "utf8");
  const refs = [...readme.matchAll(/uses: sebastienrousseau\/agtmls-action@(\S+)/g)].map((m) => m[1]);
  assert.ok(refs.length > 0, "the README shows how to use the action");
  assert.deepEqual([...new Set(refs)], [`v${version}`]);
});

test("the vendored analyzer carries no build machine's home directory", async () => {
  // rustc records source paths for panic locations. A build without
  // --remap-path-prefix ships the builder's home directory (and user name)
  // inside the module every workflow downloads.
  const wasm = await readFile(path.join(HERE, "..", "vendor", "wasm", "agtmls_wasm_bg.wasm"));
  const text = wasm.toString("latin1");
  for (const home of ["/Users/", "/home/"]) {
    assert.equal(text.includes(home), false, `vendor/wasm/agtmls_wasm_bg.wasm contains ${home}`);
  }
});
