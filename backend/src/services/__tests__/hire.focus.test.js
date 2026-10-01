import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tasks: vi.fn(), checklist: vi.fn(), sticky: vi.fn(), execute: vi.fn(), gemini: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/Task.model.js', () => ({ default: { findByUser: m.tasks } }));
vi.mock('../../models/UserChecklistAssignment.model.js', () => ({ default: { getUnifiedChecklist: m.checklist } }));
vi.mock('../../models/MomentumSticky.model.js', () => ({ default: { listByUserId: m.sticky } }));
vi.mock('../../models/TaskList.model.js', () => ({ default: { listByUserMembership: vi.fn(async () => []) } }));
vi.mock('../geminiText.service.js', () => ({ callGeminiText: m.gemini }));
import { generateDigest } from '../momentumChat.service.js';
beforeEach(() => { vi.clearAllMocks(); m.execute.mockResolvedValue([[]]); m.checklist.mockResolvedValue({}); m.sticky.mockResolvedValue([]); });
it('cannot turn model text or another person’s board tasks into employee tasks', async () => {
  m.tasks.mockResolvedValue([
    { id: 1, title: 'My task', assigned_to_user_id: 5, assigned_to_agency_id: 2, status: 'pending' },
    { id: 2, title: 'Board-only task', assigned_to_user_id: 6, assigned_to_agency_id: 2, status: 'pending' },
    { id: 3, title: 'Other tenant', assigned_to_user_id: 5, assigned_to_agency_id: 3, status: 'pending' }
  ]);
  m.gemini.mockResolvedValue({ text: 'TOP: Invented task\n999' });
  expect(await generateDigest(5, { agencyId: 2 })).toEqual({ topFocus: [{ label: 'My task', source: 'gemini' }], alsoOnRadar: [] });
  expect(m.gemini.mock.calls[0][0].prompt).not.toMatch(/Board-only task|Other tenant/);
});
it('leaves focus empty when there are no actual tasks', async () => {
  m.tasks.mockResolvedValue([]);
  expect(await generateDigest(5, { agencyId: 2 })).toEqual({ topFocus: [], alsoOnRadar: [] });
  expect(m.gemini).not.toHaveBeenCalled();
});
