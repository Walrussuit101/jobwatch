# jobwatch — proposed features

A look at the current design and where it could grow. jobwatch today is a tight,
well-factored CLI: `checkin` appends a `{name, ts}` line to a JSONL state file under
an advisory lock, and `status` diffs a config's expected intervals against the last
checkin per job, reporting `OK` / `OVERDUE` / `NEVER` with exit codes suitable for
cron and monitoring checks.

The suggestions below are ordered roughly by value-to-effort. Each notes the modules
it touches so they can be scoped independently.

---

## 1. Alerting / notification hooks

**Why:** Today `status` only reports to stdout and via exit code. To actually be
*alerted*, you have to wire jobwatch into an external monitoring system. A built-in
notifier closes the loop: the watchdog run can itself send the alert.

**Shape:** an optional `notify` block in the config, invoked for any job that is
`OVERDUE` or `NEVER` (and optionally on recovery back to `OK`):

```json
{
  "notify": {
    "command": "/usr/local/bin/alert.sh",   // exec with job details on stderr/argv
    "webhook": "https://hooks.example.com/…" // POST a JSON body
  },
  "jobs": [ … ]
}
```

Start with the `command` variant — it's the most composable (users bring their own
Slack/email/PagerDuty script) and needs no network code. A generic webhook POST is a
natural follow-up.

**Touches:** `config.ts` (parse the block), a new `notify.ts`, and `cli.ts`
(`status` calls it after computing statuses). Keep it opt-in so exit-code composition
still works unchanged.

**Care:** to avoid alert spam on every watchdog run, pair this with #2 (state) so a
job only alerts on *transition* into a bad state, not on every poll.

---

## 2. Alert de-duplication / state transitions

**Why:** If `status` runs every 5 minutes and a job is overdue for a day, naive
notification fires ~288 times. Real monitoring alerts on *edges*.

**Shape:** persist the last-reported status per job (a small sidecar file next to the
state file, e.g. `state.status.json`). On each run, compare current vs. previous and
emit `--changed-only` output and/or notifications only for jobs whose status changed.
A `--flap-window` could suppress rapid ok↔overdue oscillation.

**Touches:** new persistence alongside `state.ts`, a diff step in `cli.ts`, and it
composes directly with #1.

---

## 3. `jobwatch list` / richer status queries

**Why:** `status` conflates "compute health" with "you must supply a config." Small
quality-of-life commands make the tool nicer to operate:

- `jobwatch list --state <file>` — show every job name that has *ever* checked in,
  with its last-seen time, independent of config. Useful for discovering drift
  between what's configured and what's actually reporting.
- `jobwatch status --only <name>` / `--status overdue` — filter output to specific
  jobs or a specific health, handy in dashboards and one-off checks.
- Warn on **unconfigured checkins**: a job that appears in the state file but not in
  config is silently invisible today. Surfacing it catches typos in `checkin` names.

**Touches:** `cli.ts` dispatch, `status.ts` (an "unexpected job" pass), `report.ts`.

---

## 4. State file compaction / rotation

**Why:** `checkin` is append-only. A job checking in every 5 minutes writes ~105k
lines/year; `status` only ever needs the last line per name, so the file grows
without bound while carrying almost no useful information.

**Shape:** a `jobwatch compact [--state <file>]` command that rewrites the file to
just the last checkin per name (optionally keeping the last N per name for history).
Run it from cron, or have `checkin` trigger compaction opportunistically when the
file exceeds a size threshold. The existing `withLock` makes the rewrite safe.

**Touches:** new command in `cli.ts`, a compaction routine over `CheckinLog`
(`state.ts` already has `lastByName()` — the core is nearly free), guarded by
`withLock`.

---

## 5. Machine-readable exit detail & `--quiet`

**Why:** `status` returns 0/1/2 but the JSON/table are the only way to know *which*
jobs failed. Ops tooling often wants a terse signal.

**Shape:**
- `--quiet` — suppress the table, rely purely on exit code (for cron mail hygiene).
- Include a summary line / object (`{ ok: 3, overdue: 1, never: 0 }`) in `--json`
  so a scraper doesn't have to reduce the array itself.
- Consider a distinct exit code for `NEVER` vs `OVERDUE` (they already mean different
  things per the README) so a wrapper can treat "never ran" differently from
  "stopped running."

**Touches:** `report.ts`, `cli.ts` exit logic. Low effort, purely additive.

---

## 6. Metadata on checkins (duration, exit status, message)

**Why:** Right now a checkin only records *that* a job finished. Often you also want
*how it went* — succeeded/failed, how long it took, a note.

**Shape:** extend `checkin` with optional flags:

```sh
jobwatch checkin nightly-backup --duration 42s --ok
jobwatch checkin nightly-backup --fail --message "rsync exit 23"
```

The record becomes `{name, ts, ok?, durationMs?, msg?}`. `status` can then flag a job
that checked in *on time but reporting failure* — a case the current model can't
express (it only sees liveness, not success). The state parser already tolerates
extra/missing fields, so this is backward compatible.

**Touches:** `cli.ts` (checkin flags), `state.ts` (carry the new fields — note
`toArray`/`Checkin` already exist and are unused by `status`, so history is ready to
be surfaced), `status.ts` (a "stale-but-failing" health), `report.ts`.

---

## 7. Absolute / calendar schedules

**Why:** `every: "1d"` is a sliding interval — it can't express "expected by 02:00
daily" or "Mondays." A backup due at 2am that runs at 1am then 3am the next day looks
fine to interval logic but may violate an SLA.

**Shape:** allow a cron expression or a time-of-day anchor as an alternative to
`every`:

```json
{ "name": "nightly-backup", "cron": "0 2 * * *", "grace": "1h" }
```

`status` computes the most recent expected fire time from the cron/anchor and checks
whether a checkin landed within grace of it.

**Touches:** `config.ts` (accept `cron` as an alternative to `every`), a new
schedule-evaluation module, `status.ts`. This is the largest item here (cron parsing
is fiddly and probably wants a small dependency) — worth it only if calendar SLAs are
a real need.

---

## 8. `jobwatch checkin --start` / heartbeat window

**Why:** For long jobs you may want to catch a job that *started* but never
*finished* (hung), not just one that never started.

**Shape:** `checkin <name> --start` records a start marker; the terminal `checkin`
closes it. `status` can then flag a job whose start is older than some max-runtime
without a matching completion. This overlaps with #6's metadata and could share the
record format.

**Touches:** `cli.ts`, `state.ts`, `status.ts`.

---

## Smaller polish

- **`--version` flag.** The CLI has no way to print its version; wire it to
  `package.json`.
- **Config `$schema` / `jobwatch validate`.** A `validate --config` command that
  parses and prints the normalized job list (with `every`/`grace` echoed in ms) helps
  users debug config before trusting it in cron. `Config.parse` already does all the
  validation — this is just a thin command over it.
- **Duration output symmetry.** `Reporter.formatDuration` caps at days; weeks/months
  would read better for long-quiet jobs ("last seen 9.1d ago" vs "1.3w").
- **Env-var / default config discovery.** Let `status` fall back to
  `~/.jobwatch/config.json` (mirroring the default state path) so the common case
  needs no `--config` flag.
- **NDJSON / streaming output** for `status` to feed log pipelines line-by-line.

---

## Suggested first cut

If picking a small, high-impact starting set:

1. **#4 compaction** — the append-only file is a real, silent liability and the core
   logic already exists in `lastByName()`.
2. **#1 + #2 notification on transition** — turns jobwatch from "reports status" into
   "alerts me," which is the actual job-to-be-done, without breaking exit-code use.
3. **#5 / `--version` / `validate`** — cheap ergonomics that make it pleasant to
   operate.

These three build naturally on the existing modules and don't require the larger
investment (cron parsing, network clients) that #7 and a full webhook notifier imply.
