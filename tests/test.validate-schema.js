"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { validate, VALID_TOPIC_KEYS, VALID_CONFIDENCE, VALID_SOURCE_TYPES } = require("../scripts/validate-schema");

function validDoc(overrides = {}) {
  const {
    frontmatterExtra = "",
    disputedSection = "",
    disputedFlag = "false",
  } = overrides;

  return `---
title: Test Topic
topic_key: Sponsored-Products
confidence: High
last_updated: 2026-09-02
sources:
  - url: https://advertising.amazon.com/solutions/products/sponsored-products
    type: official
    last_checked: 2026-09-02
related: [Campaign-Types]
disputed: ${disputedFlag}
${frontmatterExtra}---

## Overview

Some overview text.

## Facts

- A fact. — [source](https://advertising.amazon.com/solutions/products/sponsored-products), confidence: High, last-checked: 2026-09-02
${disputedSection}`;
}

test("validate accepts a well-formed document", () => {
  const { valid, errors } = validate(validDoc());
  assert.equal(valid, true, JSON.stringify(errors));
});

test("validate rejects content with no frontmatter block", () => {
  const { valid, errors } = validate("## Overview\n\nno frontmatter here\n");
  assert.equal(valid, false);
  assert.match(errors[0], /missing or malformed frontmatter/);
});

test("validate reports every missing required field", () => {
  const content = `---
title: X
---

## Overview

x

## Facts

- fact
`;
  const { valid, errors } = validate(content);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("topic_key")));
  assert.ok(errors.some((e) => e.includes("confidence")));
  assert.ok(errors.some((e) => e.includes("last_updated")));
  assert.ok(errors.some((e) => e.includes("sources")));
  assert.ok(errors.some((e) => e.includes("disputed")));
});

test("validate rejects an invalid topic_key", () => {
  const content = validDoc().replace("topic_key: Sponsored-Products", "topic_key: Not-A-Real-Topic");
  const { valid, errors } = validate(content);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("not one of the 12 fixed topic keys")));
});

test("validate accepts every one of the 12 valid topic keys", () => {
  for (const key of VALID_TOPIC_KEYS) {
    const content = validDoc().replace("topic_key: Sponsored-Products", `topic_key: ${key}`);
    const { valid, errors } = validate(content);
    assert.equal(valid, true, `${key} unexpectedly invalid: ${JSON.stringify(errors)}`);
  }
});

test("validate rejects an invalid confidence value", () => {
  const content = validDoc().replace("confidence: High", "confidence: Extreme");
  const { valid, errors } = validate(content);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("confidence")));
});

test("validate accepts every valid confidence value", () => {
  for (const c of VALID_CONFIDENCE) {
    const content = validDoc().replace("confidence: High", `confidence: ${c}`);
    const { valid } = validate(content);
    assert.equal(valid, true, `confidence ${c} unexpectedly invalid`);
  }
});

test("validate rejects a malformed last_updated date", () => {
  const content = validDoc().replace("last_updated: 2026-09-02", "last_updated: Sept 2 2026");
  const { valid, errors } = validate(content);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("last_updated")));
});

test("validate rejects an empty sources list", () => {
  const content = `---
title: X
topic_key: Sponsored-Products
confidence: High
last_updated: 2026-09-02
related: []
disputed: false
---

## Overview

x

## Facts

- fact
`;
  const { valid, errors } = validate(content);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("sources")));
});

test("validate rejects a source with an invalid type", () => {
  const content = validDoc().replace("type: official", "type: forum-post");
  const { valid, errors } = validate(content);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("type") && e.includes(VALID_SOURCE_TYPES.join(", "))));
});

test("validate rejects a source with a malformed last_checked date", () => {
  const content = validDoc().replace("last_checked: 2026-09-02\nrelated", "last_checked: yesterday\nrelated");
  const { valid, errors } = validate(content);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("last_checked")));
});

test("validate rejects an invalid related topic key", () => {
  const content = validDoc().replace("related: [Campaign-Types]", "related: [Not-A-Topic]");
  const { valid, errors } = validate(content);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("related topic_key")));
});

test("validate rejects a body missing the Overview section", () => {
  const content = validDoc().replace("## Overview\n\nSome overview text.\n\n", "");
  const { valid, errors } = validate(content);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("Overview")));
});

test("validate rejects a body missing the Facts section", () => {
  const content = validDoc().replace(/## Facts[\s\S]*$/, "");
  const { valid, errors } = validate(content);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("Facts")));
});

test("validate rejects disputed:true with no Disputed section", () => {
  const content = validDoc({ disputedFlag: "true" });
  const { valid, errors } = validate(content);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("Disputed")));
});

test("validate rejects disputed:false with a Disputed section present", () => {
  const content = validDoc({
    disputedFlag: "false",
    disputedSection: "\n## Disputed\n\n- fact A vs fact B\n",
  });
  const { valid, errors } = validate(content);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("Disputed")));
});

test("validate accepts disputed:true with a matching Disputed section", () => {
  const content = validDoc({
    disputedFlag: "true",
    disputedSection: "\n## Disputed\n\n- fact A per [x](url1) vs fact B per [y](url2)\n",
  });
  const { valid, errors } = validate(content);
  assert.equal(valid, true, JSON.stringify(errors));
});
