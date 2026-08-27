# pulse

A passive dead-man's switch for cron jobs and backups.

A job that runs fine emits nothing on its own; the only way to know it stopped is that it stops checking in. Have the job call `pulse checkin` when it finishes, and let a separate periodic `pulse status` run report anything that's gone quiet.

## How it works

1. At the end of each job you want to monitor, call `pulse checkin <name>`. This appends a timestamped record to a state file (default: `~/.pulse/state.json`).
2. Run `pulse status --config <file>` on a schedule (via cron, a monitoring check, etc.). It reads your config to know what jobs to expect and how often, then reports each job as `OK`, `OVERDUE`, or `NEVER`.
3. `pulse status` exits 0 if everything is OK, 1 if any job is overdue or has never checked in — so it composes directly as a cron job or a monitoring command check.

## Installation

```sh
npm install -g pulse   # or: npx pulse
```

Or build from source:

```sh
npm install
npm run build
```

## Usage

```
pulse checkin <name> [--state <file>]
pulse status --config <file> [--state <file>] [--json]
```

### `pulse checkin <name>`

Appends a timestamped checkin for the named job to the state file. Run this as the last step of the job you're tracking.

```sh
# In your backup script:
rsync -a /data /backup && pulse checkin nightly-backup
```

Options:
- `--state <file>` — path to the state file (default: `~/.pulse/state.json`)

### `pulse status --config <file>`

Reads the config to find expected jobs and the state file to find actual checkins, then reports each job's health.

```
nightly-backup  OK      last seen 3.2h ago
weekly-report   OVERDUE last seen 9.1d ago, overdue by 2.1d
db-vacuum       NEVER   no checkin seen
```

Options:
- `--config <file>` — path to your config JSON (required)
- `--state <file>` — path to the state file (default: `~/.pulse/state.json`)
- `--json` — emit results as a JSON array instead of a table

Exit codes:
- `0` — all jobs are OK
- `1` — one or more jobs are OVERDUE or NEVER
- `2` — usage error or I/O failure

## Config file

```json
{
  "jobs": [
    { "name": "nightly-backup", "every": "1d", "grace": "2h" },
    { "name": "weekly-report",  "every": "7d" },
    { "name": "db-vacuum",      "every": "6h", "grace": "30m" }
  ]
}
```

Each job has:
- `name` — unique identifier, must match what you pass to `pulse checkin`
- `every` — how often the job is expected to run (e.g. `"1d"`, `"6h"`, `"30m"`, `"45s"`)
- `grace` _(optional)_ — extra slack before a job is considered overdue; defaults to `0`

Duration format: a number followed by a unit — `ms`, `s`, `m`, `h`, or `d`. No suffix means seconds.

## Job statuses

| Status | Meaning |
|--------|---------|
| `OK` | Last checkin is within `every + grace` |
| `OVERDUE` | Last checkin is older than `every + grace` |
| `NEVER` | No checkin has ever been recorded for this job |

`OVERDUE` and `NEVER` are reported separately because they mean different things: a new job that has never run is different from a job that used to run and stopped.

## Example cron setup

```cron
# The job itself — checkin when done
0 2 * * * /path/to/backup.sh && pulse checkin nightly-backup

# A watchdog — alert if anything is overdue
*/15 * * * * pulse status --config /etc/pulse.json || alert "pulse: job overdue"
```

## Development

```sh
npm run dev     # run via tsx (no build step)
npm test        # run tests
npm run build   # compile to dist/
```
