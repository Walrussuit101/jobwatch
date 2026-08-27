#!/usr/bin/env node
import { parseArgs } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Config } from "./config.js";
import { CheckinLog } from "./state.js";
import { StatusChecker } from "./status.js";
import { Reporter } from "./report.js";
import { withLock } from "./lock.js";

const USAGE = `jobwatch — a check-in system for cron jobs and backups.

A job that runs fine emits nothing on its own; the only way to know it stopped is that
it stops checking in. Have the job call \`jobwatch checkin\` when it finishes, and let a
separate periodic \`jobwatch status\` run (a chk command check, a cron entry, whatever)
report anything that's gone quiet.

usage:
  jobwatch checkin <name> [--state <file>]
  jobwatch status --config <file> [--state <file>] [--json]

checkin: appends a {name, ts} line to the state file, timestamped now. Run this as the
  last step of the job you're tracking.

status: reads --config's job list (each job has a name and an expected "every"
  interval, e.g. "1d", "6h", "30m", plus an optional "grace" slack duration) and
  --state's checkin log, then reports each job as:
    OK       last checkin is within every + grace
    OVERDUE  last checkin is older than every + grace
    NEVER    no checkin has ever been seen for this job name
  Exits 0 if every job is OK, 1 if any job is OVERDUE or NEVER, 2 on a usage error —
  so it composes as a chk \`command\` check or a cron job of its own.

config.json shape:
  { "jobs": [ { "name": "nightly-backup", "every": "1d", "grace": "2h" } ] }

options:
  --state     path to the state file (default: ~/.jobwatch/state.json)
  --json      status: emit an array of job statuses as JSON instead of a table
  -h, --help  show this
`;

const DEFAULT_STATE_PATH = join(homedir(), ".jobwatch", "state.json");

/** Orchestrates the jobwatch CLI: dispatches commands and owns all file I/O and process exits. */
export class JobWatchCli {
  /** Appends a timestamped checkin record to the state file. */
  async checkin(name: string, statePath: string): Promise<number> {
    await withLock(statePath + ".lock", async () => {
      await mkdir(dirname(statePath), { recursive: true });
      const line = JSON.stringify({ name, ts: Date.now() }) + "\n";
      await appendFile(statePath, line, "utf8");
    });
    return 0;
  }

  /**
   * Reads config and state files, computes job health, and writes a report to stdout.
   * Returns 0 if every job is OK, 1 if any job is OVERDUE or NEVER, 2 on an I/O error.
   */
  async status(configPath: string, statePath: string, asJson: boolean): Promise<number> {
    let configText: string;
    try {
      configText = await readFile(configPath, "utf8");
    } catch (err) {
      process.stderr.write(`jobwatch: can't read ${configPath}: ${(err as Error).message}\n`);
      return 2;
    }
    const config = Config.parse(configText);

    let stateText = "";
    try {
      stateText = await readFile(statePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        process.stderr.write(`jobwatch: can't read ${statePath}: ${(err as Error).message}\n`);
        return 2;
      }
    }

    const log = CheckinLog.parse(stateText);
    const statuses = StatusChecker.compute(config, log.lastByName(), Date.now());
    process.stdout.write((asJson ? Reporter.json(statuses) : Reporter.table(statuses)) + "\n");
    return statuses.some((s) => s.status !== "ok") ? 1 : 0;
  }

  /** Parses argv and dispatches to the appropriate command. */
  async run(argv: string[]): Promise<void> {
    if (argv[0] === "-h" || argv[0] === "--help" || argv.length === 0) {
      process.stdout.write(USAGE);
      process.exit(argv.length === 0 ? 2 : 0);
    }

    const command = argv[0];
    const rest = argv.slice(1);

    if (command === "checkin") {
      const { values, positionals } = parseArgs({
        args: rest,
        options: {
          state: { type: "string" },
          help: { type: "boolean", short: "h", default: false },
        },
        allowPositionals: true,
      });
      if (values.help) {
        process.stdout.write(USAGE);
        process.exit(0);
      }
      const name = positionals[0];
      if (!name) {
        process.stderr.write(USAGE);
        process.exit(2);
      }
      const statePath = values.state ?? DEFAULT_STATE_PATH;
      try {
        process.exit(await this.checkin(name, statePath));
      } catch (err) {
        process.stderr.write(`jobwatch: ${(err as Error).message}\n`);
        process.exit(2);
      }
    } else if (command === "status") {
      const { values } = parseArgs({
        args: rest,
        options: {
          config: { type: "string" },
          state: { type: "string" },
          json: { type: "boolean", default: false },
          help: { type: "boolean", short: "h", default: false },
        },
      });
      if (values.help) {
        process.stdout.write(USAGE);
        process.exit(0);
      }
      if (!values.config) {
        process.stderr.write(USAGE);
        process.exit(2);
      }
      const statePath = values.state ?? DEFAULT_STATE_PATH;
      try {
        process.exit(await this.status(values.config, statePath, values.json ?? false));
      } catch (err) {
        process.stderr.write(`jobwatch: ${(err as Error).message}\n`);
        process.exit(2);
      }
    } else {
      process.stderr.write(USAGE);
      process.exit(2);
    }
  }
}

new JobWatchCli().run(process.argv.slice(2));
