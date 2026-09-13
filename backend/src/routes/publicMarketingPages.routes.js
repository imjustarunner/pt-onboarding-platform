import express from 'express';
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
