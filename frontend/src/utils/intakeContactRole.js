const object = value => {
  if (typeof value === 'string') { try { return JSON.parse(value) || {}; } catch { return {}; } }
  return value && typeof value === 'object' ? value : {};
};

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
  if (relationship) return false;
  const meta = object(client.adaptive_intake_meta_json || client.adaptiveMeta);
  const prefs = object(client.intake_preferences_json || client.intakePreferences);
  return (meta.whoFor || prefs.whoFor) === 'myself' && !!email
    && email === String(meta.respondent?.email || '').trim().toLowerCase();
}
