import { expect, it, vi } from 'vitest';
const execute = vi.hoisted(() => vi.fn());
vi.mock('../../config/database.js', () => ({ default: { execute } }));
vi.mock('../hirePortalWorkflow.service.js', () => ({ portalPacket: async () => ({ documents: [{ id: 'book', title: 'Employee Handbook Acknowledgement' }, { id: 'identogo', title: 'Identogo' }] }) }));
import { loadPortalPrehireExtras } from '../hirePortalExtras.service.js';
it('omits handbook work from active pre-hire lists while preserving the stored records and job signature', async () => {
  const rows = [{ item_key: 'handbook_ack', title: 'Employee Handbook acknowledgement' }, { item_key: 'handbook_full', title: 'Reference handbook' }, { item_key: 'job_description_ack', title: 'Job description', completed_on: '2026-11-01' }];
  execute.mockImplementation(async sql => sql.includes('FROM hiring_prehire_checklist_items') ? [rows] : [[]]);
  const extras = await loadPortalPrehireExtras({ userId: 1, agencyId: 2, hiringProfile: { job_description_id: 3 } });
  expect(extras.checklistItems.map(item => item.itemKey)).toEqual(['job_description_ack']);
  expect(extras.jdAcknowledged).toBe(true); expect(extras.prehireDocs.map(d => d.id)).toEqual(['identogo']);
  expect(rows).toHaveLength(3); expect(execute.mock.calls.every(([sql]) => sql.trimStart().startsWith('SELECT'))).toBe(true);
});
