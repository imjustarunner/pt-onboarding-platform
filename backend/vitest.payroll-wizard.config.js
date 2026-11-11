export default {root:new URL('.',import.meta.url).pathname,resolve:{alias:{stream:'node:stream',vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}},test:{environment:'node',include:[
 'src/controllers/__tests__/payrollDraftReview.test.js',
 'src/controllers/__tests__/payrollClaimBatch.test.js',
 'src/models/__tests__/PayrollClaimDecisions.test.js',
 'src/controllers/__tests__/payrollSubmissions.test.js',
 'src/controllers/__tests__/payrollApprovedVisibility.test.js',
 'src/services/__tests__/payrollClaimReview.test.js',
 'src/controllers/__tests__/payrollAgencyRoster.test.js',
 'src/services/__tests__/payrollReportEmail.test.js',
 'src/services/__tests__/communicationRecordDelivery.test.js',
 'src/controllers/__tests__/payrollActualHoursReview.test.js',
 'src/controllers/__tests__/payrollReportEmail.controller.test.js',
 'src/models/__tests__/PayrollDraftReviewAudit.test.js'
]}};
