import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks }));
import { composeWorkflow, sanitizeWorkflow, validatePreemployment, summarizeSteps } from '../../utils/hirePortalWorkflow.js';
import { portalPacket, buildPortalWorkflow, savePortalStep, requiredSubmissionKeys, assertPortalStepCompletion } from '../hirePortalWorkflow.service.js';
import { encryptGuardianIntake } from '../guardianIntakeEncryption.service.js';
process.env.GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');
const db = { execute: mocks.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); mocks.getConnection.mockResolvedValue(db); });
describe('packet composition and validation', () => {
  it('inherits agency defaults, overrides by job and person, and honors exclusions', () => {
    const result = composeWorkflow({ supervisorClause: 'Approved duties', resources: [{ id: 'video', title: 'Agency video', url: 'https://example.org/video' }, { id: 'extra', title: 'Extra' }] },
      { resources: [{ id: 'video', title: 'Job video', url: 'https://example.org/job' }] }, { supervisorName: 'Sam', excludedResourceIds: ['extra'] });
    expect(result.resources).toHaveLength(1); expect(result.resources[0].title).toBe('Job video');
    expect(result.supervisorClause).toBe('Approved duties'); expect(result.supervisorName).toBe('Sam');
  });
  it('rejects active URL schemes and keeps unconfigured items incomplete', () => expect(sanitizeWorkflow({ resources: [{ id: 'x', title: 'Bad URL', url: 'javascript:alert(1)' }] }).resources[0].url).toBe(''));
  it('cannot replace core profile or signing steps with a configured resource', () => {
    const clean = sanitizeWorkflow({ resources: [{ id: 'profile', title: 'Extra form' }, { id: 'task-17', title: 'Extra task' }] });
    expect(clean.resources.map(r => r.id)).toEqual(['resource-profile', 'resource-task-17']);
    expect(sanitizeWorkflow(clean)).toEqual(clean);
  });
  it('separates assigning a supervisor from making the employee a supervisor', () => {
    expect(sanitizeWorkflow({ supervisorUserId: 14 }).supervisorRole).toBe(false);
    expect(sanitizeWorkflow({ supervisorRole: true }).supervisorUserId).toBe(null);
  });
  it('allows drafts but validates completed profile information', () => {
    expect(validatePreemployment({ full_legal_name: 'Taylor' }).full_legal_name).toBe('Taylor');
    expect(() => validatePreemployment({ full_legal_name: 'Taylor' }, true)).toThrow('Email is required');
    expect(() => validatePreemployment({ date_of_birth: '2026-02-31' })).toThrow('valid date of birth');
    expect(() => validatePreemployment({ personal_email: 'invalid' })).toThrow('valid email');
  });
  it('does not accept client-supplied profile keys such as permissions or SSN', () => {
    const values = validatePreemployment({ full_legal_name: 'Taylor', has_supervisor_privileges: true, ssn: '123456789' });
    expect(values).not.toHaveProperty('ssn'); expect(values).not.toHaveProperty('has_supervisor_privileges');
  });
  it('never lets the final review or optional work substitute for required steps', () => {
    expect(summarizeSteps([{ kind: 'profile', complete: false }, { kind: 'review', complete: true }, { required: false, complete: true }])).toMatchObject({ total: 1, completed: 0, allDone: false });
  });
});
describe('phase manifest', () => {
  it('repairs a missing legacy handbook from agency settings without replacing retained choices', async () => {
    mocks.execute.mockImplementation(async sql => sql.includes('config_json FROM') ? [[{ config_json: { workflow: { resources: [] } } }]]
      : sql.includes('prehire_settings FROM') ? [[{ prehire_settings: { handbook_full_url: 'https://docs.google.com/document/d/handbook/edit' } }]] : [[]]);
    expect((await portalPacket(1, 2)).handbookUrl).toBe('https://docs.google.com/document/d/handbook/edit');
    mocks.execute.mockImplementation(async sql => sql.includes('config_json FROM') ? [[{ config_json: { handbookUrl: 'https://example.org/retained-handbook', workflow: { resources: [] } } }]]
      : sql.includes('prehire_settings FROM') ? [[{ prehire_settings: { handbook_full_url: 'https://example.org/new-handbook' } }]] : [[]]);
    expect((await portalPacket(1, 2)).handbookUrl).toBe('https://example.org/retained-handbook');
  });
  it('includes personal information and headshot only in prehire, account setup only in onboarding', async () => {
    mocks.execute.mockImplementation(async (sql) => sql.includes('config_json FROM') ? [[{ config_json: { workflow: { resources: [] }, handbookUrl: 'https://drive.google.com/file/d/book/view' } }]] : [[]]);
    const manifest = await buildPortalWorkflow({ user: { id: 1, status: 'PREHIRE_OPEN', first_name: 'Taylor', sso_password_override: '0' }, agencyId: 2, tasks: [], prehireTasks: [], extras: {}, backgroundCheck: {}, hireAccountMode: 'group_password', journey: {} });
    expect(manifest.steps.pre_hire[0].kind).toBe('background');
    expect(manifest.steps.pre_hire.map(s => s.kind)).toEqual(expect.arrayContaining(['profile', 'headshot', 'work-email', 'handbook']));
    expect(manifest.steps.onboarding.map(s => s.kind)).not.toContain('profile');
    expect(manifest.steps.onboarding[0]).toMatchObject({ kind: 'account', complete: false });
    expect(manifest.progress.pre_hire.allDone).toBe(false);
  });
  it('does not reopen a legacy completed prehire to collect new profile requirements', async () => {
    mocks.execute.mockImplementation(async (sql) => sql.includes('config_json FROM') ? [[{ config_json: { workflow: { resources: [] } } }]] : [[]]);
    const manifest = await buildPortalWorkflow({ user: { id: 1, status: 'ONBOARDING' }, agencyId: 2, tasks: [], prehireTasks: [], extras: {}, backgroundCheck: { signed: true }, journey: { prehireCompletedAt: '2026-09-01' } });
    expect(manifest.steps.pre_hire.map(s => s.kind)).not.toContain('profile');
    expect(manifest.steps.pre_hire.map(s => s.kind)).not.toContain('headshot');
  });
});
describe('persistent step writes', () => {
  it('rechecks saved completion inside the closing transaction', async () => {
    mocks.execute.mockResolvedValue([[{ step_key: 'profile' }]]);
    await expect(assertPortalStepCompletion(1, 'pre_hire', ['profile', 'headshot'], db)).rejects.toThrow('required steps');
    await expect(assertPortalStepCompletion(1, 'pre_hire', ['profile'], db)).resolves.toBeUndefined();
  });
  it('accepts a provisioned work email without a separate preference submission', () => {
    expect(requiredSubmissionKeys([{ key: 'work-email', kind: 'work-email' }, { key: 'handbook', kind: 'handbook' }, { key: 'task-1', kind: 'task' }], true)).toEqual(['handbook']);
  });
  it.each(['PREHIRE_REVIEW', 'ONBOARDING', 'ACTIVE_EMPLOYEE'])('rejects prehire edits after transition to %s', async (status) => {
    mocks.execute.mockImplementation(async (sql) => sql.startsWith('SELECT status') ? [[{ status }]] : [[]]);
    await expect(savePortalStep({ userId: 1, agencyId: 2, phase: 'pre_hire', key: 'profile', value: {} })).rejects.toThrow('package is closed');
    expect(db.commit).not.toHaveBeenCalled(); expect(db.rollback).toHaveBeenCalled();
  });
  it('encrypts submitted data and locks the user before saving', async () => {
    mocks.execute.mockImplementation(async (sql) => sql.startsWith('SELECT status') ? [[{ status: 'PREHIRE_OPEN' }]] : [[]]);
    await savePortalStep({ userId: 1, agencyId: 2, phase: 'pre_hire', key: 'profile', value: { full_legal_name: 'Private Name' } });
    const write = mocks.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO hire_portal_submissions'));
    expect(write[1][3]).not.toContain('Private Name'); expect(JSON.parse(write[1][3])).toHaveProperty('authTagB64');
    expect(mocks.execute.mock.calls[0][0]).toContain('FOR UPDATE'); expect(db.commit).toHaveBeenCalled();
  });
  it('keeps the retained headshot separate from the editable profile photo', async () => {
    mocks.execute.mockImplementation(async (sql) => sql.startsWith('SELECT status') ? [[{ status: 'PREHIRE_OPEN' }]] : [[]]);
    await savePortalStep({ userId: 1, agencyId: 2, phase: 'pre_hire', key: 'headshot', value: { path: 'private/retained.jpg' }, file: { title: 'Headshot', path: 'private/retained.jpg', profilePath: 'profile-photos/editable.jpg', name: 'headshot.jpg', mime: 'image/jpeg' } });
    const retained = mocks.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO user_admin_docs'));
    const profile = mocks.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE users SET profile_photo_path'));
    expect(retained[1]).toContain('private/retained.jpg'); expect(profile[1][0]).toBe('profile-photos/editable.jpg');
    expect(db.commit).toHaveBeenCalled();
  });
  it('rolls back profile data when the linked account cannot be updated', async () => {
    mocks.execute.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT status')) return [[{ status: 'PREHIRE_OPEN' }]];
      if (sql.includes('SELECT id FROM user_info_field_definitions')) return [[{ id: 9 }]];
      if (sql.startsWith('UPDATE users SET personal_email')) throw new Error('database unavailable');
      return [[]];
    });
    await expect(savePortalStep({ userId: 1, agencyId: 2, phase: 'pre_hire', key: 'profile', value: {}, profile: true })).rejects.toThrow('database unavailable');
    expect(db.rollback).toHaveBeenCalled(); expect(db.commit).not.toHaveBeenCalled();
  });
});
