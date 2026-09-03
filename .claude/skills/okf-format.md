---
name: okf-format
description: Use when extracting facts into a topic key, or when assembling/updating an OKF document. Defines the fixed topic taxonomy, frontmatter schema, section headings, file naming, and cross-link conventions for knowledge/*.md.
---

# OKF (Open Knowledge Format) document rules

An OKF document is one markdown file with YAML frontmatter, holding
everything currently known about exactly one fixed topic. One topic = one
file, always — never split a topic across files, never create a file for a
topic not on the fixed list below.

## Fixed topic taxonomy

There are exactly 12 valid topic keys. Every extracted fact must be
classified into one of these, or discarded as out-of-scope. Do not invent
new topic keys, rename these, or create synonyms — a fact about "Sponsored
Product ads" and a fact about "Sponsored Products" are the same topic key:
`Sponsored-Products`.

| topic_key | Filename |
|---|---|
| `Sponsored-Products` | `knowledge/Sponsored-Products.md` |
| `Sponsored-Brands` | `knowledge/Sponsored-Brands.md` |
| `Sponsored-Display` | `knowledge/Sponsored-Display.md` |
| `Amazon-DSP` | `knowledge/Amazon-DSP.md` |
| `Campaign-Types` | `knowledge/Campaign-Types.md` |
| `Bidding-Strategies` | `knowledge/Bidding-Strategies.md` |
| `Keyword-Targeting` | `knowledge/Keyword-Targeting.md` |
| `Match-Types` | `knowledge/Match-Types.md` |
| `ACOS-ROAS-Metrics` | `knowledge/ACOS-ROAS-Metrics.md` |
| `Budget-Placement` | `knowledge/Budget-Placement.md` |
| `Reporting-Optimization` | `knowledge/Reporting-Optimization.md` |
| `Advertising-API` | `knowledge/Advertising-API.md` |

`topic_key` is the merge key: when two sources describe the same topic key,
their facts are combined into the one file for that key — never into
separate files. If a fact doesn't clearly fit one of these 12 keys, discard
it rather than forcing a fit or inventing a 13th key.

## File naming

- Path: `knowledge/<topic_key>.md`, exact casing and hyphenation as in the
  table above.
- Never create numbered/duplicate variants (`Sponsored-Products-2.md`,
  `Sponsored-Products-blog.md`, etc.) — a topic key has exactly one file.

## Frontmatter schema

Required fields, in this order:

```yaml
---
title: Sponsored Products
topic_key: Sponsored-Products
confidence: High        # High | Medium | Low — see trust-rules skill
last_updated: 2026-09-02
sources:
  - url: https://advertising.amazon.com/...
    type: official       # official | blog | repo-readme
    last_checked: 2026-09-02
related: [Campaign-Types, Bidding-Strategies]
disputed: false
---
```

Field rules:

- `title` — human-readable name (matches the topic key's natural English
  phrasing, e.g. `Sponsored-Products` → "Sponsored Products").
- `topic_key` — must be exactly one of the 12 keys above.
- `confidence` — the document's aggregate confidence; computed per the
  `trust-rules` skill, not chosen freely here.
- `last_updated` — ISO date (`YYYY-MM-DD`) of the most recent write to this
  file.
- `sources` — one entry per distinct source URL that has ever contributed a
  fact to this document, each with its `type` and the date it was last
  checked. Never remove a source entry just because a later run didn't
  re-fetch it; only update `last_checked` when it's re-fetched.
- `related` — topic keys (from the fixed list) that this document
  cross-links to. Keep to genuinely related topics, not every topic that
  happens to mention this one in passing.
- `disputed` — `true` only if the document currently has an unresolved
  contradiction between two non-official sources (see `trust-rules` skill).
  Must be `false` when there is no active **Disputed** section.

## Body structure

```markdown
## Overview

A short (2-4 sentence) plain-language summary of the topic, synthesized
from the facts below — not a copy of any single source's wording.

## Facts

- <fact text> — [source](url), confidence: High, last-checked: 2026-09-02
- <fact text> — [source](url), confidence: Medium, last-checked: 2026-08-30

## Disputed

<Only present when `disputed: true`. Omit this section entirely otherwise.>

- <fact A> per [source1](url1) vs <fact B> per [source2](url2)
```

Rules:

- **Overview** is always present, kept current, and reflects the facts as
  they stand now — rewrite it on merge, don't just append to it.
- **Facts** is a flat bulleted list. Every bullet ends with its own
  citation per the `citation-rules` skill (source link, confidence,
  last-checked date) — the document-level `confidence`/`sources` in
  frontmatter is an aggregate, not a substitute for per-fact citation.
  Never duplicate a fact that's already present with the same meaning; if a
  new source confirms an existing fact, update that bullet's citation/date
  rather than adding a second near-identical bullet.
- **Disputed** appears only when `disputed: true`, and lists the specific
  conflicting facts with their sources side by side. Remove the section
  (and set `disputed: false`) once resolved (e.g. an official source later
  confirms one side).

## Cross-links

- Use `related:` in frontmatter for topic-to-topic links, always by exact
  `topic_key`.
- Within the body, reference another topic with a standard markdown link to
  its file: `[Bidding Strategies](Bidding-Strategies.md)`.
- Keep `related:` and in-body links consistent — if the body links to a
  topic, that topic key should also appear in `related:`.
