function pad(value) {
  return String(value).padStart(2, '0');
}

export function parseJsonMaybe(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function normalizeRecurrence(input = null) {
  if (!input || typeof input !== 'object') {
    return { frequency: 'none' };
  }
  const frequencyRaw = String(input.frequency || input.type || 'none').trim().toLowerCase();
  const frequency = ['weekly', 'monthly'].includes(frequencyRaw) ? frequencyRaw : 'none';
  if (frequency === 'none') return { frequency: 'none' };

  const intervalValue = Number.parseInt(String(input.interval || '1'), 10);
  const interval = Number.isFinite(intervalValue) && intervalValue > 0 ? Math.min(intervalValue, 24) : 1;
  const untilDate = input.untilDate ? String(input.untilDate).slice(0, 10) : null;

  if (frequency === 'weekly') {
    const source = Array.isArray(input.byWeekday) ? input.byWeekday : [];
    const cleaned = [...new Set(source
      .map((d) => Number.parseInt(String(d), 10))
      .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6)
    )].sort((a, b) => a - b);
    return {
      frequency,
      interval,
      byWeekday: cleaned,
      untilDate
    };
  }

  const byMonthDayRaw = Number.parseInt(String(input.byMonthDay || 0), 10);
  const byMonthDay = Number.isFinite(byMonthDayRaw) && byMonthDayRaw >= 1 && byMonthDayRaw <= 31
    ? byMonthDayRaw
    : null;
  return {
    frequency,
    interval,
    byMonthDay,
    untilDate
  };
}

export function recurrenceToRRule(recurrence, startsAt) {
  const cfg = normalizeRecurrence(recurrence);
  if (cfg.frequency === 'none') return null;
  if (!(startsAt instanceof Date) || !Number.isFinite(startsAt.getTime())) return null;
  const pieces = [];
  if (cfg.frequency === 'weekly') {
    pieces.push('FREQ=WEEKLY');
    if (cfg.interval > 1) pieces.push(`INTERVAL=${cfg.interval}`);
    const map = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const days = (cfg.byWeekday || []).map((d) => map[d]).filter(Boolean);
    if (days.length) pieces.push(`BYDAY=${days.join(',')}`);
  } else if (cfg.frequency === 'monthly') {
    pieces.push('FREQ=MONTHLY');
    if (cfg.interval > 1) pieces.push(`INTERVAL=${cfg.interval}`);
    if (cfg.byMonthDay) pieces.push(`BYMONTHDAY=${cfg.byMonthDay}`);
  }
  if (cfg.untilDate) {
    const date = new Date(`${cfg.untilDate}T23:59:59Z`);
    if (Number.isFinite(date.getTime())) pieces.push(`UNTIL=${formatGoogleDate(date)}`);
  }
  return pieces.length ? `RRULE:${pieces.join(';')}` : null;
}

export function formatGoogleDate(date) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    'T',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z'
  ].join('');
}

export function escapeIcsText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function formatIcsDate(date) {
  return formatGoogleDate(date);
}

export function makeGoogleCalendarUrl(event) {
  const startsAt = new Date(event?.startsAt || event?.starts_at || 0);
  const endsAt = new Date(event?.endsAt || event?.ends_at || 0);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) return null;
  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', String(event?.title || 'Company event'));
  const details = String(event?.description || event?.splashContent || '').trim();
  if (details) params.set('details', details);
  params.set('dates', `${formatGoogleDate(startsAt)}/${formatGoogleDate(endsAt)}`);
  const recurrenceRule = recurrenceToRRule(event?.recurrence, startsAt);
  if (recurrenceRule) params.set('recur', recurrenceRule);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildEventIcs(event) {
  const startsAt = new Date(event?.startsAt || event?.starts_at || 0);
  const endsAt = new Date(event?.endsAt || event?.ends_at || 0);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) return null;
  const recurrenceRule = recurrenceToRRule(event?.recurrence, startsAt);
  const uid = `company-event-${event?.id || 'unknown'}@ptonboardingapp`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PTOnboardingApp//CompanyEvents//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(startsAt)}`,
    `DTEND:${formatIcsDate(endsAt)}`,
    `SUMMARY:${escapeIcsText(event?.title || 'Company event')}`
  ];
  const desc = String(event?.description || event?.splashContent || '').trim();
  if (desc) lines.push(`DESCRIPTION:${escapeIcsText(desc)}`);
  if (recurrenceRule) lines.push(recurrenceRule);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function computeNextOccurrence(event, nowInput = new Date()) {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const startsAt = new Date(event?.startsAt || event?.starts_at || 0);
  const endsAt = new Date(event?.endsAt || event?.ends_at || 0);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    return null;
  }
  if (startsAt >= now) {
    return { startsAt, endsAt };
  }
  const recurrence = normalizeRecurrence(event?.recurrence);
  if (recurrence.frequency === 'none') return null;
  const durationMs = Math.max(60_000, endsAt.getTime() - startsAt.getTime());
  const until = recurrence.untilDate ? new Date(`${recurrence.untilDate}T23:59:59Z`) : null;

  if (recurrence.frequency === 'weekly') {
    const days = recurrence.byWeekday?.length ? recurrence.byWeekday : [startsAt.getUTCDay()];
    const intervalWeeks = recurrence.interval || 1;
    const baseWeekStart = new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate()));
    for (let offsetDays = 0; offsetDays <= 366 * 2; offsetDays += 1) {
      const candidateDate = new Date(baseWeekStart.getTime() + offsetDays * 24 * 60 * 60 * 1000);
      const candidateDay = candidateDate.getUTCDay();
      if (!days.includes(candidateDay)) continue;
      const weeksFromStart = Math.floor(offsetDays / 7);
      if (weeksFromStart % intervalWeeks !== 0) continue;
      const candidateStart = new Date(Date.UTC(
        candidateDate.getUTCFullYear(),
        candidateDate.getUTCMonth(),
        candidateDate.getUTCDate(),
        startsAt.getUTCHours(),
        startsAt.getUTCMinutes(),
        startsAt.getUTCSeconds()
      ));
      if (candidateStart <= now) continue;
      if (until && candidateStart > until) return null;
      return { startsAt: candidateStart, endsAt: new Date(candidateStart.getTime() + durationMs) };
    }
    return null;
  }

  if (recurrence.frequency === 'monthly') {
    const intervalMonths = recurrence.interval || 1;
    const monthDay = recurrence.byMonthDay || startsAt.getUTCDate();
    for (let i = 1; i <= 48; i += 1) {
      const monthsToAdd = i * intervalMonths;
      const candidate = new Date(Date.UTC(
        startsAt.getUTCFullYear(),
        startsAt.getUTCMonth() + monthsToAdd,
        monthDay,
        startsAt.getUTCHours(),
        startsAt.getUTCMinutes(),
        startsAt.getUTCSeconds()
      ));
      // Skip rollover dates (e.g., Feb 31 -> Mar 2)
      if (candidate.getUTCDate() !== monthDay) continue;
      if (candidate <= now) continue;
      if (until && candidate > until) return null;
      return { startsAt: candidate, endsAt: new Date(candidate.getTime() + durationMs) };
    }
  }
  return null;
}
