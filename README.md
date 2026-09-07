# Amazon Ads Knowledge Acquisition Pipeline

An autonomous, Claude-Code-native pipeline that discovers, extracts,
validates, merges, and publishes knowledge about Amazon Ads (Sponsored
Products/Brands/Display, Amazon DSP, campaign types, bidding, targeting,
ACOS/ROAS, etc.) into a fixed-size bundle of OKF (Open Knowledge Format)
documents under `knowledge/`.

No server, no database, no frontend. It runs as CLI-triggered Claude Code
invocations, via the `/ingest` custom command:

```
claude -p "/ingest all"
claude -p "/ingest <source-id>"
```

## Pipeline

```
Discover → Extract → Validate → Merge → Publish
```

| Stage | Owner | Type |
|---|---|---|
| Orchestration (sequences all 5 stages) | `.claude/commands/ingest.md` | prompt-based (Claude Code custom command) |
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
topic key (see the taxonomy in `.claude/skills/okf-format/SKILL.md`), plus:

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
RUN.md                            example ingestion run + re-run proof
package.json                     test runner script

.claude/
  commands/
    ingest.md                    Orchestration: sequences all 5 stages (/ingest)
  agents/
    extractor.md                 Extract stage (subagent)
    validator.md                 Validate stage (subagent)
    merger.md                    Merge stage (subagent)
  skills/
    okf-format/SKILL.md          fixed topic taxonomy, frontmatter/body schema
    trust-rules/SKILL.md         confidence scoring, contradiction handling
    citation-rules/SKILL.md      per-fact citation format
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
  fetch.test.js
  hash.test.js
  validate-schema.test.js
  write-okf.test.js
  pre-write-check.test.js
```

## Running the pipeline

```
claude -p "/ingest all"
claude -p "/ingest <source-id>"
```

`/ingest` is the orchestrator (`.claude/commands/ingest.md`) — a Claude
Code custom command, not a script, that sequences discover → extract →
validate → merge → publish per source. The given `<source-id>` must match
a registered entry in `SOURCES` (`scripts/fetch.js`); ingesting an
arbitrary unregistered URL isn't supported yet.

## Testing

Unit tests use Node's built-in test runner (`node:test` / `node:assert`) —
no external dependencies.

```
npm test
```

which runs:

```
node --test
```

No glob pattern and no explicit `tests/` path — both are avoided
deliberately. A glob (`tests/**/*.js`) depends on the invoking shell to
expand `**`, which isn't consistent across shells/OSes and isn't something
`node --test` itself does on every supported Node version; passing an
explicit directory path also proved unreliable in practice. `node --test`
with no arguments recursively discovers every `*.test.js` file from the
current directory on its own — no shell involvement, works the same on any
Node ≥18 — which is why every test file here is named `<name>.test.js`
rather than `test.<name>.js`.

Tests that exercise real file I/O (`check`/`commit` in `hash.js`,
`write-okf.js`, the pre-write hook) snapshot whatever they touch —
`knowledge/.state/sources.json`, `knowledge/index.md`, `knowledge/log.md`,
individual `knowledge/<topic>.md` files — before running and restore it
exactly afterward, so running the suite never leaves the real knowledge
bundle changed. Network calls (GitHub API, HTTP fetch) are mocked via
`global.fetch`, never made for real.
