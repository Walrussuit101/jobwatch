import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Reporter } from "../src/report.js";
import type { JobStatus } from "../src/status.js";

const statuses: JobStatus[] = [
  { name: "nightly-backup", status: "ok", lastTs: 100, ageMs: 3_600_000, overdueByMs: null },
  { name: "db-vacuum", status: "overdue", lastTs: 50, ageMs: 90_000_000, overdueByMs: 400_000 },
  { name: "weekly-report", status: "never", lastTs: null, ageMs: null, overdueByMs: null },
];

describe("Reporter", () => {
  test("table shows status and detail per job", () => {
    const out = Reporter.table(statuses);
    assert.match(out, /nightly-backup\s+OK\s+last seen 1\.0h ago/);
    assert.match(out, /db-vacuum\s+OVERDUE\s+last seen 1\.0d ago, overdue by 6\.7m/);
    assert.match(out, /weekly-report\s+NEVER\s+no checkin seen/);
  });

  test("table on no jobs", () => {
    assert.equal(Reporter.table([]), "(no jobs configured)");
  });

  test("json round-trips the status array", () => {
    assert.deepEqual(JSON.parse(Reporter.json(statuses)), statuses);
  });
});
