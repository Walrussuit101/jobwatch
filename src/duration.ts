const UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parses duration strings like "24h", "7d", "30m", "45s" into milliseconds. */
export class Duration {
  /** Converts a duration string to milliseconds. No suffix means seconds. */
  static parse(raw: string): number {
    const m = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/.exec(raw.trim());
    if (!m) {
      throw new Error(`invalid duration "${raw}" — expected e.g. "24h", "7d", "30m", "45s"`);
    }
    const n = Number(m[1]);
    const unit = m[2] ?? "s";
    return n * UNITS[unit];
  }
}
