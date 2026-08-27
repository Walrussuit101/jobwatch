import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CheckinLog } from "../src/state.js";

describe("CheckinLog", () => {
  test("parses one checkin per line", () => {
    const log = CheckinLog.parse('{"name":"a","ts":100}\n{"name":"b","ts":200}\n');
    assert.deepEqual(log.toArray(), [
      { name: "a", ts: 100 },
      { name: "b", ts: 200 },
    ]);
  });

  test("skips blank and unparseable lines", () => {
    const log = CheckinLog.parse(
      '{"name":"a","ts":100}\n\n   \nnot json\n{"name":"b"\n{"name":"c","ts":300}\n',
    );
    assert.deepEqual(log.toArray(), [
      { name: "a", ts: 100 },
      { name: "c", ts: 300 },
    ]);
  });

  test("skips lines missing required fields", () => {
    const log = CheckinLog.parse(
      '{"name":"a"}\n{"ts":100}\n{"name":"b","ts":"nope"}\n{"name":"c","ts":100}\n',
    );
    assert.deepEqual(log.toArray(), [{ name: "c", ts: 100 }]);
  });

  test("empty input yields no checkins", () => {
    assert.deepEqual(CheckinLog.parse("").toArray(), []);
  });

  test("lastByName keeps the max timestamp per name", () => {
    const log = CheckinLog.parse(
      '{"name":"a","ts":100}\n{"name":"a","ts":300}\n{"name":"a","ts":200}\n{"name":"b","ts":50}\n',
    );
    assert.deepEqual(Object.fromEntries(log.lastByName()), { a: 300, b: 50 });
  });

  test("lastByName on empty input is an empty map", () => {
    assert.equal(CheckinLog.parse("").lastByName().size, 0);
  });
});
