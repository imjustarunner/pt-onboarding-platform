const object = value => {
  if (typeof value === 'string') { try { return JSON.parse(value) || {}; } catch { return {}; } }
  return value && typeof value === 'object' ? value : {};
};

const norm = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const digits = value => String(value || '').replace(/\D/g, '').slice(-10);
const day = value => String(value || '').slice(0, 10);

// A matching name alone is not enough; one more identifier must also match.
function sameNameAndIdentifier(profile, client) {
  const profileName = norm(profile.fullName || `${profile.firstName || ''} ${profile.lastName || ''}`);
  if (!profileName || profileName !== norm(client?.full_name)) return false;
  const dob = day(profile.dateOfBirth);
  if (dob && dob === day(client?.date_of_birth)) return true;
  const email = norm(profile.email);
  if (email && email === norm(client?.email || client?.contact_email)) return true;
  const phone = digits(profile.phone);
  return phone.length === 10 && phone === digits(client?.contact_phone || client?.phone);
}

// A self portal link is a storage relationship, not a guardian relationship.
// Do not infer this from age or a matching name: adults can have real guardians.
export function intakeContactIsSelf(client, links = []) {
  const profile = client?.guardian_intake_profile;
  if (!profile) return false;
  const relationship = String(profile.relationship || '').trim().toLowerCase();
  if (relationship === 'self' || relationship === 'myself') return true;
  // Shared household email does not turn a named guardian relationship into
  // self. Only the old generic Guardian label may use a matching self link.
  if (relationship && relationship !== 'guardian') return false;
  const email = String(profile.email || '').trim().toLowerCase();
  if (email && links.some(link => String(link.relationship_type).toLowerCase() === 'self'
    && String(link.email || '').trim().toLowerCase() === email)) return true;
  const meta = object(client.adaptive_intake_meta_json || client.adaptiveMeta);
  const prefs = object(client.intake_preferences_json || client.intakePreferences);
  const respondentEmail = String(meta.respondent?.email || prefs.respondent?.email || '').trim().toLowerCase();
  // A self enrollment stored under the generic Guardian title is still the client.
  // A named relationship such as Mother stays a guardian even when emails match.
  if ((meta.whoFor || prefs.whoFor) === 'myself' && email && (!respondentEmail || respondentEmail === email)) return true;
  if (sameNameAndIdentifier(profile, client)) return true;
  if (relationship) return false;
  return (meta.whoFor || prefs.whoFor) === 'myself' && !!email && email === respondentEmail;
}
