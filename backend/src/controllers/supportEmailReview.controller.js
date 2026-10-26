import reviewService from '../services/supportReplyReview.service.js';
import { reviewError } from '../utils/supportReplyReview.shared.js';

export function createSupportEmailReviewController(service = reviewService) {
  const agencyFrom = (req) => {
    const value = Number(req.query?.agencyId ?? req.body?.agencyId);
    if (!Number.isSafeInteger(value) || value < 1) throw reviewError('agencyId is required');
    return value;
  };
  return {
    async getDailyReview(req, res, next) {
      try {
        const agencyId = agencyFrom(req);
        const config = await service.authorize(req.user, agencyId);
        res.set('Cache-Control', 'private, no-store');
        res.json(await service.dailyReview({ agencyId, date: req.query?.date, config }));
      } catch (error) { next(error); }
    },
    async getConfig(req, res, next) {
      try {
        const agencyId = agencyFrom(req);
        const config = await service.authorize(req.user, agencyId);
        res.set('Cache-Control', 'private, no-store');
        res.json({ config });
      } catch (error) { next(error); }
    },
    async updateConfig(req, res, next) {
      try {
        const agencyId = agencyFrom(req);
        const config = await service.saveConfig({ ...req.body, agencyId }, req.user);
        res.json({ config });
      } catch (error) { next(error); }
    }
  };
}

const controller = createSupportEmailReviewController();
export const getDailySupportEmailReview = controller.getDailyReview;
export const getSupportEmailReviewConfig = controller.getConfig;
export const updateSupportEmailReviewConfig = controller.updateConfig;
