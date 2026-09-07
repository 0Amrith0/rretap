---
name: citation-rules
description: Use whenever writing, carrying forward, or updating a fact's citation — during extraction, validation, or merge. Defines the required per-fact citation fields and format, and how citations travel through the pipeline.
---

# Citation rules

Every fact, at every stage of the pipeline, must carry its own citation.
Confidence and trust are computed from citations (see `trust-rules` skill),
so a fact without one cannot be scored, validated, or published.

## Required citation fields

Every fact carries exactly these three fields, from the moment it's
extracted through to the published **Facts** bullet:

- **source url** — the exact URL the fact was fetched from (the specific
  page/README/changelog, not just a domain).
- **confidence** — `High` | `Medium` | `Low`, computed per the
  `trust-rules` skill. Absent at extraction time (validator assigns it);
  required from validation onward.
- **last-checked date** — ISO date (`YYYY-MM-DD`) the source was fetched
  when this fact was captured or last reconfirmed.

## Format

Inline, at the end of the fact's own bullet in the **Facts** section
(see `okf-format` skill):

```markdown
- <fact text> — [source](url), confidence: High, last-checked: 2026-09-02
```

For a stale repo-readme fact (per the `trust-rules` freshness cutoff), add
the stale marker before the citation:

```markdown
- <fact text> (stale source) — [source](url), confidence: Low, last-checked: 2026-09-02
```

## How citations travel through the pipeline

- **Extract**: the extractor attaches `source url` and `last-checked` (the
  date of this fetch) to every fact it returns. It does not assign
  `confidence` — that's the validator's job.
- **Validate**: the validator computes `confidence` per `trust-rules` and
  attaches it to the fact, without altering `source url` or
  `last-checked`.
- **Merge**: the merger writes the final citation onto the fact's bullet
  exactly as extracted/validated. If a fact was already present in the
  document and this run reconfirms it from the same or a new source, update
  that bullet's citation (source, confidence, last-checked) in place —
  never leave a stale citation next to a fact that was just reconfirmed,
  and never add a second near-duplicate bullet for the same fact instead of
  updating the citation on the existing one.

## Multiple sources for one fact

If two sources confirm the same fact, the bullet cites the single
highest-trust source that confirms it (per `trust-rules` ranking) — not a
list of every corroborating source. The document-level `sources:`
frontmatter list (see `okf-format` skill) is where every contributing
source URL is recorded overall; the per-fact citation only needs the one
that best justifies that fact's confidence.

## Never publish an uncited fact

A fact reaching the merge or publish stage without all three citation
fields is invalid and must not be written to `knowledge/`. This is also
mechanically enforced by the pre-write schema hook (see
`scripts/validate-schema.js`), but subagents should treat it as a hard rule
at every stage, not rely on the hook to catch it.
