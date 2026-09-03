#!/usr/bin/env node
"use strict";

/**
 * Pre-write schema check (deterministic).
 *
 * Mechanically validates that an OKF document's frontmatter has all
 * required fields, well-formed values, and a body with the required
 * sections, per .claude/skills/okf-format.md. Used both internally by
 * write-okf.js before every write, and independently by the
 * pre-write-check hook (scripts/hooks/pre-write-check.js) registered in
 * .claude/settings.json, as a second, harness-level enforcement layer.
 *
 * This is a hand-rolled parser for the specific controlled frontmatter
 * shape this pipeline writes (flat scalars, one `sources:` list of
 * objects, one inline `related:` array, one boolean) — not a general YAML
 * parser. That's fine: this project only ever writes files matching this
 * exact shape.
 */

const fs = require("fs");

const VALID_TOPIC_KEYS = [
  "Sponsored-Products",
  "Sponsored-Brands",
  "Sponsored-Display",
  "Amazon-DSP",
  "Campaign-Types",
  "Bidding-Strategies",
  "Keyword-Targeting",
  "Match-Types",
  "ACOS-ROAS-Metrics",
  "Budget-Placement",
  "Reporting-Optimization",
  "Advertising-API",
];

const VALID_CONFIDENCE = ["High", "Medium", "Low"];
const VALID_SOURCE_TYPES = ["official", "blog", "repo-readme"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function splitFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  return { yaml: match[1], body: match[2] };
}

function parseFrontmatter(yaml) {
  const lines = yaml.split("\n");
  const fm = { sources: [], related: [] };
  let mode = null; // null | "sources"
  let currentSource = null;

  const flushSource = () => {
    if (currentSource) {
      fm.sources.push(currentSource);
      currentSource = null;
    }
  };

  for (const raw of lines) {
    if (raw.trim() === "") continue;

    if (raw.trim() === "sources:") {
      mode = "sources";
      continue;
    }

    const sourceItemMatch = raw.match(/^\s*-\s*url:\s*(.+)$/);
    if (mode === "sources" && sourceItemMatch) {
      flushSource();
      currentSource = { url: sourceItemMatch[1].trim() };
      continue;
    }

    const subFieldMatch = raw.match(/^\s{4,}(\w+):\s*(.*)$/);
    if (mode === "sources" && subFieldMatch && currentSource) {
      currentSource[subFieldMatch[1]] = subFieldMatch[2].trim();
      continue;
    }

    const topFieldMatch = raw.match(/^(\w+):\s*(.*)$/);
    if (topFieldMatch) {
      flushSource();
      mode = null;
      const [, key, value] = topFieldMatch;
      if (key === "related") {
        const inner = value.trim().replace(/^\[/, "").replace(/\]$/, "");
        fm.related = inner
          ? inner.split(",").map((s) => s.trim()).filter(Boolean)
          : [];
      } else if (key === "disputed") {
        fm.disputed = value.trim() === "true";
      } else {
        fm[key] = value.trim();
      }
      continue;
    }
  }
  flushSource();

  return fm;
}

function validate(content) {
  const errors = [];

  const split = splitFrontmatter(content);
  if (!split) {
    return {
      valid: false,
      errors: [
        "missing or malformed frontmatter block (must start with '---' and have a closing '---')",
      ],
    };
  }

  const fm = parseFrontmatter(split.yaml);

  if (!fm.title) errors.push("missing required field: title");

  if (!fm.topic_key) {
    errors.push("missing required field: topic_key");
  } else if (!VALID_TOPIC_KEYS.includes(fm.topic_key)) {
    errors.push(
      `topic_key '${fm.topic_key}' is not one of the 12 fixed topic keys`
    );
  }

  if (!fm.confidence) {
    errors.push("missing required field: confidence");
  } else if (!VALID_CONFIDENCE.includes(fm.confidence)) {
    errors.push(
      `confidence '${fm.confidence}' must be one of ${VALID_CONFIDENCE.join(", ")}`
    );
  }

  if (!fm.last_updated) {
    errors.push("missing required field: last_updated");
  } else if (!DATE_RE.test(fm.last_updated)) {
    errors.push(
      `last_updated '${fm.last_updated}' must be an ISO date (YYYY-MM-DD)`
    );
  }

  if (!fm.sources || fm.sources.length === 0) {
    errors.push("missing required field: sources (must have at least one entry)");
  } else {
    fm.sources.forEach((s, i) => {
      if (!s.url) errors.push(`sources[${i}] missing url`);
      if (!s.type) {
        errors.push(`sources[${i}] missing type`);
      } else if (!VALID_SOURCE_TYPES.includes(s.type)) {
        errors.push(
          `sources[${i}] type '${s.type}' must be one of ${VALID_SOURCE_TYPES.join(", ")}`
        );
      }
      if (!s.last_checked) {
        errors.push(`sources[${i}] missing last_checked`);
      } else if (!DATE_RE.test(s.last_checked)) {
        errors.push(
          `sources[${i}] last_checked '${s.last_checked}' must be an ISO date (YYYY-MM-DD)`
        );
      }
    });
  }

  fm.related.forEach((key) => {
    if (!VALID_TOPIC_KEYS.includes(key)) {
      errors.push(`related topic_key '${key}' is not one of the 12 fixed topic keys`);
    }
  });

  if (fm.disputed === undefined) {
    errors.push("missing required field: disputed");
  }

  if (!/##\s*Overview/.test(split.body)) {
    errors.push("body missing '## Overview' section");
  }
  if (!/##\s*Facts/.test(split.body)) {
    errors.push("body missing '## Facts' section");
  }

  const hasDisputedSection = /##\s*Disputed/.test(split.body);
  if (fm.disputed === true && !hasDisputedSection) {
    errors.push("disputed: true but body has no '## Disputed' section");
  }
  if (fm.disputed === false && hasDisputedSection) {
    errors.push(
      "disputed: false but body has a '## Disputed' section (remove it or set disputed: true)"
    );
  }

  return { valid: errors.length === 0, errors };
}

function validateOkfFile(content) {
  return validate(content);
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("[validate-schema] usage: node validate-schema.js <file>");
    process.exitCode = 1;
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  const { valid, errors } = validate(content);
  if (valid) {
    console.error("[validate-schema] OK");
  } else {
    console.error("[validate-schema] INVALID:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  validate,
  validateOkfFile,
  VALID_TOPIC_KEYS,
  VALID_CONFIDENCE,
  VALID_SOURCE_TYPES,
};
