# Amazon Ads Knowledge Acquisition Pipeline

An autonomous, Claude-Code-native pipeline that discovers, extracts,
validates, merges, and publishes knowledge about Amazon Ads (Sponsored
Products/Brands/Display, Amazon DSP, campaign types, bidding, targeting,
ACOS/ROAS, etc.) into a fixed-size bundle of OKF (Open Knowledge Format)
documents under `knowledge/`.

No server, no database, no frontend. It runs as CLI-triggered Claude Code
invocations:

```
claude -p "ingest <url or 'all'>, update the bundle"
```

## Pipeline

```
Discover → Extract → Validate → Merge → Publish
```

| Stage | Owner | Type |
|---|---|---|
| Discover + Fetch | `scripts/fetch.js` | deterministic |
| Hash + short-circuit | `scripts/hash.js` | deterministic |
| Extract | `.claude/agents/extractor.md` | subagent (judgment) |
| Validate | `.claude/agents/validator.md` | subagent (judgment) |
| Merge | `.claude/agents/merger.md` | subagent (judgment) |
| Publish | `scripts/write-okf.js` | deterministic |
| Pre-write schema check | `scripts/hooks/pre-write-check.js` (hook) | deterministic, blocking |

A source's content is hashed before any extraction/validation/merge work
runs. If the hash matches what's already recorded in
`knowledge/.state/sources.json`, the source short-circuits — nothing else
runs, and a "no change" line is appended to `knowledge/log.md`. This is
what makes re-running the pipeline idempotent and cheap.

Full design rationale — hard requirements, per-stage detail, and the
deterministic-vs-subagent-judgment split — lives in [CLAUDE.md](CLAUDE.md).

## Sources

1. **Official Amazon Advertising docs** — trust: `official` (highest).
2. **An Amazon Ads-focused blog** — trust: `blog` (medium).
3. **Amazon Advertising API GitHub repo/SDK** (README + changelog) — trust:
   `repo-readme`; downgraded to advisory-only/Low if the last commit
   touching README/changelog is older than 6 months.

Registered sources live in `SOURCES` in `scripts/fetch.js`.

## Output

Steady-state output is 10-15 OKF documents in `knowledge/`, one per fixed
topic key (see the taxonomy in `.claude/skills/okf-format.md`), plus:

- `knowledge/index.md` — auto-generated index of all documents.
- `knowledge/log.md` — append-only run log.
- `knowledge/.state/sources.json` — per-source content hashes used for
  change detection.

Each OKF document is YAML frontmatter + markdown: `title`, `topic_key`,
`confidence`, `last_updated`, `sources[]`, `related[]`, `disputed`, then an
`## Overview`, a bulleted, individually-cited `## Facts` list, and an
optional `## Disputed` section.

## Project layout

```
CLAUDE.md                        pipeline spec (source of truth)
README.md                        this file
package.json                     test runner script

.claude/
  agents/
    extractor.md                 Extract stage (subagent)
    validator.md                 Validate stage (subagent)
    merger.md                    Merge stage (subagent)
  skills/
    okf-format.md                fixed topic taxonomy, frontmatter/body schema
    trust-rules.md                confidence scoring, contradiction handling
    citation-rules.md            per-fact citation format
  settings.json                  registers the pre-write-check hook

scripts/
  fetch.js                       Discover + Fetch (deterministic)
  hash.js                        Hash + short-circuit (deterministic)
  write-okf.js                   Publish: write file, rebuild index, append log
  validate-schema.js             OKF frontmatter/body schema check
  hooks/
    pre-write-check.js           PreToolUse hook: blocks invalid writes

knowledge/                       published OKF bundle (generated)
  <Topic-Key>.md
  index.md
  log.md
  .state/sources.json

tests/                           unit tests for scripts/ and scripts/hooks/
  test.fetch.js
  test.hash.js
  test.validate-schema.js
  test.write-okf.js
  test.pre-write-check.js
```

## Running the pipeline

```
claude -p "ingest all, update the bundle"
claude -p "ingest <url>, update the bundle"
```

The given URL must currently match a registered entry in `SOURCES`
(`scripts/fetch.js`); ingesting an arbitrary unregistered URL isn't
supported yet.

## Testing

Unit tests use Node's built-in test runner (`node:test` / `node:assert`) —
no external dependencies.

```
npm test
```

which runs:

```
node --test tests/**/*.js
```

Tests that exercise real file I/O (`checkAndUpdate` in `hash.js`,
`write-okf.js`, the pre-write hook) snapshot whatever they touch —
`knowledge/.state/sources.json`, `knowledge/index.md`, `knowledge/log.md`,
individual `knowledge/<topic>.md` files — before running and restore it
exactly afterward, so running the suite never leaves the real knowledge
bundle changed. Network calls (GitHub API, HTTP fetch) are mocked via
`global.fetch`, never made for real.
