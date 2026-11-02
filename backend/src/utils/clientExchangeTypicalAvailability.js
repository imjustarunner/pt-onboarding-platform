const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const periods = { morning:[0,720], afternoon:[720,1020], evening:[1020,1440], after_school:[900,1140], pm:[720,1440] };
const minutes = value => /^\d{2}:\d{2}$/.test(value || '') ? Number(value.slice(0,2))*60+Number(value.slice(3)) : null;

/** Typical hours describe possible fit, never a reserved or bookable appointment. */
export function typicalExchangeSchedule(details = {}, preferences = {}) {
  const schedule = preferences.schedule || {};
  if (!schedule.days?.length && !schedule.periods?.length && !schedule.windows?.length) return { known:false, reason:'No day or time preference was specified.' };
  // The existing typical-hours editor records in-office hours. Do not apply
  // those restrictions to virtual care or guess at arbitrary free-text hours.
  if (preferences.modality !== 'in_person') return { known:false, reason:'Confirm a suitable appointment time with the client. Typical office hours do not restrict virtual care.' };
  const labels = (details.typicalAvailability || []).filter(v => typeof v === 'string' && v.trim());
  if (!labels.length) return { known:false, reason:'Typical availability is not recorded. This does not count against a match; arrange a time with the client.' };
  if (schedule.timezone && schedule.timezone !== 'America/Denver') return { known:false, reason:'Confirm typical availability in the client’s requested time zone.' };
  const broadDays = new Set(), broadPeriods = [], windows = [];
  let unrecognized = false;
  for (const label of labels) {
    const value = label.trim().toLowerCase();
    if (value === 'weekdays' || value === 'weekends') { (value === 'weekdays' ? days.slice(0,5) : days.slice(5)).forEach(d => broadDays.add(d)); continue; }
    const period = value.replace(/s$/, '');
    if (periods[period]) { broadPeriods.push(periods[period]); continue; }
    const day = days.find(d => value === d.toLowerCase());
    if (day) { broadDays.add(day); continue; }
    const pair = value.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday) (mornings?|afternoons?|evenings?)$/);
    if (pair) { windows.push({days:[days.find(d => d.toLowerCase() === pair[1])], range:periods[pair[2].replace(/s$/, '')]}); continue; }
    unrecognized = true;
  }
  if (broadDays.size || broadPeriods.length) for (const range of broadPeriods.length ? broadPeriods : [[0,1440]]) windows.push({days:broadDays.size ? [...broadDays] : days, range});
  const requestedDays = schedule.days?.length ? schedule.days : days;
  const requestedPeriods = schedule.periods?.length ? schedule.periods.map(p => periods[p]).filter(Boolean) : [[0,1440]];
  const requestedWindows = schedule.windows?.length ? schedule.windows : [{start:'00:00',end:'24:00'}];
  const overlap = windows.some(w => requestedDays.some(day => w.days.includes(day) && requestedWindows.some(request => {
    if (request.day && request.day !== day) return false;
    const start = minutes(request.start), end = request.end ? minutes(request.end) : start == null ? null : start+1;
    if (start == null || end == null) return false;
    return requestedPeriods.some(p => Math.max(w.range[0],p[0],start) < Math.min(w.range[1],p[1],end));
  })));
  const client = [schedule.days?.join(', '), schedule.periods?.join(', '), schedule.windows?.map(w => `${w.day || 'any day'} ${w.start}${w.end ? `–${w.end}` : ''}`).join('; ')].filter(Boolean).join(' · ');
  const reason = `Client requests ${client}. Provider’s typical in-office availability: ${labels.join('; ')}.`;
  if (overlap) return {known:true, matches:true, reason:`${reason} Typical availability overlaps; agree on an actual appointment time.`};
  if (unrecognized || !windows.length) return {known:false, reason:`${reason} Confirm these hours with the provider; no schedule mismatch is assumed.`};
  return {known:true, matches:false, reason:`${reason} These days or times do not overlap. You may request this client if you can arrange a suitable time; Support must review the difference.`};
}
