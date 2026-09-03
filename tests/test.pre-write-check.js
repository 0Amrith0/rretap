"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const HOOK_PATH = path.join(__dirname, "..", "scripts", "hooks", "pre-write-check.js");
const PROJECT_ROOT = path.join(__dirname, "..");

function runHook(stdinPayload) {
  const input = typeof stdinPayload === "string" ? stdinPayload : JSON.stringify(stdinPayload);
  const result = spawnSync("node", [HOOK_PATH], {
    input,
    encoding: "utf8",
    cwd: PROJECT_ROOT,
  });
  return { code: result.status, stderr: result.stderr };
}

function tempFile(content) {
  const p = path.join(os.tmpdir(), `hook-test-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  fs.writeFileSync(p, content, "utf8");
  return p;
}

const VALID_OKF = `---
title: Test
topic_key: Sponsored-Products
confidence: High
last_updated: 2026-09-03
sources:
  - url: https://advertising.amazon.com/solutions/products/sponsored-products
    type: official
    last_checked: 2026-09-03
related: []
disputed: false
---

## Overview

x

## Facts

- fact — [source](https://advertising.amazon.com/solutions/products/sponsored-products), confidence: High, last-checked: 2026-09-03
`;

const INVALID_OKF = "---\ntitle: Missing\n---\n\nno sections\n";

test("hook allows a Bash command unrelated to write-okf.js (exit 0)", () => {
  const result = runHook({ tool_input: { command: "git status" }, cwd: PROJECT_ROOT });
  assert.equal(result.code, 0);
});

test("hook allows a write-okf.js command whose content file is schema-valid (exit 0)", () => {
  const f = tempFile(VALID_OKF);
  try {
    const result = runHook({
      tool_input: { command: `node scripts/write-okf.js "${f}"` },
      cwd: PROJECT_ROOT,
    });
    assert.equal(result.code, 0, result.stderr);
  } finally {
    fs.unlinkSync(f);
  }
});

test("hook blocks a write-okf.js command whose content file is schema-invalid (exit 2)", () => {
  const f = tempFile(INVALID_OKF);
  try {
    const result = runHook({
      tool_input: { command: `node scripts/write-okf.js "${f}"` },
      cwd: PROJECT_ROOT,
    });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /schema validation failed/);
  } finally {
    fs.unlinkSync(f);
  }
});

test("hook blocks a write-okf.js command pointing at a nonexistent file (exit 2)", () => {
  const result = runHook({
    tool_input: { command: "node scripts/write-okf.js does-not-exist.md" },
    cwd: PROJECT_ROOT,
  });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /content file not found/);
});

test("hook resolves a relative content-file path against the given cwd", () => {
  const f = tempFile(VALID_OKF);
  try {
    const dir = path.dirname(f);
    const base = path.basename(f);
    const result = runHook({
      tool_input: { command: `node scripts/write-okf.js ${base}` },
      cwd: dir,
    });
    assert.equal(result.code, 0, result.stderr);
  } finally {
    fs.unlinkSync(f);
  }
});

test("hook fails open (exit 0) on unparseable JSON input", () => {
  const result = runHook("not valid json{{{");
  assert.equal(result.code, 0);
});

test("hook blocks with a clear message when no content-file argument can be found", () => {
  const result = runHook({
    tool_input: { command: "node scripts/write-okf.js" },
    cwd: PROJECT_ROOT,
  });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /could not find a content file argument/);
});
