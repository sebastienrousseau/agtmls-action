// SPDX-FileCopyrightText: 2026 Sebastien Rousseau
// SPDX-License-Identifier: Apache-2.0 OR MIT

/**
 * The summary comment against a local stand-in for the GitHub API: one
 * comment per pull request, edited in place, never posted for nothing, and
 * never written by a run the pull request has moved past.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { MARKER, body, changedConfig, postSummary, watched } from "../src/comment.mjs";

const git = promisify(execFile);
const FINDING = { severity: "HIGH", rule: "AGT-HOOK-002", file: ".claude/settings.json", line: 3,
  message: "Hook command that fetches from the network or installs packages" };

/** A fake API: the pull request's head, and its comments, as the calls change them. */
async function fakeGitHub({ head = "h".repeat(40), comments = [] } = {}) {
  const calls = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    calls.push(`${req.method} ${req.url.split("?")[0]}`);
    const send = (status, data) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (req.method === "GET" && req.url === "/repos/o/r/pulls/7") return send(200, { head: { sha: head } });
    if (req.method === "GET" && req.url.startsWith("/repos/o/r/issues/7/comments")) return send(200, comments);
    if (req.method === "POST") { comments.push({ id: 99, body: JSON.parse(raw).body, user: { type: "Bot" } }); return send(201, {}); }
    if (req.method === "PATCH") { const c = comments.find((x) => `/repos/o/r/issues/comments/${x.id}` === req.url); c.body = JSON.parse(raw).body; return send(200, c); }
    return send(404, {});
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.GITHUB_API_URL = `http://127.0.0.1:${server.address().port}`;
  return { calls, comments, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function eventFile(dir, extra = {}) {
  const file = path.join(dir, "event.json");
  await writeFile(file, JSON.stringify({ pull_request: { number: 7, head: { sha: "h".repeat(40) }, base: { sha: "b".repeat(40) } }, ...extra }));
  return file;
}

async function withDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "agtmls-comment-"));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test("agent configuration is watched; prose and code are not", () => {
  for (const rel of [".claude/settings.json", ".mcp.json", "CLAUDE.md", "pkg/AGENTS.md", ".husky/pre-commit", ".codex/config.toml"]) {
    assert.ok(watched(rel), rel);
  }
  for (const rel of ["README.md", "src/app.js", "docs/setup.md"]) assert.ok(!watched(rel), rel);
});

test("a run with findings creates one comment carrying the marker and no matched text", () => withDir(async (dir) => {
  const api = await fakeGitHub();
  try {
    const done = await postSummary([FINDING], { token: "t", eventPath: await eventFile(dir), repo: "o/r", cwd: dir });
    assert.equal(done, "created");
    assert.ok(api.comments[0].body.startsWith(MARKER));
    assert.match(api.comments[0].body, /\| HIGH \| AGT-HOOK-002 \| `.claude\/settings.json:3` \|/);
    assert.match(api.comments[0].body, /could not be listed/, "a directory that is not a checkout cannot list changes");
  } finally { await api.close(); }
}));

test("the next run edits the bot's comment, not a person's, and leaves an identical one alone", () => withDir(async (dir) => {
  const human = { id: 1, body: `${MARKER} quoted by a person`, user: { type: "User" } };
  const ours = { id: 2, body: `${MARKER}\nold`, user: { type: "Bot" } };
  const api = await fakeGitHub({ comments: [human, ours] });
  try {
    const options = { token: "t", eventPath: await eventFile(dir), repo: "o/r", cwd: dir };
    assert.equal(await postSummary([FINDING], options), "updated");
    assert.equal(human.body, `${MARKER} quoted by a person`);
    assert.equal(await postSummary([FINDING], options), "unchanged");
    assert.ok(!api.calls.includes("POST /repos/o/r/issues/7/comments"));
  } finally { await api.close(); }
}));

test("a clean run posts nothing, but turns an earlier warning into a clean verdict", () => withDir(async (dir) => {
  const repo = path.join(dir, "repo");
  await git("git", ["init", "-q", repo]);
  await withHeadAndBase(repo, async (base, head) => {
    const eventPath = path.join(dir, "event.json");
    await writeFile(eventPath, JSON.stringify({ pull_request: { number: 7, head: { sha: head }, base: { sha: base } } }));
    const api = await fakeGitHub({ head });
    try {
      const options = { token: "t", eventPath, repo: "o/r", cwd: repo };
      assert.equal(await postSummary([], options), "skipped (nothing to report)");
      api.comments.push({ id: 5, body: `${MARKER}\nold warning`, user: { type: "Bot" } });
      assert.equal(await postSummary([], options), "updated");
      assert.match(api.comments[0].body, /No findings and no agent configuration changes/);
    } finally { await api.close(); }
  });
}));

async function withHeadAndBase(repo, fn) {
  const g = (...args) => git("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args]);
  await g("commit", "-q", "--allow-empty", "-m", "base");
  const base = (await g("rev-parse", "HEAD")).stdout.trim();
  await writeFile(path.join(repo, "app.js"), "1\n");
  await g("add", "-A");
  await g("commit", "-q", "-m", "code");
  const head = (await g("rev-parse", "HEAD")).stdout.trim();
  return fn(base, head);
}

test("changes are listed between the pull request's base and head", () => withDir(async (dir) => {
  const repo = path.join(dir, "repo");
  await git("git", ["init", "-q", repo]);
  await withHeadAndBase(repo, async (base) => {
    await writeFile(path.join(repo, ".mcp.json"), "{}");
    const g = (...args) => git("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args]);
    await g("add", "-A");
    await g("commit", "-q", "-m", "mcp");
    const head = (await g("rev-parse", "HEAD")).stdout.trim();
    assert.deepEqual(await changedConfig(base, head, repo), [".mcp.json"]);
    assert.equal(await changedConfig("nope", head, repo), null);
  });
}));

test("a run the pull request has moved past writes nothing", () => withDir(async (dir) => {
  const api = await fakeGitHub({ head: "n".repeat(40) });
  try {
    const done = await postSummary([FINDING], { token: "t", eventPath: await eventFile(dir), repo: "o/r", cwd: dir });
    assert.match(done, /^skipped \(stale: the pull request is now at nnnnnnnnnnnn\)$/);
    assert.deepEqual(api.calls, ["GET /repos/o/r/pulls/7"]);
  } finally { await api.close(); }
}));

test("no token, or an event that is not a pull request, is skipped before any call", () => withDir(async (dir) => {
  assert.equal(await postSummary([FINDING], { token: "", eventPath: "x", repo: "o/r" }), "skipped (no github-token)");
  const file = path.join(dir, "push.json");
  await writeFile(file, JSON.stringify({ ref: "refs/heads/main" }));
  assert.equal(await postSummary([FINDING], { token: "t", eventPath: file, repo: "o/r" }), "skipped (not a pull request event)");
}));

test("the body escapes table cells, counts by severity and caps its table", () => {
  const many = Array.from({ length: 23 }, (_, i) => ({ ...FINDING, line: i + 1, message: "a | b\nc" }));
  const text = body(many, [".mcp.json"], "c".repeat(40));
  assert.match(text, /23 finding\(s\) \(23 HIGH\)/);
  assert.match(text, /- `\.mcp\.json`/);
  assert.match(text, /a \\\| b c/);
  assert.match(text, /3 more in the SARIF report/);
  assert.match(body([], [], "c".repeat(40)), /No findings and no agent configuration changes at `cccccccccccc`/);
});

test("an API error surfaces, so the runner can warn", () => withDir(async (dir) => {
  const server = createServer((req, res) => { res.writeHead(500); res.end(); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.GITHUB_API_URL = `http://127.0.0.1:${server.address().port}`;
  try {
    await assert.rejects(postSummary([FINDING], { token: "t", eventPath: await eventFile(dir), repo: "o/r" }), /GET \/repos\/o\/r\/pulls\/7: 500/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
}));
