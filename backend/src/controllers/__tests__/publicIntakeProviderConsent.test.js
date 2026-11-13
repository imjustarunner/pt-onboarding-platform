import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findByPublicKey: vi.fn() } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findBySessionToken: vi.fn(), updateById: vi.fn(), create: vi.fn() } }));
vi.mock('../../services/clientRenewal.service.js', () => ({ findRenewalByPacketPublicKey: vi.fn(), findRenewalByDisclosurePublicKey: vi.fn() }));
vi.mock('../../services/officeIntakeProviders.service.js', () => ({ listOfficeIntakeProviders: vi.fn(), scopeLearningIntakeProviders: vi.fn() }));
import IntakeLink from '../../models/IntakeLink.model.js';
import IntakeSubmission from '../../models/IntakeSubmission.model.js';
import { listOfficeIntakeProviders } from '../../services/officeIntakeProviders.service.js';
import { createPublicConsent,lookupPublicRegistrationAccount,matchPublicIntakeClient } from '../publicIntake.controller.js';
import pool from '../../config/database.js';

let req, res, next;
it('never recognizes an existing account or client through public enrollment lookups',async()=>{
 IntakeLink.findByPublicKey.mockResolvedValue({id:20,is_active:1,form_type:'intake',scope_type:'agency',intake_steps:[{type:'registration'}]});pool.execute.mockResolvedValue([[]]);
 const r=()=>({status:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis(),json:vi.fn()});
 for(const email of ['returning@example.invalid','new@example.invalid']){const response=r();await lookupPublicRegistrationAccount({params:{publicKey:'public'},query:{email}},response,next);expect(response.json).toHaveBeenCalledWith(expect.objectContaining({exists:false,accountState:'unverified',profile:null}));}
 const response=r();await matchPublicIntakeClient({params:{publicKey:'public'},body:{clients:[{fullName:'Someone',dateOfBirth:'2000-01-01'}]}},response,next);expect(response.json).toHaveBeenCalledWith({registration_client_match:'new',registration_matched_client_id:null});
 expect(pool.execute.mock.calls.some(([sql])=>/FROM users|FROM client_guardians|FROM clients WHERE/.test(sql))).toBe(false);
});
beforeEach(() => {
  vi.resetAllMocks();
  IntakeLink.findByPublicKey.mockResolvedValue({ id: 20, is_active: 1, agency_id: 2, form_type: 'intake', scope_type: 'agency', inherits_office_master: 1 });
  IntakeSubmission.findBySessionToken.mockResolvedValue({ id: 10, intake_link_id: 20, status: 'started' });
  IntakeSubmission.updateById.mockResolvedValue({ id: 10 });
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
    expect(IntakeSubmission.create).not.toHaveBeenCalled();
    expect(JSON.parse(IntakeSubmission.updateById.mock.calls[0][1].intake_data)).toMatchObject({ responses: { submission: { providerSelection: { providerId: 7, status: 'WAITLIST', confirmed: false } } } });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
