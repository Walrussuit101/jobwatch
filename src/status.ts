import type { Config } from "./config.js";

export type Health = "ok" | "overdue" | "never";

export interface JobStatus {
  name: string;
  status: Health;
  lastTs: number | null;
  ageMs: number | null;
  overdueByMs: number | null;
}

/** Computes the health of each configured job against its last checkin. */
export class StatusChecker {
  /**
   * Compares each configured job's last checkin against `everyMs + graceMs`.
   * A job with no checkin is "never" rather than "overdue" — the two mean
   * different things and collapsing them would hide which failure you're seeing.
   */
  static compute(config: Config, lastByName: Map<string, number>, now: number): JobStatus[] {
    return config.jobs.map((job) => {
      const lastTs = lastByName.get(job.name) ?? null;
      if (lastTs === null) {
        return { name: job.name, status: "never", lastTs: null, ageMs: null, overdueByMs: null };
      }
      const ageMs = now - lastTs;
      const deadline = job.everyMs + job.graceMs;
      if (ageMs <= deadline) {
        return { name: job.name, status: "ok", lastTs, ageMs, overdueByMs: null };
      }
      return { name: job.name, status: "overdue", lastTs, ageMs, overdueByMs: ageMs - deadline };
    });
  }
}
