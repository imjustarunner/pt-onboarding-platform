import { describe, expect, it } from 'vitest';
import { auricwellSettingsLocation, buildAuricWellOperations, canManageAuricWell } from '../auricwellManagement.js';
import { buildSettingsSearchTargets, filterSettingsSearchTargets } from '../settingsSearchCatalog.js';

const agency = { id: 12, slug: 'practice-a', feature_flags: { medicalBillingEnabled: true, schoolPortalsEnabled: true } };
const admin = { role: 'admin', billingAgencyIds: [12] };
const operations = (user = admin, practice = agency) => buildAuricWellOperations({ user, agency: practice });

describe('AuricWell management operations', () => {
  it('requires an administered organization and limits the preview to superadmin', () => {
    for (const role of ['provider', 'support', 'staff', 'client_guardian']) {
      expect(canManageAuricWell({ role }, agency)).toBe(false);
      expect(operations({ role })).toEqual([]);
    }
    expect(buildAuricWellOperations({ user: admin, agency: null })).toEqual([]);
    expect(operations().some(item => item.id === 'preview')).toBe(false);
    expect(operations({ role: 'super_admin' }).find(item => item.id === 'preview').href).toBe('/auricwell/app/practice-a/overview');
  });

  it('keeps tenant identity on existing workflows and the transition plan', () => {
    const items = operations();
    const transition = items.find(item => item.id === 'transition');
    expect(transition.status).toBe('Transition workspace');
    expect(transition.href).toBe('/practice-a/admin/settings?agencyId=12&category=auricwell&item=auricwell-transition');
    expect(items.find(item => item.id === 'providers').href).toBe('/practice-a/admin/providers?agencyId=12');
    expect(items.find(item => item.id === 'records-requests').href).toBe('/records-manager?agencyId=12');
    expect(auricwellSettingsLocation({ id: 12 }).path).toBe('/admin/settings');
  });

  it('does not expose billing for another agency or when disabled', () => {
    expect(operations({ role: 'admin', billingAgencyIds: [99] }).some(item => item.id === 'billing')).toBe(false);
    expect(operations().some(item => item.id === 'billing')).toBe(true);
    expect(operations(admin, { ...agency, feature_flags: { medicalBillingEnabled: false } }).some(item => item.id === 'billing')).toBe(false);
  });

  it('follows disabled clinical and school features without hiding ordinary workflows', () => {
    const items = operations(admin, { ...agency, feature_flags: { noteAidEnabled: false, clinicalNoteGeneratorEnabled: false, schoolPortalsEnabled: false } });
    expect(items.some(item => item.id === 'documentation' || item.id === 'schools')).toBe(false);
    expect(items.some(item => item.id === 'clients')).toBe(true);
    const override = operations(admin, { ...agency, tenant_available_agency_features_json: { schoolPortalsEnabled: false } });
    expect(override.some(item => item.id === 'schools')).toBe(false);
  });

  it('retains session and clinical form permissions while exposing existing family and intake tools', () => {
    expect(operations().some(item => item.id === 'sessions' || item.id === 'clinical-forms')).toBe(false);
    const enabled = operations({ ...admin, capabilities: { canViewLibrary: true } }, { ...agency, feature_flags: { sessionRecordingEnabled: true } });
    expect(enabled.some(item => item.id === 'sessions')).toBe(true);
    expect(enabled.some(item => item.id === 'clinical-forms')).toBe(true);
    expect(enabled.filter(item => ['guardians', 'forms', 'office-approvals'].includes(item.id))).toHaveLength(3);
  });

  it('makes the transition discoverable by migration, insurance, and agenda terms', () => {
    const targets = buildSettingsSearchTargets({ catalogItems: [{ id: 'auricwell-transition', label: 'EHR Transition', categoryId: 'auricwell', categoryLabel: 'AURICWELL' }] });
    for (const query of ['TherapyNotes migration', 'insurance import', 'weekly agenda', 'additional contacts']) {
      expect(filterSettingsSearchTargets(query, targets).some(item => item.id === 'auricwell-transition')).toBe(true);
    }
  });
});
