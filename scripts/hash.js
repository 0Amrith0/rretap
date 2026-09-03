#!/usr/bin/env node
"use strict";

/**
 * Hash + short-circuit stage (deterministic).
 *
 * Step 7 scope: wired to the official-docs source only (via fetch.js's
 * SOURCES map). Reads fetched body from stdin, computes its content hash,
 * and compares it against knowledge/.state/sources.json.
 *
 * If the hash is unchanged since the last run: prints changed=false and
 * does NOT touch the state file at all (no unnecessary writes). This is
 * the short-circuit signal — the caller (pipeline orchestrator) must stop
 * here for this source and skip extract/validate/merge/publish.
 *
 * If the hash changed (or this source has never been seen before): prints
 * changed=true and updates the state file with the new hash.
 *
 * IMPORTANT: raw fetched HTML from live pages (this one included) embeds
 * per-request volatile data — session ids, request ids, CSRF-style hidden
 * fields, tracking-pixel query strings — that differs on every single
 * fetch even when the visible page content is identical. Hashing the raw
 * body directly makes every run look "changed". So this script hashes a
 * normalized (scripts/styles/tags stripped, whitespace collapsed) version
 * of the body instead. The raw body is untouched and still passed through
 * to the extractor stage when a real change is detected — only the value
 * used for the hash comparison is normalized.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { SOURCES } = require("./fetch");

const STATE_PATH = path.join(
  __dirname,
  "..",
  "knowledge",
  ".state",
  "sources.json"
);

function readState() {
  if (!fs.existsSync(STATE_PATH)) {
    return {};
  }
  const raw = fs.readFileSync(STATE_PATH, "utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/**
 * Strip script/style blocks, HTML comments, and remaining tags; decode a
 * handful of common entities; collapse whitespace. Not a full HTML
 * parser — just enough to remove volatile markup/tracking noise so the
 * hash reflects visible page text, not per-request cruft.
 */
function normalizeForHashing(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hashContent(body) {
  const normalized = normalizeForHashing(body);
  return "sha256:" + crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

// trust-rules skill: repo-readme facts are advisory-only (capped Low, never
// alone-confirming) once the last commit touching README/changelog is
// older than this many months.
const STALE_CUTOFF_MONTHS = 6;

function isStale(lastCommitAt) {
  if (!lastCommitAt) return false; // not applicable to non-repo sources
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - STALE_CUTOFF_MONTHS);
  return new Date(lastCommitAt) < cutoff;
}

/**
 * @param {string} sourceId
 * @param {string} body - raw fetched content for this source
 * @param {{lastCommitAt?: string|null}} [options] - repo-readme sources
 *   only: the date of the last commit that touched the README/changelog,
 *   used for the trust-rules freshness cutoff.
 * @returns {{sourceId: string, url: string, type: string, changed: boolean, hash: string, previousHash: string|null, stale: boolean, lastCommitAt: string|null}}
 */
function checkAndUpdate(sourceId, body, options = {}) {
  const source = SOURCES[sourceId];
  if (!source) {
    throw new Error(`Unknown source id: ${sourceId}`);
  }

  const hash = hashContent(body);
  const state = readState();
  const existing = state[source.url];
  const previousHash = existing ? existing.hash : null;
  const changed = previousHash !== hash;
  const lastCommitAt = options.lastCommitAt || null;
  const stale = isStale(lastCommitAt);

  if (changed) {
    state[source.url] = {
      hash,
      last_fetched: new Date().toISOString(),
      type: source.type,
      ...(lastCommitAt ? { last_commit_at: lastCommitAt, stale } : {}),
    };
    writeState(state);
  }

  return {
    sourceId,
    url: source.url,
    type: source.type,
    changed,
    hash,
    previousHash,
    stale,
    lastCommitAt,
  };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const lastCommitAtIdx = args.indexOf("--last-commit-at");
  const lastCommitAt =
    lastCommitAtIdx !== -1 ? args[lastCommitAtIdx + 1] : null;
  const sourceId =
    args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--last-commit-at") ||
    "sponsored-products-overview";

  const body = await readStdin();
  const result = checkAndUpdate(sourceId, body, { lastCommitAt });

  if (result.changed) {
    console.error(
      `[hash] sourceId=${result.sourceId} CHANGED (previous=${result.previousHash || "none"} new=${result.hash})${result.stale ? " [STALE repo-readme]" : ""} — proceed to extract`
    );
  } else {
    console.error(
      `[hash] sourceId=${result.sourceId} UNCHANGED (hash=${result.hash}) — short-circuit, skip extract/validate/merge/publish`
    );
  }

  process.stdout.write(JSON.stringify(result));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[hash] error: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  checkAndUpdate,
  hashContent,
  normalizeForHashing,
  isStale,
  STALE_CUTOFF_MONTHS,
  readState,
  STATE_PATH,
};
