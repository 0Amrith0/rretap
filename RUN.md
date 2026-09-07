---
type: run-log
title: Example Ingestion Run
date: 2026-09-07
---

# Example Ingestion Run

This is a real, unstaged run of the pipeline against live sources, executed
twice back to back, to demonstrate:

1. The pipeline actually produces valid OKF output from real fetched
   content (Run 1).
2. Running it again immediately afterward changes nothing in the published
   knowledge bundle (Run 2) — the idempotency/short-circuit guarantee in
   `CLAUDE.md` actually holds.

All 5 sources registered in `scripts/fetch.js`'s `SOURCES` map were
processed both times:

- `sponsored-products-overview` (official)
- `junglescout-sponsored-products-guide` (blog)
- `amazon-advertising-api-php-sdk-readme` (repo-readme)
- `helium10-sponsored-products-guide` (blog)
- `sponsored-brands-overview` (official)

## Run 1 — 2026-09-07T13:32–13:34 UTC

Commands run, per source, per the 5-stage pipeline in `CLAUDE.md` (this
predates `.claude/commands/ingest.md` existing as a single command, so the
stages were driven directly in the same order that command now automates):

```
node scripts/fetch.js <source-id> 1>body.txt 2>meta.txt
node scripts/hash.js <source-id> [--last-commit-at <value>] < body.txt > hash.json
```

Hash results — this run found real, live drift, not a staged scenario:

```
[hash] sourceId=sponsored-products-overview UNCHANGED — short-circuit
[hash] sourceId=junglescout-sponsored-products-guide UNCHANGED — short-circuit
[hash] sourceId=amazon-advertising-api-php-sdk-readme UNCHANGED — short-circuit
[hash] sourceId=sponsored-brands-overview UNCHANGED — short-circuit
[hash] sourceId=helium10-sponsored-products-guide CHANGED
  (previous=sha256:9e02cf2f... new=sha256:b8d02e4f...) — proceed to extract
```

4 of 5 sources short-circuited (unchanged since the last real run on
2026-09-02/03). Each got one "no-change" line appended to `knowledge/log.md`.

For the one changed source (`helium10-sponsored-products-guide`), the
judgment stages ran:

- **Extract** (`extractor` subagent): read the fetched page, discarded
  navigation/marketing boilerplate, returned 3 candidate facts, all
  classified `Sponsored-Products`.
- **Validate** (`validator` subagent): compared each fact against the
  existing `knowledge/Sponsored-Products.md`. Result: 1 `new` fact
  (Medium confidence, blog-only), 2 `confirmed` facts (one raised to High
  because an existing official-sourced bullet already backed it).
- **Merge** (`merger` subagent): produced the complete updated
  `Sponsored-Products.md` content — 1 new Facts bullet added, 2 existing
  bullets' citations refreshed, Overview rewritten, `sources:` gained the
  helium10 URL with today's date.

Publish:

```
node scripts/write-okf.js <content-file> --summary "..."
```

```
[write-okf] updated knowledge/Sponsored-Products.md
```

This also regenerated `knowledge/index.md` and appended the real
"Sponsored-Products updated" line to `knowledge/log.md`.

**Files changed by Run 1** (verified via `git diff --stat`):

```
knowledge/.state/sources.json   | 4 ++--   (helium10's new hash recorded)
knowledge/Sponsored-Products.md | 11 ++++++-----
knowledge/index.md              | 2 +-      (Sponsored-Products' summary line refreshed)
knowledge/log.md                | 5 lines appended (4 no-change + 1 updated)
```

## Run 2 — 2026-09-07T13:34–13:35 UTC (immediately after Run 1)

Same commands, same 5 sources, run again with no time for any source's
live content to change further:

```
[hash] sourceId=sponsored-products-overview UNCHANGED — short-circuit
[hash] sourceId=junglescout-sponsored-products-guide UNCHANGED — short-circuit
[hash] sourceId=amazon-advertising-api-php-sdk-readme UNCHANGED — short-circuit
[hash] sourceId=helium10-sponsored-products-guide UNCHANGED — short-circuit
[hash] sourceId=sponsored-brands-overview UNCHANGED — short-circuit
```

All 5 short-circuited this time — including `helium10-sponsored-products-guide`,
now matched against the hash Run 1 just recorded for it. Neither extractor,
validator, merger, nor `write-okf.js` ran for any source. One "no-change"
line was appended per source to `knowledge/log.md` (5 lines total).

### Proof: Run 2 changed nothing in the published bundle

SHA-256 of every file under `knowledge/` except `log.md` (an append-only
audit log is expected to grow — it is not part of the "published bundle
content" idempotency claim), computed immediately before and immediately
after Run 2:

```
                                   BEFORE Run 2          AFTER Run 2
index.md                          08811de0...           08811de0...   (identical)
Keyword-Targeting.md              1e6864e2...            1e6864e2...   (identical)
Reporting-Optimization.md         2293ca00...            2293ca00...   (identical)
Campaign-Types.md                 2ac1bebc...            2ac1bebc...   (identical)
Budget-Placement.md               49380f6b...            49380f6b...   (identical)
Advertising-API.md                589b627a...            589b627a...   (identical)
Bidding-Strategies.md             621651cc...            621651cc...   (identical)
Sponsored-Products.md             81df4ba5...            81df4ba5...   (identical)
ACOS-ROAS-Metrics.md              9ec0534a...            9ec0534a...   (identical)
Sponsored-Brands.md               a85ac6a2...            a85ac6a2...   (identical)
.state/sources.json               c945bbfc...            c945bbfc...   (identical)
Match-Types.md                    c9752739...            c9752739...   (identical)
```

Every checksum is byte-identical before and after Run 2. `git diff` for
this window touches exactly one file:

```
$ git diff -- knowledge/log.md
+ 5 lines: one "no-change" line per source, timestamped 2026-09-07T13:35:50Z
```

No topic document, `index.md`, or `.state/sources.json` changed. This is
the re-run idempotency guarantee from `CLAUDE.md` holding under a real,
live, unstaged second run — not a scripted no-op.

## Notes on how this run was produced

- Two of the five sources genuinely didn't change between fetches
  (`sponsored-products-overview`, `sponsored-brands-overview`,
  `junglescout-sponsored-products-guide`, `amazon-advertising-api-php-sdk-readme`
  — 4 of 5, all unchanged in both runs). One source
  (`helium10-sponsored-products-guide`) genuinely changed once, between the
  last real run on 2026-09-02 and Run 1 here — real content drift, not
  staged. It then correctly stayed unchanged from Run 1 to Run 2, which is
  exactly the behavior being demonstrated.
- `.claude/commands/ingest.md` (added after this run's stages were first
  designed) now automates exactly the sequence documented above as a
  single command (`/ingest <source-id>` or `/ingest all`) — future runs
  should use it rather than driving each script by hand.
- Known limitation, unchanged by this run: `scripts/hash.js` records the
  new hash to `knowledge/.state/sources.json` as soon as the hash check
  runs, before extract/validate/merge/publish complete for that source. A
  crash between hash and publish would leave state saying "handled" for
  content that was never actually published. Not exercised or fixed in
  this run; tracked separately.
