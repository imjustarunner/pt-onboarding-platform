/**
 * Shared audience options for Announcement Hub, User Directory, and other create surfaces.
 * Values must stay in sync with backend parseAudience / audienceMatchesRole.
 */
export const ANNOUNCEMENT_AUDIENCE_OPTIONS = [
  { value: 'specific_users', label: 'Specific User' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'providers', label: 'Providers' },
  { value: 'provider_plus', label: 'Provider Plus' },
  { value: 'cpa', label: 'CPA' },
  { value: 'everyone', label: 'All Staff' },
  { value: 'guardians', label: 'Guardians' },
  { value: 'school_staff', label: 'School Staff' }
];

export function announcementAudienceLabel(value, recipientCount = 0) {
  const aud = String(value || 'everyone');
  const opt = ANNOUNCEMENT_AUDIENCE_OPTIONS.find((o) => o.value === aud);
  if (opt) {
    if (aud === 'specific_users' && recipientCount > 0) {
      return recipientCount === 1 ? '1 specific user' : `${recipientCount} specific users`;
    }
    return opt.label;
  }
  if (aud === 'admin_staff') return 'Admin / Staff';
  if (recipientCount > 0) return `${recipientCount} recipients`;
  return aud;
}

export function needsAnnouncementUserPicker(audience) {
  return String(audience || '') === 'specific_users';
}
