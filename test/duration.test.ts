import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Duration } from "../src/duration.js";

describe("Duration", () => {
  test("parses each unit", () => {
    assert.equal(Duration.parse("500ms"), 500);
    assert.equal(Duration.parse("45s"), 45_000);
    assert.equal(Duration.parse("30m"), 30 * 60_000);
    assert.equal(Duration.parse("6h"), 6 * 3_600_000);
    assert.equal(Duration.parse("7d"), 7 * 86_400_000);
  });

  test("no suffix means seconds", () => {
    assert.equal(Duration.parse("90"), 90_000);
  });

  test("decimals allowed", () => {
    assert.equal(Duration.parse("1.5h"), 1.5 * 3_600_000);
  });

  test("rejects garbage", () => {
    assert.throws(() => Duration.parse("banana"));
    assert.throws(() => Duration.parse(""));
    assert.throws(() => Duration.parse("5x"));
  });
});
