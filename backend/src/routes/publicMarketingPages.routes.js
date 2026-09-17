import { publicCoachingCatalog } from '../services/publicCoachingCatalog.service.js';
import express from 'express';
import pool from '../config/database.js';
import { listPublicReferralNetwork } from '../services/publicReferralNetwork.service.js';
import { listPublicWebsiteIdentities } from '../services/publicWebsiteIdentity.service.js';
import { publicBusinessOnboardingRouter } from './businessOnboarding.routes.js';
import { publicGeocodeLimiter, publicMarketingPageMetricsLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  getPublicMarketingPage,
  getPublicMarketingPageBookingHints,
  getPublicMarketingPageEvents,
  getPublicMarketingPageMetrics,
  getPublicMarketingPageTheme,
  postPublicMarketingPageEventsNearest
} from '../controllers/publicMarketingPages.controller.js';

import { getItscoWebsiteData } from '../services/itscoPublicWebsite.service.js';

import { ingestPublicWebsiteAnalytics, publicAnalyticsIngestLimiter } from './publicWebsiteAnalytics.routes.js';

const router = express.Router();
router.get('/:slug/coaching-catalog', async (req,res,next)=>{try{
 const catalog=await publicCoachingCatalog(String(req.params.slug||'').toLowerCase());
 if(!catalog)return res.status(404).json({error:{message:'Coaching catalog not found'}});
 res.setHeader('Cache-Control','no-store');return res.json(catalog);
}catch(e){next(e);}});

// Only published company websites are exposed; event hubs and private tenants are excluded.
router.get('/referral-network', publicMarketingPageMetricsLimiter, async (req,res,next)=>{try{res.set('Cache-Control','public, max-age=60').json({companies:await listPublicReferralNetwork()});}catch(e){next(e);}});
router.get('/partners', publicMarketingPageMetricsLimiter, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=60').json({partners:await listPublicWebsiteIdentities()});
  } catch (error) { next(error); }
});
router.post('/:slug/analytics/events', publicAnalyticsIngestLimiter, ingestPublicWebsiteAnalytics);
router.get('/itsco/website-data', publicMarketingPageMetricsLimiter, async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json(await getItscoWebsiteData(req)); }
  catch (error) { if (error.status === 404) return res.status(404).json({ error: { message: error.message } }); next(error); }
});
router.use('/ptco/business', publicBusinessOnboardingRouter);

router.get('/:slug', getPublicMarketingPage);
router.get('/:slug/theme', getPublicMarketingPageTheme);
router.get('/:slug/events', getPublicMarketingPageEvents);
router.post('/:slug/events/nearest', publicGeocodeLimiter, postPublicMarketingPageEventsNearest);
router.get('/:slug/metrics', publicMarketingPageMetricsLimiter, getPublicMarketingPageMetrics);
router.get('/:slug/booking-hints', getPublicMarketingPageBookingHints);

export default router;
