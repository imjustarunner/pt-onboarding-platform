export function normalizedIntakeFormat(value) {
  const format = String(value || '').trim().toUpperCase().replace(/[ -]/g, '_');
  if (['VIRTUAL', 'TELEHEALTH', 'ONLINE'].includes(format)) return 'VIRTUAL';
  if (['IN_PERSON', 'OFFICE', 'IN_OFFICE'].includes(format)) return 'IN_PERSON';
  return 'ALL';
}

function normalizedStatus(value) {
  const status = String(value || '').toLowerCase();
  if (['accepting', 'open', 'available'].includes(status)) return 'open';
  if (status === 'waitlist') return 'waitlist';
  if (['closed', 'unavailable', 'not_accepting'].includes(status)) return 'closed';
  return null;
}

export function intakeProviderStatus(provider = {}, modality = 'ALL') {
  const format = normalizedIntakeFormat(modality);
  const byFormat = provider.intakeStatusByFormat || provider.agencyAvailability?.intakeStatusByFormat;
  if (byFormat && typeof byFormat === 'object') {
    const formats = format === 'ALL' ? ['IN_PERSON', 'VIRTUAL'] : [format];
    const statuses = formats.map(key => normalizedStatus(byFormat[key])).filter(Boolean);
    if (statuses.includes('open')) return 'open';
    if (statuses.includes('waitlist')) return 'waitlist';
    if (statuses.length) return 'closed';
  }
  const explicit = normalizedStatus(provider.intakeStatus || provider.availabilityStatus);
  if (explicit) return explicit;
  if (provider.acceptingNewClients === true) return 'open';
  if (provider.waitlist === true) return 'waitlist';
  if (provider.acceptingNewClients === false) return 'closed';
  return 'open';
}

export function providerSessionFormats(provider = {}, modality = 'ALL') {
  const selected = normalizedIntakeFormat(modality);
  const byFormat = provider.intakeStatusByFormat || provider.agencyAvailability?.intakeStatusByFormat;
  const supplied = provider.sessionFormats || provider.details?.sessionFormats || provider.profile?.details?.sessionFormats || [];
  const formats = new Set((Array.isArray(supplied) ? supplied : []).map(normalizedIntakeFormat).filter(value => value !== 'ALL'));
  if (provider.inOfficeAvailable || provider.inPersonEnabled || provider.office || provider.openOfficeSlots > 0) formats.add('IN_PERSON');
  if (provider.virtualEnabled || provider.virtual || provider.openVirtualSlots > 0) formats.add('VIRTUAL');
  if (byFormat) {
    for (const key of ['IN_PERSON', 'VIRTUAL']) {
      if (['open', 'waitlist'].includes(normalizedStatus(byFormat[key]))) formats.add(key);
      else if (normalizedStatus(byFormat[key]) === 'closed') formats.delete(key);
    }
  }
  return ['IN_PERSON', 'VIRTUAL']
    .filter(key => formats.has(key) && (selected === 'ALL' || key === selected))
    .map(key => key === 'IN_PERSON' ? 'In person' : 'Virtual');
}

export function providerPhoto(provider = {}) {
  return provider.profilePhotoUrl || provider.photoUrl || provider.profile_photo_url || '';
}

export function providerInitials(provider = {}) {
  return String(provider.displayName || provider.name || 'Provider').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}
