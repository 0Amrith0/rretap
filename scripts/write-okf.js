#!/usr/bin/env node
"use strict";

/**
 * Publish stage (deterministic).
 *
 * Takes the complete content the merger stage produced for one topic key
 * (as a file on disk — merger's output is returned to the caller, who
 * writes it to a temp file before invoking this script), validates it
 * against the OKF schema, and if valid, writes it to
 * knowledge/<topic_key>.md, then regenerates knowledge/index.md and
 * appends a line to knowledge/log.md.
 *
 * This script performs its own schema check before writing (primary
 * safety). The pre-write-check hook registered in .claude/settings.json
 * independently re-checks the same content file before this script is
 * even allowed to run, as a second, harness-level enforcement layer.
 */

const fs = require("fs");
const path = require("path");
const { validate, validateMinimal, normalizeNewlines } = require("./validate-schema");

const KNOWLEDGE_DIR = path.join(__dirname, "..", "knowledge");
const INDEX_PATH = path.join(KNOWLEDGE_DIR, "index.md");
const LOG_PATH = path.join(KNOWLEDGE_DIR, "log.md");

function parseArgs(argv) {
  const args = { summary: null, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--summary") {
      args.summary = argv[++i];
    } else {
      args.positional.push(argv[i]);
    }
  }
  return args;
}

function extractFrontmatterField(content, field) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const line = fmMatch[1].split("\n").find((l) => l.startsWith(field + ":"));
  if (!line) return null;
  return line.slice(field.length + 1).trim();
}

function rebuildIndex() {
  const files = fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith(".md") && f !== "index.md" && f !== "log.md")
    .sort();

  const lines = ["---", "type: index", "---", "", "# Knowledge Index", ""];
  for (const file of files) {
    // Normalize CRLF->LF before parsing: a checkout with git's core.autocrlf
    // enabled can leave an unrelated file's line endings as CRLF even
    // though nothing about its actual content changed. Without this, the
    // frontmatter/overview regexes below silently fail to match on any
    // such file, and its index entry falls back to "Unknown"/blank.
    const content = normalizeNewlines(fs.readFileSync(path.join(KNOWLEDGE_DIR, file), "utf8"));
    const title = extractFrontmatterField(content, "title") || file;
    const confidence = extractFrontmatterField(content, "confidence") || "Unknown";
    const overviewMatch = content.match(/## Overview\n\n([\s\S]*?)\n\n##/);
    const firstSentence = overviewMatch
      ? overviewMatch[1].trim().split(/(?<=[.!?])\s/)[0]
      : "";
    lines.push(`- [${title}](${file}) — confidence: ${confidence}. ${firstSentence}`);
  }
  lines.push("");

  const content = lines.join("\n");
  const { valid, errors } = validateMinimal(content);
  if (!valid) {
    throw new Error(`[write-okf] BLOCKED: index.md frontmatter invalid: ${errors.join("; ")}`);
  }

  fs.writeFileSync(INDEX_PATH, content, "utf8");
}

const LOG_FRONTMATTER = "---\ntype: log\n---\n\n";

function appendLog(topicKey, action, summary) {
  const timestamp = new Date().toISOString();
  const line = `- ${timestamp}: ${topicKey} ${action}${summary ? ` — ${summary}` : ""}\n`;

  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, LOG_FRONTMATTER, "utf8");
  } else {
    const existing = fs.readFileSync(LOG_PATH, "utf8");
    if (!existing.startsWith("---")) {
      // Pre-existing log.md predates the type-frontmatter requirement —
      // migrate it in place by prepending the header, never dropping
      // history that's already there.
      fs.writeFileSync(LOG_PATH, LOG_FRONTMATTER + existing, "utf8");
    }
  }
  fs.appendFileSync(LOG_PATH, line, "utf8");

  const { valid, errors } = validateMinimal(fs.readFileSync(LOG_PATH, "utf8"));
  if (!valid) {
    throw new Error(`[write-okf] BLOCKED: log.md frontmatter invalid: ${errors.join("; ")}`);
  }
}

function main() {
  const { positional, summary } = parseArgs(process.argv.slice(2));
  const contentFile = positional[0];

  if (!contentFile) {
    console.error(
      '[write-okf] usage: node write-okf.js <content_file> [--summary "text"]'
    );
    process.exitCode = 1;
    return;
  }

  const content = fs.readFileSync(contentFile, "utf8");

  const { valid, errors } = validate(content);
  if (!valid) {
    console.error("[write-okf] BLOCKED: schema validation failed:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exitCode = 1;
    return;
  }

  const topicKey = extractFrontmatterField(content, "topic_key");
  if (!topicKey) {
    console.error("[write-okf] BLOCKED: could not read topic_key from frontmatter");
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });

  const targetPath = path.join(KNOWLEDGE_DIR, `${topicKey}.md`);
  const existingContent = fs.existsSync(targetPath)
    ? fs.readFileSync(targetPath, "utf8")
    : null;

  // Normalize CRLF->LF before comparing: on a checkout with git's
  // core.autocrlf enabled, an on-disk file can carry CRLF line endings
  // while freshly generated content (from the merger, always LF) does
  // not, even when nothing about the actual content changed. Comparing
  // raw bytes would then log a false "updated" for pure line-ending
  // drift — exactly the kind of unnecessary write this check exists to
  // prevent.
  const isUnchanged =
    existingContent !== null &&
    normalizeNewlines(existingContent) === normalizeNewlines(content);

  if (isUnchanged) {
    // Byte-identical to what's already published: the merger produced no
    // real change for this topic key. Per CLAUDE.md's "zero unnecessary
    // edits/writes" hard requirement, skip the write, the index rebuild,
    // and the log line entirely — none of them would reflect an actual
    // change, and logging "updated" here would be a lie the next reader
    // has no way to detect.
    console.error(`[write-okf] no-op: knowledge/${topicKey}.md unchanged, nothing to write`);
    return;
  }

  const action = existingContent === null ? "created" : "updated";

  fs.writeFileSync(targetPath, content, "utf8");

  rebuildIndex();
  appendLog(topicKey, action, summary);

  console.error(`[write-okf] ${action} knowledge/${topicKey}.md`);
}

if (require.main === module) {
  main();
}

module.exports = { main, rebuildIndex, appendLog };
