const DAY = 86400000;

// Mirror the worker's calendar-month cadence for the displayed service-date window.
export function scheduledReportPeriod(settings) {
  const due = new Date(settings?.nextRunAt);
  if (!settings?.nextRunAt || !Number.isFinite(due.getTime())) return null;
  const start = new Date(due);
  if (settings.cadence === 'custom') {
    const days = Number(settings.intervalDays);
    if (!Number.isInteger(days) || days < 1 || days > 366) return null;
    start.setTime(start.getTime() - days * DAY);
  } else {
    const months = { monthly: 1, quarterly: 3, annual: 12 }[settings.cadence];
    if (!months) return null;
    const day = start.getUTCDate();
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - months);
    const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    start.setUTCDate(Math.min(day, last));
  }
  return { start: start.toISOString().slice(0, 10), end: new Date(due.getTime() - DAY).toISOString().slice(0, 10) };
}

export function reportScheduleStatus(settings, billing, now = Date.now()) {
  if (!settings?.enabled) return { state: 'off', title: 'Automatic reports are off', detail: 'Enable scheduled reports in Frequency and sample.' };
  if (settings.cadence === 'manual') return { state: 'manual', title: 'Manual reports only', detail: 'Run a report whenever you need one, or choose an automatic frequency.' };
  if (billing?.canRun === false || billing?.priceAccepted === false) return { state: 'paused', title: 'Automatic reports are paused', detail: 'Review availability and the current accepted price in Frequency and sample.' };
  const target = settings.nextRunAt ? new Date(settings.nextRunAt).getTime() : NaN;
  if (!Number.isFinite(target)) return { state: 'unscheduled', title: 'Next run is not scheduled', detail: 'Review the saved reporting schedule.' };
  const remaining = target - Number(now);
  if (remaining <= 0) return { state: 'due', title: 'Automatic report is due', detail: 'Refresh to see the latest run. Scheduled processing checks for due reports every 15 minutes.' };
  const minutes = Math.ceil(remaining / 60000);
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), rest = minutes % 60;
  const unit = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return { state: 'scheduled', title: 'Next automatic report', countdown: [days && unit(days, 'day'), (days || hours) && unit(hours, 'hour'), unit(rest, 'minute')].filter(Boolean).join(' · '), detail: 'Time until the next scheduled run. Processing may start within the following 15 minutes.' };
}
