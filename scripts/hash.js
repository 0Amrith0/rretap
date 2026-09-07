#!/usr/bin/env node
"use strict";

/**
 * Hash + short-circuit stage (deterministic).
 *
 * Two-mode CLI, backed by two separate functions — deliberately not one
 * atomic read-and-write:
 *
 *   node hash.js <source-id> [--last-commit-at <v>] < body   → check()
 *     Reads fetched body from stdin, computes its content hash, compares
 *     it against knowledge/.state/sources.json. NEVER writes state, even
 *     when changed:true. Prints the comparison result as JSON.
 *
 *   node hash.js --commit <source-id> <hash> [--last-commit-at <v>]  → commit()
 *     Persists <hash> to knowledge/.state/sources.json for <source-id>.
 *     The caller (the /ingest orchestrator) must only run this AFTER
 *     extract/validate/merge/publish have all completed successfully for
 *     that source's changed content (or after extraction legitimately
 *     found zero facts) — never right after check() reports changed:true.
 *     Writing state that early would let a crash or failure between
 *     detection and publish silently mark unpublished content as "already
 *     handled" forever; deferring the write means a failed run just gets
 *     retried on the next `/ingest`.
 *
 * If the hash is unchanged since the last run: check() prints changed=false
 * and touches nothing. This is the short-circuit signal — the caller must
 * stop here for this source and skip extract/validate/merge/publish.
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
 * Read-only: computes the hash and compares it against recorded state, but
 * never writes anything. Deliberately does not persist a "changed" result
 * itself — see `commit()` below for why.
 *
 * @param {string} sourceId
 * @param {string} body - raw fetched content for this source
 * @param {{lastCommitAt?: string|null}} [options] - repo-readme sources
 *   only: the date of the last commit that touched the README/changelog,
 *   used for the trust-rules freshness cutoff.
 * @returns {{sourceId: string, url: string, type: string, changed: boolean, hash: string, previousHash: string|null, stale: boolean, lastCommitAt: string|null}}
 */
function check(sourceId, body, options = {}) {
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

/**
 * Persists a source's new hash to knowledge/.state/sources.json.
 *
 * Deliberately a separate step from `check()`, not folded back into one
 * atomic operation: the caller (the /ingest orchestrator) must only call
 * this AFTER extract/validate/merge/publish have all completed
 * successfully for this source's changed content (or after extract
 * legitimately found zero facts to publish). If state were written the
 * moment a change was detected — the old behavior — a crash or failure
 * anywhere between detection and publish would leave state claiming this
 * content was already handled, silently losing that update forever on
 * every future run. Committing late means a failed run just gets retried
 * next time instead.
 *
 * @param {string} sourceId
 * @param {string} hash - the hash from a prior `check()` call for this source
 * @param {{lastCommitAt?: string|null}} [options]
 */
function commit(sourceId, hash, options = {}) {
  const source = SOURCES[sourceId];
  if (!source) {
    throw new Error(`Unknown source id: ${sourceId}`);
  }

  const state = readState();
  const lastCommitAt = options.lastCommitAt || null;
  const stale = isStale(lastCommitAt);

  state[source.url] = {
    hash,
    last_fetched: new Date().toISOString(),
    type: source.type,
    ...(lastCommitAt ? { last_commit_at: lastCommitAt, stale } : {}),
  };
  writeState(state);

  return { sourceId, url: source.url, hash, stale, lastCommitAt };
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

  if (args[0] === "--commit") {
    const sourceId = args[1];
    const hash = args[2];
    const lastCommitAtIdx = args.indexOf("--last-commit-at");
    const lastCommitAt = lastCommitAtIdx !== -1 ? args[lastCommitAtIdx + 1] : null;

    if (!sourceId || !hash) {
      console.error(
        "[hash] usage: node hash.js --commit <source-id> <hash> [--last-commit-at <value>]"
      );
      process.exitCode = 1;
      return;
    }

    const result = commit(sourceId, hash, { lastCommitAt });
    console.error(`[hash] committed sourceId=${result.sourceId} hash=${result.hash}`);
    process.stdout.write(JSON.stringify(result));
    return;
  }

  const lastCommitAtIdx = args.indexOf("--last-commit-at");
  const lastCommitAt =
    lastCommitAtIdx !== -1 ? args[lastCommitAtIdx + 1] : null;
  const sourceId =
    args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--last-commit-at") ||
    "sponsored-products-overview";

  const body = await readStdin();
  const result = check(sourceId, body, { lastCommitAt });

  if (result.changed) {
    console.error(
      `[hash] sourceId=${result.sourceId} CHANGED (previous=${result.previousHash || "none"} new=${result.hash})${result.stale ? " [STALE repo-readme]" : ""} — proceed to extract; commit only after publish succeeds`
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
  check,
  commit,
  hashContent,
  normalizeForHashing,
  isStale,
  STALE_CUTOFF_MONTHS,
  readState,
  STATE_PATH,
};
