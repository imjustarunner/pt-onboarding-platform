import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: m }));
vi.mock('../documentTrainingContent.js', () => ({ trainingDefinitionsFor: agency => agency.id === 2 ? [{ documentKey: 'provider-guide', title: 'Provider guide' }] : [] }));
import { getSharedHireDefaults, saveSharedHireDefaults, validateJobHireDefaults, resolveOnboardingDefaults, getAppliedJobHireDefaults } from '../hireJobDefaults.service.js';
import { sanitizePrehireConfig } from '../../utils/prehireConfigSanitize.js';
const link = (id, phase = 'onboarding') => ({ id, phase, title: id, kind: 'link', url: 'https://example.test/' + id });
const db = { execute: m.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
let settings, pkg, template, training, job;
beforeEach(() => {
  vi.clearAllMocks(); m.getConnection.mockResolvedValue(db);
  settings = { handbook_full_url: 'https://example.test/book', default_prehire_package_id: 3, default_onboarding_package_id: 4,
    portal_workflow: { tagline: 'Welcome', resources: [link('pre', 'pre_hire'), link('welcome')] }, default_prehire_docs: [{ id: 'notice', title: 'Notice', kind: 'reference', url: 'https://example.test/notice' }], onboarding_training: { moduleIds: [9] } };
  pkg = { agency_id: 2, package_type: 'onboarding', is_active: 1 };
  template = { agency_id: 2, is_active: 1 }; training = { agency_id: 2, is_active: 1, is_archived: 0 }; job = {};
  m.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('SELECT prehire_settings')) return [[{ prehire_settings: settings }]];
    if (sql.includes('SELECT id, name, slug')) return [[{ id: 2, slug: 'itsco' }]];
    if (sql.includes('FROM onboarding_packages')) return [[pkg]];
    if (sql.includes('FROM document_templates')) return [[template]];
    if (sql.includes('FROM modules') || sql.includes('FROM training_tracks')) return [[training]];
    if (sql.includes('FROM hiring_profiles')) return [[{ prehire_config_json: job }]];
    if (sql.startsWith('UPDATE agencies')) settings = JSON.parse(args[0]);
    return [[]];
  });
});
async function save(phase, changes = {}) {
  const state = await getSharedHireDefaults(2);
  return saveSharedHireDefaults({ agencyId: 2, actorId: 8, phase, input: { ...state.phases[phase], ...changes } });
}
describe('job and all-jobs hire defaults', () => {
  it('saves shared onboarding forms and training without altering prehire or unrelated settings', async () => {
    const pre = structuredClone(settings.default_prehire_docs);
    await save('onboarding', { workflow: { resources: [{ id: 'i9', title: 'Form I-9', phase: 'onboarding', kind: 'document', templateId: 6 }] }, training: { moduleIds: [8], trackIds: [3], guideRequirements: { 'provider-guide': true } } });
    expect(settings.default_prehire_docs).toEqual(pre); expect(settings.handbook_full_url).toContain('/book');
    expect(settings.portal_workflow.resources.map(r => r.id)).toEqual(['pre', 'i9']); expect(settings.portal_workflow.tagline).toBe('Welcome');
    expect(settings.onboarding_training).toMatchObject({ moduleIds: [8], trackIds: [3], guideRequirements: { 'provider-guide': true } });
    expect(m.execute.mock.calls.some(([sql]) => /UPDATE users|INSERT INTO tasks|hire_portal_packets/.test(sql))).toBe(false);
    expect(db.commit).toHaveBeenCalledOnce();
  });
  it('prevents stale shared saves and rejects tenant or phase mismatches', async () => {
    await expect(save('onboarding', { revision: 'old' })).rejects.toMatchObject({ status: 409 });
    pkg.agency_id = 7; await expect(save('onboarding')).rejects.toMatchObject({ status: 400 });
    pkg.agency_id = 2; pkg.package_type = 'pre_hire'; await expect(save('onboarding')).rejects.toMatchObject({ status: 400 });
    expect(db.commit).not.toHaveBeenCalled();
  });
  it('validates document, module, track and guide access before setting a shared requirement', async () => {
    template.agency_id = 7;
    await expect(save('onboarding', { workflow: { resources: [{ id: 'i9', title: 'I9', kind: 'document', phase: 'onboarding', templateId: 6 }] } })).rejects.toMatchObject({ status: 400 });
    training.agency_id = 7;
    await expect(save('onboarding', { training: { moduleIds: [44] } })).rejects.toMatchObject({ status: 400 });
    await expect(validateJobHireDefaults({ onboardingTraining: { trackIds: [44] } }, 2)).rejects.toMatchObject({ status: 400 });
    await expect(save('onboarding', { training: { guideRequirements: { 'unknown-guide': true } } })).rejects.toMatchObject({ status: 400 });
  });
  it('merges all-jobs and job defaults with person overrides and preserves exclusions through layers', () => {
    const result = resolveOnboardingDefaults({ settings, job: { onboardingPackageId: 7, workflow: { resources: [link('job')], excludedResourceIds: ['welcome'] }, onboardingTraining: { moduleIds: [10], excludedModuleIds: [9], guideRequirements: { 'provider-guide': false } } }, packet: { onboardingPackageId: 12, workflow: { resources: [link('person')] } } });
    expect(result.packageId).toBe(12); expect(result.workflow.resources.map(r => r.id)).toEqual(['pre', 'job', 'person']);
    expect(result.workflow.excludedResourceIds).toContain('welcome'); expect(result.training.moduleIds).toEqual([10]);
    expect(result.training.guideRequirements).toEqual({ 'provider-guide': false });
  });
  it('keeps a prepared person’s training snapshot when defaults change', () => {
    expect(resolveOnboardingDefaults({ settings, job: { onboardingTraining: { moduleIds: [11] } }, packet: { onboardingTraining: { moduleIds: [22], guideRequirements: { 'provider-guide': true } } } }).training.moduleIds).toEqual([22]);
  });
  it('round trips both job packages, training and both workflow phases through job sanitization', async () => {
    job = { prehirePackageId: 3, onboardingPackageId: 4, onboardingTraining: { moduleIds: [9, 9], excludedTrackIds: [2], guideRequirements: { 'provider-guide': false } }, workflow: { resources: [link('pre','pre_hire'), link('post')] } };
    const sanitized = sanitizePrehireConfig(JSON.stringify(job));
    expect(sanitized).toMatchObject({ prehirePackageId: 3, onboardingPackageId: 4, onboardingTraining: { moduleIds: [9], excludedTrackIds: [2] } });
    expect((await getAppliedJobHireDefaults(8, 2)).onboardingPackageId).toBe(4);
    expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('jd.agency_id = ?'), [2, 8]);
  });
  it('blocks invalid, duplicate and cross-phase shared resources without saving', async () => {
    await expect(save('onboarding', { workflow: { resources: [link('p','pre_hire')] } })).rejects.toMatchObject({ status: 400 });
    await expect(save('onboarding', { workflow: { resources: [link('pre')] } })).rejects.toMatchObject({ status: 400 });
    await expect(save('onboarding', { workflow: { resources: [{ ...link('bad'), url: 'javascript:alert(1)' }] } })).rejects.toMatchObject({ status: 400 });
    expect(db.commit).not.toHaveBeenCalled();
  });
});
