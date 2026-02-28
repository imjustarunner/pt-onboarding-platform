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
  snapshotPayrollPeriodRun,
  snapshotPayrollPeriodRunFromFile,
  previewPayrollCarryover,
  applyPayrollCarryover,
  patchPayrollStaging,
  putPayrollStagePriorUnpaid,
  submitPayrollPeriod,
  runPayrollPeriod,
  postPayrollPeriod,
  unpostPayrollPeriod,
  previewPostPayrollPeriod,
  restagePayrollPeriod,
  deletePayrollPeriod,
  resetPayrollPeriod,
  getPayrollAdjustmentsForUser,
  upsertPayrollAdjustmentsForUser,
  getPayrollReportLateNotesTotals,
  listMyPayroll,
  getMyDashboardSummary,
  getSuperviseeDashboardSummary,
  getMyCurrentTier,
  getUserCurrentTier,
  getMyCompensation,
  getPayrollRateCard,
  upsertPayrollRateCard,
  listServiceCodeRules,
  upsertServiceCodeRule,
  deleteServiceCodeRule,
  listExcessCompensationRules,
  listMyExcessCompensationRules,
  upsertExcessCompensationRule,
  deleteExcessCompensationRule,
  listPayrollRateTemplates,
  getPayrollRateTemplate,
  createPayrollRateTemplateFromUser,
  renamePayrollRateTemplate,
  deletePayrollRateTemplate,
  applyPayrollRateTemplateToUser,
  importPayrollAuto,
  detectPayrollAuto,
  importPayrollCsv,
  toolComparePayrollFiles,
  toolPreviewPayrollFileStaging,
  listPayrollAgencyUsers,
  upsertRate,
  listRatesForUser,
  deleteRateForUser,
  listUserRateSheetVisibility,
  upsertUserRateSheetVisibility,
  listUserPayroll,
  requestAdpExport,
  ensureFuturePayrollPeriods,
  getAgencyMileageRates,
  getMyAgencyMileageRates,
  upsertAgencyMileageRates,
  createMyMileageClaim,
  listMyMileageClaims,
  deleteMyMileageClaim,
  createUserMileageClaim,
  listMileageClaims,
  patchMileageClaim
  ,createMyMedcancelClaim
  ,createUserMedcancelClaim
  ,listMyMedcancelClaims
  ,deleteMyMedcancelClaim
  ,listMedcancelClaims
  ,patchMedcancelClaim
  ,getMedcancelPolicy
  ,putMedcancelPolicy
  ,getHolidayPayPolicy
  ,putHolidayPayPolicy
  ,getMyMedcancelPolicy
  ,listAgencyHolidays
  ,listMyAgencyHolidays
  ,createAgencyHoliday
  ,deleteAgencyHoliday
  ,getSupervisionPolicy
  ,putSupervisionPolicy
  ,listSupervisionAccountsForAgency
  ,importSupervisionCsv
  ,createMyReimbursementClaim
  ,createUserReimbursementClaim
  ,listMyReimbursementClaims
  ,updateMyReimbursementClaim
  ,deleteMyReimbursementClaim
  ,listReimbursementClaims
  ,patchReimbursementClaim
  ,createMyCompanyCardExpense
  ,createUserCompanyCardExpense
  ,listMyCompanyCardExpenses
  ,updateMyCompanyCardExpense
  ,deleteMyCompanyCardExpense
  ,listCompanyCardExpenses
  ,patchCompanyCardExpense
  ,listExpenses
  ,downloadExpensesCsv
  ,uploadExpenseReceiptToDrive
  ,createMyTimeClaim
  ,createUserTimeClaim
  ,listMyTimeClaims
  ,deleteMyTimeClaim
  ,listTimeClaims
  ,patchTimeClaim
  ,listHolidayBonusClaims
  ,patchHolidayBonusClaim
  ,createOfficeLocationForPayroll
  ,updateOfficeLocationForPayroll
  ,listMyAssignedSchoolsForPayroll
  ,listUserAssignedSchoolsForPayroll
  ,getPayrollOtherRateTitles
  ,putPayrollOtherRateTitlesForAgency
  ,putPayrollOtherRateTitlesForUser
  ,listPayrollManualPayLines
  ,createPayrollManualPayLine
  ,createPayrollManualBulk
  ,deletePayrollManualPayLine
  ,listMeetingAttendance
  ,syncMeetingAttendance
  ,listAgencySchoolsForPayroll
  ,listOfficeLocationsForPayroll
  ,listMyAssignedOfficesForPayroll
  ,listUserAssignedOfficesForPayroll
  ,updateMyHomeAddress
  ,getMyHomeAddress
  ,getUserHomeAddress
  ,updateUserHomeAddress
  ,updateOrganizationAddressForPayroll
  ,updateOfficeLocationAddressForPayroll
  ,getPtoPolicy
  ,putPtoPolicy
  ,getUserPtoAccount
  ,upsertUserPtoAccount
  ,listPayrollTodoTemplates
  ,createPayrollTodoTemplate
  ,patchPayrollTodoTemplate
  ,deletePayrollTodoTemplate
  ,listPayrollPeriodTodos
  ,createPayrollPeriodTodo
  ,patchPayrollPeriodTodo
  ,deletePayrollPeriodTodo
  ,getPayrollWizardProgress
  ,putPayrollWizardProgress
  ,getAgencyPayrollScheduleSettings
  ,putAgencyPayrollScheduleSettings
  ,cleanupFuturePayrollPeriods
  ,getPayrollReportSessionsUnits
  ,getPayrollReportProviderPaySummary
  ,getPayrollReportAdjustmentsBreakdown
  ,getPayrollReportSupervisionConflicts
  ,putPayrollSupervisionConflictResolution
  ,getPayrollReportHolidayHours
  ,listUserSalaryPositions
  ,upsertUserSalaryPosition
  ,deleteUserSalaryPosition
  ,getMyPtoBalances
  ,getUserPtoBalances
  ,createMyPtoRequest
  ,createUserPtoRequest
  ,listMyPtoRequests
  ,deleteMyPtoRequest
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
router.get('/periods/:id/reports/sessions-units', getPayrollReportSessionsUnits);
router.get('/periods/:id/reports/late-notes', getPayrollReportLateNotesTotals);
router.get('/periods/:id/reports/provider-pay-summary', getPayrollReportProviderPaySummary);
router.get('/periods/:id/reports/adjustments-breakdown', getPayrollReportAdjustmentsBreakdown);
router.get('/periods/:id/reports/supervision-conflicts', getPayrollReportSupervisionConflicts);
router.put('/periods/:id/supervision-conflicts/resolution', putPayrollSupervisionConflictResolution);
router.get('/periods/:id/reports/holiday-hours', getPayrollReportHolidayHours);
router.get('/periods/:id/raw.csv', downloadPayrollRawCsv);
router.get('/periods/:id/export.csv', downloadPayrollExportCsv);
router.get('/periods/:id/staging', getPayrollStaging);
router.get('/periods/:id/runs', listPayrollPeriodRuns);
router.post('/periods/:id/runs/snapshot', snapshotPayrollPeriodRun);
router.post('/periods/:id/runs/snapshot-from-file', snapshotPayrollPeriodRunFromFile);
router.get('/periods/:id/carryover/preview', previewPayrollCarryover);
router.post('/periods/:id/carryover/apply', applyPayrollCarryover);
router.patch('/periods/:id/staging', patchPayrollStaging);
router.put('/periods/:id/prior-unpaid', putPayrollStagePriorUnpaid);
router.post('/periods/:id/submit', submitPayrollPeriod);
router.post('/periods/:id/run', runPayrollPeriod);
router.post('/periods/:id/post', postPayrollPeriod);
router.post('/periods/:id/unpost', unpostPayrollPeriod);
router.get('/periods/:id/post/preview', previewPostPayrollPeriod);
router.post('/periods/:id/restage', restagePayrollPeriod);
router.post('/periods/:id/reset', resetPayrollPeriod);
router.delete('/periods/:id', deletePayrollPeriod);
router.get('/periods/:id/adjustments', getPayrollAdjustmentsForUser);
router.put('/periods/:id/adjustments/:userId', upsertPayrollAdjustmentsForUser);

// Rates
router.post('/rates', upsertRate);
router.get('/rates', listRatesForUser);
router.delete('/rates', deleteRateForUser);
router.get('/rate-sheet-visibility', listUserRateSheetVisibility);
router.put('/rate-sheet-visibility', upsertUserRateSheetVisibility);
router.get('/rate-cards', getPayrollRateCard);
router.post('/rate-cards', upsertPayrollRateCard);
router.get('/service-code-rules', listServiceCodeRules);
router.post('/service-code-rules', upsertServiceCodeRule);
router.delete('/service-code-rules', deleteServiceCodeRule);
router.get('/excess-compensation-rules', listExcessCompensationRules);
router.get('/me/excess-compensation-rules', listMyExcessCompensationRules);
router.post('/excess-compensation-rules', upsertExcessCompensationRule);
router.delete('/excess-compensation-rules', deleteExcessCompensationRule);
router.get('/mileage-rates', getAgencyMileageRates);
router.get('/me/mileage-rates', getMyAgencyMileageRates);
router.put('/mileage-rates', upsertAgencyMileageRates);
router.post('/me/mileage-claims', createMyMileageClaim);
router.post('/users/:userId/mileage-claims', createUserMileageClaim);
router.get('/me/mileage-claims', listMyMileageClaims);
router.delete('/me/mileage-claims/:id', deleteMyMileageClaim);
router.post('/me/medcancel-claims', createMyMedcancelClaim);
router.post('/users/:userId/medcancel-claims', createUserMedcancelClaim);
router.get('/me/medcancel-claims', listMyMedcancelClaims);
router.delete('/me/medcancel-claims/:id', deleteMyMedcancelClaim);
router.get('/me/medcancel-policy', getMyMedcancelPolicy);
router.get('/medcancel-policy', getMedcancelPolicy);
router.put('/medcancel-policy', putMedcancelPolicy);
router.get('/holiday-pay-policy', getHolidayPayPolicy);
router.put('/holiday-pay-policy', putHolidayPayPolicy);
router.get('/holidays', listAgencyHolidays);
router.get('/me/holidays', listMyAgencyHolidays);
router.post('/holidays', createAgencyHoliday);
router.delete('/holidays/:id', deleteAgencyHoliday);
router.post('/me/reimbursement-claims', ...createMyReimbursementClaim);
router.post('/users/:userId/reimbursement-claims', ...createUserReimbursementClaim);
router.get('/me/reimbursement-claims', listMyReimbursementClaims);
router.put('/me/reimbursement-claims/:id', ...updateMyReimbursementClaim);
router.delete('/me/reimbursement-claims/:id', deleteMyReimbursementClaim);
router.post('/me/company-card-expenses', ...createMyCompanyCardExpense);
router.post('/users/:userId/company-card-expenses', ...createUserCompanyCardExpense);
router.get('/me/company-card-expenses', listMyCompanyCardExpenses);
router.put('/me/company-card-expenses/:id', ...updateMyCompanyCardExpense);
router.delete('/me/company-card-expenses/:id', deleteMyCompanyCardExpense);
router.post('/me/time-claims', createMyTimeClaim);
router.post('/users/:userId/time-claims', createUserTimeClaim);
router.get('/me/time-claims', listMyTimeClaims);
router.delete('/me/time-claims/:id', deleteMyTimeClaim);
router.get('/me/assigned-schools', listMyAssignedSchoolsForPayroll);
router.get('/users/:userId/assigned-schools', listUserAssignedSchoolsForPayroll);
router.get('/other-rate-titles', getPayrollOtherRateTitles);
router.put('/other-rate-titles', putPayrollOtherRateTitlesForAgency);
router.put('/other-rate-titles/users/:userId', putPayrollOtherRateTitlesForUser);
router.get('/periods/:id/manual-pay-lines', listPayrollManualPayLines);
router.post('/periods/:id/manual-pay-lines', createPayrollManualPayLine);
router.post('/periods/:id/manual-bulk', createPayrollManualBulk);
router.delete('/periods/:id/manual-pay-lines/:lineId', deletePayrollManualPayLine);
router.get('/meeting-attendance', listMeetingAttendance);
router.post('/meeting-attendance/sync', syncMeetingAttendance);
router.get('/todo-templates', listPayrollTodoTemplates);
router.post('/todo-templates', createPayrollTodoTemplate);
router.patch('/todo-templates/:templateId', patchPayrollTodoTemplate);
router.delete('/todo-templates/:templateId', deletePayrollTodoTemplate);
router.get('/periods/:id/todos', listPayrollPeriodTodos);
router.post('/periods/:id/todos', createPayrollPeriodTodo);
router.patch('/periods/:id/todos/:todoId', patchPayrollPeriodTodo);
router.delete('/periods/:id/todos/:todoId', deletePayrollPeriodTodo);
router.get('/periods/:id/wizard-progress', getPayrollWizardProgress);
router.put('/periods/:id/wizard-progress', putPayrollWizardProgress);
router.get('/schedule-settings', getAgencyPayrollScheduleSettings);
router.put('/schedule-settings', putAgencyPayrollScheduleSettings);
router.post('/periods/cleanup-future', cleanupFuturePayrollPeriods);
router.get('/agency-schools', listAgencySchoolsForPayroll);
router.get('/office-locations', listOfficeLocationsForPayroll);
router.get('/me/assigned-offices', listMyAssignedOfficesForPayroll);
router.get('/users/:userId/assigned-offices', listUserAssignedOfficesForPayroll);
router.post('/office-locations', createOfficeLocationForPayroll);
router.patch('/office-locations/:locationId', updateOfficeLocationForPayroll);
router.get('/me/home-address', getMyHomeAddress);
router.put('/me/home-address', updateMyHomeAddress);
router.get('/users/:userId/home-address', getUserHomeAddress);
router.put('/users/:userId/home-address', updateUserHomeAddress);
router.get('/me/pto-balances', getMyPtoBalances);
router.get('/users/:userId/pto-balances', getUserPtoBalances);
router.post('/me/pto-requests', ...createMyPtoRequest);
router.post('/users/:userId/pto-requests', ...createUserPtoRequest);
router.get('/me/pto-requests', listMyPtoRequests);
router.delete('/me/pto-requests/:id', deleteMyPtoRequest);
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
router.get('/expenses', listExpenses);
router.get('/expenses/export.csv', downloadExpensesCsv);
router.post('/expenses/:type/:id/drive', uploadExpenseReceiptToDrive);
router.get('/time-claims', listTimeClaims);
router.patch('/time-claims/:id', patchTimeClaim);
router.get('/holiday-bonus-claims', listHolidayBonusClaims);
router.patch('/holiday-bonus-claims/:id', patchHolidayBonusClaim);
router.get('/pto-policy', getPtoPolicy);
router.put('/pto-policy', putPtoPolicy);
router.get('/users/:userId/pto-account', getUserPtoAccount);
router.put('/users/:userId/pto-account', upsertUserPtoAccount);
router.get('/users/:userId/salary-positions', listUserSalaryPositions);
router.post('/users/:userId/salary-positions', upsertUserSalaryPosition);
router.delete('/users/:userId/salary-positions/:positionId', deleteUserSalaryPosition);
router.get('/pto-requests', listPtoRequests);
router.patch('/pto-requests/:id', patchPtoRequest);
router.get('/agency-users', listPayrollAgencyUsers);
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

// Payroll Tools (read-only, no persistence)
router.post('/tools/payroll/compare', ...toolComparePayrollFiles);
router.post('/tools/payroll/viewer', ...toolPreviewPayrollFileStaging);

// User payroll history
router.get('/users/:userId/periods', listUserPayroll);
router.get('/me/periods', listMyPayroll);
router.get('/me/dashboard-summary', getMyDashboardSummary);
router.get('/supervisee/:superviseeId/dashboard-summary', getSuperviseeDashboardSummary);
router.get('/me/current-tier', getMyCurrentTier);
router.get('/users/:userId/current-tier', getUserCurrentTier);
router.get('/me/compensation', getMyCompensation);

// ADP export (stub/job log)
router.post('/periods/:id/adp/export', requestAdpExport);

export default router;

