import express from 'express';
import pool from '../config/database.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import { authorizeSubmitAdmin, resolveSubmitEmployee, submitAgencyId, submitEmployees } from '../services/submitOnBehalf.service.js';
import * as payroll from '../controllers/payroll.controller.js';
import { listMyIndirectServiceTypes } from '../controllers/indirectTime.controller.js';
import { getMyFfsExcessOptions } from '../controllers/ffsExcessTime.controller.js';
import { getMyPaySystemRates, estimatePaySystem, estimatePaySystemScenario } from '../controllers/payrollPaySystem.controller.js';
import { getMyEventTravelOptions, previewMyEventTravelReport, submitMyEventTravelReport } from '../controllers/eventTravelReport.controller.js';
import { getMyAvailabilityPending, createMySchoolAvailabilityRequest, unrequestAllMyAvailabilityRequests } from '../controllers/availability.controller.js';

import * as car from '../controllers/companyCar.controller.js';
import { createBudgetExpenses, listBudgetExpenses } from '../controllers/budget.controller.js';
import { getManualMeetingOptions, previewManualMeetingLog, createManualMeetingLog } from '../controllers/manualMeetingLog.controller.js';

const router = express.Router();
router.get('/employees', async (req,res,next) => {
  try {
    const agencyId = submitAgencyId(req.query.agencyId);
    await authorizeSubmitAdmin(req.user, agencyId);
    res.set('Cache-Control','no-store').json(await submitEmployees(agencyId));
  } catch(e) { next(e); }
});
router.use('/:employeeId', async (req,res,next) => {
  try {
    const { agencyId, employee } = await resolveSubmitEmployee({ actor:req.user, agencyId:req.query.agencyId, userId:req.params.employeeId });
    // Only this explicit set of Submit endpoints receives the employee context.
    // Authentication/session and the acting administrator remain unchanged.
    req.actorUser = req.user;
    req.user = employee;
    req.submitAgencyId = agencyId;
    res.set('Cache-Control','no-store');
    next();
  } catch(e) { next(e); }
});
function enforceScope(req,res,next) {
  if (req.body?.agencyId != null && Number(req.body.agencyId) !== req.submitAgencyId) return res.status(403).json({error:{message:'Organization does not match the selected Submit page'}});
  if (req.body && typeof req.body === 'object') {
    req.body.agencyId = req.submitAgencyId;
    if ('userId' in req.body) req.body.userId = req.user.id;
  }
  // Self-service handlers sometimes also accept an admin-supplied user/driver ID.
  req.query.userId = req.user.id;
  req.query.driverId = req.user.id;
  if (!['GET','HEAD'].includes(req.method)) {
    const actorId = req.actorUser.id, employeeId = req.user.id, agencyId = req.submitAgencyId;
    const route = req.route.path, method = req.method;
    res.once('finish', () => {
      if (res.statusCode < 400) AdminAuditLog.logAction({ actionType:'payroll_write', actorUserId:actorId, targetUserId:employeeId, agencyId,
        metadata:{ source:'submit_on_behalf', method, route, recordId:req.params.id || req.params.eventId || null } }).catch(e => console.error('Submit-on-behalf audit failed', e.code || e.message));
    });
  }
  next();
}
// Upload parsers must run before scope validation, including multipart agencyId.
function register(method, path, handlers) {
  const chain = Array.isArray(handlers) ? handlers : [handlers];
  router[method](`/:employeeId${path}`, ...chain.slice(0,-1), enforceScope, chain.at(-1));
}
const reads = {
  '/compensation':payroll.getMyCompensation, '/my-time-categories':payroll.getMyTimeCategories,
  '/indirect-service-types':listMyIndirectServiceTypes, '/ffs-excess-options':getMyFfsExcessOptions,
  '/time-claims':payroll.listMyTimeClaims, '/mileage-claims':payroll.listMyMileageClaims,
  '/reimbursement-claims':payroll.listMyReimbursementClaims, '/company-card-expenses':payroll.listMyCompanyCardExpenses,
  '/pto-requests':payroll.listMyPtoRequests, '/pto-balances':payroll.getMyPtoBalances,
  '/medcancel-claims':payroll.listMyMedcancelClaims, '/medcancel-policy':payroll.getMyMedcancelPolicy,
  '/assigned-schools':payroll.listMyAssignedSchoolsForPayroll, '/assigned-offices':payroll.listMyAssignedOfficesForPayroll,
  '/home-address':payroll.getMyHomeAddress, '/mileage-rates':payroll.getMyAgencyMileageRates,
  '/holidays':payroll.listMyAgencyHolidays, '/excess-compensation-rules':payroll.listMyExcessCompensationRules,
  '/event-time':payroll.listMyEventTime, '/recurring-payments':payroll.listRecurringPayments,
  '/periods':payroll.listMyPayroll, '/current-tier':payroll.getMyCurrentTier,
  '/pay-system/my-rates':getMyPaySystemRates,
  '/company-events/travel-options':getMyEventTravelOptions,
  '/availability/me/pending':getMyAvailabilityPending,
  '/company-car/company-cars':car.listCompanyCars,
  '/company-car/company-car-trips':car.listCompanyCarTrips,
  '/company-car/start-locations':car.listCompanyCarStartLocations,
  '/company-car/destination-options':car.listCompanyCarDestinationOptions,
  '/company-car/latest-trip-end-odometer':car.getLatestTripEndOdometer,
  '/company-car/mileage/calculate':car.calculateCompanyCarMileage,
  '/team-meetings/manual-log/options':getManualMeetingOptions
};
for (const [path, handler] of Object.entries(reads)) register('get', path, handler);
for (const [path, handler] of Object.entries({
  '/time-claims':payroll.createMyTimeClaim, '/mileage-claims':payroll.createMyMileageClaim,
  '/reimbursement-claims':payroll.createMyReimbursementClaim, '/company-card-expenses':payroll.createMyCompanyCardExpense,
  '/pto-requests':payroll.createMyPtoRequest, '/medcancel-claims':payroll.createMyMedcancelClaim,
  '/pay-system/estimate':estimatePaySystem, '/pay-system/estimate-scenario':estimatePaySystemScenario,
  '/availability/school-requests':createMySchoolAvailabilityRequest,
  '/availability/me/requests/unrequest-all':unrequestAllMyAvailabilityRequests,
  '/company-car/company-car-trips':car.createCompanyCarTrip,
  '/team-meetings/manual-log/preview':previewManualMeetingLog,
  '/team-meetings/manual-log':createManualMeetingLog
})) register('post', path, handler);
async function eventScope(req,res,next) {
  try {
    const [rows] = await pool.execute('SELECT id FROM company_events WHERE id = ? AND agency_id = ?', [req.params.eventId, req.submitAgencyId]);
    if (!rows.length) return res.status(404).json({error:{message:'Event not found in this organization'}});
    next();
  } catch(e) { next(e); }
}
register('post','/company-events/:eventId/travel-report/preview',[eventScope,previewMyEventTravelReport]);
register('post','/company-events/:eventId/travel-report',[eventScope,submitMyEventTravelReport]);
register('put','/home-address',payroll.updateMyHomeAddress);
async function budgetScope(req,res,next) {
  if (!req.user.budgetSubmitAccess) return res.status(403).json({error:{message:'Budget submissions are not enabled for this employee'}});
  req.params.agencyId = req.submitAgencyId;
  next();
}
register('get','/budget/expenses',[budgetScope,listBudgetExpenses]);
register('post','/budget/expenses',[budgetScope,createBudgetExpenses]);
export default router;
