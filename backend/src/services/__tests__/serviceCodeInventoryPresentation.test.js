import { describe, expect, it } from 'vitest';
import { medicalCatalogActiveChoice, planTestingInventoryReferences, serviceCodeInventoryPresentation } from '../serviceCodeInventoryPresentation.js';
import { TESTING_SERVICE_CODES } from '../../content/testingServicePolicy.js';
import { agencyDocumentPresentation } from '../documentAgencyBranding.js';
describe('visible service inventory preserves clinical setup', () => {
  it.each(['itsco', 'nlu', 'tisi'])('adds missing references for %s without billing activation or overwriting saved services', slug => {
    const saved = [{ service_code: '96130', is_active: 1, unit_calc_mode: 'CUSTOM_BANDS' }, { service_code: 'H0004', is_active: 0 }];
    const plan = planTestingInventoryReferences({ id: 6, slug }, saved);
    expect(plan).toHaveLength(TESTING_SERVICE_CODES.length - 2);
    expect(plan.some(row => ['96130', 'H0004'].includes(row.serviceCode))).toBe(false);
    expect(plan.every(row => row.isActive === false && row.unitCalcMode === 'NONE' && row.unitMinutes === null)).toBe(true);
    expect(planTestingInventoryReferences({ id: 6, slug }, [...saved, ...plan])).toEqual([]);
    expect(saved[0]).toEqual({ service_code: '96130', is_active: 1, unit_calc_mode: 'CUSTOM_BANDS' });
  });
  it('does not seed unrelated practices or infer membership from a display name', () => {
    expect(planTestingInventoryReferences({ id: 99, slug: 'unrelated', name: 'ITSCO' })).toEqual([]);
  });
  it('uses component work rather than a leading 9 to classify pay', () => {
    expect(serviceCodeInventoryPresentation('96130')).toMatchObject({ group: 'testing-evaluation', payBucket: 'credit', requiredRole: 'psychological_testing', medicaidOnly: true });
    expect(serviceCodeInventoryPresentation('96136')).toMatchObject({ group: 'testing-administration', payBucket: 'hcode', requiredRole: 'psychological_testing' });
    expect(serviceCodeInventoryPresentation('98966')).toMatchObject({ group: 'direct-care', payBucket: 'hcode', requiredRole: null });
    expect(serviceCodeInventoryPresentation('H0004')).toMatchObject({ group: 'direct-care', requiredRole: null });
    expect(serviceCodeInventoryPresentation('99414').group).toBe('indirect');
    expect(serviceCodeInventoryPresentation('99051').group).toBe('addon');
    expect(serviceCodeInventoryPresentation('H2014')).toMatchObject({group:'program',payLabel:'Approved H2014 program schedule'});
    expect(serviceCodeInventoryPresentation('96137').baseCode).toBe('96136');
    expect(serviceCodeInventoryPresentation('98966').claimTiming).toContain('5–10 minutes');
    expect(serviceCodeInventoryPresentation('98967').claimTiming).toContain('11–20 minutes');
    expect(serviceCodeInventoryPresentation('98968').claimTiming).toContain('21–30 minutes');
    expect(serviceCodeInventoryPresentation('H0004').claimTiming).toContain('15-minute');
    for (const definition of TESTING_SERVICE_CODES) expect(serviceCodeInventoryPresentation(definition.code).claimTiming).not.toMatch(/null|undefined/);
  });
  it('preserves inactivity unless an explicit enable choice is supplied', () => {
    expect(medicalCatalogActiveChoice(undefined, { isActive: false }, '96136')).toBe(false);
    expect(medicalCatalogActiveChoice(undefined, null, '96136')).toBe(false);
    expect(medicalCatalogActiveChoice(undefined, { isActive: true }, '96136')).toBe(true);
    expect(medicalCatalogActiveChoice(true, { isActive: false }, '96136')).toBe(true);
    expect(medicalCatalogActiveChoice('false', { isActive: true }, '96136')).toBe(false);
    expect(() => medicalCatalogActiveChoice('maybe', null, '96136')).toThrow('Choose whether');
  });
});
describe('agency document metadata', () => {
  it('uses only actual valid public palette fields and leaves original metadata unchanged', () => {
    const presentation = { theme: 'isi-foundations', primaryColor: '#145A3D', arbitrary: 'kept' };
    const result = agencyDocumentPresentation({ id: 377, slug: 'tisi', color_palette: { primary: '#0F172A', secondary: '#1E40AF', accent: '#F97316', secret: 'omit' } }, presentation);
    expect(result).toMatchObject({ primaryColor: '#0F172A', accentColor: '#F97316', arbitrary: 'kept', agencyBrand: { agencyId: 377, agencySlug: 'tisi', primary: '#0F172A', secondary: '#1E40AF', accent: '#F97316' } });
    expect(result.agencyBrand.secret).toBeUndefined();expect(presentation.primaryColor).toBe('#145A3D');
  });
});
