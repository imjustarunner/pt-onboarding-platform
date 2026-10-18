export function localTime(value, timezone = "America/Denver") {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export const dateInZone = (value, timezone) =>
  localTime(value, timezone).slice(0, 10);
export function addDays(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function calendarDays(date, view) {
  if (view === "day") return [date];
  const anchor = view === "month" ? `${date.slice(0, 7)}-01` : date;
  const day = new Date(`${anchor}T12:00:00Z`).getUTCDay();
  const start = addDays(anchor, -((day + 6) % 7));
  return Array.from({ length: view === "month" ? 42 : 7 }, (_, i) =>
    addDays(start, i),
  );
}
export function nextDate(date, view, direction) {
  if (view !== "month")
    return addDays(date, (view === "week" ? 7 : 1) * direction);
  const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + direction);
  return value.toISOString().slice(0, 10);
}
