# Amazon Ads Knowledge Acquisition Pipeline

This project is an autonomous, Claude-Code-native knowledge acquisition
system. It continuously discovers, extracts, validates, merges, and
publishes knowledge about Amazon Ads (Sponsored Products/Brands/Display,
Amazon DSP, campaign types, bidding, targeting, ACOS/ROAS, etc.) from three
trusted source types into a bundle of OKF (Open Knowledge Format:
YAML-frontmatter + markdown) documents under `knowledge/`.

No server, no database, no frontend. It runs as CLI-triggered Claude Code
invocations, via the `/ingest` custom command (`.claude/commands/ingest.md`):

```
claude -p "/ingest all"
claude -p "/ingest <source-id>"
```

## Hard requirements

- **Idempotent re-runs**: running twice with unchanged sources must produce
  zero duplicate files and zero unnecessary edits/writes.
- **Cheap change detection**: detect whether a source changed at all via
  content hashing *before* doing any expensive extraction/validation/merge
  work.
- **Merge dedup**: multiple sources describing the same concept must
  collapse into a single OKF file, never multiple files for one topic.
- **Fixed output size**: steady-state output is 10-15 OKF files, achieved
  via a fixed, predefined topic taxonomy (see
  `.claude/skills/okf-format/SKILL.md`) rather than dynamically discovered
  topics.

## Orchestration

None of the 5 stages below sequence themselves — each script/subagent only
does its own stage when called. `.claude/commands/ingest.md` is what
sequences them: it's a Claude Code custom command (a prompt, not
executable code), invoked as `/ingest <source-id>` or `/ingest all`. When
invoked, the session reading that prompt drives the stages itself — running
`fetch.js`/`hash.js` via shell commands, invoking the `extractor`,
`validator`, and `merger` subagents in order, then running `write-okf.js`
— per source, one at a time. This is also where the hash short-circuit's
"no change" log line actually gets written (see stage 1 below); no script
does it on its own.

## The 5-stage pipeline

```
Discover → Extract → Validate → Merge → Publish
```

### 1. Discover (deterministic — code, not a subagent)

`scripts/fetch.js` fetches raw content per source: plain HTTP `fetch()` for
the official-docs and blog sources, the GitHub REST API for the Advertising
API repo's README (plus the date of its last commit, used by the freshness
cutoff in `trust-rules`). No MCP tooling is used — every source registered
so far is static enough for a plain HTTP request; a JS-rendering path would
only be added if a future source actually needed it. `scripts/hash.js`
computes a content hash per fetched page/URL and compares it against
`knowledge/.state/sources.json` — but does not itself decide when to
persist a new hash; see below.

**If the hash is unchanged since the last run, the source short-circuits
here**: `hash.js`'s `check()` reports `changed: false` and leaves
`knowledge/.state/sources.json` untouched — no extraction, no validation,
no merge, no write. `hash.js` itself doesn't log anything to
`knowledge/log.md`; the orchestrator (see Orchestration above) appends one
"no change" line per short-circuited source, then moves to the next
source. This is what makes re-runs idempotent and cheap.

**If the hash changed**, `check()` still does not write state — the new
hash is only persisted via a separate `hash.js --commit` call, and only
after extract/validate/merge/publish have all completed successfully for
that source (or extraction legitimately found nothing to publish). This
split exists so a crash or failure partway through doesn't leave state
claiming unpublished content was already handled — a failed run gets
retried next time instead of silently losing the update.

Only sources whose hash changed proceed to stage 2.

### 2. Extract (subagent judgment)

`.claude/agents/extractor.md` reads a changed source's raw fetched content
and returns structured facts: `{ topic_key, fact text, source url }`. It
must classify every fact into one of the fixed topic keys defined in
`.claude/skills/okf-format/SKILL.md`, or discard it as out-of-scope. It invokes
the `okf-format` and `citation-rules` skills.

### 3. Validate (subagent judgment)

`.claude/agents/validator.md` compares each new fact against the existing
OKF document (if any) for that topic key: is it new, does it confirm an
existing fact, or does it contradict one? It assigns a confidence level per
the tiered rule in `.claude/skills/trust-rules/SKILL.md` (High/Medium/Low) and
flags unresolved contradictions. It invokes the `trust-rules` and
`citation-rules` skills.

### 4. Merge (subagent judgment)

`.claude/agents/merger.md` combines facts — old and newly validated — for a
single topic key into one coherent OKF document body, resolving conflicts
per `.claude/skills/trust-rules/SKILL.md` (official source always wins silently;
non-official-vs-non-official contradictions are marked `disputed: true`
under a **Disputed** section instead of being guessed away). Because the
topic key is the merge key, this is what guarantees "duplicates become one
entry, not multiple files." It invokes the `okf-format`, `trust-rules`, and
`citation-rules` skills.

### 5. Publish (deterministic — code, not a subagent)

`scripts/write-okf.js` writes/updates the final `knowledge/<topic-key>.md`
file, and updates `knowledge/index.md` and `knowledge/log.md`. It validates
the content itself via `scripts/validate-schema.js` before writing anything
— this is the primary safety check. A `PreToolUse` hook registered in
`.claude/settings.json` (`scripts/hooks/pre-write-check.js`) independently
re-runs that same `validate-schema.js` check on any Bash command that
invokes `write-okf.js`, as a second, harness-level enforcement layer that
runs before `write-okf.js` is even allowed to start — it **blocks the
write** if the content is invalid, at either layer.

## Stage ownership at a glance

| Stage | Owner | Type |
|---|---|---|
| Orchestration (sequences all 5 stages, per source) | `.claude/commands/ingest.md` | prompt-based (Claude Code custom command) |
| Discover + Fetch | `scripts/fetch.js` | deterministic |
| Hash + short-circuit | `scripts/hash.js` | deterministic |
| Extract | `.claude/agents/extractor.md` | subagent (judgment) |
| Validate | `.claude/agents/validator.md` | subagent (judgment) |
| Merge | `.claude/agents/merger.md` | subagent (judgment) |
| Publish (write file, update index/log) | `scripts/write-okf.js` | deterministic |
| Pre-write schema check | `scripts/write-okf.js` (internal) and `scripts/hooks/pre-write-check.js` (hook, via `.claude/settings.json`) — both call `scripts/validate-schema.js` | deterministic, blocking |

Deterministic code owns everything mechanical: fetching bytes, hashing,
short-circuiting unchanged sources, writing files, and schema-checking
before write. Subagents own everything requiring judgment: reading
unstructured content, deciding what a fact means and which topic it belongs
to, scoring confidence, detecting contradictions, and writing the final
prose. Subagents never fetch or write files directly — they receive fetched
content as input and return structured text; only the deterministic scripts
touch the filesystem for `knowledge/`.

## Sources

1. **Official Amazon Advertising docs** — trust: `official` (highest).
2. **An Amazon Ads-focused blog** — trust: `blog` (medium).
3. **Amazon Advertising API GitHub repo/SDK** (README + changelog) — trust:
   `repo-readme`; downgraded to advisory-only/Low if the last commit
   touching README/changelog is older than 6 months.

## Skills

Shared rules live once in `.claude/skills/` and are invoked by subagents —
never restated inline in an agent's own instructions:

- **`okf-format/SKILL.md`** — the fixed topic taxonomy, frontmatter schema,
  section headings, file naming, cross-link conventions.
- **`trust-rules/SKILL.md`** — confidence scoring, contradiction handling,
  repo-staleness cutoff.
- **`citation-rules/SKILL.md`** — per-fact citation format (source url,
  confidence, last-checked date).

## Build status

This project was built incrementally, one component at a time (see commit
history for the order). `RUN.md` at the repo root documents a full,
verified ingestion run against live sources, including the re-run
idempotency proof. `feedback/` holds the most recent external review;
outstanding items from it are tracked as normal follow-up work, not in a
separate build-plan document.
