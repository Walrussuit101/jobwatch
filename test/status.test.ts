import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { StatusChecker } from "../src/status.js";
import { Config } from "../src/config.js";

const config = new Config([
  { name: "on-time", everyMs: 3_600_000, graceMs: 0 },
  { name: "within-grace", everyMs: 3_600_000, graceMs: 600_000 },
  { name: "overdue", everyMs: 3_600_000, graceMs: 0 },
  { name: "unseen", everyMs: 3_600_000, graceMs: 0 },
]);

describe("StatusChecker", () => {
  test("classifies ok / overdue / never correctly", () => {
    const now = 10_000_000;
    const last = new Map([
      ["on-time", now - 1_000_000], // within the 1h window
      ["within-grace", now - 3_900_000], // past every, within grace
      ["overdue", now - 4_000_000], // past every, no grace
    ]);
    const statuses = StatusChecker.compute(config, last, now);

    assert.deepEqual(
      statuses.map((s) => s.status),
      ["ok", "ok", "overdue", "never"],
    );

    const overdue = statuses.find((s) => s.name === "overdue")!;
    assert.equal(overdue.ageMs, 4_000_000);
    assert.equal(overdue.overdueByMs, 400_000);

    const unseen = statuses.find((s) => s.name === "unseen")!;
    assert.equal(unseen.lastTs, null);
    assert.equal(unseen.ageMs, null);
    assert.equal(unseen.overdueByMs, null);
  });

  test("exactly at the deadline is still ok, not overdue", () => {
    const now = 1_000_000;
    const single = new Config([{ name: "x", everyMs: 500_000, graceMs: 100_000 }]);
    const last = new Map([["x", now - 600_000]]);
    const [status] = StatusChecker.compute(single, last, now);
    assert.equal(status.status, "ok");
  });
});
