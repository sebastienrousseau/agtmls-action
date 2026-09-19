// SPDX-FileCopyrightText: 2026 Sebastien Rousseau
// SPDX-License-Identifier: Apache-2.0 OR MIT

/**
 * Audit a workspace and emit SARIF.
 *
 * The analyzer is agtmls-core compiled to WebAssembly, so this runs under Node
 * with no Rust toolchain, no platform matrix and no compile step — and enforces
 * exactly the rule set the CLI does, because the rules are data in agtmls-spec
 * rather than a copy in each implementation.
 */

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SEVERITY_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
const FAIL_ON_RANK = { never: Infinity, low: 0, medium: 1, high: 2, critical: 3 };

// Kept in step with agtmls-core's AUDITABLE_SUFFIXES. Auditing only Markdown
// was the original gap: a skill ships harness scripts and examples beside
// SKILL.md, and none of them were ever read.
const AUDITABLE = new Set([
  ".md", ".markdown", ".txt", ".rst",
  ".sh", ".bash", ".zsh", ".fish", ".ps1",
  ".py", ".js", ".mjs", ".cjs", ".ts", ".rb", ".pl", ".lua",
  ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg",
]);
const SKIP_DIRS = new Set([".git", "node_modules", "target", "__pycache__", ".venv", "dist"]);

async function* walk(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) continue; // never follow links out of the tree
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full);
    } else if (entry.isFile() && AUDITABLE.has(path.extname(entry.name).toLowerCase())) {
      yield full;
    }
  }
}

/** SARIF 2.1.0, so findings land on the diff rather than in a log. */
function toSarif(findings, ruleIds, specVersion) {
  const rules = ruleIds.map((id) => ({
    id,
    helpUri: `https://github.com/sebastienrousseau/agtmls-spec/blob/main/rules/${id}.toml`,
    properties: { tags: ["security", "agent-skills"] },
  }));
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "AgtMLS",
            informationUri: "https://github.com/sebastienrousseau/agtmls",
            semanticVersion: specVersion,
            rules,
          },
        },
        results: findings.map((f) => ({
          ruleId: f.rule,
          level: SEVERITY_RANK[f.severity] >= 2 ? "error" : "warning",
          message: { text: f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.file },
                region: { startLine: Math.max(1, f.line) },
              },
            },
          ],
        })),
      },
    ],
  };
}

async function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) await appendFile(file, `${name}=${value}\n`);
}

async function main() {
  const target = process.env.INPUT_PATH || ".";
  const failOn = (process.env.INPUT_FAIL_ON || "high").toLowerCase();
  const sarifFile = process.env.INPUT_SARIF_FILE || "agtmls.sarif";

  if (!(failOn in FAIL_ON_RANK)) {
    console.error(`::error::fail-on must be one of ${Object.keys(FAIL_ON_RANK).join(", ")}`);
    process.exit(2);
  }

  // Vendored, not installed: a composite action runs the repository as-is,
  // and an analyzer that fetches its own implementation at audit time is a
  // strange thing to trust.
  const wasm = await import(
    new URL("../vendor/wasm/agtmls_wasm.js", import.meta.url).href
  );

  // A module with no rules reports zero findings, which looks exactly like a
  // clean repository. Refuse to report success on an unarmed analyzer.
  const ruleCount = wasm.rule_count();
  if (ruleCount === 0) {
    console.error("::error::the analyzer has no rules embedded; refusing to report a clean result");
    process.exit(1);
  }
  console.log(`AgtMLS: ${ruleCount} rules, spec ${wasm.spec_version()}`);

  const findings = [];
  let scanned = 0;
  for await (const file of walk(target)) {
    const info = await stat(file);
    if (info.size > 5 * 1024 * 1024) {
      findings.push({
        file, line: 1, severity: "MEDIUM", category: "scan_limit",
        rule: "AGT-SCAN-001", message: "File skipped: larger than the 5MB audit limit",
      });
      continue;
    }
    scanned += 1;
    const relative = path.relative(process.cwd(), file) || file;
    for (const finding of wasm.audit(relative, await readFile(file, "utf8"))) {
      findings.push({ ...finding, file: relative });
    }
  }

  const floor = FAIL_ON_RANK[failOn];
  const blocking = findings.filter((f) => SEVERITY_RANK[f.severity] >= floor);

  await writeFile(
    sarifFile,
    JSON.stringify(toSarif(findings, wasm.rule_ids(), wasm.spec_version()), null, 2),
    "utf8",
  );

  for (const f of findings) {
    const level = SEVERITY_RANK[f.severity] >= 2 ? "error" : "warning";
    console.log(`::${level} file=${f.file},line=${f.line},title=${f.rule}::${f.message}`);
  }
  console.log(`AgtMLS: ${scanned} file(s) scanned, ${findings.length} finding(s), ${blocking.length} at or above ${failOn}`);

  await setOutput("findings", findings.length);
  await setOutput("blocking", blocking.length);
  await setOutput("sarif-file", sarifFile);

  process.exit(blocking.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`::error::${error?.stack || error}`);
  process.exit(1);
});
