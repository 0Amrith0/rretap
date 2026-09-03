"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const KNOWLEDGE_DIR = path.join(__dirname, "..", "knowledge");
const INDEX_PATH = path.join(KNOWLEDGE_DIR, "index.md");
const LOG_PATH = path.join(KNOWLEDGE_DIR, "log.md");

// write-okf.js writes to the real knowledge/ dir (its paths are hardcoded
// relative to __dirname, not injectable), so every test here snapshots
// index.md, log.md, and whichever knowledge/<topic>.md it touches, and
// restores them exactly in a finally block — including deleting a file that
// didn't exist before the test created it. Sponsored-Display has no doc yet
// (verified against knowledge/ before writing this suite), so it's used as
// the safe "create" target; Budget-Placement's existing doc is used, via a
// full snapshot/restore, as the safe "update" target.

function runWriteOkf(args) {
  const { spawnSync } = require("child_process");
  const scriptPath = path.join(__dirname, "..", "scripts", "write-okf.js");
  const result = spawnSync("node", [scriptPath, ...args], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function snapshot(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
}

function restore(filePath, original) {
  if (original === null) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } else {
    fs.writeFileSync(filePath, original, "utf8");
  }
}

function withKnowledgeSnapshot(topicKey, fn) {
  const targetPath = path.join(KNOWLEDGE_DIR, `${topicKey}.md`);
  const before = {
    index: snapshot(INDEX_PATH),
    log: snapshot(LOG_PATH),
    target: snapshot(targetPath),
  };
  try {
    fn(targetPath);
  } finally {
    restore(targetPath, before.target);
    restore(INDEX_PATH, before.index);
    restore(LOG_PATH, before.log);
  }
}

function writeTempContentFile(content) {
  const tmpPath = path.join(os.tmpdir(), `okf-test-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  fs.writeFileSync(tmpPath, content, "utf8");
  return tmpPath;
}

function okfDoc({ topicKey, factLine = "A fact." }) {
  return `---
title: Test Doc
topic_key: ${topicKey}
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

Test overview.

## Facts

- ${factLine} — [source](https://advertising.amazon.com/solutions/products/sponsored-products), confidence: High, last-checked: 2026-09-03
`;
}

test("write-okf creates a new file for a topic that doesn't have one yet, and reports 'created'", () => {
  withKnowledgeSnapshot("Sponsored-Display", (targetPath) => {
    assert.equal(fs.existsSync(targetPath), false, "precondition: Sponsored-Display.md must not already exist");

    const contentFile = writeTempContentFile(okfDoc({ topicKey: "Sponsored-Display" }));
    try {
      const result = runWriteOkf([contentFile, "--summary", "unit test create"]);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stderr || "", /created knowledge\/Sponsored-Display\.md/);
      assert.equal(fs.existsSync(targetPath), true);

      const written = fs.readFileSync(targetPath, "utf8");
      assert.match(written, /topic_key: Sponsored-Display/);

      const log = fs.readFileSync(LOG_PATH, "utf8");
      assert.match(log, /Sponsored-Display created — unit test create/);

      const index = fs.readFileSync(INDEX_PATH, "utf8");
      assert.match(index, /Sponsored-Display\.md/);
    } finally {
      fs.unlinkSync(contentFile);
    }
  });
});

test("write-okf updates an existing file in place and reports 'updated'", () => {
  withKnowledgeSnapshot("Budget-Placement", (targetPath) => {
    assert.equal(fs.existsSync(targetPath), true, "precondition: Budget-Placement.md must already exist");

    const contentFile = writeTempContentFile(
      okfDoc({ topicKey: "Budget-Placement", factLine: "A brand new updated fact for this test." })
    );
    try {
      const result = runWriteOkf([contentFile]);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stderr || "", /updated knowledge\/Budget-Placement\.md/);

      const written = fs.readFileSync(targetPath, "utf8");
      assert.match(written, /A brand new updated fact for this test\./);
    } finally {
      fs.unlinkSync(contentFile);
    }
  });
});

test("write-okf refuses to write and exits non-zero for a schema-invalid document", () => {
  withKnowledgeSnapshot("Sponsored-Display", (targetPath) => {
    const invalid = "---\ntitle: Missing Fields\n---\n\nno sections here\n";
    const contentFile = writeTempContentFile(invalid);
    try {
      const result = runWriteOkf([contentFile]);
      assert.notEqual(result.code, 0);
      assert.equal(fs.existsSync(targetPath), false, "invalid document must not be written");
    } finally {
      fs.unlinkSync(contentFile);
    }
  });
});

test("write-okf exits non-zero with a usage message when no content file is given", () => {
  const result = runWriteOkf([]);
  assert.notEqual(result.code, 0);
});

// ---- rebuildIndex / appendLog exported helpers ----

const { rebuildIndex, appendLog } = require("../scripts/write-okf");

test("rebuildIndex lists every knowledge/*.md file except index.md and log.md", () => {
  const before = snapshot(INDEX_PATH);
  try {
    rebuildIndex();
    const index = fs.readFileSync(INDEX_PATH, "utf8");
    const files = fs
      .readdirSync(KNOWLEDGE_DIR)
      .filter((f) => f.endsWith(".md") && f !== "index.md" && f !== "log.md");
    for (const f of files) {
      assert.match(index, new RegExp(f.replace(".", "\\.")));
    }
    assert.doesNotMatch(index, /\]\(index\.md\)/);
    assert.doesNotMatch(index, /\]\(log\.md\)/);
  } finally {
    restore(INDEX_PATH, before);
  }
});

test("appendLog appends exactly one line with topic, action, and summary", () => {
  const before = snapshot(LOG_PATH);
  try {
    appendLog("Sponsored-Products", "updated", "unit test summary line");
    const log = fs.readFileSync(LOG_PATH, "utf8");
    assert.match(log, /Sponsored-Products updated — unit test summary line\n$/);
  } finally {
    restore(LOG_PATH, before);
  }
});
