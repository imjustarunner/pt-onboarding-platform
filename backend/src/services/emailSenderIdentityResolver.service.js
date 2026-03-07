import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function pickPreferredSenderIdentity(list = [], preferredKeys = []) {
  const normalizedPreferred = (preferredKeys || []).map(normalizeKey).filter(Boolean);
  for (const key of normalizedPreferred) {
    const match = (list || []).find((identity) => normalizeKey(identity?.identity_key) === key);
    if (match) return match;
  }
  return (list || [])[0] || null;
}

export async function resolvePreferredSenderIdentityForAgency({
  agencyId = null,
  preferredKeys = [],
  includePlatformDefaults = true,
  onlyActive = true
} = {}) {
  const aid = Number(agencyId || 0) || null;
  if (!aid && aid !== null) return null;
  const list = await EmailSenderIdentity.list({
    agencyId: aid,
    includePlatformDefaults,
    onlyActive
  });
  return pickPreferredSenderIdentity(list, preferredKeys);
}

export async function resolvePreferredSenderIdentityForSchoolThenAgency({
  schoolOrganizationId = null,
  agencyId = null,
  preferredKeys = [],
  includePlatformDefaults = true,
  onlyActive = true
} = {}) {
  const schoolId = Number(schoolOrganizationId || 0) || null;
  if (schoolId) {
    const schoolList = await EmailSenderIdentity.list({
      agencyId: schoolId,
      includePlatformDefaults,
      onlyActive
    });
    const schoolMatch = pickPreferredSenderIdentity(schoolList, preferredKeys);
    if (schoolMatch?.id) return schoolMatch;
  }
  return await resolvePreferredSenderIdentityForAgency({
    agencyId,
    preferredKeys,
    includePlatformDefaults,
    onlyActive
  });
}

