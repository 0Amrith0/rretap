"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { SOURCES, fetchSource } = require("../scripts/fetch");

// ---- SOURCES registry shape ----

test("SOURCES has at least one entry of each required type", () => {
  const types = Object.values(SOURCES).map((s) => s.type);
  assert.ok(types.includes("official"), "expected at least one official source");
  assert.ok(types.includes("blog"), "expected at least one blog source");
  assert.ok(types.includes("repo-readme"), "expected at least one repo-readme source");
});

test("every SOURCES entry has a url and a valid type", () => {
  const validTypes = ["official", "blog", "repo-readme"];
  for (const [id, source] of Object.entries(SOURCES)) {
    assert.ok(source.url, `${id} missing url`);
    assert.ok(validTypes.includes(source.type), `${id} has invalid type '${source.type}'`);
  }
});

test("every repo-readme source declares githubOwner and githubRepo", () => {
  for (const [id, source] of Object.entries(SOURCES)) {
    if (source.type === "repo-readme") {
      assert.ok(source.githubOwner, `${id} missing githubOwner`);
      assert.ok(source.githubRepo, `${id} missing githubRepo`);
    }
  }
});

// ---- fetchSource dispatch ----

test("fetchSource rejects an unknown source id", async () => {
  await assert.rejects(() => fetchSource("__not_a_real_source__"), /Unknown source id/);
});

// ---- fetchHttpSource path (official/blog), via fetchSource, with global.fetch mocked ----

function withMockedFetch(impl, fn) {
  const original = global.fetch;
  global.fetch = impl;
  return Promise.resolve(fn()).finally(() => {
    global.fetch = original;
  });
}

test("fetchSource (http path) returns body text and metadata on a 200 response", async () => {
  const anyHttpSourceId = Object.keys(SOURCES).find(
    (id) => SOURCES[id].type === "official" || SOURCES[id].type === "blog"
  );
  assert.ok(anyHttpSourceId, "need at least one official/blog source to test against");

  await withMockedFetch(
    async (url) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => `<p>mock body for ${url}</p>`,
    }),
    async () => {
      const result = await fetchSource(anyHttpSourceId);
      assert.equal(result.sourceId, anyHttpSourceId);
      assert.equal(result.type, SOURCES[anyHttpSourceId].type);
      assert.match(result.body, /mock body for/);
      assert.equal(result.lastCommitAt, null);
      assert.ok(result.fetchedAt);
    }
  );
});

test("fetchSource (http path) throws with status info on a non-ok response", async () => {
  const anyHttpSourceId = Object.keys(SOURCES).find(
    (id) => SOURCES[id].type === "official" || SOURCES[id].type === "blog"
  );

  await withMockedFetch(
    async () => ({ ok: false, status: 404, statusText: "Not Found", text: async () => "" }),
    async () => {
      await assert.rejects(() => fetchSource(anyHttpSourceId), /404/);
    }
  );
});

// ---- fetchRepoReadmeSource path, via fetchSource, with global.fetch mocked ----

test("fetchSource (repo-readme path) returns README body and last-commit date", async () => {
  const repoSourceId = Object.keys(SOURCES).find((id) => SOURCES[id].type === "repo-readme");
  assert.ok(repoSourceId, "need at least one repo-readme source to test against");
  const source = SOURCES[repoSourceId];

  const calls = [];
  await withMockedFetch(
    async (url, opts) => {
      calls.push(url);
      if (calls.length === 1) {
        // raw README content
        return { ok: true, status: 200, statusText: "OK", text: async () => "# Mock README" };
      }
      if (calls.length === 2) {
        // README metadata (path)
        return { ok: true, status: 200, statusText: "OK", json: async () => ({ path: "README.md" }) };
      }
      // commits list
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [{ commit: { author: { date: "2024-01-15T00:00:00Z" } } }],
      };
    },
    async () => {
      const result = await fetchSource(repoSourceId);
      assert.equal(result.sourceId, repoSourceId);
      assert.equal(result.body, "# Mock README");
      assert.equal(result.lastCommitAt, "2024-01-15T00:00:00Z");
      assert.equal(calls.length, 3);
      assert.ok(calls[2].includes(encodeURIComponent("README.md")));
    }
  );
});

test("fetchSource (repo-readme path) returns lastCommitAt: null when no commits are found", async () => {
  const repoSourceId = Object.keys(SOURCES).find((id) => SOURCES[id].type === "repo-readme");

  let call = 0;
  await withMockedFetch(
    async () => {
      call++;
      if (call === 1) return { ok: true, status: 200, statusText: "OK", text: async () => "# README" };
      if (call === 2) return { ok: true, status: 200, statusText: "OK", json: async () => ({ path: "README.md" }) };
      return { ok: true, status: 200, statusText: "OK", json: async () => [] };
    },
    async () => {
      const result = await fetchSource(repoSourceId);
      assert.equal(result.lastCommitAt, null);
    }
  );
});

test("fetchSource (repo-readme path) throws when the README fetch fails", async () => {
  const repoSourceId = Object.keys(SOURCES).find((id) => SOURCES[id].type === "repo-readme");

  await withMockedFetch(
    async () => ({ ok: false, status: 404, statusText: "Not Found" }),
    async () => {
      await assert.rejects(() => fetchSource(repoSourceId), /GitHub README fetch failed/);
    }
  );
});

test("fetchSource (repo-readme path) throws when the commits fetch fails", async () => {
  const repoSourceId = Object.keys(SOURCES).find((id) => SOURCES[id].type === "repo-readme");

  let call = 0;
  await withMockedFetch(
    async () => {
      call++;
      if (call === 1) return { ok: true, status: 200, statusText: "OK", text: async () => "# README" };
      if (call === 2) return { ok: true, status: 200, statusText: "OK", json: async () => ({ path: "README.md" }) };
      return { ok: false, status: 500, statusText: "Server Error" };
    },
    async () => {
      await assert.rejects(() => fetchSource(repoSourceId), /GitHub commits fetch failed/);
    }
  );
});
