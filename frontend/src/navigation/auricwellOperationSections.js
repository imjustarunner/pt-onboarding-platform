// Group the already-authorized operations without creating another set of tools.
const areas = [
  { id: 'transition', label: 'EHR Transition', desc: 'Bring over providers, clients, records, and appointments.', tone: 'teal', icon: 'transition', operations: ['transition', 'providers'] },
  { id: 'clients', label: 'Clients & families', desc: 'Caseloads, intake, guardians, and family access.', tone: 'blue', icon: 'people', operations: ['clients', 'guardians', 'forms', 'office-clients'] },
  { id: 'clinical', label: 'Clinical records', desc: 'Documentation, medical files, and records requests.', tone: 'green', icon: 'records', operations: ['documentation', 'sessions', 'clinical-forms', 'medical-records', 'records-requests'] },
  { id: 'scheduling', label: 'Schedules & schools', desc: 'Appointments, school schedules, and office bookings.', tone: 'orange', icon: 'calendar', operations: ['schedule', 'schools', 'office-schedule', 'office-approvals', 'provider-scheduling'] },
  { id: 'billing', label: 'Billing & insurance', desc: 'Insurance, claims, practice fees, and billing setup.', tone: 'indigo', icon: 'billing', operations: ['billing', 'billing-settings', 'fees', 'service-codes', 'pricing'] },
  { id: 'practice', label: 'Practice operations', desc: 'Communications, locations, and practice settings.', tone: 'cyan', icon: 'settings', operations: ['communications', 'practice-settings', 'features', 'preview'] }
];

const titles = {
  providers: 'Providers & imports', clients: 'Clients & caseloads', guardians: 'Families & guardians',
  forms: 'Digital intake & forms', 'office-clients': 'Office clients & intake',
  'medical-records': 'Medical files & history', 'records-requests': 'Records requests',
  schedule: 'Provider appointments', schools: 'School schedules & portals',
  'office-schedule': 'Office rooms & schedules', 'office-approvals': 'Booking approvals',
  'provider-scheduling': 'Scheduling settings', 'billing-settings': 'Billing settings',
  'service-codes': 'Service codes & rules', pricing: 'Practice pricing',
  'practice-settings': 'Practice details & locations', features: 'Practice features'
};

export function buildAuricWellOperationSections(operations = []) {
  const byId = new Map(operations.map(operation => [operation.id, operation]));
  return areas.map(area => ({
    ...area,
    cards: area.operations.filter(id => byId.has(id)).map(id => ({
      ...byId.get(id), title: titles[id] || byId.get(id).label, shortDesc: byId.get(id).description,
      to: byId.get(id).href, tone: area.tone, icon: area.icon
    }))
  })).filter(area => area.cards.length);
}
