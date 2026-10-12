import { zonedWallTimeToUtc } from './zonedWallTime.util.js';

const DAY = 86400000;
const iso = (date) => date.toISOString().slice(0, 10);
const date = (ymd) => new Date(`${ymd}T12:00:00Z`);
const shift = (ymd, days) => iso(new Date(date(ymd).getTime() + days * DAY));
const weekend = (ymd) => [0, 6].includes(date(ymd).getUTCDay());
const fixed = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const nth = (year, month, weekday, n) => {
  const first = fixed(year, month, 1);
  return shift(first, (weekday - date(first).getUTCDay() + 7) % 7 + (n - 1) * 7);
};
const label = (ymd) => date(ymd).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

// Calendar rules are used only by the one-time seed generator, never a scheduler.
export function handbookHolidayDates(year) {
  let memorial = nth(year, 5, 1, 4);
  if (shift(memorial, 7).slice(5, 7) === '05') memorial = shift(memorial, 7);
  const thanksgiving = nth(year, 11, 4, 4);
  return [
    [fixed(year, 1, 1), "New Year's Day"],
    [nth(year, 1, 1, 3), 'Martin Luther King, Jr. Day'],
    [nth(year, 2, 1, 3), "President's Day"],
    [memorial, 'Memorial Day'],
    [fixed(year, 6, 19), 'Juneteenth'],
    [fixed(year, 7, 4), '4th of July/Independence Day'],
    [nth(year, 9, 1, 1), 'Labor Day'],
    [nth(year, 10, 1, 2), 'Indigenous People’s Day/Columbus Day'],
    [fixed(year, 11, 11), "Veteran's Day"],
    [thanksgiving, 'Thanksgiving Day'],
    [shift(thanksgiving, 1), 'Day after Thanksgiving'],
    [fixed(year, 12, 24), 'Christmas Eve'],
    [fixed(year, 12, 25), 'Christmas Day'],
    [fixed(year, 12, 31), 'New Year’s Eve']
  ];
}

export function buildHandbookHolidayToasts({ from = '2026-10-12', through = '2027-12-31', timeZone = 'America/Denver', observeWeekends = false } = {}) {
  const all = [];
  for (let y = Number(from.slice(0, 4)) - 1; y <= Number(through.slice(0, 4)) + 1; y++) {
    for (const [day, name] of handbookHolidayDates(y)) {
      const weekday = date(day).getUTCDay();
      all.push([observeWeekends && weekday === 6 ? shift(day, -1) : observeWeekends && weekday === 0 ? shift(day, 1) : day, name]);
    }
  }
  all.sort(([a], [b]) => a.localeCompare(b));
  const holidays = new Set(all.map(([day]) => day));
  const isBusiness = (day) => !weekend(day) && !holidays.has(day);
  const midnight = (ymd) => {
    const [year, month, day] = ymd.split('-').map(Number);
    return zonedWallTimeToUtc({ year, month, day, hour: 0, minute: 0, timeZone }).toISOString();
  };
  const rows = [];
  let previousReturn = '';
  for (const [start] of all) {
    if (start < previousReturn) continue;
    let returns = shift(start, 1);
    while (!isBusiness(returns)) returns = shift(returns, 1);
    previousReturn = returns;
    if (start > through || returns <= from) continue;
    let reminder = shift(start, -1);
    while (!isBusiness(reminder)) reminder = shift(reminder, -1);
    const names = all.filter(([day]) => day >= start && day < returns).map(([, name]) => name);
    const occasion = [...new Set(names)].join(' / ');
    const common = `This closure applies to administrative offices only; provider appointments and services follow their individual schedules.`;
    rows.push({
      seed_key: `handbook-office-holidays:${start}:reminder`,
      title: 'Upcoming administrative office closure',
      message: `Our administrative offices will be closed beginning ${label(start)} for ${occasion} and will reopen on ${label(returns)}. ${common}`,
      starts_at: midnight(reminder), ends_at: midnight(start), closureDate: start, returnDate: returns
    }, {
      seed_key: `handbook-office-holidays:${start}:closed`,
      title: 'Administrative offices closed today',
      message: `Our administrative offices are closed today for ${occasion} and will reopen on ${label(returns)}. ${common}`,
      starts_at: midnight(start), ends_at: midnight(returns), closureDate: start, returnDate: returns
    });
  }
  return rows.filter((row) => row.ends_at > midnight(from));
}
