import test from "node:test";
import assert from "node:assert/strict";
import { wallTime, localToInstant, occurrenceTime } from "./schedulingTime.js";

test("weekly visits keep Colorado wall time across spring and autumn changes", () => {
  const spring = [0, 1, 2].map((w) =>
    occurrenceTime("2027-03-01T09:00", w, 60, "America/Denver"),
  );
  assert.deepEqual(
    spring.map((v) => v.start),
    [
      "2027-03-01T16:00:00.000Z",
      "2027-03-08T16:00:00.000Z",
      "2027-03-15T15:00:00.000Z",
    ],
  );
  const autumn = [0, 1].map((w) =>
    occurrenceTime("2026-10-26T09:00", w, 60, "America/Denver"),
  );
  assert.equal(autumn[1].start, "2026-11-02T16:00:00.000Z");
  for (const v of [...spring, ...autumn]) {
    assert.equal(wallTime(v.start, "America/Denver").slice(11), "09:00");
    assert.equal(Date.parse(v.end) - Date.parse(v.start), 3600000);
  }
});
test("nonexistent, repeated and invalid wall times require an explicit correction", () => {
  assert.throws(
    () => localToInstant("2027-03-14T02:30", "America/Denver"),
    /unavailable/,
  );
  assert.throws(
    () => localToInstant("2026-11-01T01:30", "America/Denver"),
    /ambiguous/,
  );
  assert.throws(
    () => localToInstant("2027-02-30T09:00", "America/Denver"),
    /valid local/,
  );
  assert.throws(
    () => localToInstant("2027-02-10", "America/Denver"),
    /to the minute/,
  );
  assert.equal(
    localToInstant("2027-03-14T02:30", "America/Phoenix"),
    "2027-03-14T09:30:00.000Z",
  );
});
