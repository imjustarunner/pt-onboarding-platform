import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../config/config.js', () => ({ default: {
  nodeEnv: 'production', recaptcha: { secretKey: 'test-secret', minScore: 0.3 }
} }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findByPublicKey: vi.fn() } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { countStartsByLinkAndIp: vi.fn(), create: vi.fn() } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/AgencySchool.model.js', () => ({ default: { getActiveAgencyIdForSchool: vi.fn() } }));
vi.mock('../../services/clientUpdate.service.js', () => ({
  isClientUpdatePacket: vi.fn(() => false), resolveClientUpdatePacketBinding: vi.fn(), assertClientUpdateSubmissionContext: vi.fn()
}));
vi.mock('../../services/clientRenewal.service.js', () => ({ findRenewalByPacketPublicKey: vi.fn(), findRenewalByDisclosurePublicKey: vi.fn() }));
vi.mock('../../services/captcha.service.js', () => ({ verifyRecaptchaV3: vi.fn() }));

import IntakeLink from '../../models/IntakeLink.model.js';
import IntakeSubmission from '../../models/IntakeSubmission.model.js';
import Agency from '../../models/Agency.model.js';
import AgencySchool from '../../models/AgencySchool.model.js';
import { verifyRecaptchaV3 } from '../../services/captcha.service.js';
import { createPublicIntakeSession } from '../publicIntake.controller.js';

const qa = { id: 450, slug: 'auricwell-qa-demo', feature_flags: { qaSandbox: { syntheticOnly: true } } };
let req, res, next;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('RECAPTCHA_REQUIRED_FOR_ALL', 'true');
  vi.stubEnv('RECAPTCHA_SITE_KEY_INTAKE', 'test-site-key');
  IntakeLink.findByPublicKey.mockResolvedValue({ id: 20, scope_type: 'agency', organization_id: 450, form_type: 'intake', is_active: true });
  Agency.findById.mockImplementation(async id => Number(id) === 450 ? qa : { id: Number(id), name: 'Other organization' });
  AgencySchool.getActiveAgencyIdForSchool.mockResolvedValue(450);
  // Stop safely at the next security boundary: no real session or messages.
  IntakeSubmission.countStartsByLinkAndIp.mockResolvedValue(50);
  req = { params: { publicKey: 'synthetic-key' }, body: {}, query: {}, headers: {}, ip: '192.0.2.1',
    get: vi.fn(name => name === 'host' ? 'app.itsco.health' : undefined) };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  next = vi.fn();
});
afterEach(() => vi.unstubAllEnvs());

describe('public intake server CAPTCHA enforcement', () => {
  it.each(['agency', 'school'])('permits token-free QA %s starts while retaining the rate limit', async scope => {
    IntakeLink.findByPublicKey.mockResolvedValue({ id: 20, scope_type: scope, organization_id: scope === 'school' ? 451 : 450, form_type: 'intake', is_active: true });
    await createPublicIntakeSession(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(IntakeSubmission.countStartsByLinkAndIp).toHaveBeenCalled();
    expect(verifyRecaptchaV3).not.toHaveBeenCalled();
    expect(IntakeSubmission.create).not.toHaveBeenCalled();
  });

  it('rejects a token-free production start even when the request claims to be QA', async () => {
    IntakeLink.findByPublicKey.mockResolvedValue({ id: 21, scope_type: 'agency', organization_id: 1, form_type: 'intake', is_active: true });
    req.body = { agencyId: 450, qaSandbox: { syntheticOnly: true }, skipCaptcha: true };
    req.query = { agencyId: 450, skipCaptcha: 'true' };
    await createPublicIntakeSession(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'Captcha is required' } });
    expect(IntakeSubmission.countStartsByLinkAndIp).not.toHaveBeenCalled();
  });

  it('still verifies submitted CAPTCHA tokens outside QA', async () => {
    IntakeLink.findByPublicKey.mockResolvedValue({ id: 21, scope_type: 'agency', organization_id: 1, form_type: 'intake', is_active: true });
    req.body.captchaToken = 'test-token';
    verifyRecaptchaV3.mockResolvedValue({ ok: true, score: 0.9 });
    await createPublicIntakeSession(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(verifyRecaptchaV3).toHaveBeenCalledWith(expect.objectContaining({ token: 'test-token' }));
    expect(res.status).toHaveBeenCalledWith(429);
  });
});
