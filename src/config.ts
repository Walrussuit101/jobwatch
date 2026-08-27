import { Duration } from "./duration.js";

export interface Job {
  name: string;
  everyMs: number;
  graceMs: number;
}

/** Parsed and validated jobwatch job configuration. */
export class Config {
  readonly jobs: Job[];

  constructor(jobs: Job[]) {
    this.jobs = jobs;
  }

  /**
   * Parses and validates a jobwatch config JSON string.
   * Expected shape: { "jobs": [{ "name": "...", "every": "1d", "grace": "2h" }, ...] }
   * `grace` is optional and defaults to 0 (overdue the instant `every` elapses).
   */
  static parse(text: string): Config {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      throw new Error(`invalid JSON: ${(err as Error).message}`);
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error("config must be a JSON object");
    }
    const obj = raw as Record<string, unknown>;
    if (!Array.isArray(obj.jobs) || obj.jobs.length === 0) {
      throw new Error(`"jobs" must be a non-empty array`);
    }

    const seen = new Set<string>();
    const jobs: Job[] = obj.jobs.map((entry, i) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new Error(`jobs[${i}] must be an object`);
      }
      const j = entry as Record<string, unknown>;
      if (typeof j.name !== "string" || j.name.trim() === "") {
        throw new Error(`jobs[${i}].name must be a non-empty string`);
      }
      if (seen.has(j.name)) {
        throw new Error(`duplicate job name "${j.name}"`);
      }
      seen.add(j.name);
      if (typeof j.every !== "string") {
        throw new Error(`jobs[${i}] ("${j.name}").every must be a string duration`);
      }
      let everyMs: number;
      try {
        everyMs = Duration.parse(j.every);
      } catch (err) {
        throw new Error(`jobs[${i}] ("${j.name}").every: ${(err as Error).message}`);
      }
      let graceMs = 0;
      if (j.grace !== undefined) {
        if (typeof j.grace !== "string") {
          throw new Error(`jobs[${i}] ("${j.name}").grace must be a string duration`);
        }
        try {
          graceMs = Duration.parse(j.grace);
        } catch (err) {
          throw new Error(`jobs[${i}] ("${j.name}").grace: ${(err as Error).message}`);
        }
      }
      return { name: j.name, everyMs, graceMs };
    });

    return new Config(jobs);
  }
}
