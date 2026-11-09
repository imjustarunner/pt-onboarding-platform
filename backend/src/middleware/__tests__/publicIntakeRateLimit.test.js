import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../config/config.js', () => ({ default: { nodeEnv: 'production' } }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findByPublicKey: vi.fn() } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/AgencySchool.model.js', () => ({ default: { getActiveAgencyIdForSchool: vi.fn() } }));
vi.mock('../../models/OrganizationAffiliation.model.js', () => ({ default: { getActiveAgencyIdForOrganization: vi.fn() } }));
import IntakeLink from '../../models/IntakeLink.model.js';
import Agency from '../../models/Agency.model.js';
import AgencySchool from '../../models/AgencySchool.model.js';
import OrganizationAffiliation from '../../models/OrganizationAffiliation.model.js';
import { createPublicIntakeRequestLimiter, resolveQaIntakeLinkId } from '../publicIntakeRateLimit.middleware.js';

const qa = { id: 450, slug: 'auricwell-qa-demo', feature_flags: { qaSandbox: { syntheticOnly: true } } };
let ipSequence = 0;
beforeEach(() => {
  vi.resetAllMocks();
  IntakeLink.findByPublicKey.mockImplementation(async key => key.startsWith('qa-')
    ? { id: key === 'qa-school' ? 343 : 339, is_active: 1, scope_type: 'agency', organization_id: 450 }
    : { id: 1, is_active: 1, scope_type: 'agency', organization_id: 1 });
  Agency.findById.mockResolvedValue(qa);
});

function makeClient(limiter) {
  const ip = `192.0.2.${++ipSequence}`;
  return (path, body = {}) => new Promise((resolve, reject) => {
    const req = { path, ip, body, params: {}, query: {}, headers: {}, method: 'POST', app: { get: () => false } };
    const res = { locals: {}, statusCode: 200, headers: {},
      setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
      status(code) { this.statusCode = code; return this; },
      send(payload) { resolve({ status: this.statusCode, headers: this.headers, payload }); }
    };
    limiter(req, res, error => error ? reject(error) : resolve({ status: 200, headers: res.headers }));
  });
}

describe('server-scoped intake request budgets', () => {
  it('keeps 200 ordinary requests despite body/query QA claims, while QA forms have separate budgets', async () => {
    const request = makeClient(createPublicIntakeRequestLimiter());
    for (let i = 0; i < 200; i++) {
      expect((await request('/ordinary/session', { publicKey: `made-up-${i}`, agencyId: 450, skipCaptcha: true })).status).toBe(200);
    }
    const blocked = await request('/different-ordinary/session', { publicKey: 'qa-school' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    const allowed = await request('/qa-school/session');
    expect(allowed.status).toBe(200);
    expect(Number(allowed.headers['ratelimit-limit'])).toBe(2000);
    expect(Number(allowed.headers['ratelimit-remaining'])).toBe(1999);
    expect((await request('/qa-office/session')).status).toBe(200);
  });

  it('enforces a finite per-link QA budget without consuming ordinary or other QA link quotas', async () => {
    const request = makeClient(createPublicIntakeRequestLimiter({ qaMax: 2 }));
    expect((await request('/qa-school/progress')).status).toBe(200);
    expect((await request('/qa-school/consent')).status).toBe(200);
    expect((await request('/qa-school/session')).status).toBe(429);
    expect((await request('/qa-office/session')).status).toBe(200);
    const ordinary = await request('/ordinary/session');
    expect(ordinary.status).toBe(200);
    expect(Number(ordinary.headers['ratelimit-remaining'])).toBe(199);
  });

  it('bounds lookup traffic before querying stored links', async () => {
    const request = makeClient(createPublicIntakeRequestLimiter({ lookupMax: 2 }));
    await request('/qa-school/progress'); await request('/ordinary/session');
    expect((await request('/qa-office/session')).status).toBe(429);
    expect(IntakeLink.findByPublicKey).toHaveBeenCalledTimes(2);
  });

  it('uses normal protection when the database lookup fails', async () => {
    IntakeLink.findByPublicKey.mockRejectedValue(new Error('unavailable'));
    const request = makeClient(createPublicIntakeRequestLimiter());
    expect(Number((await request('/qa-school/session')).headers['ratelimit-limit'])).toBe(200);
  });
});

describe('stored QA agency verification', () => {
  it.each(['agency', 'school'])('resolves an active QA %s from the routed link', async scope => {
    IntakeLink.findByPublicKey.mockResolvedValue({ id: 343, is_active: 1, scope_type: scope, organization_id: scope === 'school' ? 451 : 450 });
    AgencySchool.getActiveAgencyIdForSchool.mockResolvedValue(450);
    expect(await resolveQaIntakeLinkId({ path: '/qa-school/session' })).toBe(343);
  });
  it('uses the stored affiliation fallback for schools', async () => {
    IntakeLink.findByPublicKey.mockResolvedValue({ id: 343, is_active: 1, scope_type: 'school', organization_id: 451 });
    OrganizationAffiliation.getActiveAgencyIdForOrganization.mockResolvedValue(450);
    expect(await resolveQaIntakeLinkId({ path: '/qa-school/session' })).toBe(343);
  });
  it.each([
    { id: 451, slug: qa.slug, feature_flags: qa.feature_flags },
    { ...qa, slug: 'ordinary' },
    { ...qa, feature_flags: { qaSandbox: { syntheticOnly: false } } },
    { ...qa, feature_flags: 'invalid-json' }
  ])('rejects incomplete QA identity: %j', async agency => {
    Agency.findById.mockResolvedValue(agency);
    expect(await resolveQaIntakeLinkId({ path: '/qa-school/session' })).toBeNull();
  });
  it.each([null, { id: 343, is_active: 0 }, { id: 343, is_active: '0' },
    { id: 343, is_active: 1, scope_type: 'school', organization_id: 451 }])('rejects unknown/inactive or unaffiliated links: %j', async link => {
    IntakeLink.findByPublicKey.mockResolvedValue(link);
    AgencySchool.getActiveAgencyIdForSchool.mockResolvedValue(2);
    expect(await resolveQaIntakeLinkId({ path: '/qa-school/session' })).toBeNull();
    expect(Agency.findById).not.toHaveBeenCalled();
  });
  it.each(['/careers/jobs/1', '/school/451', '/registration-receipt/123', '/qa-school%2Fsession', '/'])('does not classify non-link paths using caller flags: %s', async path => {
    expect(await resolveQaIntakeLinkId({ path, body: { publicKey: 'qa-school', agencyId: 450 }, query: { publicKey: 'qa-school' } })).toBeNull();
    expect(IntakeLink.findByPublicKey).not.toHaveBeenCalled();
  });
});
