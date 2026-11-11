import { canAccessMedicalBilling, isMedicalBillingEnabled } from '../config/medicalBillingAccess.js';
import { canAccessSchoolPortalsSurfaces, parseFeatureFlags } from '../utils/schoolPortalsAccess.js';
import { canUseSessionRecordingRole, isSessionRecordingEnabledForAgencyFlags } from '../config/sessionRecordingAccess.js';

export function canManageAuricWell(user, agency) {
  return !!Number(agency?.id) && ['admin', 'super_admin'].includes(String(user?.role || '').toLowerCase());
}

export function auricwellSettingsLocation(agency, item = 'auricwell-management') {
  const slug = String(agency?.slug || agency?.portal_url || '').trim();
  return {
    path: slug ? `/${encodeURIComponent(slug)}/admin/settings` : '/admin/settings',
    query: { agencyId: String(agency?.id || ''), category: 'auricwell', item }
  };
}

function href(location) {
  return `${location.path}?${new URLSearchParams(location.query)}`;
}

/** Links reuse shared workflows and their existing access checks. No migration state is inferred. */
export function buildAuricWellOperations({ user, agency, platformBranding = {}, appBase = '/auricwell/app' } = {}) {
  if (!canManageAuricWell(user, agency)) return [];
  const slug = String(agency.slug || agency.portal_url || '').trim();
  const prefix = slug ? `/${encodeURIComponent(slug)}` : '';
  const scoped = (path) => `${prefix}${path}?agencyId=${encodeURIComponent(agency.id)}`;
  const setting = (category, item) => href({ ...auricwellSettingsLocation(agency, item), query: { agencyId: String(agency.id), category, item } });
  const flags = parseFeatureFlags(agency.feature_flags ?? agency.featureFlags);
  const billing = canAccessMedicalBilling(user, agency.id) && isMedicalBillingEnabled(flags);
  const operations = [
    { id: 'transition', label: 'EHR Transition', description: 'Choose a provider, match existing clients, review chart and insurance paste, upload medical history, and import a weekly agenda.', href: href(auricwellSettingsLocation(agency, 'auricwell-transition')), status: 'Transition workspace' },
    { id: 'providers', label: 'Import providers & provider directory', description: 'Use the existing Import Providers action, then review provider identities and agency assignments.', href: scoped('/admin/providers'), status: 'Existing workflow' },
    { id: 'clients', label: 'Clients, caseloads & chart imports', description: 'Open existing clients or add clients; use the existing demographics, intake, and treatment plan paste tools.', href: scoped('/admin/clients'), status: 'Existing workflow' },
    { id: 'guardians', label: 'Families, guardians & portal access', description: 'Review guardian accounts and client relationships using the existing family tools.', href: scoped('/admin/guardians'), status: 'Existing workflow' },
    { id: 'forms', label: 'Digital intake & forms', description: 'Manage existing registration and intake links for clients and families.', href: scoped('/admin/digital-forms'), status: 'Existing workflow' },
    { id: 'communications', label: 'Practice communications', description: 'Open the existing communications workspace for staff and family coordination.', href: scoped('/admin/communications'), status: 'Existing workflow' },
    { id: 'schedule', label: 'Appointments & provider schedules', description: 'Review booked sessions and recurrence in the shared calendar.', href: scoped('/schedule'), status: 'Existing workflow' },
    { id: 'office-clients', label: 'Office clients & intake', description: 'Use the existing office caseload and intake tools.', href: scoped('/admin/office-clients'), status: 'Existing workflow' },
    { id: 'office-schedule', label: 'Office rooms & scheduling', description: 'Review shared room assignments and booked office appointments.', href: scoped('/buildings/schedule'), status: 'Existing workflow' },
    { id: 'office-approvals', label: 'Office booking approvals', description: 'Review existing office requests and scheduling approvals.', href: `${scoped('/admin/office-approvals')}&tab=requests`, status: 'Existing workflow' },
    { id: 'medical-records', label: 'Medical files & historical records', description: 'Open a client chart to review medical files and clinical history. Large PDF migration still needs acceptance testing.', href: scoped('/admin/clients'), status: 'Review PDF readiness' },
    { id: 'records-requests', label: 'Records requests & exports', description: 'Configure Records Managers and open requests with your assigned records permissions.', href: `/records-manager?agencyId=${encodeURIComponent(agency.id)}`, status: 'Existing workflow' },
    { id: 'provider-scheduling', label: 'Provider scheduling & rollout', description: 'Reuse provider scheduling settings and the existing appointment booking rollout controls.', href: setting('workflow', 'provider-scheduling'), status: 'Existing workflow' },
    { id: 'practice-settings', label: 'Practice identity & locations', description: 'Review the organization’s identity, contact information, and locations.', href: setting('general', 'business-details'), status: 'Existing settings' },
    { id: 'features', label: 'Practice features', description: 'Review enabled capabilities and organization preferences.', href: setting('general', 'tenant-features'), status: 'Existing settings' }
  ];
  if (flags.noteAidEnabled !== false || flags.clinicalNoteGeneratorEnabled !== false) {
    operations.push({ id: 'documentation', label: 'Clinical documentation', description: 'Open the shared Note Workspace for intake, treatment plans, and session notes.', href: scoped('/note-aid'), status: 'Existing workflow' });
  }
  if (isSessionRecordingEnabledForAgencyFlags(flags) && canUseSessionRecordingRole({ role: user.role, agencyId: agency.id })) {
    operations.push({ id: 'sessions', label: 'Session Recording', description: 'Open the enabled session tools using the existing recording and consent workflow.', href: scoped('/admin/session-recording'), status: 'Existing workflow' });
  }
  if (user.capabilities?.canViewLibrary) {
    operations.push({ id: 'clinical-forms', label: 'Clinical forms & safety plans', description: 'Open the shared clinical forms library with your existing library permission.', href: scoped('/clinical-forms'), status: 'Existing workflow' });
  }
  if (canAccessSchoolPortalsSurfaces({ userRole: user.role, agencyFeatureFlags: flags, platformAvailableAgencyFeaturesJson: platformBranding.available_agency_features_json ?? platformBranding.availableAgencyFeaturesJson, tenantAvailableAgencyFeaturesOverrideJson: agency.tenant_available_agency_features_json ?? agency.tenantAvailableAgencyFeaturesJson })) {
    operations.push({ id: 'schools', label: 'School schedules & portals', description: 'Review school caseloads and existing soft schedules alongside actual appointments.', href: scoped('/admin/school-portals-hub'), status: 'Review schedule linkage' });
  }
  if (billing) {
    operations.push({ id: 'billing', label: 'Billing & insurance', description: 'Use the shared billing workspace for insurance verification, claims, balances, and payer transition review.', href: scoped('/admin/medical-billing'), status: 'Existing workflow' });
    operations.push({ id: 'billing-settings', label: 'Billing practice settings', description: 'Review billing locations, practice NPIs, and places of service.', href: setting('general', 'billing-settings'), status: 'Existing settings' });
    operations.push({ id: 'fees', label: 'Fee schedules', description: 'Review practice charges and payer/provider fee schedules.', href: setting('general', 'fee-schedule'), status: 'Existing settings' });
    operations.push({ id: 'service-codes', label: 'Service code catalog & billing rules', description: 'Review clinical service codes, units, time bands, modifiers, and billing eligibility.', href: setting('general', 'service-codes'), status: 'Existing settings' });
    operations.push({ id: 'pricing', label: 'AuricWell pricing & practice costs', description: 'Review existing AuricWell cost planning, practice pricing, and billing setup.', href: `${scoped('/admin/medical-billing')}&billingSection=settings`, status: 'Existing workflow' });
  }
  if (String(user.role).toLowerCase() === 'super_admin' && slug) {
    operations.push({ id: 'preview', label: 'AuricWell practice preview', description: 'Open the current superadmin preview for this practice. Preview access does not establish cutover readiness.', href: `${appBase}/${encodeURIComponent(slug)}/overview`, status: 'Superadmin preview' });
  }
  return operations;
}
