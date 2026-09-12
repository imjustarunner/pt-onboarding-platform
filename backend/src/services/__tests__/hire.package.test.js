import { describe, it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn(),
  pkg: vi.fn(), modules: vi.fn(), docs: vi.fn(), links: vi.fn(), focuses: vi.fn(), checklist: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: m }));
vi.mock('../../models/OnboardingPackage.model.js', () => ({ default: { findById: m.pkg, getModules: m.modules,
  getDocuments: m.docs, getIntakeLinks: m.links, getTrainingFocuses: m.focuses, getChecklistItems: m.checklist } }));
vi.mock('../../models/Module.model.js', () => ({ default: { findById: async (id) => ({ id, title: 'Profile' }) } }));
vi.mock('../../models/DocumentTemplate.model.js', () => ({ default: { findById: async (id) => ({ id, name: 'Tax form' }) } }));
vi.mock('../../models/CustomChecklistItem.model.js', () => ({ default: { findByModule: async () => [], findByTrainingFocus: async () => [] } }));
vi.mock('../../models/TrainingTrack.model.js', () => ({ default: {} }));
import { assignPackageToUser } from '../packageAssignment.service.js';
const db = { execute: m.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
const request = { packageId: 10, userId: 2, agencyId: 1, assignedByUserId: 3 };
beforeEach(() => {
  vi.clearAllMocks(); m.getConnection.mockResolvedValue(db);
  m.pkg.mockResolvedValue({ agency_id: 1, is_active: 1, package_type: 'onboarding', name: 'New hire' });
  m.modules.mockResolvedValue([{ module_id: 11 }]); m.docs.mockResolvedValue([{ document_template_id: 12 }]);
  m.links.mockResolvedValue([{ intake_link_id: 13, public_key: 'public-key', title: 'Questionnaire' }]);
  m.focuses.mockResolvedValue([]); m.checklist.mockResolvedValue([]);
  m.execute.mockImplementation(async (sql) => sql.startsWith('SELECT id FROM users') || sql.startsWith('SELECT user_id') ? [[{ id: 2 }]] : [[]]);
});
describe('package assignment', () => {
  it('assigns forms, training and documents with required onboarding provenance', async () => {
    await assignPackageToUser(request);
    const inserts = m.execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO tasks'));
    expect(inserts.map(([, params]) => params[0])).toEqual(['training', 'document', 'intake_form']);
    for (const [sql, params] of inserts) {
      expect(sql).toContain("'pending', 1"); expect(JSON.parse(params[8])).toMatchObject({ fromPackage: 10, portalPhase: 'onboarding' });
    }
    expect(db.commit).toHaveBeenCalledTimes(1);
  });
  it('does not duplicate tasks when assignment is retried', async () => {
    m.execute.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, task_type')) return [[{ task_type: 'training', reference_id: 11 }, { task_type: 'document', reference_id: 12 }, { task_type: 'intake_form', reference_id: 13 }]];
      if (sql.startsWith('SELECT id FROM users') || sql.startsWith('SELECT user_id')) return [[{ id: 2 }]];
      return [[]];
    });
    await assignPackageToUser(request);
    expect(m.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO tasks'))).toBe(false);
  });
  it('rejects a package from another agency', async () => {
    m.pkg.mockResolvedValue({ agency_id: 9, is_active: 1 });
    await expect(assignPackageToUser(request)).rejects.toThrow('this organization'); expect(m.getConnection).not.toHaveBeenCalled();
  });
  it('rolls back all assignment items on a persistence failure', async () => {
    m.execute.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO tasks')) throw new Error('assignment failed');
      if (sql.startsWith('SELECT id FROM users') || sql.startsWith('SELECT user_id')) return [[{ id: 2 }]];
      return [[]];
    });
    await expect(assignPackageToUser(request)).rejects.toThrow('assignment failed');
    expect(db.rollback).toHaveBeenCalled(); expect(db.commit).not.toHaveBeenCalled();
  });
  it('participates in promotion transaction without committing it', async () => {
    await assignPackageToUser({ ...request, connection: db });
    expect(db.commit).not.toHaveBeenCalled(); expect(db.release).not.toHaveBeenCalled();
  });
});
