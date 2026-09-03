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
const { validate } = require("./validate-schema");

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

  const lines = ["# Knowledge Index", ""];
  for (const file of files) {
    const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), "utf8");
    const title = extractFrontmatterField(content, "title") || file;
    const confidence = extractFrontmatterField(content, "confidence") || "Unknown";
    const overviewMatch = content.match(/## Overview\n\n([\s\S]*?)\n\n##/);
    const firstSentence = overviewMatch
      ? overviewMatch[1].trim().split(/(?<=[.!?])\s/)[0]
      : "";
    lines.push(`- [${title}](${file}) — confidence: ${confidence}. ${firstSentence}`);
  }
  lines.push("");

  fs.writeFileSync(INDEX_PATH, lines.join("\n"), "utf8");
}

function appendLog(topicKey, action, summary) {
  const timestamp = new Date().toISOString();
  const line = `- ${timestamp}: ${topicKey} ${action}${summary ? ` — ${summary}` : ""}\n`;
  fs.appendFileSync(LOG_PATH, line, "utf8");
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
  const action = fs.existsSync(targetPath) ? "updated" : "created";

  fs.writeFileSync(targetPath, content, "utf8");

  rebuildIndex();
  appendLog(topicKey, action, summary);

  console.error(`[write-okf] ${action} knowledge/${topicKey}.md`);
}

if (require.main === module) {
  main();
}

module.exports = { main, rebuildIndex, appendLog };
