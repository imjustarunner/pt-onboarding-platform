import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findByPublicKey: vi.fn() } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findBySessionToken: vi.fn(), updateById: vi.fn(), create: vi.fn() } }));
vi.mock('../../services/clientRenewal.service.js', () => ({ findRenewalByPacketPublicKey: vi.fn(), findRenewalByDisclosurePublicKey: vi.fn() }));
vi.mock('../../services/officeIntakeProviders.service.js', () => ({ listOfficeIntakeProviders: vi.fn(), scopeLearningIntakeProviders: vi.fn() }));
import IntakeLink from '../../models/IntakeLink.model.js';
import IntakeSubmission from '../../models/IntakeSubmission.model.js';
import { listOfficeIntakeProviders } from '../../services/officeIntakeProviders.service.js';
import { createPublicConsent } from '../publicIntake.controller.js';

let req, res, next;
beforeEach(() => {
  vi.resetAllMocks();
  IntakeLink.findByPublicKey.mockResolvedValue({ id: 20, is_active: 1, agency_id: 2, form_type: 'intake', scope_type: 'agency', inherits_office_master: 1 });
  IntakeSubmission.findBySessionToken.mockResolvedValue(null);
  IntakeSubmission.create.mockResolvedValue({ id: 10 });
  req = { params: { publicKey: 'full-intake' }, get: () => 'test', headers: {}, body: {
    signerName: 'Test Person', signerEmail: 'person@example.test', sessionToken: 'new-enrollment',
    intakeData: { responses: { submission: { enrollment_source: 'provider', requested_profile_provider_id: 7, preferred_service_format: 'VIRTUAL' } } }
  } };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  next = vi.fn();
});

describe('provider-origin full enrollment consent gate', () => {
  it('rejects a closed or no-longer-eligible provider before creating an enrollment submission', async () => {
    listOfficeIntakeProviders.mockResolvedValue([]);
    await createPublicConsent(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
    expect(IntakeSubmission.create).not.toHaveBeenCalled();
    expect(IntakeSubmission.updateById).not.toHaveBeenCalled();
  });
  it('stores the waitlist request and desired provider on the first consented submission', async () => {
    listOfficeIntakeProviders.mockResolvedValue([{ id: 7, name: 'Requested Provider', intakeStatusByFormat: { VIRTUAL: 'waitlist', IN_PERSON: 'accepting' } }]);
    await createPublicConsent(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(IntakeSubmission.create).toHaveBeenCalledWith(expect.objectContaining({ intakeData: expect.objectContaining({ responses: { submission: expect.objectContaining({ providerSelection: expect.objectContaining({ providerId: 7, status: 'WAITLIST', confirmed: false }) }) } }) }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
