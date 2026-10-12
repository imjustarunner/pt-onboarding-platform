import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../services/providerUpdate.service.js', () => ({ assertAgencyAdmin: vi.fn(), getRecipientByToken: vi.fn(), getPush: vi.fn() }));
vi.mock('../../services/workplaceHandbook.service.js', () => ({ ensureDocument: vi.fn(), getPublishedHandbook: vi.fn(), getPublishedDigestForAgency: vi.fn(), getDraftOrCreate: vi.fn(), publishDraft: vi.fn(), getDigest: vi.fn(), setFullHandbookUrl: vi.fn() }));
vi.mock('../../services/workplaceHandbookWorkflow.service.js', () => ({ sourceForAgency: vi.fn(), stageHandbookSource: vi.fn(), linkHandbookUpdate: vi.fn() }));
vi.mock('../../services/workplaceHandbookAnswer.service.js', () => ({ answerPublishedHandbook: vi.fn() }));
import User from '../../models/User.model.js';
import { assertAgencyAdmin, getRecipientByToken, getPush } from '../../services/providerUpdate.service.js';
import { getPublishedDigestForAgency, getPublishedHandbook, getDraftOrCreate, publishDraft, getDigest, setFullHandbookUrl } from '../../services/workplaceHandbook.service.js';
import { assertHandbookReader, getPublished, getLibraryHandbook, publish, publicPublishedByToken, getDigestHandler, saveFullHandbookUrl, answerQuestion, answerQuestionByToken } from '../workplaceHandbook.controller.js';
import { sourceForAgency } from '../../services/workplaceHandbookWorkflow.service.js';
import { answerPublishedHandbook } from '../../services/workplaceHandbookAnswer.service.js';
import { handbookResponseForReader } from '../../services/workplaceHandbookAccess.js';

beforeEach(() => vi.resetAllMocks());
describe('library handbook reading', () => {
  it('shows the supplied company beta edition when publication is not ready', async () => {
    User.getAgencies.mockResolvedValue([{ id: 2 }]);
    getPublishedHandbook.mockResolvedValue({ version: null, sections: [] });
    sourceForAgency.mockResolvedValue({ organization: 'ITSCO', title: 'Workplace Handbook', revision: 'r1', sections: [{ slug: 'welcome', body_html: '<p>Our handbook</p>' }], reviewUpdates: [{ subject: 'Unpublished draft change' }] });
    const res = { json: vi.fn(), set: vi.fn() }, next = vi.fn();
    await getLibraryHandbook({ user: { id: 7, role: 'provider' }, query: { agencyId: 2 } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].handbook).toMatchObject({ beta: true, revision: 'r1', metadata: { organization: 'ITSCO' }, sections: [{ slug: 'welcome' }] });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('Unpublished draft change');
    expect(getDraftOrCreate).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
  it('prefers the published edition and never exposes another organization’s source', async () => {
    const published = { version: { id: 10 }, sections: [{ slug: 'policy' }] };
    User.getAgencies.mockResolvedValue([{ id: 2 }]); getPublishedHandbook.mockResolvedValue(published);
    const res = { json: vi.fn(), set: vi.fn() }, next = vi.fn();
    await getLibraryHandbook({ user: { id: 7 }, query: { agencyId: 2 } }, res, next);
    expect(res.json.mock.calls[0][0].handbook).toEqual(published);
    expect(sourceForAgency).not.toHaveBeenCalled();
    getPublishedHandbook.mockClear();
    await getLibraryHandbook({ user: { id: 7 }, query: { agencyId: 99 } }, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(getPublishedHandbook).not.toHaveBeenCalled();
  });
});
describe('handbook answer authorization', () => {
  it('denies a user from another organization before loading policies or using AI', async () => {
    User.getAgencies.mockResolvedValue([{ id: 3 }]);
    const next = vi.fn();
    await answerQuestion({ user: { id: 7, role: 'provider' }, body: { agencyId: 2, question: 'PTO please' } }, { json: vi.fn() }, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(answerPublishedHandbook).not.toHaveBeenCalled();
  });
  it('answers for a member and prevents HTTP caching of the conversation', async () => {
    User.getAgencies.mockResolvedValue([{ id: 2 }]);
    answerPublishedHandbook.mockResolvedValue({ status: 'answered' });
    const res = { json: vi.fn(), set: vi.fn() };
    await answerQuestion({ user: { id: 7, role: 'provider' }, body: { agencyId: 2, question: 'PTO please' } }, res, vi.fn());
    expect(answerPublishedHandbook).toHaveBeenCalledWith(2, expect.objectContaining({ question: 'PTO please' }), 7, 'handbook');
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
  it('uses the token organization regardless of the submitted agency ID or signed-in role', async () => {
    getRecipientByToken.mockResolvedValue({ agency_id: 2, user_id: 8 });
    const res = { json: vi.fn(), set: vi.fn() };
    await answerQuestionByToken({ params: { token: 'recipient' }, user: { role: 'super_admin' }, body: { agencyId: 99, question: 'PTO please' } }, res, vi.fn());
    expect(answerPublishedHandbook).toHaveBeenCalledWith(2, expect.any(Object), 8, 'handbook');
  });
  it('rejects invalid recipient links without invoking AI', async () => {
    getRecipientByToken.mockResolvedValue(null);
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await answerQuestionByToken({ params: { token: 'invalid' }, body: { question: 'PTO please' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404); expect(answerPublishedHandbook).not.toHaveBeenCalled();
  });
});
describe('handbook request access and publication identity', () => {
  it('rejects invalid agency IDs and readers from another organization', async () => {
    await expect(assertHandbookReader({ id: 7, role: 'provider' }, -1)).rejects.toMatchObject({ status: 400 });
    User.getAgencies.mockResolvedValue([{ id: 3 }]);
    await expect(assertHandbookReader({ id: 7, role: 'provider' }, 2)).rejects.toMatchObject({ status: 403 });
    const next = vi.fn();
    await getPublished({ user: { id: 7, role: 'provider' }, query: { agencyId: 2 }, params: {} }, { json: vi.fn() }, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(getPublishedHandbook).not.toHaveBeenCalled();
    expect(getPublishedDigestForAgency).not.toHaveBeenCalled();
  });
  it('allows a member to read their organization’s published handbook', async () => {
    User.getAgencies.mockResolvedValue([{ id: 2 }]);
    getPublishedDigestForAgency.mockResolvedValue({ digest: null, entries: [] });
    getPublishedHandbook.mockResolvedValue({ version: { id: 10 }, sections: [{ slug: 'welcome' }] });
    const res = { json: vi.fn() }; const next = vi.fn();
    await getPublished({ user: { id: 7, role: 'provider' }, query: { agencyId: 2 }, params: {} }, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ handbook: { version: { id: 10 }, sections: [{ slug: 'welcome' }] } }));
    expect(next).not.toHaveBeenCalled();
  });
  it('publishes the exact reviewed version on retry without silently creating another draft', async () => {
    assertAgencyAdmin.mockResolvedValue(2);
    publishDraft.mockResolvedValue({ publication: { versionId: 10, alreadyPublished: true } });
    await publish({ user: { id: 4, role: 'admin' }, body: { agencyId: 2, versionId: 10 } }, { json: vi.fn() }, vi.fn());
    expect(getDraftOrCreate).not.toHaveBeenCalled();
    expect(publishDraft).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, versionId: 10, publishedByUserId: 4 }));
  });
});

describe('original handbook access', () => {
  const original = 'https://docs.google.com/document/d/original-handbook';
  const publishedAt = new Date('2026-10-10T12:00:00Z');
  function setupPublished() {
    User.getAgencies.mockResolvedValue([{ id: 2 }]);
    getPublishedDigestForAgency.mockResolvedValue({ fullHandbookUrl: original, digest: { id: 7, published_at: publishedAt }, entries: [] });
    getPublishedHandbook.mockResolvedValue({ document: { id: 1, full_handbook_url: original }, version: { id: 10 }, sections: [{ slug: 'welcome', body_html: '<p>Read this policy in the app.</p>' }] });
  }
  it.each(['provider', 'staff', 'support', undefined])('keeps %s responses readable without disclosing the original URL', async role => {
    setupPublished();
    const res = { json: vi.fn() }; const next = vi.fn();
    await getPublished({ user: { id: 7, role }, query: { agencyId: 2 }, params: {} }, res, next);
    expect(next).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain(original);
    expect(body.handbook.sections[0].body_html).toContain('Read this policy in the app.');
    expect(body.digest.published_at).toEqual(publishedAt);
    expect(body.access).toEqual({ canOpenOriginal: false, canPrint: false });
  });
  it.each(['admin', 'super_admin', 'superadmin'])('retains original access for an authorized %s', async role => {
    setupPublished();
    const res = { json: vi.fn() };
    await getPublished({ user: { id: 7, role }, query: { agencyId: 2 }, params: {} }, res, vi.fn());
    expect(res.json.mock.calls[0][0]).toMatchObject({ fullHandbookUrl: original, handbook: { document: { full_handbook_url: original } }, access: { canOpenOriginal: true, canPrint: true } });
  });
  it('still rejects an admin from a different organization', async () => {
    setupPublished(); User.getAgencies.mockResolvedValue([{ id: 3 }]);
    const res = { json: vi.fn() }; const next = vi.fn();
    await getPublished({ user: { id: 7, role: 'admin' }, query: { agencyId: 2 }, params: {} }, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(res.json).not.toHaveBeenCalled();
  });
  it('restricts recipient links even when the request carries an admin session', async () => {
    setupPublished();
    getRecipientByToken.mockResolvedValue({ id: 5, agency_id: 2, provider_user_id: 9, push_id: 4 });
    getPush.mockResolvedValue({ id: 4 });
    const res = { json: vi.fn() }; const next = vi.fn();
    await publicPublishedByToken({ user: { id: 7, role: 'super_admin' }, params: { token: 'recipient-link' } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain(original);
    expect(res.json.mock.calls[0][0].access).toEqual({ canOpenOriginal: false, canPrint: false });
    expect(getPublishedHandbook).toHaveBeenCalledWith(2);
  });
  it('redacts original URLs from support update responses as well as the book', async () => {
    assertAgencyAdmin.mockResolvedValue(2);
    getDigest.mockResolvedValue({ digest: { id: 7 }, fullHandbookUrl: original, entries: [] });
    const res = { json: vi.fn() };
    await getDigestHandler({ user: { id: 7, role: 'support' }, query: { agencyId: 2 }, params: { digestId: 7 } }, res, vi.fn());
    expect(res.json.mock.calls[0][0].fullHandbookUrl).toBeUndefined();
    expect(res.json.mock.calls[0][0].access.canOpenOriginal).toBe(false);
  });
  it.each(['support', 'provider'])('rejects original-link management by %s before writing', async role => {
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
    await saveFullHandbookUrl({ user: { id: 7, role }, body: { agencyId: 2, url: original } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(setFullHandbookUrl).not.toHaveBeenCalled();
  });
  it('does not mutate shared payloads or discard dates while redacting nested URLs', () => {
    const payload = { fullHandbookUrl: original, history: [{ document: { full_handbook_url: original }, published_at: publishedAt }] };
    const result = handbookResponseForReader(payload);
    expect(JSON.stringify(result)).not.toContain(original);
    expect(result.history[0].published_at).toBe(publishedAt);
    expect(payload.history[0].document.full_handbook_url).toBe(original);
    expect(handbookResponseForReader(payload, { role: 'admin' }).fullHandbookUrl).toBe(original);
  });
  it('removes original document links from candidate workflow steps and settings while retaining acknowledgement receipts', () => {
    const receipt = '/prehire-portal/token/workflow/onboarding/handbook/file';
    const payload = { handbookLinks: { fullUrl: original, acknowledgementUrl: receipt }, workflow: { config: { handbookUrl: original }, steps: { pre_hire: [{ kind: 'handbook', url: original }], onboarding: [{ kind: 'handbook', url: original, submission: { receiptPath: receipt } }] } } };
    const result = handbookResponseForReader(payload);
    expect(JSON.stringify(result)).not.toContain(original);
    expect(result.handbookLinks.acknowledgementUrl).toBe(receipt);
    expect(result.workflow.steps.onboarding[0].submission.receiptPath).toBe(receipt);
    expect(payload.handbookLinks.fullUrl).toBe(original);
  });
});
