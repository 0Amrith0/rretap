# Amazon Ads Knowledge Acquisition Pipeline

This project is an autonomous, Claude-Code-native knowledge acquisition
system. It continuously discovers, extracts, validates, merges, and
publishes knowledge about Amazon Ads (Sponsored Products/Brands/Display,
Amazon DSP, campaign types, bidding, targeting, ACOS/ROAS, etc.) from three
trusted source types into a bundle of OKF (Open Knowledge Format:
YAML-frontmatter + markdown) documents under `knowledge/`.

No server, no database, no frontend. It runs as CLI-triggered Claude Code
invocations, e.g.:

```
claude -p "ingest <url or 'all'>, update the bundle"
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
  via a fixed, predefined topic taxonomy (see `.claude/skills/okf-format.md`)
  rather than dynamically discovered topics.

## The 5-stage pipeline

```
Discover → Extract → Validate → Merge → Publish
```

### 1. Discover (deterministic — code, not a subagent)

`scripts/fetch.js` fetches raw content per source (Playwright MCP for
JS-rendered pages, plain HTTP for static pages, GitHub REST API for the
Advertising API repo). `scripts/hash.js` computes a content hash per fetched
page/URL and compares it against `knowledge/.state/sources.json`.

**If the hash is unchanged since the last run, the source short-circuits
here** — no extraction, no validation, no merge, no write. One "no change"
line is appended to `knowledge/log.md` and the pipeline moves to the next
source. This is what makes re-runs idempotent and cheap.

Only sources whose hash changed proceed to stage 2.

### 2. Extract (subagent judgment)

`.claude/agents/extractor.md` reads a changed source's raw fetched content
and returns structured facts: `{ topic_key, fact text, source url }`. It
must classify every fact into one of the fixed topic keys defined in
`.claude/skills/okf-format.md`, or discard it as out-of-scope. It invokes
the `okf-format` and `citation-rules` skills.

### 3. Validate (subagent judgment)

`.claude/agents/validator.md` compares each new fact against the existing
OKF document (if any) for that topic key: is it new, does it confirm an
existing fact, or does it contradict one? It assigns a confidence level per
the tiered rule in `.claude/skills/trust-rules.md` (High/Medium/Low) and
flags unresolved contradictions. It invokes the `trust-rules` and
`citation-rules` skills.

### 4. Merge (subagent judgment)

`.claude/agents/merger.md` combines facts — old and newly validated — for a
single topic key into one coherent OKF document body, resolving conflicts
per `.claude/skills/trust-rules.md` (official source always wins silently;
non-official-vs-non-official contradictions are marked `disputed: true`
under a **Disputed** section instead of being guessed away). Because the
topic key is the merge key, this is what guarantees "duplicates become one
entry, not multiple files." It invokes the `okf-format`, `trust-rules`, and
`citation-rules` skills.

### 5. Publish (deterministic — code, not a subagent)

`scripts/write-okf.js` writes/updates the final `knowledge/<topic-key>.md`
file, and updates `knowledge/index.md` and `knowledge/log.md`. Before any
write under `knowledge/`, a hook registered in `.claude/settings.json` runs
`scripts/validate-schema.js` to mechanically check required frontmatter
fields are present and the YAML is well-formed — it **blocks the write** if
not.

## Stage ownership at a glance

| Stage | Owner | Type |
|---|---|---|
| Discover + Fetch | `scripts/fetch.js` | deterministic |
| Hash + short-circuit | `scripts/hash.js` | deterministic |
| Extract | `.claude/agents/extractor.md` | subagent (judgment) |
| Validate | `.claude/agents/validator.md` | subagent (judgment) |
| Merge | `.claude/agents/merger.md` | subagent (judgment) |
| Publish (write file, update index/log) | `scripts/write-okf.js` | deterministic |
| Pre-write schema check | `scripts/validate-schema.js`, invoked by a hook in `.claude/settings.json` | deterministic, blocking |

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

- **`okf-format.md`** — the fixed topic taxonomy, frontmatter schema,
  section headings, file naming, cross-link conventions.
- **`trust-rules.md`** — confidence scoring, contradiction handling,
  repo-staleness cutoff.
- **`citation-rules.md`** — per-fact citation format (source url,
  confidence, last-checked date).

## Build status

This project is being built incrementally, one component at a time. See the
build order and verification plan for the current stage.
