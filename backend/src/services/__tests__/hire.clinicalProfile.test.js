import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks }));
import { CLINICAL_PROFILE_FIELDS, needsClinicalProfile, clinicalProfileForm, validateClinicalProfile } from '../../utils/hireClinicalProfile.js';
import { buildPortalWorkflow, savePortalStep, requiredSubmissionKeys } from '../hirePortalWorkflow.service.js';
import { listClinicalFacetsForUsers } from '../providerClinicalFacets.service.js';
process.env.GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');
const db = { execute: mocks.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
const empty = () => Object.fromEntries(CLINICAL_PROFILE_FIELDS.map(f => [f.key, []]));
const manifest = user => buildPortalWorkflow({ user: { id: 8, status: 'ONBOARDING', ...user }, agencyId: 2, tasks: [], prehireTasks: [], extras: {}, backgroundCheck: {}, journey: {} });
beforeEach(() => { vi.clearAllMocks(); mocks.getConnection.mockResolvedValue(db); mocks.execute.mockResolvedValue([[]]); });

describe('clinical profile onboarding', () => {
  it('provides the four distinct catalogs, including school specialties', () => {
    const form = clinicalProfileForm({ specialties: ['Executive Functioning'], reviewNeeded: [{ value: 'Old narrative' }] });
    expect(form.fields.map(f => f.key)).toEqual(['specialties_general', 'age_specialty', 'groups', 'modality']);
    expect(form.fields[0].options).toHaveLength(61);
    expect(form.fields[0].options).toContain('Transition to Adulthood');
    expect(form.fields[0].options).not.toContain('Play Therapy');
    expect(form.fields[2].options).not.toContain('Children');
    expect(form.values.specialties_general).toEqual(['Executive Functioning']);
    expect(form.reviewNeeded).toEqual([{ value: 'Old narrative' }]);
  });
  it('requires a review of all categories but does not force claims or accept arbitrary options', () => {
    expect(validateClinicalProfile(empty())).toEqual(empty());
    expect(() => validateClinicalProfile({ specialties_general: [] })).toThrow('client ages');
    expect(() => validateClinicalProfile({ ...empty(), groups: ['Children'] })).toThrow('populations');
    expect(() => validateClinicalProfile({ ...empty(), specialties_general: 'Anxiety' })).toThrow('specialties');
    expect(validateClinicalProfile({ ...empty(), specialties_general: ['Anxiety', 'Anxiety'], role: 'admin' })).toEqual({ ...empty(), specialties_general: ['Anxiety'] });
  });
  it('only includes the step in clinical staff onboarding', async () => {
    const workflow = await manifest({ role: 'provider' });
    expect(workflow.steps.pre_hire.map(s => s.kind)).not.toContain('clinical-profile');
    expect(workflow.steps.onboarding[1].kind).toBe('clinical-profile');
    expect(requiredSubmissionKeys(workflow.steps.onboarding)).toContain('clinical-profile');
    expect(needsClinicalProfile({ role: 'provider', sees_clients: 0 })).toBe(false);
    expect(needsClinicalProfile({ role: 'admin' })).toBe(false);
    expect(needsClinicalProfile({ role: 'admin', sees_clients: 1 })).toBe(true);
    expect(needsClinicalProfile({ role: 'guardian', sees_clients: 1 })).toBe(false);
    expect((await manifest({ role: 'client' })).steps.onboarding.map(s => s.kind)).not.toContain('clinical-profile');
  });
  it('does not add a requirement to a completed legacy journey', async () => {
    const workflow = await buildPortalWorkflow({ user: { id: 8, status: 'ONBOARDING', role: 'provider' }, agencyId: 2, tasks: [], prehireTasks: [], extras: {}, backgroundCheck: {}, journey: { onboardingCompletedAt: '2026-09-01' } });
    expect(workflow.steps.onboarding.map(s => s.kind)).not.toContain('clinical-profile');
  });
  it('keeps drafts out of the published profile and atomically saves confirmed answers to existing tenant fields', async () => {
    mocks.execute.mockImplementation(async sql => sql.startsWith('SELECT status') ? [[{ status: 'ONBOARDING' }]] : sql.includes('SELECT id FROM user_info_field_definitions') ? [[{ id: 31 }]] : [[]]);
    const args = { userId: 8, agencyId: 2, phase: 'onboarding', key: 'clinical-profile', value: { values: empty(), reviewed: true } };
    await savePortalStep({ ...args, complete: false });
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO user_info_values'))).toBe(false);
    vi.clearAllMocks();
    await savePortalStep(args);
    expect(mocks.execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO user_info_values'))).toHaveLength(4);
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO user_info_field_definitions'))).toBe(false);
    const fieldLookup = mocks.execute.mock.calls.find(([sql]) => sql.includes('SELECT id FROM user_info_field_definitions'));
    expect(fieldLookup[0]).toContain('agency_id = ? OR agency_id IS NULL');
    expect(fieldLookup[1]).toContain('provider_marketing_specialties');
    expect(db.commit).toHaveBeenCalled();
  });
  it('rolls back the step and shared answers together if a profile write fails', async () => {
    mocks.execute.mockImplementation(async sql => {
      if (sql.startsWith('SELECT status')) return [[{ status: 'ONBOARDING' }]];
      if (sql.includes('SELECT id FROM user_info_field_definitions')) return [[{ id: 31 }]];
      if (sql.includes('INSERT INTO user_info_values')) throw new Error('write failed');
      return [[]];
    });
    await expect(savePortalStep({ userId: 8, agencyId: 2, phase: 'onboarding', key: 'clinical-profile', value: { values: empty() } })).rejects.toThrow('write failed');
    expect(db.rollback).toHaveBeenCalled(); expect(db.commit).not.toHaveBeenCalled();
  });
  it('rejects edits after the onboarding phase closes', async () => {
    mocks.execute.mockImplementation(async sql => sql.startsWith('SELECT status') ? [[{ status: 'ONBOARDING' }]] : [[{ onboarding_completed_at: '2026-09-20' }]]);
    await expect(savePortalStep({ userId: 8, agencyId: 2, phase: 'onboarding', key: 'clinical-profile', value: { values: empty() } })).rejects.toMatchObject({ status: 409 });
    expect(mocks.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it('does not resurrect removed specialties from older surveys after an explicit clear', async () => {
    const database = { execute: vi.fn(async () => [[
      { user_id: 8, field_key: 'specialties_general', value_text: '[]' },
      { user_id: 8, field_key: 'pt_specialties_max25', value_text: '["Anxiety"]' },
      { user_id: 8, field_key: 'modality', value_text: '["Play Therapy"]' },
      { user_id: 8, field_key: 'treatment_prefs_max15', value_text: '["CBT"]' }
    ]]) };
    const facts = (await listClinicalFacetsForUsers([8], { agencyId: 2, database })).get(8);
    expect(facts.specialties).toEqual([]);
    expect(facts.modalities).toEqual(['Play Therapy']);
    expect(facts.summaryTags).not.toContain('Anxiety');
    expect(facts.reviewNeeded).toContainEqual({ group: 'specialties', value: 'Anxiety' });
  });
});
