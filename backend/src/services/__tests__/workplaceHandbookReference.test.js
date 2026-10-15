import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../workplaceHandbook.service.js', () => ({ getPublishedHandbook: vi.fn() }));
vi.mock('../workplaceHandbookWorkflow.service.js', () => ({ sourceForAgency: vi.fn() }));
import { getPublishedHandbook } from '../workplaceHandbook.service.js';
import { sourceForAgency } from '../workplaceHandbookWorkflow.service.js';
import { getPortalHandbookEdition } from '../workplaceHandbookReference.service.js';
beforeEach(() => { vi.resetAllMocks(); });
describe('optional pre-hire handbook reference', () => {
  const published = { version: { id: 8 }, sections: [{ slug: 'welcome', body_html: '<p>Published policy</p>' }] };
  const source = { title: 'Workplace Handbook', organization: 'ITSCO', revision: 'r1', sections: [{ slug: 'welcome', body_html: '<p>Company reference</p>' }], reviewUpdates: [{ subject: 'Private draft change' }] };
  it('uses the published edition when available', async () => {
    getPublishedHandbook.mockResolvedValue(published);
    expect(await getPortalHandbookEdition(2, { referenceOnly: true })).toEqual(published);
    expect(sourceForAgency).not.toHaveBeenCalled();
  });
  it('uses only the token agency’s company source for optional reading without publishing or exposing draft updates', async () => {
    getPublishedHandbook.mockResolvedValue({ version: null, sections: [] });
    sourceForAgency.mockResolvedValue(source);
    const result = await getPortalHandbookEdition(2, { referenceOnly: true });
    expect(getPublishedHandbook).toHaveBeenCalledWith(2);
    expect(sourceForAgency).toHaveBeenCalledWith(2);
    expect(result).toMatchObject({ beta: true, version: null, revision: 'r1', metadata: { organization: 'ITSCO' }, sections: source.sections, updates: [] });
    expect(JSON.stringify(result)).not.toContain('Private draft change');
  });
  it('never substitutes a reference edition for an onboarding acknowledgement', async () => {
    getPublishedHandbook.mockResolvedValue({ version: null, sections: [] });
    sourceForAgency.mockResolvedValue(source);
    expect(await getPortalHandbookEdition(2)).toBeNull();
    expect(sourceForAgency).not.toHaveBeenCalled();
  });
  it('also recovers an empty published edition for optional reading', async () => {
    getPublishedHandbook.mockResolvedValue({ version: { id: 8 }, sections: [] });
    sourceForAgency.mockResolvedValue(source);
    expect(await getPortalHandbookEdition(2, { referenceOnly: true })).toMatchObject({ beta: true, version: null, sections: source.sections });
  });
  it('returns unavailable for a company without its own source', async () => {
    getPublishedHandbook.mockResolvedValue({ version: null, sections: [] });
    sourceForAgency.mockResolvedValue(null);
    expect(await getPortalHandbookEdition(99, { referenceOnly: true })).toBeNull();
    expect(sourceForAgency).toHaveBeenCalledWith(99);
  });
});
