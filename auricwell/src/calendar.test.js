import test from "node:test";
import assert from "node:assert/strict";
import { localTime, dateInZone, calendarDays, nextDate } from "./calendar.js";
test("calendar uses practice dates across device timezones and clock changes", () => {
  assert.equal(
    dateInZone("2027-03-15T01:00:00Z", "America/Denver"),
    "2027-03-14",
  );
  assert.equal(
    localTime("2027-03-15T15:00:00Z", "America/Denver"),
    "2027-03-15T09:00",
  );
  assert.equal(
    localTime("2027-03-08T16:00:00Z", "America/Denver"),
    "2027-03-08T09:00",
  );
});
test("calendar weeks, months and navigation cover year and leap-day boundaries", () => {
  assert.deepEqual(calendarDays("2027-01-03", "week"), [
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
  assert.ok(calendarDays("2028-02-15", "month").includes("2028-02-29"));
  assert.equal(nextDate("2026-12-31", "month", 1), "2027-01-01");
  assert.equal(nextDate("2027-03-14", "day", 1), "2027-03-15");
});
