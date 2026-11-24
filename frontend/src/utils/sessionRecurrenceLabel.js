import {RECURRENCE_LABELS} from './scheduleRecurrence';

export function sessionRecurrenceLabel(session) {
  if (!session) return 'Recurrence not recorded';
  const frequency = String(session.recurrenceFrequency || '').toUpperCase();
  if (frequency === 'ONCE') return 'One-time session';
  if (RECURRENCE_LABELS[frequency]) return `Repeats · ${RECURRENCE_LABELS[frequency]}`;
  return session.recurrenceSeriesId ? 'Repeats · Frequency not recorded' : 'One-time session';
}
