import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import {
  coloradoBillingRules,
  saveCredentialRule,
  saveProviderServiceGrant
} from '../services/billingRules.service.js';

async function agencyFrom(req) {
  const agencyId = Number(req.body?.agencyId || req.query?.agencyId);
  if (!Number.isSafeInteger(agencyId) || agencyId < 1) {
    throw Object.assign(new Error('agencyId is required.'), { status: 400 });
  }
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
  return agencyId;
}

export async function getBillingRules(req, res, next) {
  try {
    const agencyId = await agencyFrom(req);
    res.json(await coloradoBillingRules(agencyId));
  } catch (error) {
    next(error);
  }
}

export async function putBillingCredentialRule(req, res, next) {
  try {
    const agencyId = await agencyFrom(req);
    await saveCredentialRule({
      serviceCode: req.body?.serviceCode,
      credentialTier: req.body?.credentialTier,
      allowed: req.body?.allowed === true || req.body?.allowed === 1 || req.body?.allowed === '1',
      actorUserId: req.user?.id
    });
    res.json(await coloradoBillingRules(agencyId));
  } catch (error) {
    next(error);
  }
}

export async function putProviderServiceGrant(req, res, next) {
  try {
    const agencyId = await agencyFrom(req);
    const userId = Number(req.body?.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(400).json({ error: { message: 'userId is required.' } });
    }
    await saveProviderServiceGrant({
      agencyId,
      userId,
      serviceCode: req.body?.serviceCode,
      enabled: req.body?.enabled === true || req.body?.enabled === 1 || req.body?.enabled === '1',
      actorUserId: req.user?.id
    });
    res.json(await coloradoBillingRules(agencyId));
  } catch (error) {
    next(error);
  }
}
