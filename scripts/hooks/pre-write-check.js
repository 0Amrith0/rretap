#!/usr/bin/env node
"use strict";

/**
 * PreToolUse hook (registered in .claude/settings.json), matched on the
 * Bash tool.
 *
 * Independently re-validates the OKF schema check before allowing any
 * Bash command that invokes scripts/write-okf.js to run at all — a
 * second, harness-level enforcement layer on top of write-okf.js's own
 * internal check. Blocks (exit code 2, per Claude Code's PreToolUse hook
 * protocol) if the content file the command is about to publish fails
 * schema validation.
 *
 * Any Bash command that doesn't invoke write-okf.js is irrelevant to this
 * hook and is allowed through immediately (exit 0).
 */

const fs = require("fs");
const path = require("path");
const { validate } = require("../validate-schema");

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

async function main() {
  const raw = await readStdin();

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    // Can't parse hook input at all — fail open rather than block on an
    // unrelated parsing problem this hook has no business enforcing.
    process.exit(0);
  }

  const command = input && input.tool_input && input.tool_input.command;
  if (!command || !command.includes("write-okf.js")) {
    process.exit(0); // not a write-okf.js invocation — nothing to check
  }

  const match = command.match(/write-okf\.js\s+("([^"]+)"|'([^']+)'|(\S+))/);
  const contentFile = match && (match[2] || match[3] || match[4]);

  if (!contentFile) {
    console.error(
      "[pre-write-check] could not find a content file argument in the write-okf.js command; blocking to be safe"
    );
    process.exit(2);
  }

  const resolved = path.isAbsolute(contentFile)
    ? contentFile
    : path.resolve(input.cwd || process.cwd(), contentFile);

  if (!fs.existsSync(resolved)) {
    console.error(`[pre-write-check] content file not found: ${resolved}; blocking`);
    process.exit(2);
  }

  const content = fs.readFileSync(resolved, "utf8");
  const { valid, errors } = validate(content);

  if (!valid) {
    console.error("[pre-write-check] BLOCKED write to knowledge/: schema validation failed:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(2);
  }

  process.exit(0);
}

main();
