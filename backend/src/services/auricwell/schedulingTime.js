import { fail } from "./policy.js";

export function wallTime(value, timezone) {
  const date = new Date(value);
  if (!Number.isFinite(+date))
    throw fail(400, "Choose a valid appointment time.");
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((v) => [v.type, v.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function parseWallTime(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  )
    throw fail(400, "Enter an appointment date and time to the minute.");
  const nominal = Date.parse(`${value}:00Z`);
  if (
    !Number.isFinite(nominal) ||
    new Date(nominal).toISOString().slice(0, 16) !== value
  )
    throw fail(400, "Choose a valid local date and time.");
  return nominal;
}
export function localToInstant(value, timezone) {
  const nominal = parseWallTime(value);
  // Candidate offsets on both sides of a transition detect missing and repeated times.
  const offsets = new Set(
    [-48, -24, 0, 24, 48].map((hours) => {
      const probe = nominal + hours * 3600000;
      return parseWallTime(wallTime(probe, timezone)) - probe;
    }),
  );
  const candidates = [...offsets]
    .map((offset) => nominal - offset)
    .filter((instant) => wallTime(instant, timezone) === value);
  if (candidates.length !== 1)
    throw fail(
      409,
      `${value.replace("T", " ")} is ${candidates.length ? "ambiguous" : "unavailable"} in ${timezone} because of a clock change. Choose an unambiguous time.`,
    );
  return new Date(candidates[0]).toISOString();
}
export function occurrenceTime(localStart, weeks, durationMinutes, timezone) {
  const nominal = parseWallTime(localStart) + weeks * 7 * 86400000;
  const local = new Date(nominal).toISOString().slice(0, 16);
  const start = localToInstant(local, timezone);
  return {
    localStart: local,
    start,
    end: new Date(Date.parse(start) + durationMinutes * 60000).toISOString(),
  };
}
