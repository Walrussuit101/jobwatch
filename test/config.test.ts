import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Config } from "../src/config.js";

describe("Config", () => {
  test("parses jobs with and without grace", () => {
    const config = Config.parse(
      JSON.stringify({
        jobs: [
          { name: "nightly-backup", every: "1d", grace: "2h" },
          { name: "db-vacuum", every: "6h" },
        ],
      }),
    );
    assert.deepEqual(config.jobs, [
      { name: "nightly-backup", everyMs: 86_400_000, graceMs: 7_200_000 },
      { name: "db-vacuum", everyMs: 21_600_000, graceMs: 0 },
    ]);
  });

  test("rejects invalid JSON", () => {
    assert.throws(() => Config.parse("{ not json"));
  });

  test("rejects non-object top level", () => {
    assert.throws(() => Config.parse("[]"));
    assert.throws(() => Config.parse("42"));
  });

  test("rejects missing or empty jobs array", () => {
    assert.throws(() => Config.parse("{}"));
    assert.throws(() => Config.parse(JSON.stringify({ jobs: [] })));
  });

  test("rejects a job missing name", () => {
    assert.throws(() => Config.parse(JSON.stringify({ jobs: [{ every: "1d" }] })));
  });

  test("rejects a job missing every", () => {
    assert.throws(() => Config.parse(JSON.stringify({ jobs: [{ name: "x" }] })));
  });

  test("rejects an invalid every/grace duration", () => {
    assert.throws(() => Config.parse(JSON.stringify({ jobs: [{ name: "x", every: "nope" }] })));
    assert.throws(() =>
      Config.parse(JSON.stringify({ jobs: [{ name: "x", every: "1d", grace: "nope" }] })),
    );
  });

  test("rejects duplicate job names", () => {
    assert.throws(() =>
      Config.parse(
        JSON.stringify({ jobs: [{ name: "x", every: "1d" }, { name: "x", every: "2d" }] }),
      ),
    );
  });
});
