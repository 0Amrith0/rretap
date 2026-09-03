---
name: trust-rules
description: Use when scoring a fact's or document's confidence, or when deciding how to resolve a contradiction between sources. Defines the official > blog > repo-readme trust ranking, the confidence tiers, the repo-readme freshness cutoff, and contradiction-resolution rules.
---

# Trust and confidence rules

## Source trust ranking

Three source types, in fixed trust order (highest first):

1. **`official`** — official Amazon Advertising docs.
2. **`blog`** — an Amazon Ads-focused blog.
3. **`repo-readme`** — the Amazon Advertising API GitHub repo's README and
   changelog. Subject to the freshness cutoff below.

This ranking is fixed and never overridden by how many facts a lower-trust
source contributes — one official source outweighs any number of blog or
repo-readme sources on the same fact.

## Repo-readme freshness cutoff

Before using any `repo-readme` fact, check the last commit date that
touched the README/changelog:

- **Within 6 months of today** → treat as a normal `repo-readme` source,
  eligible to contribute at the confidence tiers below.
- **Older than 6 months** → the source is **advisory-only**. Its facts:
  - can never alone confirm a fact (never produce Medium or High on their
    own),
  - are always capped at **Low** confidence regardless of corroboration
    from other stale repo-readme content,
  - must be labeled `(stale source)` inline next to the citation in the
    **Facts** list.

Compute this once per repo fetch (not per fact) and apply it to every fact
sourced from that fetch.

## Confidence tiers (per fact, and rolled up per document)

Compute confidence for each individual fact based on which sources confirm
it, then the document's frontmatter `confidence` is the highest confidence
of any fact currently in its **Facts** list (not an average — one
high-confidence fact is enough to make the document High).

- **High** — confirmed by at least one `official` source. Any number of
  other sources agreeing or disagreeing doesn't change this (see
  Contradictions below for the official-source-always-wins rule).
- **Medium** — no official source confirms it, and either:
  - confirmed by 2 or more non-official sources (`blog` and/or fresh
    `repo-readme`) that agree, or
  - confirmed by exactly 1 `blog` source alone.
- **Low** — confirmed only by a single fresh `repo-readme` source alone, or
  by any stale (`(stale source)`) repo-readme content regardless of how
  many stale sources agree.

If a fact has no confirming source at all (shouldn't happen post-extraction,
but as a safety rule), it must not be published — extraction/validation
should have discarded it.

## Contradiction handling

A contradiction is two facts about the same topic key that cannot both be
true (not two facts that are merely different or complementary — don't
over-flag).

- **Official vs. non-official**: the official source's fact wins silently.
  The conflicting non-official fact is dropped from the **Facts** list (or
  superseded if it's an update to a previously-published fact) — it is
  *not* shown in a Disputed section, since there's no genuine ambiguity
  once an official source has spoken.
- **Non-official vs. non-official, no official source on this point**:
  neither side is dropped or guessed. Set `disputed: true` in frontmatter
  and list both facts with their sources under the **Disputed** section
  (see `okf-format` skill), until an official source later resolves it.
- **Official vs. official**: this should not happen (official docs are a
  single trusted source of truth), but if two official facts genuinely
  contradict, treat it the same as the non-official-vs-non-official case —
  `disputed: true`, both listed, do not silently pick one.

## Resolution over time

- If a document is currently `disputed: true` and a later run brings in an
  official-source fact that resolves the conflict, apply the
  official-vs-non-official rule: pick the official fact, drop the losing
  side from **Facts**, remove the **Disputed** section, and set
  `disputed: false`.
- Re-scoring confidence happens every time a topic key's facts change
  (extraction found something new for it this run) — never leave a stale
  confidence value from a previous run once new facts have been merged in.
