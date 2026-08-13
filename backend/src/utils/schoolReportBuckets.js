const WEEKDAY_RE = /Monday|Tuesday|Wednesday|Thursday|Friday/i;

export function classifyAssignmentBucket({ hasProvider, hasDay }) {
  if (hasProvider && hasDay) return 'provider_and_day';
  if (hasProvider) return 'provider_no_day';
  return 'no_provider';
}

/** True when the value names a Mon–Fri weekday. "Unknown" and blanks are not a day. */
export function isRealServiceDay(raw) {
  const day = String(raw || '').trim();
  if (!day || day.toLowerCase() === 'unknown') return false;
  return WEEKDAY_RE.test(day);
}

export function weekdaysFromAssignment({ serviceDay, providerDayPairs } = {}) {
  const found = [];
  const add = (raw) => {
    const matches = String(raw || '').match(/Monday|Tuesday|Wednesday|Thursday|Friday/gi) || [];
    for (const m of matches) {
      const norm = `${m.charAt(0).toUpperCase()}${m.slice(1).toLowerCase()}`;
      if (!found.includes(norm)) found.push(norm);
    }
  };
  add(serviceDay);
  add(providerDayPairs);
  return found;
}

export function displayServiceDay(row) {
  const days = weekdaysFromAssignment({
    serviceDay: row?.service_day,
    providerDayPairs: row?.provider_day_pairs
  });
  return days.length ? days.join(', ') : null;
}

/** SQL predicate: expr stores a real weekday (not NULL / blank / Unknown). */
export function sqlRealWeekdayPredicate(expr) {
  return `(
    NULLIF(TRIM(${expr}), '') IS NOT NULL
    AND LOWER(TRIM(${expr})) <> 'unknown'
    AND (
      ${expr} LIKE '%Monday%'
      OR ${expr} LIKE '%Tuesday%'
      OR ${expr} LIKE '%Wednesday%'
      OR ${expr} LIKE '%Thursday%'
      OR ${expr} LIKE '%Friday%'
    )
  )`;
}
