const ADULT_CONSENT_MESSAGES = {
  en: 'Each adult must provide their own consent. This shared packet cannot yet collect separate adult signatures. Save your progress and contact the office to arrange separate enrollment and consent.',
  es: 'Cada adulto debe dar su propio consentimiento. Este paquete compartido aún no permite recoger las firmas de cada adulto por separado. Guarde su progreso y comuníquese con la oficina para coordinar la inscripción y el consentimiento por separado.'
};

function identityName(person = {}) {
  const name = person?.firstName && person?.lastName
    ? `${person.firstName} ${person.lastName}`
    : person?.fullName || person?.name || '';
  return String(name).trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function dateOnly(value) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

function isVerifiedMinor(person, today) {
  const dob = dateOnly(person?.dateOfBirth || person?.dob || person?.date_of_birth);
  if (!dob || dob > today) return false;
  let age = Number(today.slice(0, 4)) - Number(dob.slice(0, 4));
  if (today.slice(5) < dob.slice(5)) age -= 1;
  return age < 18;
}

/** A shared guardian signature is not a separate adult participant's consent. */
export function officeAdultConsentBlockMessage({
  serviceSubject, participants = [], primarySigner = {}, locale = 'en',
  asOf = new Date().toISOString().slice(0, 10)
} = {}) {
  const subject = String(serviceSubject || '').trim().toLowerCase();
  if (subject !== 'couple' && subject !== 'family') return '';
  const message = ADULT_CONSENT_MESSAGES[String(locale).toLowerCase().startsWith('es') ? 'es' : 'en'];
  // The current couple packet has one signer, regardless of a caller's claimed
  // shared-signature consent or any unverified per-adult signature metadata.
  if (subject === 'couple') return message;
  const today = dateOnly(asOf) || new Date().toISOString().slice(0, 10);
  const primaryName = identityName(primarySigner);
  const primaryDob = dateOnly(primarySigner?.dateOfBirth || primarySigner?.dob || primarySigner?.date_of_birth);
  let primaryUsed = false;
  for (const participant of Array.isArray(participants) ? participants : []) {
    if (isVerifiedMinor(participant, today)) continue;
    const dob = dateOnly(participant?.dateOfBirth || participant?.dob || participant?.date_of_birth);
    if (!primaryUsed && primaryName && primaryDob && primaryDob <= today
      && identityName(participant) === primaryName && dob === primaryDob) {
      primaryUsed = true;
      continue;
    }
    // An unknown age/identity cannot establish that guardian signing applies.
    return message;
  }
  return '';
}
