import rateLimit from 'express-rate-limit';
import IntakeLink from '../models/IntakeLink.model.js';
import Agency from '../models/Agency.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';
import { getClientIpAddress } from '../utils/ipAddress.util.js';
import { publicIntakeLimiter } from './rateLimiter.middleware.js';

const reservedPaths = new Set(['application-documents', 'registration-receipt', 'careers', 'school']);

// router.use runs before :publicKey is populated. Only the routed path can
// select a link; body/query flags must never select the QA allowance.
export async function resolveQaIntakeLinkId(req) {
  const segment = String(req.path || '').split('/')[1] || '';
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(segment) || reservedPaths.has(segment)) return null;
  const link = await IntakeLink.findByPublicKey(segment);
  if (!link || ![true, 1, '1'].includes(link.is_active)) return null;
  let agencyId = null;
  if (link.scope_type === 'agency') agencyId = Number(link.organization_id);
  if (link.scope_type === 'school') {
    agencyId = Number(await AgencySchool.getActiveAgencyIdForSchool(link.organization_id)
      || await OrganizationAffiliation.getActiveAgencyIdForOrganization(link.organization_id));
  }
  if (agencyId !== 450) return null;
  const agency = await Agency.findById(agencyId);
  return isAuricwellQaAgency(agency) && Number(link.id) > 0 ? Number(link.id) : null;
}

export function createPublicIntakeRequestLimiter({
  normalLimiter = publicIntakeLimiter,
  resolveQaLinkId = resolveQaIntakeLinkId,
  qaMax = 2000,
  lookupMax = 10000
} = {}) {
  const options = {
    windowMs: 15 * 60 * 1000,
    message: { error: { message: 'Too many intake requests, please try again later' } },
    standardHeaders: true,
    legacyHeaders: false
  };
  // Bound database classification even for unknown/rotating link URLs.
  const lookupLimiter = rateLimit({ ...options, max: lookupMax,
    requestPropertyName: 'intakeLookupRateLimit',
    keyGenerator: req => `intake-lookup:${getClientIpAddress(req) || 'unknown'}` });
  const qaLimiter = rateLimit({ ...options, max: qaMax,
    keyGenerator: (_req, res) => `qa-intake:${res.locals.qaIntakeRateLinkId}:${getClientIpAddress(_req) || 'unknown'}` });
  return (req, res, next) => lookupLimiter(req, res, async error => {
    if (error) return next(error);
    let qaLinkId = null;
    try { qaLinkId = await resolveQaLinkId(req); } catch { /* Unverified links keep ordinary limits. */ }
    if (!Number.isSafeInteger(qaLinkId) || qaLinkId <= 0) return normalLimiter(req, res, next);
    res.locals.qaIntakeRateLinkId = qaLinkId;
    return qaLimiter(req, res, next);
  });
}

export const publicIntakeRequestLimiter = createPublicIntakeRequestLimiter();
