import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  createPayrollPeriod,
  listPayrollPeriods,
  getPayrollPeriod,
  patchPayrollImportRow,
  downloadPayrollRawCsv,
  downloadPayrollExportCsv,
  getPayrollStaging,
  listPayrollPeriodRuns,
  previewPayrollCarryover,
  applyPayrollCarryover,
  patchPayrollStaging,
  submitPayrollPeriod,
  runPayrollPeriod,
  postPayrollPeriod,
  previewPostPayrollPeriod,
  deletePayrollPeriod,
  resetPayrollPeriod,
  getPayrollAdjustmentsForUser,
  upsertPayrollAdjustmentsForUser,
  listMyPayroll,
  getMyCurrentTier,
  getMyCompensation,
  getPayrollRateCard,
  upsertPayrollRateCard,
  listServiceCodeRules,
  upsertServiceCodeRule,
  deleteServiceCodeRule,
  listPayrollRateTemplates,
  getPayrollRateTemplate,
  createPayrollRateTemplateFromUser,
  renamePayrollRateTemplate,
  deletePayrollRateTemplate,
  applyPayrollRateTemplateToUser,
  importPayrollAuto,
  detectPayrollAuto,
  importPayrollCsv,
  importPayrollRateSheet,
  listPayrollAgencyUsers,
  upsertRate,
  listRatesForUser,
  deleteRateForUser,
  listUserPayroll,
  requestAdpExport,
  ensureFuturePayrollPeriods,
  getAgencyMileageRates,
  getMyAgencyMileageRates,
  upsertAgencyMileageRates,
  createMyMileageClaim,
  listMyMileageClaims,
  deleteMyMileageClaim,
  listMileageClaims,
  patchMileageClaim
  ,createMyMedcancelClaim
  ,listMyMedcancelClaims
  ,deleteMyMedcancelClaim
  ,listMedcancelClaims
  ,patchMedcancelClaim
  ,getSupervisionPolicy
  ,putSupervisionPolicy
  ,listSupervisionAccountsForAgency
  ,importSupervisionCsv
  ,createMyReimbursementClaim
  ,listMyReimbursementClaims
  ,deleteMyReimbursementClaim
  ,listReimbursementClaims
  ,patchReimbursementClaim
  ,createMyCompanyCardExpense
  ,listMyCompanyCardExpenses
  ,deleteMyCompanyCardExpense
  ,listCompanyCardExpenses
  ,patchCompanyCardExpense
  ,createMyTimeClaim
  ,listMyTimeClaims
  ,deleteMyTimeClaim
  ,listTimeClaims
  ,patchTimeClaim
  ,createOfficeLocationForPayroll
  ,updateOfficeLocationForPayroll
  ,listMyAssignedSchoolsForPayroll
  ,listAgencySchoolsForPayroll
  ,listOfficeLocationsForPayroll
  ,updateMyHomeAddress
  ,getMyHomeAddress
  ,updateOrganizationAddressForPayroll
  ,updateOfficeLocationAddressForPayroll
  ,getPtoPolicy
  ,putPtoPolicy
  ,getUserPtoAccount
  ,upsertUserPtoAccount
  ,getMyPtoBalances
  ,createMyPtoRequest
  ,listMyPtoRequests
  ,listPtoRequests
  ,patchPtoRequest
} from '../controllers/payroll.controller.js';

const router = express.Router();

router.use(authenticate);

// Pay periods
router.post('/periods', createPayrollPeriod);
router.post('/periods/ensure-future', ensureFuturePayrollPeriods);
router.get('/periods', listPayrollPeriods);
router.get('/periods/:id', getPayrollPeriod);
router.patch('/import-rows/:rowId', patchPayrollImportRow);
router.get('/periods/:id/raw.csv', downloadPayrollRawCsv);
router.get('/periods/:id/export.csv', downloadPayrollExportCsv);
router.get('/periods/:id/staging', getPayrollStaging);
router.get('/periods/:id/runs', listPayrollPeriodRuns);
router.get('/periods/:id/carryover/preview', previewPayrollCarryover);
router.post('/periods/:id/carryover/apply', applyPayrollCarryover);
router.patch('/periods/:id/staging', patchPayrollStaging);
router.post('/periods/:id/submit', submitPayrollPeriod);
router.post('/periods/:id/run', runPayrollPeriod);
router.post('/periods/:id/post', postPayrollPeriod);
router.get('/periods/:id/post/preview', previewPostPayrollPeriod);
router.post('/periods/:id/reset', resetPayrollPeriod);
router.delete('/periods/:id', deletePayrollPeriod);
router.get('/periods/:id/adjustments', getPayrollAdjustmentsForUser);
router.put('/periods/:id/adjustments/:userId', upsertPayrollAdjustmentsForUser);

// Rates
router.post('/rates', upsertRate);
router.get('/rates', listRatesForUser);
router.delete('/rates', deleteRateForUser);
router.get('/rate-cards', getPayrollRateCard);
router.post('/rate-cards', upsertPayrollRateCard);
router.get('/service-code-rules', listServiceCodeRules);
router.post('/service-code-rules', upsertServiceCodeRule);
router.delete('/service-code-rules', deleteServiceCodeRule);
router.get('/mileage-rates', getAgencyMileageRates);
router.get('/me/mileage-rates', getMyAgencyMileageRates);
router.put('/mileage-rates', upsertAgencyMileageRates);
router.post('/me/mileage-claims', createMyMileageClaim);
router.get('/me/mileage-claims', listMyMileageClaims);
router.delete('/me/mileage-claims/:id', deleteMyMileageClaim);
router.post('/me/medcancel-claims', createMyMedcancelClaim);
router.get('/me/medcancel-claims', listMyMedcancelClaims);
router.delete('/me/medcancel-claims/:id', deleteMyMedcancelClaim);
router.post('/me/reimbursement-claims', ...createMyReimbursementClaim);
router.get('/me/reimbursement-claims', listMyReimbursementClaims);
router.delete('/me/reimbursement-claims/:id', deleteMyReimbursementClaim);
router.post('/me/company-card-expenses', ...createMyCompanyCardExpense);
router.get('/me/company-card-expenses', listMyCompanyCardExpenses);
router.delete('/me/company-card-expenses/:id', deleteMyCompanyCardExpense);
router.post('/me/time-claims', createMyTimeClaim);
router.get('/me/time-claims', listMyTimeClaims);
router.delete('/me/time-claims/:id', deleteMyTimeClaim);
router.get('/me/assigned-schools', listMyAssignedSchoolsForPayroll);
router.get('/agency-schools', listAgencySchoolsForPayroll);
router.get('/office-locations', listOfficeLocationsForPayroll);
router.post('/office-locations', createOfficeLocationForPayroll);
router.patch('/office-locations/:locationId', updateOfficeLocationForPayroll);
router.get('/me/home-address', getMyHomeAddress);
router.put('/me/home-address', updateMyHomeAddress);
router.get('/me/pto-balances', getMyPtoBalances);
router.post('/me/pto-requests', ...createMyPtoRequest);
router.get('/me/pto-requests', listMyPtoRequests);
router.patch('/org-address/:orgId', updateOrganizationAddressForPayroll);
router.patch('/office-address/:locationId', updateOfficeLocationAddressForPayroll);
router.get('/mileage-claims', listMileageClaims);
router.patch('/mileage-claims/:id', patchMileageClaim);
router.get('/medcancel-claims', listMedcancelClaims);
router.patch('/medcancel-claims/:id', patchMedcancelClaim);
router.get('/supervision-policy', getSupervisionPolicy);
router.put('/supervision-policy', putSupervisionPolicy);
router.get('/supervision-accounts', listSupervisionAccountsForAgency);
router.get('/reimbursement-claims', listReimbursementClaims);
router.patch('/reimbursement-claims/:id', patchReimbursementClaim);
router.get('/company-card-expenses', listCompanyCardExpenses);
router.patch('/company-card-expenses/:id', patchCompanyCardExpense);
router.get('/time-claims', listTimeClaims);
router.patch('/time-claims/:id', patchTimeClaim);
router.get('/pto-policy', getPtoPolicy);
router.put('/pto-policy', putPtoPolicy);
router.get('/users/:userId/pto-account', getUserPtoAccount);
router.put('/users/:userId/pto-account', upsertUserPtoAccount);
router.get('/pto-requests', listPtoRequests);
router.patch('/pto-requests/:id', patchPtoRequest);
router.get('/agency-users', listPayrollAgencyUsers);
router.post('/rate-sheet/import', ...importPayrollRateSheet);
router.get('/rate-templates', listPayrollRateTemplates);
router.get('/rate-templates/:id', getPayrollRateTemplate);
router.post('/rate-templates/from-user', createPayrollRateTemplateFromUser);
router.patch('/rate-templates/:id', renamePayrollRateTemplate);
router.delete('/rate-templates/:id', deletePayrollRateTemplate);
router.post('/rate-templates/:id/apply', applyPayrollRateTemplateToUser);

// CSV import into a period
// IMPORTANT: register the "auto" route BEFORE any ":id" routes
// and constrain ":id" to digits so "/periods/auto/import" doesn't get treated as id="auto".
router.post('/periods/auto/import', ...importPayrollAuto);
router.post('/periods/auto/detect', ...detectPayrollAuto);
router.post('/periods/:id(\\d+)/import', ...importPayrollCsv);
router.post('/periods/:id(\\d+)/supervision/import', ...importSupervisionCsv);

// User payroll history
router.get('/users/:userId/periods', listUserPayroll);
router.get('/me/periods', listMyPayroll);
router.get('/me/current-tier', getMyCurrentTier);
router.get('/me/compensation', getMyCompensation);

// ADP export (stub/job log)
router.post('/periods/:id/adp/export', requestAdpExport);

export default router;

