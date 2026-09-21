import {agencyFormatAllowed} from './providerAgencyAvailability.js';
export function providerAvailabilityPreferences(user, profile = {}) {
 const details = profile?.details || {};
 if(profile?.agencyAvailability)return {...profile.agencyAvailability};
 const seesClients = ![false,0,'0'].includes(user?.sees_clients ?? true);
 return {
  seesClients,
  waitlistEnabled: details.waitlistEnabled === true,
  acceptingNewClients: Boolean(user?.provider_accepting_new_clients ?? profile?.acceptingNewClientsOverride ?? true),
  inPerson: typeof details.inPersonEnabled === 'boolean' ? details.inPersonEnabled : Boolean(user?.in_office_available || details.officeAvailability === 'accepting'),
  virtual: typeof details.virtualEnabled === 'boolean' ? details.virtualEnabled : (details.sessionFormats || []).some(v => /virtual|telehealth|online/i.test(v))
 };
}
export function missingAvailabilityFormats(preferences, slots, now = Date.now()) {
 const future = list => (list || []).some(s => Date.parse(s.startAt) > now && Date.parse(s.endAt) > Date.parse(s.startAt));
 if (preferences.seesClients === false || !preferences.acceptingNewClients) return [];
 return [['IN_PERSON',preferences.inPerson,slots.inPersonSlots],['VIRTUAL',preferences.virtual,slots.virtualSlots]]
  .filter(([,enabled,list]) => enabled && !future(list)).map(([format]) => format);
}
export const availabilitySettingsPath = (providerId, agencyId) => `/admin/users/${Number(providerId)}?agencyId=${Number(agencyId)}&section=public-profile`;

// Kept as the shared format hook for booking callers; published intake slots drive eligibility.
export function publicFormatEnabled(profile, format, bookingMode='NEW_CLIENT') {
 // Actual intake-enabled schedule openings are authoritative. Closing intake
 // withdraws those publications, rather than hiding still-open times here.
 return agencyFormatAllowed(profile?.agencyAvailability,format,{intake:bookingMode!=='CURRENT_CLIENT'});
}
