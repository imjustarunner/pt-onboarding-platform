export const ABSENCE_REASONS = Object.freeze([
  { key: 'unforeseen', label: 'Unforeseen circumstances', phrase: 'unforeseen circumstances', category: 'provider_unavailable' },
  { key: 'illness', label: 'Illness', phrase: 'illness', category: 'illness' },
  { key: 'family_emergency', label: 'Family emergency', phrase: 'a family emergency', category: 'emergency' },
  { key: 'weather', label: 'Weather', phrase: 'weather conditions', category: 'weather' },
  { key: 'personal_emergency', label: 'Personal emergency', phrase: 'a personal emergency', category: 'emergency' },
  { key: 'transportation', label: 'Transportation', phrase: 'a transportation issue', category: 'provider_unavailable' }
]);

const CRISIS = 'If this is an emergency, call 911. If you are in crisis, call 988.';

export function absenceReason(key) {
  return ABSENCE_REASONS.find(reason => reason.key === key) || ABSENCE_REASONS[0];
}

export function reasonKeyFor(reasonCategory, reason = '') {
  const text = `${reasonCategory || ''} ${reason || ''}`;
  if (/family emergency/i.test(text)) return 'family_emergency';
  if (/transport/i.test(text)) return 'transportation';
  if (/personal emergency/i.test(text)) return 'personal_emergency';
  if (reasonCategory === 'illness' || /unwell|illness/i.test(text)) return 'illness';
  if (reasonCategory === 'weather' || /weather/i.test(text)) return 'weather';
  return 'unforeseen';
}

export function becauseClause(reasonCategory, reason = '', note = '') {
  const custom = String(note || '').trim().slice(0, 500);
  if (custom) {
    if (/^(i |i'm |we )/i.test(custom) || /[.!?]$/.test(custom)) return custom.replace(/[.]+$/, '');
    return `because of ${custom.replace(/^because of /i, '').replace(/[.]+$/, '')}`;
  }
  return `because of ${absenceReason(reasonKeyFor(reasonCategory, reason)).phrase}`;
}

function sessionPhrase({ audience, clientName, schoolName, when, wholeDay = true }) {
  if (audience === 'school') return `${wholeDay ? 'my sessions' : 'the selected sessions'} at your school on ${when}`;
  const place = schoolName ? ` at ${schoolName}` : '';
  if (audience === 'guardian') return `the session for ${clientName || 'your child'} on ${when}${place}`;
  return `our session on ${when}${place}`;
}

export function composeAbsenceLetter({ audience = 'client', providerAuthored = true, providerName = 'Your provider', clientName, schoolName, when, reasonCategory, reason, note, wholeDay = true }) {
  const because = becauseClause(reasonCategory, reason, note);
  const session = sessionPhrase({ audience, clientName, schoolName, when, wholeDay });
  const safety = `\n\n${CRISIS}`;
  if (audience === 'school') {
    return providerAuthored
      ? { subject: `Schedule change for ${when}`, text: `Hello, ${schoolName || 'school'} team,\n\nUnfortunately, ${because}, I need to cancel ${session}. I apologize for the change and appreciate your understanding.\n\nI am notifying my clients and their families of my absence.${safety}\n\n${providerName}` }
      : { subject: `Schedule change for ${when}`, text: `Hello, ${schoolName || 'school'} team,\n\n${providerName} has let us know they will not be able to attend on ${when}, ${because}. We are contacting their clients and families to inform them of the absence.${safety}\n\nSchools Team` };
  }
  if (!providerAuthored) {
    const who = audience === 'guardian' ? `the session for ${clientName || 'your child'}` : 'the scheduled session';
    return { subject: `Session canceled — ${when}`, text: `Hello,\n\n${providerName} has let us know they are unable to attend ${who} on ${when}, ${because}. We have canceled it and are sorry for the change.${safety}\n\nYour care team` };
  }
  const voice = audience === 'guardian'
    ? 'I am writing to you as the parent or guardian.'
    : 'I am writing to you directly about your session.';
  return { subject: `Session canceled — ${when}`, text: `Hello,\n\nUnfortunately, ${because}, I need to cancel ${session}. I apologize for the change and appreciate your understanding.\n\n${voice}${safety}\n\n${providerName}` };
}

export function parentCancellationSms(portalUrl) {
  const link = String(portalUrl || '').trim() || 'your client portal';
  return `Your provider has canceled today's session. Log in to ${link} for any additional updates. Reply NOREMIND to stop reminders. Reply STOP to stop all texts.`;
}

export function restyleAbsenceLetter(text, tone = 'regenerate') {
  let next = String(text || '').trim();
  if (!next) return next;
  if (tone === 'shorter') {
    next = next.replace(/\n\nI apologize for the change and appreciate your understanding\./, '')
      .replace(/\n\nI am writing to you as the parent or guardian\./, '')
      .replace(/\n\nI am writing to you directly about your session\./, '')
      .replace(/\n\nThank you for your flexibility\./, '');
  } else if (tone === 'longer' && !next.includes('Thank you for your flexibility.')) {
    next = next.replace(`\n\n${CRISIS}`, `\n\nThank you for your flexibility.\n\n${CRISIS}`);
  } else if (tone === 'formal') {
    next = next.replaceAll('I apologize for the change and appreciate your understanding.', 'Please accept my apology for this change.')
      .replaceAll("I'm sorry", 'I apologize');
  } else if (tone === 'warmer') {
    next = next.replaceAll('I apologize for the change and appreciate your understanding.', 'I am sorry for the short notice, and I appreciate you working with me.');
  }
  if (!next.includes('call 911') || !next.includes('988')) next = `${next}\n\n${CRISIS}`;
  return next.replace(/\n{3,}/g, '\n\n').trim();
}
