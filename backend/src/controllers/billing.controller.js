import BillingUsageService from '../services/billingUsage.service.js';
import { buildEstimate } from '../services/billingPricing.service.js';
import { formatPeriodLabel, getCurrentBillingPeriod } from '../utils/billingPeriod.js';

export const getAgencyBillingEstimate = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const parsedAgencyId = parseInt(agencyId, 10);
    if (!parsedAgencyId || Number.isNaN(parsedAgencyId)) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }

    const usage = await BillingUsageService.getUsage(parsedAgencyId);
    const estimate = buildEstimate(usage);
    const period = getCurrentBillingPeriod(new Date());

    res.json({
      agencyId: parsedAgencyId,
      billingCycle: {
        periodStart: period.periodStart.toISOString().slice(0, 10),
        periodEnd: period.periodEnd.toISOString().slice(0, 10),
        label: formatPeriodLabel(period)
      },
      ...estimate
    });
  } catch (error) {
    next(error);
  }
};

