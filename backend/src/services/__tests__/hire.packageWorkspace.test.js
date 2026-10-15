import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn(), packet: vi.fn(), assign: vi.fn(), formReady: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: m }));
vi.mock('../hirePortalWorkflow.service.js', () => ({ portalPacket: m.packet }));
vi.mock('../packageAssignment.service.js', () => ({ assignPackageToUser: m.assign }));
vi.mock('../../utils/hireDocumentFields.js', () => ({ assertHireFormReady: m.formReady }));
import { getHirePackageWorkspace, saveHirePackageWorkspace } from '../hirePackageWorkspace.service.js';
const db = { execute: m.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
const link = (id, phase) => ({ id, phase, title: id, kind: 'link', url: 'https://example.org/guide', required: true });
let user, journey, packet, completed, settings, membership, owner, collection;
beforeEach(() => {
  vi.clearAllMocks(); m.getConnection.mockResolvedValue(db);
  user = { id: 8, first_name: 'Jordan', last_name: 'Example', status: 'PREHIRE_OPEN' }; journey = {}; completed = [];
  membership = { user_id: 8 }; owner = { agency_id: 2 };
  packet = { prehirePackageId: null, workflow: { resources: [link('pre', 'pre_hire')] }, documents: [{ id: 'original' }] };
  settings = { portal_workflow: { resources: [link('welcome', 'onboarding')] } };
  collection = { agency_id: 2, package_type: 'onboarding', is_active: 1 };
  m.packet.mockImplementation(async () => structuredClone(packet));
  m.execute.mockImplementation(async (sql, values) => {
    if (sql.includes('FROM users WHERE')) return [[user]];
    if (sql.includes('FROM user_agencies')) return [[membership].filter(Boolean)];
    if (sql.includes('FROM hire_journeys')) return [[journey]];
    if (sql.includes('SELECT agency_id FROM hire_portal_packets')) return [[owner].filter(Boolean)];
    if (sql.includes('FROM agencies')) return [[{ prehire_settings: settings }]];
    if (sql.includes('FROM hiring_profiles')) return [[{ applied_role: 'Provider' }]];
    if (sql.includes('FROM onboarding_packages')) return [[collection]];
    if (sql.includes('FROM document_templates')) return [[{ id: values[0], agency_id: 2, is_active: 1 }]];
    if (sql.includes('FROM hire_portal_submissions')) {
      // The submission table is scoped by user and phase, not an agency_id column.
      expect(sql).not.toContain('agency_id'); return [completed];
    }
    if (sql.includes('FROM tasks')) return [[{ id: 3, title: 'Signed agreement', status: 'completed', task_type: 'document', metadata: { portalPhase: 'pre_hire' } }]];
    return [[]];
  });
});
async function save(phase, changes = {}) {
  const state = await getHirePackageWorkspace(8, 2);
  return saveHirePackageWorkspace({ userId: 8, agencyId: 2, actorId: 9, phase, input: { revision: state.revision, packageId: null, workflow: state.phases[phase].workflow, ...changes } });
}
const written = () => JSON.parse(m.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO hire_portal_packets'))[1][2]);
describe('staff workspace for a person’s hire packages', () => {
  it('keeps the same person with scoped assignments in each phase and no writes when browsing', async () => {
    const result = await getHirePackageWorkspace(8, 2);
    expect(result.candidate.id).toBe(8);
    expect(result.phases.pre_hire.tasks).toEqual([{ id: 3, title: 'Signed agreement', status: 'completed', type: 'document' }]);
    expect(result.phases.onboarding).toMatchObject({ preparing: true, closed: false, tasks: [], workflow: { resources: [expect.objectContaining({ id: 'welcome' })] } });
    expect(m.execute.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE/.test(sql))).toBe(false);
  });
  it('saves future onboarding without assigning tasks, promoting, or altering the pre-hire packet', async () => {
    await save('onboarding', { packageId: 10, workflow: { resources: [link('orientation', 'onboarding')] } });
    expect(written()).toMatchObject({ documents: packet.documents, onboardingPackageId: 10, workflow: { resources: [packet.workflow.resources[0], expect.objectContaining({ id: 'orientation' })], excludedResourceIds: ['welcome'] } });
    expect(m.assign).not.toHaveBeenCalled(); expect(db.commit).toHaveBeenCalledOnce();
    expect(m.execute.mock.calls.some(([sql]) => /UPDATE users|UPDATE tasks|DELETE/.test(sql))).toBe(false);
  });
  it('applies an active collection through the existing transaction and reuses phase assignments', async () => {
    user.status = 'ONBOARDING'; journey.onboarding_started_at = '2026-10-15';
    await save('onboarding', { packageId: 10, workflow: { resources: [link('orientation', 'onboarding')] } });
    expect(m.assign).toHaveBeenCalledWith(expect.objectContaining({ packageId: 10, userId: 8, agencyId: 2, connection: db, reusePhaseItems: true, documentsOnly: false }));
    expect(written().workflow.resources[0]).toEqual(packet.workflow.resources[0]);
  });
  it('imports only documents when applying a pre-hire collection', async () => {
    collection.package_type = 'pre_hire'; await save('pre_hire', { packageId: 10 });
    expect(m.assign).toHaveBeenCalledWith(expect.objectContaining({ documentsOnly: true }));
  });
  it('rejects a stale save and preserves newer changes', async () => {
    await expect(save('pre_hire', { revision: 'stale' })).rejects.toMatchObject({ status: 409 });
    expect(db.commit).not.toHaveBeenCalled(); expect(db.rollback).toHaveBeenCalled();
  });
  it('retains submitted pre-hire and onboarding packages', async () => {
    user.status = 'ONBOARDING'; await expect(save('pre_hire')).rejects.toMatchObject({ status: 409 });
    journey.onboarding_completed_at = '2026-10-15'; await expect(save('onboarding')).rejects.toMatchObject({ status: 409 });
    expect(m.assign).not.toHaveBeenCalled();
  });
  it('prevents rewriting or removing a completed resource', async () => {
    completed = [{ phase: 'pre_hire', step_key: 'pre' }];
    await expect(save('pre_hire', { workflow: { resources: [] } })).rejects.toMatchObject({ status: 409 });
    await expect(save('pre_hire', { workflow: { resources: [{ ...link('pre','pre_hire'), url: 'https://example.org/changed' }] } })).rejects.toMatchObject({ status: 409 });
  });
  it('rejects access across agencies even if the person belongs to both', async () => {
    owner.agency_id = 4;
    await expect(getHirePackageWorkspace(8, 2)).rejects.toMatchObject({ status: 403 });
    expect(m.packet).not.toHaveBeenCalled();
    owner.agency_id = 2; membership = null;
    await expect(save('onboarding')).rejects.toMatchObject({ status: 404 });
  });
  it('rejects collections from another phase or agency and invalid links', async () => {
    collection.agency_id = 4; await expect(save('onboarding', { packageId: 10 })).rejects.toMatchObject({ status: 400 });
    collection.agency_id = 2; collection.package_type = 'pre_hire'; await expect(save('onboarding', { packageId: 10 })).rejects.toMatchObject({ status: 400 });
    await expect(save('pre_hire', { workflow: { resources: [{ ...link('pre','pre_hire'), url: 'javascript:alert(1)' }] } })).rejects.toMatchObject({ status: 400 });
  });
  it('rolls back assignments and packet updates together on failure', async () => {
    user.status = 'ONBOARDING'; m.assign.mockRejectedValueOnce(new Error('Assignment failed'));
    await expect(save('onboarding', { packageId: 10 })).rejects.toThrow('Assignment failed');
    expect(db.rollback).toHaveBeenCalled(); expect(db.commit).not.toHaveBeenCalled();
    expect(m.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO hire_portal_packets'))).toBe(false);
  });
});
it('accepts the same stored JSON when MySQL returns object keys in a different order', async () => {
  const state = await getHirePackageWorkspace(8, 2);
  packet = { documents: packet.documents, workflow: packet.workflow, prehirePackageId: null };
  await saveHirePackageWorkspace({ userId: 8, agencyId: 2, actorId: 9, phase: 'pre_hire', input: { revision: state.revision, packageId: null, workflow: state.phases.pre_hire.workflow } });
  expect(db.commit).toHaveBeenCalledOnce();
});

it('rejects invalid collection identifiers rather than silently clearing the selection', async () => {
  await expect(save('pre_hire', { packageId: 'invalid' })).rejects.toMatchObject({ status: 400 });
  expect(db.commit).not.toHaveBeenCalled();
});

it('previews the applied job’s onboarding package, training and exclusions before promotion', async () => {
  const original = m.execute.getMockImplementation();
  m.execute.mockImplementation(async (sql, args) => sql.includes('jd.prehire_config_json') ? [[{ prehire_config_json: { onboardingPackageId: 12, onboardingTraining: { moduleIds: [23] }, workflow: { excludedResourceIds: ['welcome'], resources: [link('job-orientation', 'onboarding')] } } }]] : original(sql, args));
  const state = await getHirePackageWorkspace(8, 2);
  expect(state.phases.onboarding.suggestedPackageId).toBe(12);
  expect(state.phases.onboarding.training.moduleIds).toEqual([23]);
  expect(state.phases.onboarding.workflow.resources.map(r => r.id)).toEqual(['job-orientation']);
  expect(state.phases.onboarding.workflow.excludedResourceIds).toContain('welcome');
});
