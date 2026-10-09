import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn(), findUser: vi.fn(), journeyTasks: vi.fn(), getJourney: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks, onTableWrite:vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: mocks.findUser } }));
vi.mock('../hireJourney.service.js', () => ({ journeyTasks: mocks.journeyTasks, getJourney: mocks.getJourney }));
import { composeWorkflow, sanitizeWorkflow, validatePreemployment, summarizeSteps, onboardingPasswordReady } from '../../utils/hirePortalWorkflow.js';
import { onboardingContactForAgency, uniquePortalTasks, portalPacket, buildPortalWorkflow, savePortalStep, requiredSubmissionKeys, assertPortalStepCompletion, assertOnboardingPasswordReady } from '../hirePortalWorkflow.service.js';
vi.mock('../../config/database.js', () => ({ default: mocks, onTableWrite:vi.fn() }));
vi.mock('../hiringCommunication.service.js',()=>({hiringCommunicationContext:vi.fn(async()=>({channel:'email',available:false}))}));
vi.mock('../hireUserSetup.service.js',()=>({getHireUserSetup:vi.fn(async(user)=>({clinical:['provider','intern'].includes(user.role),values:{},focusGroups:[]})),persistHireUserSetup:vi.fn()}));
vi.mock('../staffCommunicationChoices.service.js',()=>({getStaffCommunicationChoices:vi.fn(async()=>({needsReview:true})),saveStaffCommunicationChoices:vi.fn()}));
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
    expect(manifest.steps.pre_hire[0].kind).toBe('hiring-notifications');
    expect(manifest.steps.pre_hire[0].required).toBe(false);
    expect(manifest.steps.pre_hire[1].kind).toBe('background');
    expect(manifest.steps.pre_hire.map(s => s.kind)).toEqual(expect.arrayContaining(['profile', 'headshot', 'handbook']));
    expect(manifest.steps.onboarding.map(s => s.kind)).not.toContain('profile');
    expect(manifest.steps.pre_hire.map(s => s.kind)).not.toContain('work-email');
    expect(manifest.steps.onboarding.map(s => s.kind)).toContain('work-email');
    expect(manifest.steps.pre_hire.find(s => s.kind === 'handbook').required).toBe(false);
    expect(manifest.steps.onboarding.at(-2)).toMatchObject({ kind: 'account', complete: false });
    expect(manifest.steps.onboarding.at(-1).kind).toBe('review');
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

describe('final onboarding password step', () => {
  const user = { status: 'ONBOARDING' };
  const steps = [
    { kind: 'task', required: true, complete: true },
    { kind: 'clinical-profile', complete: true },
    { kind: 'handbook', complete: true },
    { kind: 'account', complete: false },
    { kind: 'review', complete: false }
  ];
  it('requires all non-account steps, including configured resources and clinical profile', () => {
    expect(onboardingPasswordReady(user, { steps: { onboarding: steps } })).toBe(true);
    for (const kind of ['task', 'clinical-profile', 'handbook']) {
      expect(onboardingPasswordReady(user, { steps: { onboarding: steps.map(s => s.kind === kind ? { ...s, complete: false } : s) } })).toBe(false);
    }
    expect(onboardingPasswordReady(user, { steps: { onboarding: [...steps, { kind: 'video', complete: false }] } })).toBe(false);
    expect(onboardingPasswordReady(user, { steps: { onboarding: [...steps, { kind: 'video', required: false, complete: false }] } })).toBe(true);
  });
  it('never opens password setup for an empty, closed, or unstarted process', () => {
    expect(onboardingPasswordReady(user, { steps: { onboarding: [] } })).toBe(false);
    expect(onboardingPasswordReady(user, { steps: { onboarding: steps } }, { onboardingCompletedAt: '2026-09-26' })).toBe(false);
    expect(onboardingPasswordReady({ status: 'PREHIRE_OPEN' }, { steps: { onboarding: steps } })).toBe(false);
  });
});

it('checks saved onboarding tasks and acknowledgements before password preparation', async () => {
  const { getStaffCommunicationChoices } = await import('../staffCommunicationChoices.service.js');
  getStaffCommunicationChoices.mockResolvedValueOnce({needsReview:false}).mockResolvedValueOnce({needsReview:false});
  mocks.findUser.mockResolvedValue({ id: 1, status: 'ONBOARDING', role: 'staff', work_email: 'taylor@example.org' });
  mocks.getJourney.mockResolvedValue({ prehireCompletedAt: '2026-09-01' });
  mocks.journeyTasks.mockResolvedValue([{ id: 9, phase: 'onboarding', isRequired: true, status: 'pending' }]);
  mocks.execute.mockImplementation(async sql => sql.includes('FROM hire_portal_submissions')
    ? [['handbook','user-setup','staff-communications'].map(step_key => ({ phase: 'onboarding', step_key, encrypted_value: encryptGuardianIntake('{}'), completed_at: '2026-09-26' }))] : [[]]);
  await expect(assertOnboardingPasswordReady(1, 2)).rejects.toMatchObject({ code: 'ONBOARDING_INCOMPLETE' });
  mocks.journeyTasks.mockResolvedValue([{ id: 9, phase: 'onboarding', isRequired: true, status: 'completed' }]);
  await expect(assertOnboardingPasswordReady(1, 2)).resolves.toBeUndefined();
  mocks.execute.mockResolvedValue([[]]);
  await expect(assertOnboardingPasswordReady(1, 2)).rejects.toMatchObject({ code: 'ONBOARDING_INCOMPLETE' });
});

it('consolidates duplicate documents and retains the signed copy while removing redundant background templates', () => {
  const tasks = [
    { id: 1, referenceId: 10, taskType: 'document', title: 'Agreement', status: 'pending', isRequired: true },
    { id: 2, referenceId: 10, taskType: 'document', title: 'Agreement', status: 'completed', isRequired: false },
    { id: 3, referenceId: 20, taskType: 'document', title: 'Hiring: Authorization for Background Check' }
  ];
  expect(uniquePortalTasks(tasks)).toEqual([{ ...tasks[1], isRequired: true }]);
  expect(tasks[1].isRequired).toBe(false);
});

describe('onboarding contact staff profile', () => {
  it('uses Aunya’s staff identity and saved photo within ITSCO', async () => {
    mocks.execute.mockResolvedValue([[{ id: 12, first_name: 'Aunya', last_name: 'Albinana', profile_photo_path: 'profiles/aunya.jpg' }]]);
    expect(await onboardingContactForAgency(2)).toMatchObject({ id: 12, name: 'Aunya Albinana', photoPath: 'profiles/aunya.jpg', email: 'Aunya@ITSCO.health' });
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('ua.agency_id = ?'), [2, 'Aunya@ITSCO.health', 'Aunya@ITSCO.health']);
  });
  it('does not expose the ITSCO contact to another agency', async () => {
    expect(await onboardingContactForAgency(9)).toBe(null);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('retains contact instructions without fabricating a missing photo', async () => {
    mocks.execute.mockResolvedValue([[]]);
    expect(await onboardingContactForAgency(2)).toMatchObject({ name: 'Aunya Albinana', photoPath: null });
  });
});

 it('requires retained school availability during final submission', async () => {
   expect(requiredSubmissionKeys([{key:'school-availability',kind:'school-availability'}])).toEqual(['school-availability']);
   mocks.execute.mockResolvedValue([[]]);
   await expect(assertPortalStepCompletion(1,'onboarding',['school-availability'],db)).rejects.toThrow('Complete all required steps');
 });
 it('includes school availability in live and progress-only onboarding', async () => {
   mocks.execute.mockResolvedValue([[]]);
   const input={user:{id:1,role:'provider',status:'ONBOARDING',service_focus:'School-Based Counseling'},agencyId:9,tasks:[],prehireTasks:[],extras:{},backgroundCheck:{},journey:{}};
   const full=await buildPortalWorkflow(input);
   expect(full.steps.onboarding.find(s=>s.kind==='school-availability')).toMatchObject({required:true,complete:false,values:{available:null,blocks:[]}});
   const progress=await buildPortalWorkflow({...input,progressOnly:true});
   expect(progress.progress.onboarding).toEqual(full.progress.onboarding);
 });
 it('saves school hours and encrypted onboarding completion in one transaction', async () => {
   mocks.execute.mockImplementation(async sql => sql.startsWith('SELECT status') ? [[{status:'ONBOARDING'}]] : sql.includes('SELECT id FROM user_info_field_definitions') ? [[{id:12}]] : [[]]);
   await savePortalStep({userId:1,agencyId:2,phase:'onboarding',key:'school-availability',value:{available:true,notes:'',blocks:[{dayOfWeek:'Tuesday',startTime:'09:00',endTime:'14:00'}]}});
   expect(mocks.execute.mock.calls.some(([sql,args])=>sql.startsWith('INSERT INTO user_info_values') && args[2]==='Tuesday: 9:00 a.m.–2:00 p.m.')).toBe(true);
   expect(mocks.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO hire_portal_submissions'))[1][4]).toBeInstanceOf(Date);
   expect(db.commit).toHaveBeenCalled();
 });
 it('rolls back invalid school hours without completing the step', async () => {
   mocks.execute.mockImplementation(async sql => sql.startsWith('SELECT status') ? [[{status:'ONBOARDING'}]] : [[]]);
   await expect(savePortalStep({userId:1,agencyId:2,phase:'onboarding',key:'school-availability',value:{available:true,notes:'',blocks:[]}})).rejects.toThrow('at least one');
   expect(db.rollback).toHaveBeenCalled(); expect(db.commit).not.toHaveBeenCalled();
   expect(mocks.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO'))).toBe(false);
 });
