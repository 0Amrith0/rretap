---
description: Run the 5-stage knowledge acquisition pipeline (discover -> extract -> validate -> merge -> publish) for one source or all sources.
argument-hint: [source-id|all]
---

You are running the **Amazon Ads Knowledge Acquisition Pipeline** end to
end, per `CLAUDE.md`. This command is the orchestrator: it is the "caller"
that `scripts/hash.js`'s own comments refer to — the piece of code that
decides, per source, whether to short-circuit or to run extract -> validate
-> merge -> publish. It exists because none of the individual scripts or
agents sequence the stages themselves; that is this command's only job.

Argument: `$ARGUMENTS` — a single source id from `scripts/fetch.js`'s
`SOURCES` map (e.g. `sponsored-products-overview`), or the literal word
`all` to run every source in that map. Default to `all` if no argument is
given.

## Setup

1. Get the list of source ids to process. If `$ARGUMENTS` is `all` or
   empty, run:
   ```
   node -e "console.log(Object.keys(require('./scripts/fetch.js').SOURCES).join('\n'))"
   ```
   and process every id it prints, in the order printed. Otherwise process
   only the single id given — validate it exists in that same list first;
   if it doesn't, stop and report the error, don't guess a close match.

2. Use `knowledge/.state/tmp/` as scratch space for this run (create it if
   missing). Use one subdirectory per source id inside it so parallel
   temp files never collide, e.g. `knowledge/.state/tmp/<source-id>/`.
   Delete each source's scratch subdirectory after that source finishes
   (success or failure) — scratch files must never be left behind, and
   must never be written under `knowledge/` outside `.state/tmp/`.

## Per source, in order

Process sources one at a time, in the order from Setup step 1 — not in
parallel — so log lines and terminal output stay in a readable, correct
sequence for anyone (including a human) reading the run afterward.

### 1. Discover + Fetch (deterministic)

Run:
```
node scripts/fetch.js <source-id> 1><scratch>/body.txt 2><scratch>/meta.txt
```
- `<scratch>/body.txt` now holds the raw fetched content.
- `<scratch>/meta.txt` holds one `[fetch] ...` line. If it contains
  `lastCommitAt=<value>`, extract that value — you'll need it for the next
  step. It's only present for `repo-readme` sources.

If this command exits non-zero (network failure, 404, etc.): print the
error, append a failure note for this source to your final run summary,
clean up this source's scratch subdirectory, and move on to the next
source. Do not let one source's fetch failure stop the whole run when
processing `all`.

### 2. Hash + short-circuit (deterministic — read-only)

Run:
```
node scripts/hash.js <source-id> [--last-commit-at <value>] < <scratch>/body.txt > <scratch>/hash.json
```
(include `--last-commit-at` only when step 1 found one). This is `hash.js`'s
`check()` path — it compares the hash but **never writes**
`knowledge/.state/sources.json`, even when the hash changed. Read
`<scratch>/hash.json` — it's a single JSON object:
`{ sourceId, url, type, changed, hash, previousHash, stale, lastCommitAt }`.
Keep the `hash` value — you'll need it later to commit state, but only
once this source's content has actually been fully processed (steps 3-6).

**If `changed` is `false`:** this is the short-circuit. Per `CLAUDE.md`,
append exactly one "no-change" line to `knowledge/log.md` — this is the
line `hash.js`'s own comments describe but that no script currently
writes; producing it is this command's responsibility. Match the existing
log line style (see other lines in `knowledge/log.md`), e.g.:
```
- <ISO timestamp>: <source-id> no-change — hash unchanged since last run, skipped extract/validate/merge/publish
```
Append it directly with a shell command (this is a single fixed-format
line, not a schema-validated document write, so it does not go through
`write-okf.js`). No commit is needed — state already correctly reflects
this hash from a prior run. Clean up this source's scratch subdirectory
and move to the next source. **Do not invoke extractor, validator, or
merger for this source.**

**If `changed` is `true`:** continue to step 3. **Do not commit the new
hash yet** — state must stay at the old hash until this source's content
has been fully and successfully processed, so that a failure anywhere in
steps 3-6 leaves this source correctly re-detected as changed on the next
run, instead of silently marking unpublished content as handled.

### 3. Extract (subagent judgment)

Invoke the `extractor` subagent (it is available as an agent type in this
session) with:
- `content_file`: `<scratch>/body.txt`
- `source_url`: the `url` from `hash.json`
- `source_type`: the `type` from `hash.json`
- `fetched_at`: today's date (`YYYY-MM-DD`)

It returns a JSON array of facts (see `.claude/agents/extractor.md` for
the exact shape). If it returns malformed output (not valid JSON, or not
an array), treat this source as failed: report the error, clean up scratch,
move on — **do not commit** (state stays at the old hash, so this source
is correctly retried from scratch next run).

If the array is empty: this source yielded no facts, but it *was* fully
and successfully processed — nothing publishable doesn't mean nothing
happened. Commit now, so a future run doesn't keep re-fetching and
re-extracting this same unchanged content forever:
```
node scripts/hash.js --commit <source-id> <hash> [--last-commit-at <value>]
```
(the `<hash>` and optional `--last-commit-at` value are from step 2's
`hash.json`). Append a note to your run summary, clean up scratch, move to
the next source.

### 4. Validate (subagent judgment)

Invoke the `validator` subagent with:
- `facts`: the extractor's output array
- `source_type`: the `type` from `hash.json`
- `source_stale`: the `stale` field from `hash.json` (only meaningful for
  `repo-readme`)

It returns a JSON array, one entry per input fact, each carrying `status`
and `confidence` (see `.claude/agents/validator.md`). Same malformed-output
handling as step 3 (report, clean up, **do not commit**, move on).

### 5. Merge (subagent judgment)

Group the validator's output by `topic_key`. Invoke the `merger` subagent
once with:
- `validated_facts`: the full validated array (all topic keys together —
  the merger groups internally per its own instructions)
- `today`: today's date (`YYYY-MM-DD`)

It returns a JSON array of `{ topic_key, content, summary }`, one entry per
topic key actually touched this run (see `.claude/agents/merger.md`). If
this returns malformed output, same handling as step 3: report, clean up,
**do not commit**, move on.

### 6. Publish (deterministic, one call per topic key)

For each `{ topic_key, content, summary }` entry from step 5:
1. Write `content` to `<scratch>/<topic_key>.md`.
2. Run:
   ```
   node scripts/write-okf.js <scratch>/<topic_key>.md --summary "<summary>"
   ```
3. If this exits non-zero (schema validation failed), print its error
   output, report this topic key as failed in your run summary, and do
   **not** treat the source as fully successful — but still attempt the
   remaining topic keys from this same merge output, since a schema
   failure on one topic key doesn't imply the others are also invalid.

`write-okf.js` handles the actual file write, `knowledge/index.md`
regeneration, and the `knowledge/log.md` created/updated line itself — do
not duplicate any of that here.

**Once every topic key from step 5 has been attempted:** if all of them
published successfully (no schema-validation failures), commit this
source's new hash now — this is the point where the content has actually,
fully landed in `knowledge/`:
```
node scripts/hash.js --commit <source-id> <hash> [--last-commit-at <value>]
```
If **any** topic key failed to publish, **do not commit** — leave state at
the old hash so this entire source (not just the failed topic key) is
retried from step 3 on the next run, since a partial publish means this
source's content hasn't been fully and correctly captured yet.

Clean up this source's scratch subdirectory once all its topic keys are
processed (and the commit decision above has been made).

## After all sources

Print a short summary: for each source id, one line stating short-circuit
(no-change) / created N files / updated N files / failed at stage X, so
whoever ran this command can see the outcome of the whole run at a glance.

## Why hash state is committed late, not at step 2

`scripts/hash.js` splits detection (`check`, step 2) from persistence
(`commit`, called only from step 3's empty-facts branch or the end of step
6). This is deliberate: if this command is interrupted anywhere between
step 2 and step 6 for a source, state is left at the *old* hash, so the
next run correctly re-detects that source as changed and retries it from
scratch — instead of silently marking unpublished content as "already
handled" forever. Never call `--commit` earlier than described above.
