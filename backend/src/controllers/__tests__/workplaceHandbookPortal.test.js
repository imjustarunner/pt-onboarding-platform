import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../prehirePortal.controller.js', () => ({ portalStateForUser: vi.fn(), getPortalTask: vi.fn(), viewPortalSignedFile: vi.fn() }));
vi.mock('../../services/hirePortalWorkflow.service.js', () => ({ savePortalStep: vi.fn(), portalStepSubmissions: vi.fn(), validatePreemployment: vi.fn() }));
vi.mock('../../services/workplaceHandbook.service.js', () => ({ getPublishedHandbook: vi.fn() }));
vi.mock('../../services/hireUserSetup.service.js', () => ({ validateHireUserSetup: vi.fn() }));
vi.mock('../../services/storage.service.js', () => ({ default: { saveAdminDoc: vi.fn() } }));
vi.mock('../../services/prehireSignedReceipt.service.js', () => ({ buildSignedReceipt: vi.fn() }));
vi.mock('../../services/documentSigning.service.js', () => ({ default: {} }));
import { portalStateForUser } from '../prehirePortal.controller.js';
import { savePortalStep } from '../../services/hirePortalWorkflow.service.js';
import { getPublishedHandbook } from '../../services/workplaceHandbook.service.js';
import StorageService from '../../services/storage.service.js';
import { buildSignedReceipt } from '../../services/prehireSignedReceipt.service.js';
import { saveWorkflowStep } from '../hirePortalWorkflow.controller.js';

const req = { portalUser: { id: 9 }, params: { stepKey: 'handbook' }, body: { acknowledged: true, handbookVersionId: 10, signatureData: 'signed' } };
beforeEach(() => {
  vi.resetAllMocks();
  portalStateForUser.mockResolvedValue({ agency: { id: 2, name: 'ITSCO' }, candidate: { status: 'ONBOARDING', firstName: 'Test', lastName: 'Person' }, workflow: { profile: {}, steps: { onboarding: [{ key: 'handbook', kind: 'handbook', title: 'Handbook acknowledgement' }] } } });
  getPublishedHandbook.mockResolvedValue({ version: { id: 10, version_number: 3 }, sections: [{ slug: 'welcome' }] });
  buildSignedReceipt.mockResolvedValue(Buffer.from('acknowledgement'));
  StorageService.saveAdminDoc.mockResolvedValue({ relativePath: 'private/receipt.pdf' });
});
describe('candidate in-app handbook acknowledgement', () => {
  it('retains the exact reviewed version and signs a receipt without an external handbook URL', async () => {
    const res = { json: vi.fn() }; const next = vi.fn();
    await saveWorkflowStep(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(getPublishedHandbook).toHaveBeenCalledWith(2);
    expect(savePortalStep).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, userId: 9, value: { title: 'Handbook acknowledgement', handbookVersionId: 10, handbookVersionNumber: 3, acknowledged: true, receiptPath: 'private/receipt.pdf' } }));
    expect(buildSignedReceipt.mock.calls[0][0].body).toContain('In-app handbook version 3 (ID 10)');
    expect(buildSignedReceipt.mock.calls[0][0].body).not.toContain('Resource:');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
  it.each([undefined, 9, 11])('rejects missing or changed reviewed version %s', async handbookVersionId => {
    const next = vi.fn();
    await saveWorkflowStep({ ...req, body: { ...req.body, handbookVersionId } }, { json: vi.fn() }, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
    expect(savePortalStep).not.toHaveBeenCalled();
    expect(buildSignedReceipt).not.toHaveBeenCalled();
  });
  it('does not record acknowledgement before a handbook is published', async () => {
    getPublishedHandbook.mockResolvedValue({ version: null, sections: [] });
    const next = vi.fn();
    await saveWorkflowStep(req, { json: vi.fn() }, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(savePortalStep).not.toHaveBeenCalled();
  });
});
