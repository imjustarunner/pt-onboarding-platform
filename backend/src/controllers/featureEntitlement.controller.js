import {
  enableTenantFeature,
  disableTenantFeature,
  enableUserFeature,
  disableUserFeature,
  listTenantFeatures,
  listEntitledUsers,
  listTenantEvents,
  listUserEvents,
  listUserFeatures,
  listEligibleTenantUsers
} from '../services/featureEntitlement.service.js';
import { computeFeatureBillingForPeriod } from '../services/featureBilling.service.js';
import { getEffectiveBillingPricingForAgency, getFeatureCatalog } from '../services/billingPricing.service.js';
import { getCurrentBillingPeriod } from '../utils/billingPeriod.js';
import User from '../models/User.model.js';

function actorFromReq(req) {
  return { id: req.user?.id || null, role: req.user?.role || null };
}

function parseAgencyId(req) {
  const v = parseInt(req.params.agencyId, 10);
  if (!v || Number.isNaN(v)) return null;
  return v;
}

export const setTenantFeatureToggle = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const featureKey = String(req.body?.featureKey || req.params?.featureKey || '').trim();
    const enabled = !!req.body?.enabled;
    const notes = req.body?.notes ? String(req.body.notes) : null;
    if (!featureKey) return res.status(400).json({ error: { message: 'featureKey is required' } });
    const fn = enabled ? enableTenantFeature : disableTenantFeature;
    const result = await fn(agencyId, featureKey, { actor: actorFromReq(req), notes });
    res.json(result);
  } catch (e) { next(e); }
};

export const setUserFeatureToggle = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const userId = parseInt(req.params.userId || req.body?.userId, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid userId' } });
    const featureKey = String(req.body?.featureKey || req.params?.featureKey || '').trim();
    const enabled = !!req.body?.enabled;
    const notes = req.body?.notes ? String(req.body.notes) : null;
    if (!featureKey) return res.status(400).json({ error: { message: 'featureKey is required' } });

    const fn = enabled ? enableUserFeature : disableUserFeature;
    const result = await fn(agencyId, userId, featureKey, { actor: actorFromReq(req), notes });

    // Keep the legacy `users.has_X_access` denormalization in sync for hot-path
    // gating reads (frontend nav, controllers that haven't yet been migrated).
    if (featureKey === 'gamesPlatformEnabled') {
      try {
        await User.update(userId, { hasGamesAccess: enabled });
      } catch (e) {
        console.warn('Legacy has_games_access sync failed:', e?.message || e);
      }
    }

    res.json(result);
  } catch (e) { next(e); }
};

export const listAgencyFeatureCurrentState = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const features = await listTenantFeatures(agencyId);
    const userIdParam = req.query.userId ? parseInt(req.query.userId, 10) : null;
    let userFeatures = null;
    if (userIdParam && !Number.isNaN(userIdParam)) {
      userFeatures = await listUserFeatures(userIdParam, { agencyId });
    }
    res.json({ agencyId, features, ...(userFeatures ? { userFeatures } : {}) });
  } catch (e) { next(e); }
};

export const listFeatureEntitledUsers = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const featureKey = String(req.params.featureKey || req.query.featureKey || '').trim();
    if (!featureKey) return res.status(400).json({ error: { message: 'featureKey is required' } });
    const [users, candidates] = await Promise.all([
      listEntitledUsers(agencyId, featureKey),
      listEligibleTenantUsers(agencyId)
    ]);
    res.json({ agencyId, featureKey, users, candidates });
  } catch (e) { next(e); }
};

export const getFeatureBillingPreview = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const periodStart = req.query.periodStart ? new Date(String(req.query.periodStart)) : null;
    const periodEnd = req.query.periodEnd ? new Date(String(req.query.periodEnd)) : null;
    const period = (periodStart && periodEnd && !Number.isNaN(periodStart.getTime()) && !Number.isNaN(periodEnd.getTime()))
      ? { periodStart, periodEnd }
      : getCurrentBillingPeriod(new Date());
    const pricingBundle = await getEffectiveBillingPricingForAgency(agencyId);
    const billing = await computeFeatureBillingForPeriod(agencyId, period.periodStart, period.periodEnd, pricingBundle.effective);
    res.json({
      agencyId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      featureCatalog: getFeatureCatalog(pricingBundle.effective),
      billing
    });
  } catch (e) { next(e); }
};

export const auditTenantEvents = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req) || (req.query.agencyId ? parseInt(req.query.agencyId, 10) : null);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const featureKey = req.query.featureKey ? String(req.query.featureKey) : null;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
    const events = await listTenantEvents(agencyId, { featureKey, limit, offset });
    res.json({ agencyId, featureKey, events });
  } catch (e) { next(e); }
};

export const auditUserEvents = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : (req.params.agencyId ? parseInt(req.params.agencyId, 10) : null);
    const featureKey = req.query.featureKey ? String(req.query.featureKey) : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
    const actorUserId = req.query.actorUserId ? parseInt(req.query.actorUserId, 10) : null;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
    const events = await listUserEvents({ agencyId, featureKey, userId, actorUserId, limit, offset });
    res.json({ agencyId, featureKey, userId, events });
  } catch (e) { next(e); }
};
