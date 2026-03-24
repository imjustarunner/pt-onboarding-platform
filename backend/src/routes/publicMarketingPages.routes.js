import express from 'express';
import { publicGeocodeLimiter, publicMarketingPageMetricsLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  getPublicMarketingPage,
  getPublicMarketingPageBookingHints,
  getPublicMarketingPageEvents,
  getPublicMarketingPageMetrics,
  getPublicMarketingPageTheme,
  postPublicMarketingPageEventsNearest
} from '../controllers/publicMarketingPages.controller.js';

const router = express.Router();

router.get('/:slug', getPublicMarketingPage);
router.get('/:slug/theme', getPublicMarketingPageTheme);
router.get('/:slug/events', getPublicMarketingPageEvents);
router.post('/:slug/events/nearest', publicGeocodeLimiter, postPublicMarketingPageEventsNearest);
router.get('/:slug/metrics', publicMarketingPageMetricsLimiter, getPublicMarketingPageMetrics);
router.get('/:slug/booking-hints', getPublicMarketingPageBookingHints);

export default router;
