export function providerAvailabilityPreferences(user, profile = {}) {
 const details = profile?.details || {};
 return {
  acceptingNewClients: Boolean(profile?.acceptingNewClientsOverride ?? user?.provider_accepting_new_clients ?? true),
  inPerson: typeof details.inPersonEnabled === 'boolean' ? details.inPersonEnabled : Boolean(user?.in_office_available || details.officeAvailability === 'accepting'),
  virtual: typeof details.virtualEnabled === 'boolean' ? details.virtualEnabled : (details.sessionFormats || []).some(v => /virtual|telehealth|online/i.test(v))
 };
}
export function missingAvailabilityFormats(preferences, slots, now = Date.now()) {
 const future = list => (list || []).some(s => Date.parse(s.startAt) > now && Date.parse(s.endAt) > Date.parse(s.startAt));
 if (!preferences.acceptingNewClients) return [];
 return [['IN_PERSON',preferences.inPerson,slots.inPersonSlots],['VIRTUAL',preferences.virtual,slots.virtualSlots]]
  .filter(([,enabled,list]) => enabled && !future(list)).map(([format]) => format);
}
export const availabilitySettingsPath = (providerId, agencyId) => `/admin/users/${Number(providerId)}?agencyId=${Number(agencyId)}&section=public-profile`;

// Existing profiles retain their established schedule behavior until explicit format choices are saved.
export function publicFormatEnabled(profile, format, bookingMode='NEW_CLIENT') {
 if(bookingMode!=='NEW_CLIENT')return true;
 if(profile?.acceptingNewClientsOverride===false || profile?.acceptingNewClientsOverride===0)return false;
 const details=profile?.details||{};
 return details[format==='VIRTUAL'?'virtualEnabled':'inPersonEnabled']!==false;
}
