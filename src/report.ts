import type { JobStatus } from "./status.js";

/** Renders job status results for CLI output. */
export class Reporter {
  private static formatDuration(ms: number): string {
    if (ms >= 86_400_000) return `${(ms / 86_400_000).toFixed(1)}d`;
    if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
    if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  /** Renders a fixed-width table of job statuses aligned on the longest name. */
  static table(statuses: JobStatus[]): string {
    if (statuses.length === 0) return "(no jobs configured)";
    const nameWidth = Math.max(...statuses.map((s) => s.name.length), "name".length);
    const lines: string[] = [];
    for (const s of statuses) {
      const label = s.status.toUpperCase().padEnd(7);
      let detail: string;
      if (s.status === "never") {
        detail = "no checkin seen";
      } else if (s.status === "ok") {
        detail = `last seen ${Reporter.formatDuration(s.ageMs!)} ago`;
      } else {
        detail = `last seen ${Reporter.formatDuration(s.ageMs!)} ago, overdue by ${Reporter.formatDuration(s.overdueByMs!)}`;
      }
      lines.push(`${s.name.padEnd(nameWidth)}  ${label} ${detail}`);
    }
    return lines.join("\n");
  }

  /** Renders job statuses as a pretty-printed JSON array. */
  static json(statuses: JobStatus[]): string {
    return JSON.stringify(statuses, null, 2);
  }
}
