import { describe, it, expect, vi, beforeEach } from 'vitest';
const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db }));
import { contractServiceFocusSettings } from '../contractServiceFocus.service.js';
beforeEach(() => vi.clearAllMocks());
describe('handbook service-focus options', () => {
  it('uses all 12 ITSCO handbook examples when a handbook has not been published', async () => {
    db.execute.mockResolvedValue([[]]);
    const settings = await contractServiceFocusSettings({ id: 1, slug: 'itsco' });
    expect(settings.schoolDaysEnabled).toBe(true);
    expect(settings.serviceFocusOptions).toHaveLength(12);
    expect(settings.serviceFocusOptions).toEqual(expect.arrayContaining(['School-Based Counseling', 'Office-Based Counseling', 'Learning & Wellness Program', 'Academic Support & Tutoring']));
    expect(settings.serviceFocusOptions).not.toContain('Clarify scope of work and program alignment');
  });
  it('uses the agency’s published handbook choices rather than draft content or a stale source list', async () => {
    db.execute.mockResolvedValue([[{ body_html: '<h4>Service Focus Categories</h4><p>Examples:</p><ul><li>School &amp; Community Counseling</li><li>Office-Based Counseling</li></ul><h4>Other</h4><ul><li>Not a focus</li></ul>' }]]);
    expect((await contractServiceFocusSettings({ id: 9, slug: 'itsco' })).serviceFocusOptions).toEqual(['School & Community Counseling', 'Office-Based Counseling']);
    expect(db.execute.mock.calls[0][0]).toContain('s.version_id = d.published_version_id');
    expect(db.execute.mock.calls[0][1]).toEqual([9]);
  });
  it('does not enable school-day expectations based on a display name', async () => {
    expect(await contractServiceFocusSettings({ id: 2, name: 'ITSCO', slug: 'another-agency' })).toEqual({ serviceFocusOptions: [], schoolDaysEnabled: false });
    expect(db.execute).not.toHaveBeenCalled();
  });
});
