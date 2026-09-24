import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), findSigned: vi.fn(), findSource: vi.fn(), createSigned: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/SignedDocument.model.js', () => ({ default: { findByTask: mocks.findSigned, create: mocks.createSigned } }));
vi.mock('../../models/UserSpecificDocument.model.js', () => ({ default: { findByTask: mocks.findSource } }));
import DocumentSigningService from '../documentSigning.service.js';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue([[{ id: 1, reference_id: 9, metadata: { contractGeneration: true } }]]);
});
describe('contract signing guard', () => {
  it('rejects formatting-split placeholders before recording a signature', async () => {
    mocks.findSigned.mockResolvedValue(null);
    mocks.findSource.mockResolvedValue({ template_type: 'html', html_content: '<p>{{COMPANY<em>NAME}} ... {{ROLE</em>LABEL}}</p>' });
    await expect(DocumentSigningService.signTask({ taskId: 1, userId: 2, signatureData: 'signature' })).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.createSigned).not.toHaveBeenCalled();
  });
  it('returns an already signed agreement without replacing its content', async () => {
    const signedDocument = { id: 4, signed_pdf_path: 'signed.pdf' };
    mocks.findSigned.mockResolvedValue(signedDocument);
    expect(await DocumentSigningService.signTask({ taskId: 1, userId: 2, signatureData: 'signature' })).toEqual({ alreadyFinalized: true, signedDocument });
    expect(mocks.findSource).not.toHaveBeenCalled();
  });
});
