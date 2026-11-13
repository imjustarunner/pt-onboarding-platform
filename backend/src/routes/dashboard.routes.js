import express from 'express';
import { authenticate, requireAgencyAccess, requireBackofficeAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { requireAgencyAccess as tenantAccess } from '../middleware/agencyAccess.middleware.js';
import { getAgencySpecs, getOrgOverviewSummary, getScheduleSnapshot, getPlatformTenantSummary } from '../controllers/dashboard.controller.js';
import {
  getSchoolOverview,
  listSchoolInternalNotes,
  createSchoolInternalNote
} from '../controllers/schoolOverview.controller.js';
import { listForDashboard } from '../controllers/socialFeedLinks.controller.js';
import { getDashboardReferralTotals } from '../controllers/referralTotals.controller.js';

const router = express.Router();
router.get('/school-closures',authenticate,async(req,res,next)=>{
  try {
    const {mySchoolClosureDashboard}=await import('../services/schoolClosureDashboard.service.js');
    const agencyId=req.query.agencyId==null?null:Number(req.query.agencyId);
    if(agencyId!==null&&(!Number.isSafeInteger(agencyId)||agencyId<1))return res.status(400).json({error:{message:'Invalid agency'}});
    res.set('Cache-Control','no-store').json({closures:await mySchoolClosureDashboard({user:req.user,agencyId})});
  }catch(error){next(error);}
});
router.post('/school-closures/:eventId/dismiss',authenticate,async(req,res,next)=>{
  try {
    const {dismissMySchoolClosure}=await import('../services/schoolClosureDashboard.service.js');
    res.json(await dismissMySchoolClosure({user:req.user,eventId:req.params.eventId,revision:req.body?.revision}));
  }catch(error){if(error.status)return res.status(error.status).json({error:{message:error.message}});next(error);}
});

// At-a-glance dashboard metrics (admin dashboards) - tenant scoped via agencyAccess middleware
router.get('/agency-specs', authenticate, tenantAccess, requireBackofficeAdmin, getAgencySpecs);

router.get('/referral-totals', authenticate, requireBackofficeAdmin, getDashboardReferralTotals);

// Schedule snapshot for tenant admin dashboard (today's real sessions)
router.get('/schedule-snapshot', authenticate, tenantAccess, requireBackofficeAdmin, getScheduleSnapshot);

// Platform-level tenant summary (super admin only - all tenants with real metrics)
router.get('/platform-tenant-summary', authenticate, requireSuperAdmin, getPlatformTenantSummary);

// Lightweight affiliated org counts (admin dashboards)
router.get('/org-overview-summary', authenticate, requireAgencyAccess, getOrgOverviewSummary);

// School overview (admin/staff dashboards)
router.get('/school-overview', authenticate, requireAgencyAccess, getSchoolOverview);

// School org internal notes (admin / super_admin / CPA only — enforced in controller)
router.get(
  '/school-overview/:schoolOrganizationId/internal-notes',
  authenticate,
  requireAgencyAccess,
  listSchoolInternalNotes
);
router.post(
  '/school-overview/:schoolOrganizationId/internal-notes',
  authenticate,
  requireAgencyAccess,
  createSchoolInternalNote
);

// Social feeds for My Dashboard (agency + optional org/program scope)
router.get('/social-feeds', authenticate, listForDashboard);

export default router;

