import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../services/intakeResponsesEncryption.service.js', () => ({ decryptIntakeSubmissionRows: vi.fn() }));
import pool from '../../config/database.js';
import IntakeSubmissionDocument from '../IntakeSubmissionDocument.model.js';

beforeEach(() => vi.resetAllMocks());
it('keeps explicit child ownership and scopes older personalized ROIs to the primary child', async () => {
  const roi = { audit_trail: JSON.stringify({ smartSchoolRoi: true }), signed_pdf_path: 'private.pdf' };
  pool.execute.mockResolvedValue([[
    { ...roi, id: 1, client_id: 4 }, { ...roi, id: 2, client_id: 5 },
    { ...roi, id: 3, client_id: null, submission_client_id: 4 },
    { ...roi, id: 4, client_id: null, submission_client_id: 5 },
    { id: 5, client_id: null, document_template_name: 'Shared consent', signed_pdf_path: 'consent.pdf' }
  ]]);
  expect((await IntakeSubmissionDocument.listSignedForClient(4)).map(d => d.id)).toEqual([1, 3, 5]);
});
