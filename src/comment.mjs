// SPDX-FileCopyrightText: 2026 Sebastien Rousseau
// SPDX-License-Identifier: Apache-2.0 OR MIT

/**
 * One summary comment on the pull request, updated in place.
 *
 * Annotations land on lines a reviewer may never open; a change to a hook
 * or an MCP manifest has no line worth annotating. The comment says, once
 * per pull request, what the audit found and which agent configuration the
 * branch changes. It is posted only when there is something to say, edited
 * rather than repeated on every push, and skipped when the pull request has
 * moved on since this run started, so an old run never overwrites a newer
 * one's verdict.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

export const MARKER = "<!-- agtmls-audit -->";
const SHOWN = 20;

// What an agent loads unread on its next run: the paths claude-code-action
// restores before it runs, plus the other agents'. Kept in step with
// agtmls's scripts/_lib/agent_config.py (WATCH_DIRS, WATCH_NAMES).
const WATCH_DIRS = new Set([".claude", ".codex", ".cursor", ".gemini", ".opencode", ".husky",
  ".claude-plugin", ".codex-plugin", ".cursor-plugin"]);
const WATCH_NAMES = new Set([".mcp.json", ".claude.json", ".gitmodules", ".ripgreprc", "CLAUDE.md",
  "CLAUDE.local.md", "AGENTS.md", "GEMINI.md", "opencode.json", "opencode.jsonc", "copilot-instructions.md",
  "hooks.json", "plugin.json", "marketplace.json"]);

export function watched(rel) {
  const parts = rel.split("/");
  return WATCH_NAMES.has(parts.at(-1)) || parts.slice(0, -1).some((part) => WATCH_DIRS.has(part));
}

/** Agent-config paths changed between the pull request's base and head, or null when git cannot say. */
export async function changedConfig(base, head, cwd = process.cwd()) {
  try {
    const { stdout } = await promisify(execFile)(
      "git", ["diff", "--name-only", "--no-color", `${base}...${head}`, "--"], { cwd });
    return stdout.split("\n").filter((line) => line && watched(line));
  } catch {
    return null;
  }
}

function escapeCell(text) {
  return String(text).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

/** The comment body. Findings carry only rule messages, never the text a rule matched. */
export function body(findings, changed, sha) {
  const lines = [MARKER, "## AgtMLS audit", ""];
  if (findings.length === 0 && (changed ?? []).length === 0) {
    lines.push(`No findings and no agent configuration changes at \`${sha.slice(0, 12)}\`.`);
    return lines.join("\n");
  }
  const counts = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    .map((s) => [s, findings.filter((f) => f.severity === s).length])
    .filter(([, n]) => n > 0).map(([s, n]) => `${n} ${s}`);
  lines.push(`At \`${sha.slice(0, 12)}\`: ${findings.length} finding(s)${counts.length ? ` (${counts.join(", ")})` : ""}.`, "");
  if (changed === null) {
    lines.push("Agent configuration changes could not be listed: check out with `fetch-depth: 0`.", "");
  } else if (changed.length) {
    lines.push("**Agent configuration this pull request changes.** An agent loads these on its next run; read them first:", "");
    lines.push(...changed.map((p) => `- \`${p}\``), "");
  }
  if (findings.length) {
    lines.push("| Severity | Rule | Where | Finding |", "| --- | --- | --- | --- |");
    for (const f of findings.slice(0, SHOWN)) {
      lines.push(`| ${f.severity} | ${f.rule} | \`${escapeCell(f.file)}:${f.line}\` | ${escapeCell(f.message)} |`);
    }
    if (findings.length > SHOWN) lines.push("", `${findings.length - SHOWN} more in the SARIF report.`);
  }
  return lines.join("\n");
}

function client(token, api = process.env.GITHUB_API_URL || "https://api.github.com") {
  return async (method, route, payload) => {
    const response = await fetch(`${api}${route}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(payload ? { "content-type": "application/json" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
}

async function existing(call, repo, number) {
  for (let page = 1; page <= 10; page += 1) {
    const comments = await call("GET", `/repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`);
    const ours = comments.find((c) => c.user?.type === "Bot" && c.body?.startsWith(MARKER));
    if (ours || comments.length < 100) return ours ?? null;
  }
  return null;
}

/**
 * Post, update or leave the summary comment. Returns what it did, for the log:
 * "skipped (...)", "created", "updated" or "unchanged".
 */
export async function postSummary(findings, { token, eventPath, repo, cwd } = {}) {
  if (!token) return "skipped (no github-token)";
  const event = JSON.parse(await readFile(eventPath, "utf8"));
  const pr = event.pull_request;
  if (!pr) return "skipped (not a pull request event)";
  const call = client(token);
  const current = await call("GET", `/repos/${repo}/pulls/${pr.number}`);
  if (current.head.sha !== pr.head.sha) return `skipped (stale: the pull request is now at ${current.head.sha.slice(0, 12)})`;
  const changed = await changedConfig(pr.base.sha, pr.head.sha, cwd);
  const text = body(findings, changed, pr.head.sha);
  const ours = await existing(call, repo, pr.number);
  const quiet = findings.length === 0 && (changed ?? []).length === 0;
  if (!ours && quiet) return "skipped (nothing to report)";
  if (ours?.body === text) return "unchanged";
  if (ours) {
    await call("PATCH", `/repos/${repo}/issues/comments/${ours.id}`, { body: text });
    return "updated";
  }
  await call("POST", `/repos/${repo}/issues/${pr.number}/comments`, { body: text });
  return "created";
}
