#!/usr/bin/env node
"use strict";

/**
 * Discover + Fetch stage (deterministic).
 *
 * Plain HTTP fetch for official/blog sources; GitHub REST API for the
 * repo-readme source. No MCP tooling — every source registered so far is
 * static enough for a plain request. Every network call goes through
 * `fetchWithRetry` below: a timeout plus one retry, since a hung
 * connection or a transient failure (a dropped connection, a momentary
 * GitHub rate limit) previously killed the whole source on the spot.
 */

const SOURCES = {
  "sponsored-products-overview": {
    url: "https://advertising.amazon.com/solutions/products/sponsored-products",
    type: "official",
  },
  "junglescout-sponsored-products-guide": {
    url: "https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/",
    type: "blog",
  },
  "amazon-advertising-api-php-sdk-readme": {
    url: "https://github.com/amzn/amazon-advertising-api-php-sdk",
    type: "repo-readme",
    githubOwner: "amzn",
    githubRepo: "amazon-advertising-api-php-sdk",
  },
  "helium10-sponsored-products-guide": {
    url: "https://www.helium10.com/blog/amazon-ppc/sponsored-products/",
    type: "blog",
  },
  "sponsored-brands-overview": {
    url: "https://advertising.amazon.com/solutions/products/sponsored-brands",
    type: "official",
  },
  "sponsored-display-overview": {
    url: "https://advertising.amazon.com/solutions/products/sponsored-display",
    type: "official",
  },
  "amazon-dsp-overview": {
    url: "https://advertising.amazon.com/solutions/products/amazon-dsp",
    type: "official",
  },
};

const FETCH_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 2; // 1 initial attempt + 1 retry
const RETRY_DELAY_MS = 300;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a single fetch() call with a timeout (via AbortSignal.timeout, no
 * extra dependency) and one retry after a short delay — covers both a
 * hung connection (no timeout previously) and a transient failure like a
 * dropped connection or a momentary GitHub API rate limit (no retry
 * previously, so the very first failure killed the whole source).
 *
 * `errorPrefix` lets each call site keep its own descriptive error message
 * (e.g. "GitHub README fetch failed for amzn/repo") rather than a generic
 * one, since callers/tests key off those specific messages.
 */
async function fetchWithRetry(url, options, errorPrefix) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`${errorPrefix}: ${response.status} ${response.statusText}`);
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

async function fetchHttpSource(source) {
  const response = await fetchWithRetry(
    source.url,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; okf-pipeline/0.1; +local-dev)",
      },
    },
    `Fetch failed for ${source.url}`
  );

  return { body: await response.text() };
}

/**
 * GitHub REST API, no auth (public repo, fine at the low unauthenticated
 * rate limit for this project's scale). Fetches the README's raw content
 * plus the date of the most recent commit that touched it — the
 * `trust-rules` skill's freshness cutoff is computed from README/changelog
 * commit history specifically, not just any push to the repo.
 */
async function fetchRepoReadmeSource(source) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; okf-pipeline/0.1; +local-dev)",
    Accept: "application/vnd.github+json",
  };

  const readmeResponse = await fetchWithRetry(
    `https://api.github.com/repos/${source.githubOwner}/${source.githubRepo}/readme`,
    { headers: { ...headers, Accept: "application/vnd.github.raw+json" } },
    `GitHub README fetch failed for ${source.githubOwner}/${source.githubRepo}`
  );
  const body = await readmeResponse.text();

  // First find the README's actual path (commits?path= needs the real
  // filename, which varies in case/extension across repos).
  const metaResponse = await fetchWithRetry(
    `https://api.github.com/repos/${source.githubOwner}/${source.githubRepo}/readme`,
    { headers },
    `GitHub README metadata fetch failed for ${source.githubOwner}/${source.githubRepo}`
  );
  const meta = await metaResponse.json();

  const commitsResponse = await fetchWithRetry(
    `https://api.github.com/repos/${source.githubOwner}/${source.githubRepo}/commits?path=${encodeURIComponent(meta.path)}&per_page=1`,
    { headers },
    `GitHub commits fetch failed for ${source.githubOwner}/${source.githubRepo}`
  );
  const commits = await commitsResponse.json();
  const lastCommitAt = commits[0]?.commit?.author?.date || null;

  return { body, lastCommitAt };
}

async function fetchSource(sourceId) {
  const source = SOURCES[sourceId];
  if (!source) {
    throw new Error(`Unknown source id: ${sourceId}`);
  }

  const { body, lastCommitAt } =
    source.type === "repo-readme"
      ? await fetchRepoReadmeSource(source)
      : await fetchHttpSource(source);

  return {
    sourceId,
    url: source.url,
    type: source.type,
    fetchedAt: new Date().toISOString(),
    lastCommitAt: lastCommitAt || null,
    body,
  };
}

async function main() {
  const sourceId = process.argv[2] || "sponsored-products-overview";
  const result = await fetchSource(sourceId);
  // Print metadata to stderr so stdout stays pure body content, pipeable
  // to hash.js / a file in later steps.
  console.error(
    `[fetch] sourceId=${result.sourceId} url=${result.url} type=${result.type} bytes=${result.body.length} fetchedAt=${result.fetchedAt}${result.lastCommitAt ? ` lastCommitAt=${result.lastCommitAt}` : ""}`
  );
  process.stdout.write(result.body);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[fetch] error: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { SOURCES, fetchSource, fetchWithRetry };
