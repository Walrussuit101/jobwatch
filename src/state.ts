export interface Checkin {
  name: string;
  ts: number;
}

/** An immutable log of job checkins parsed from a JSONL state file. */
export class CheckinLog {
  private readonly checkins: Checkin[];

  private constructor(checkins: Checkin[]) {
    this.checkins = checkins;
  }

  /**
   * Parses a JSONL checkin file into a CheckinLog.
   * Tolerates blank lines and lines that fail to parse — a write interrupted
   * mid-line (e.g. a killed process) leaves a truncated final line that is
   * simply skipped rather than aborting the whole read.
   */
  static parse(text: string): CheckinLog {
    const checkins: Checkin[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      let obj: unknown;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (typeof obj !== "object" || obj === null) continue;
      const rec = obj as Record<string, unknown>;
      if (typeof rec.name !== "string" || typeof rec.ts !== "number") continue;
      checkins.push({ name: rec.name, ts: rec.ts });
    }
    return new CheckinLog(checkins);
  }

  /** Returns all parsed checkin entries in file order. */
  toArray(): readonly Checkin[] {
    return this.checkins;
  }

  /** Reduces the log to the most recent checkin timestamp per job name. */
  lastByName(): Map<string, number> {
    const last = new Map<string, number>();
    for (const c of this.checkins) {
      const prev = last.get(c.name);
      if (prev === undefined || c.ts > prev) {
        last.set(c.name, c.ts);
      }
    }
    return last;
  }
}
