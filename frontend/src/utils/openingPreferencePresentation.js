import { availabilityLabel } from './availabilityLabel';

export function openingPreferencePresentation(opening, locale = 'en-US') {
  if (!opening?.startAt) return null;
  const start = new Date(opening.startAt), end = new Date(opening.endAt);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) return null;
  let timeZone = opening.timeZone || 'America/Denver';
  try { new Intl.DateTimeFormat(locale, { timeZone }).format(start); }
  catch { timeZone = 'America/Denver'; }
  const spanish = locale.startsWith('es');
  const time = value => new Intl.DateTimeFormat(locale, { hour:'numeric', minute:'2-digit', timeZone }).format(value);
  return {
    date: new Intl.DateTimeFormat(locale, { weekday:'long', month:'long', day:'numeric', year:'numeric', timeZone }).format(start),
    time: `${time(start)} – ${time(end)}`,
    timeZone,
    setting: opening.modality === 'VIRTUAL' ? 'Virtual' : opening.buildingName || (spanish ? 'En persona' : 'In person'),
    frequency: spanish
      ? ({ ONCE:'Una vez', WEEKLY:'Semanal', BIWEEKLY:'Cada 2 semanas', EVERY_3_WEEKS:'Cada 3 semanas', EVERY_4_WEEKS:'Cada 4 semanas', MONTHLY:'Mensual', EITHER:'Semanal / cada 2 semanas' }[opening.frequency] || 'Horario recurrente')
      : opening.frequency === 'MONTHLY' ? 'Monthly' : availabilityLabel(opening)
  };
}
