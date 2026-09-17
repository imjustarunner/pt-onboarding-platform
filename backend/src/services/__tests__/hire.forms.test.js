import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import { hireFormDefinitions } from '../hireFormDefinitions.service.js';
import { validateHireDocumentFields, assertHireFormReady } from '../../utils/hireDocumentFields.js';
describe('employee forms', () => {
  it.each([['w4_2026.pdf', 'w4'], ['i9_2025.pdf', 'i9'], ['directdepositform.pdf', 'direct_deposit'], ['Health_Insurance_Opt_In_Out__1_.pdf', 'health_election']])('maps %s onto existing PDF pages', async (file, kind) => {
    const fields = await hireFormDefinitions(await fs.readFile(new URL(`../../assets/hireOnboarding/itsco/${file}`, import.meta.url)), kind);
    expect(fields.some(f => f.type === 'signature' && f.page === 1)).toBe(true);
    expect(fields.filter(f => f.required).length).toBeGreaterThan(2);
    for (const f of fields.filter(f => f.x != null)) { expect(f.x).toBeGreaterThanOrEqual(0); expect(f.y).toBeGreaterThanOrEqual(0); expect(f.page).toBeGreaterThan(0); }
    if (kind === 'i9') expect(fields.map(f => f.label).join(' ')).not.toMatch(/Employer|Document Title|Preparer/);
  });
  it('requires answers and rejects forged select values before accepting a signature', () => {
    const fields = [{ id: 'name', label: 'Legal name', type: 'text', required: true }, { id: 'election', label: 'Coverage election', type: 'select', required: true, options: [{ value: 'in' }, { value: 'out' }] }];
    expect(() => validateHireDocumentFields(fields, { election: 'in' })).toThrow('Legal name');
    expect(() => validateHireDocumentFields(fields, { name: 'Taylor', election: 'invalid' })).toThrow('valid option');
    expect(() => validateHireDocumentFields(fields, { name: 'Taylor', election: 'out' })).not.toThrow();
  });
  it('requires work-authorization identification only for the applicable I-9 choice', async () => {
    const fields = await hireFormDefinitions(await fs.readFile(new URL('../../assets/hireOnboarding/itsco/i9_2025.pdf', import.meta.url)), 'i9');
    const conditional = fields.filter(f => f.requiredOneOf);
    expect(() => validateHireDocumentFields(conditional, { citizenship_status: '1' })).not.toThrow();
    expect(() => validateHireDocumentFields(conditional, { citizenship_status: '4' })).toThrow('identification');
    expect(() => validateHireDocumentFields(conditional, { citizenship_status: '4', 'USCIS ANumber': '123456789' })).not.toThrow();
  });
  it('blocks legacy payroll PDFs with no employee input fields', () => {
    expect(() => assertHireFormReady({ name: 'Form W-4', document_action_type: 'signature', field_definitions: [] })).toThrow('Configure');
    expect(() => assertHireFormReady({ name: 'Employment Agreement', document_action_type: 'signature', field_definitions: [{ type: 'signature' }] })).not.toThrow();
  });
});
