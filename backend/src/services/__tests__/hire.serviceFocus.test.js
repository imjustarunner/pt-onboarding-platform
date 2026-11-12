import { describe, it, expect, vi, beforeEach } from 'vitest';
const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db }));
import { contractServiceFocusSettings } from '../contractServiceFocus.service.js';
import { SERVICE_FOCUS_CATEGORIES } from '../../content/contractServiceFocusOptions.js';
beforeEach(() => vi.clearAllMocks());
describe('handbook service-focus options', () => {
  it('uses all baseline service focuses, including childcare/testing, before a handbook is published', async () => {
    db.execute.mockResolvedValue([[]]);
    const settings = await contractServiceFocusSettings({ id: 1, slug: 'itsco' });
    expect(settings.schoolDaysEnabled).toBe(true);
    expect(settings.serviceFocusOptions).toHaveLength(14);
    expect(settings.serviceFocusOptions).toEqual(expect.arrayContaining(['School-Based Counseling', 'Office-Based Counseling', 'Learning & Wellness Program', 'Academic Support & Tutoring','Childcare / Daycare','Psychological Testing']));
    expect(settings.serviceFocusOptions).not.toContain('Clarify scope of work and program alignment');
  });
  it('adds published handbook choices without dropping any baseline categories', async () => {
    db.execute.mockResolvedValue([[{ body_html: '<h4>Service Focus Categories</h4><p>Examples:</p><ul><li>School &amp; Community Counseling</li><li>Office-Based Counseling</li></ul><h4>Other</h4><ul><li>Not a focus</li></ul>' }]]);
    expect((await contractServiceFocusSettings({ id: 9, slug: 'itsco' })).serviceFocusOptions).toEqual([...SERVICE_FOCUS_CATEGORIES, 'School & Community Counseling']);
    expect(db.execute.mock.calls[0][0]).toContain('s.version_id = d.published_version_id');
    expect(db.execute.mock.calls[0][1]).toEqual([9]);
  });
  it('does not enable school-day expectations based on a display name', async () => {
    expect(await contractServiceFocusSettings({ id: 2, name: 'ITSCO', slug: 'another-agency' })).toEqual({ serviceFocusOptions: SERVICE_FOCUS_CATEGORIES, schoolDaysEnabled: false });
    expect(db.execute).not.toHaveBeenCalled();
  });
  it.each(['nlu', 'tisi'])('includes every category for %s without ITSCO school-day rules', async slug => {
    db.execute.mockResolvedValue([[{ body_html: '<h2>Welcome</h2><p>No categories listed.</p>' }]]);
    expect(await contractServiceFocusSettings({ id: 6, slug })).toEqual({ serviceFocusOptions: SERVICE_FOCUS_CATEGORIES, schoolDaysEnabled: false });
  });
  it('retains the baseline when handbook tables are unavailable', async () => {
    db.execute.mockRejectedValue({ code: 'ER_NO_SUCH_TABLE' });
    expect((await contractServiceFocusSettings({ id: 2, slug: 'itsco' })).serviceFocusOptions).toEqual(SERVICE_FOCUS_CATEGORIES);
  });
  it('surfaces database failures rather than treating them as missing handbooks', async () => {
    db.execute.mockRejectedValue(new Error('Connection lost'));
    await expect(contractServiceFocusSettings({ id: 2, slug: 'itsco' })).rejects.toThrow('Connection lost');
  });
});
