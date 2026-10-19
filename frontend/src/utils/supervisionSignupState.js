function instant(value) {
  if (value instanceof Date) return +value;
  if (!value) return NaN;
  const raw=String(value).trim();
  return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? `${raw.replace(' ','T')}Z` : raw);
}

export function supervisionSignupState(event, now=Date.now()) {
  const mode=String(event?.enrollmentMode || '').toLowerCase();
  if (mode!=='signup_only' && !event?.isOpenJoinOffering) return 'none';
  if (['CANCELLED','CANCELED'].includes(String(event?.status || '').toUpperCase())) return 'cancelled';
  if (mode!=='signup_only' && event?.isOpenJoinOffering) return now < instant(event.endAt) ? 'open' : 'closed';
  const start=instant(event.startAt);
  // Derive from this occurrence for older cached payloads as well. Do not use a
  // copied deadline belonging to a previous occurrence or the browser timezone.
  if (!Number.isFinite(start)) return 'closed';
  if (now < start-24*3600000) return 'upcoming';
  return now < start-3600000 ? 'open' : 'closed';
}

export function supervisionSignupLabel(event, now=Date.now()) {
  const state=supervisionSignupState(event,now);
  if(state==='cancelled')return 'Canceled';
  if(event?.viewerSignedUp)return 'Signed up';
  if(state==='upcoming')return 'Signup opens 24 hours before';
  if(state==='open')return event?.enrollmentMode === 'signup_only' ? 'Sign up · Closes 1 hour before' : 'Sign up to attend';
  return 'Signup closed';
}
