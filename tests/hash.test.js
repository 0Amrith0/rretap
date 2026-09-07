"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

const {
  normalizeForHashing,
  hashContent,
  isStale,
  check,
  commit,
  readState,
  STATE_PATH,
} = require("../scripts/hash");
const { SOURCES } = require("../scripts/fetch");

// ---- normalizeForHashing ----

test("normalizeForHashing strips script/style/comment blocks and tags", () => {
  const html = `
    <html><head><style>.a{color:red}</style></head>
    <body>
      <!-- tracking comment -->
      <script>var sessionId = "abc123";</script>
      <p>Hello   World</p>
    </body></html>
  `;
  const normalized = normalizeForHashing(html);
  assert.equal(normalized, "Hello World");
});

test("normalizeForHashing decodes common HTML entities", () => {
  const html = "<p>Tom &amp; Jerry &lt;3&gt; &quot;fun&quot; &#39;times&#39;&nbsp;here</p>";
  const normalized = normalizeForHashing(html);
  assert.equal(normalized, 'Tom & Jerry <3> "fun" \'times\' here');
});

test("normalizeForHashing collapses whitespace and trims", () => {
  const html = "  <p>a</p>\n\n  <p>b</p>   <p>c</p>  ";
  assert.equal(normalizeForHashing(html), "a b c");
});

// ---- hashContent ----

test("hashContent is deterministic for identical input", () => {
  const body = "<p>Some stable content</p>";
  assert.equal(hashContent(body), hashContent(body));
});

test("hashContent is stable across volatile embedded tracking data", () => {
  const bodyA = '<p>Content</p><script>var sid="aaa111";</script>';
  const bodyB = '<p>Content</p><script>var sid="zzz999";</script>';
  assert.equal(hashContent(bodyA), hashContent(bodyB));
});

test("hashContent changes when visible content changes", () => {
  const bodyA = "<p>Version one</p>";
  const bodyB = "<p>Version two</p>";
  assert.notEqual(hashContent(bodyA), hashContent(bodyB));
});

test("hashContent is prefixed with sha256:", () => {
  assert.match(hashContent("<p>x</p>"), /^sha256:[0-9a-f]{64}$/);
});

// ---- isStale ----

test("isStale returns false when lastCommitAt is missing", () => {
  assert.equal(isStale(null), false);
  assert.equal(isStale(undefined), false);
});

test("isStale returns false for a recent commit", () => {
  const recent = new Date();
  recent.setDate(recent.getDate() - 1);
  assert.equal(isStale(recent.toISOString()), false);
});

test("isStale returns true for a commit older than 6 months", () => {
  const old = new Date();
  old.setMonth(old.getMonth() - 7);
  assert.equal(isStale(old.toISOString()), true);
});

test("isStale returns false for a commit just inside the 6-month cutoff", () => {
  const withinCutoff = new Date();
  withinCutoff.setMonth(withinCutoff.getMonth() - 6);
  withinCutoff.setDate(withinCutoff.getDate() + 1); // one day inside the window
  assert.equal(isStale(withinCutoff.toISOString()), false);
});

// ---- check / commit ----
// These exercise real file I/O against the project's live
// knowledge/.state/sources.json, so every test snapshots the file first and
// restores it exactly afterwards (and never touches a real source id/url —
// only a throwaway test source registered temporarily on SOURCES).

function withTempSource(fn) {
  const tempId = "__test_source__";
  const tempUrl = "https://example.invalid/__test_source__";
  SOURCES[tempId] = { url: tempUrl, type: "blog" };

  const hadStateFile = fs.existsSync(STATE_PATH);
  const originalState = hadStateFile ? fs.readFileSync(STATE_PATH, "utf8") : null;

  try {
    fn(tempId);
  } finally {
    delete SOURCES[tempId];
    if (hadStateFile) {
      fs.writeFileSync(STATE_PATH, originalState, "utf8");
    } else if (fs.existsSync(STATE_PATH)) {
      // commit() created the state file where none existed before.
      fs.unlinkSync(STATE_PATH);
    }
  }
}

test("check throws on an unknown source id", () => {
  assert.throws(() => check("__not_a_real_source__", "body"), /Unknown source id/);
});

test("commit throws on an unknown source id", () => {
  assert.throws(() => commit("__not_a_real_source__", "sha256:abc"), /Unknown source id/);
});

test("check never writes state, even when changed:true (first sight)", () => {
  withTempSource((tempId) => {
    const hadStateFile = fs.existsSync(STATE_PATH);
    const result = check(tempId, "<p>first version</p>");
    assert.equal(result.changed, true);
    assert.equal(result.previousHash, null);
    assert.match(result.hash, /^sha256:/);

    // check() must not have created the state file (or touched it if it
    // already existed) — only commit() is allowed to write.
    assert.equal(fs.existsSync(STATE_PATH), hadStateFile);
  });
});

test("commit persists the hash so a later check reports changed:false", () => {
  withTempSource((tempId) => {
    const checked = check(tempId, "<p>version A</p>");
    assert.equal(checked.changed, true);

    commit(tempId, checked.hash);
    const state = readState();
    assert.equal(state[SOURCES[tempId].url].hash, checked.hash);

    const rechecked = check(tempId, "<p>version A</p>");
    assert.equal(rechecked.changed, false);
    assert.equal(rechecked.previousHash, checked.hash);
  });
});

test("check reports changed:false for identical content once committed, and does not rewrite state", () => {
  withTempSource((tempId) => {
    const first = check(tempId, "<p>same content</p>");
    commit(tempId, first.hash);
    const beforeMtime = fs.statSync(STATE_PATH).mtimeMs;

    const result = check(tempId, "<p>same    content</p>"); // whitespace-only diff
    assert.equal(result.changed, false);
    assert.equal(result.hash, result.previousHash);

    const afterMtime = fs.statSync(STATE_PATH).mtimeMs;
    assert.equal(afterMtime, beforeMtime, "check() must never rewrite state");
  });
});

test("check reports changed:true when content actually differs from the last committed hash", () => {
  withTempSource((tempId) => {
    const first = check(tempId, "<p>version A</p>");
    commit(tempId, first.hash);

    const second = check(tempId, "<p>version B</p>");
    assert.equal(second.changed, true);
    assert.equal(second.previousHash, first.hash);
    assert.notEqual(second.hash, first.hash);
  });
});

test("a crash between check and commit leaves state unchanged, so the next check still reports changed:true", () => {
  withTempSource((tempId) => {
    const first = check(tempId, "<p>version A</p>");
    commit(tempId, first.hash);

    // Simulate detecting a change but never reaching commit (e.g. publish
    // failed) — deliberately do not call commit() here.
    const detected = check(tempId, "<p>version B</p>");
    assert.equal(detected.changed, true);

    // A subsequent run re-checks the same still-uncommitted content and
    // must still see it as changed, so it gets retried rather than
    // silently lost.
    const retried = check(tempId, "<p>version B</p>");
    assert.equal(retried.changed, true);
    assert.equal(retried.previousHash, first.hash);
  });
});

test("commit marks stale:true and records last_commit_at for an old repo-readme commit", () => {
  withTempSource((tempId) => {
    SOURCES[tempId].type = "repo-readme";
    const old = new Date();
    old.setFullYear(old.getFullYear() - 2);
    const checked = check(tempId, "<p>readme</p>", { lastCommitAt: old.toISOString() });
    assert.equal(checked.stale, true);

    const result = commit(tempId, checked.hash, { lastCommitAt: old.toISOString() });
    assert.equal(result.stale, true);

    const state = readState();
    assert.equal(state[SOURCES[tempId].url].stale, true);
    assert.equal(state[SOURCES[tempId].url].last_commit_at, old.toISOString());
  });
});
