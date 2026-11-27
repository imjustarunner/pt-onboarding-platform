import { defineConfig } from '../frontend/node_modules/vitest/dist/config.js';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment:'node', include:[
    'src/services/__tests__/importedGuardianAccount.test.js','src/services/__tests__/importedGuardianNotifications.test.js','src/services/__tests__/importedGuardianSmsGate.test.js',
    'src/models/__tests__/Client.recordsImport.test.js',
    'src/controllers/__tests__/clientImportCandidates.test.js','src/services/__tests__/familyPortalEmail.accountPreparation.test.js','src/services/__tests__/claimMdCoverage.test.js',
    'src/services/__tests__/clientChartRecordsStatus.test.js',
    'src/controllers/__tests__/clientImportedIntakeRemoval.test.js','src/services/__tests__/clientOfficeIntakeProvider.test.js',
    'src/services/__tests__/guardianPlanDelivery.test.js','src/services/__tests__/guardianAccess.planProgress.test.js','src/services/__tests__/medicalRecordList.imports.test.js','src/services/__tests__/coverageVerificationSummary.test.js','src/services/__tests__/clientExchangeSummary.test.js','src/utils/__tests__/clientCareSummary.test.js',
    'src/services/__tests__/chartPasteParser.test.js', 'src/services/__tests__/chartContactOwnership.test.js', 'src/services/__tests__/clientChartImport*.test.js',
    'src/services/__tests__/clientContactAffiliation.schema.test.js',
    'src/controllers/__tests__/clientChart*.test.js', 'src/controllers/__tests__/clientInsuranceSupport.test.js',
    'src/services/__tests__/clientChartSetupNeeds.test.js','src/controllers/__tests__/providerScheduling.assignable.test.js',
    'src/services/__tests__/clientClinicalRecordsImport.test.js','src/services/__tests__/chartSetupStatus.consistency.test.js','src/services/__tests__/intakeDraftReview.test.js','src/services/__tests__/narrivaPlanDraft.test.js',
    'src/models/__tests__/ClinicalTreatmentPlan.importedDraft.test.js','src/controllers/__tests__/intakeFinalizationConcurrency.test.js',
    'src/services/__tests__/clinicalImportedPlanFrequencySchema.test.js',
    'src/controllers/__tests__/ehrHistoricalPlanRoute.test.js','src/controllers/__tests__/ehrHistoricalIntake.test.js',
    'src/controllers/__tests__/clientInsuranceSources.test.js', 'src/services/__tests__/payerDirectorySelection.test.js'
  ] }
});
