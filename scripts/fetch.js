#!/usr/bin/env node
"use strict";

/**
 * Discover + Fetch stage (deterministic).
 *
 * Plain HTTP fetch per source. GitHub API / Playwright MCP paths are added
 * when the repo source (step 12) needs them — the blog and official
 * sources added so far are both static enough for plain HTTP.
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
};

async function fetchHttpSource(source) {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; okf-pipeline/0.1; +local-dev)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Fetch failed for ${source.url}: ${response.status} ${response.statusText}`
    );
  }

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

  const readmeResponse = await fetch(
    `https://api.github.com/repos/${source.githubOwner}/${source.githubRepo}/readme`,
    { headers: { ...headers, Accept: "application/vnd.github.raw+json" } }
  );
  if (!readmeResponse.ok) {
    throw new Error(
      `GitHub README fetch failed for ${source.githubOwner}/${source.githubRepo}: ${readmeResponse.status} ${readmeResponse.statusText}`
    );
  }
  
  const body = await readmeResponse.text();

  // First find the README's actual path (commits?path= needs the real
  // filename, which varies in case/extension across repos).
  const metaResponse = await fetch(
    `https://api.github.com/repos/${source.githubOwner}/${source.githubRepo}/readme`,
    { headers }
  );
  if (!metaResponse.ok) {
    throw new Error(
      `GitHub README metadata fetch failed for ${source.githubOwner}/${source.githubRepo}: ${metaResponse.status} ${metaResponse.statusText}`
    );
  }
  const meta = await metaResponse.json();

  const commitsResponse = await fetch(
    `https://api.github.com/repos/${source.githubOwner}/${source.githubRepo}/commits?path=${encodeURIComponent(meta.path)}&per_page=1`,
    { headers }
  );
  if (!commitsResponse.ok) {
    throw new Error(
      `GitHub commits fetch failed for ${source.githubOwner}/${source.githubRepo}: ${commitsResponse.status} ${commitsResponse.statusText}`
    );
  }
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

module.exports = { SOURCES, fetchSource };
