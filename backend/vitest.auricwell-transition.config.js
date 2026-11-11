import { defineConfig } from '../frontend/node_modules/vitest/dist/config.js';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: {
    environment: 'node',
    include: [
      'src/services/__tests__/auricwellAgendaImport.test.js',
      'src/services/__tests__/auricwellAgendaProviderAccess.test.js',
      'src/services/__tests__/auricwellAgendaRecovery.test.js',
      'src/services/__tests__/auricwellAgendaImport.mysql.test.js',
      'src/services/__tests__/schoolAppointmentTransition.test.js',
      'src/services/__tests__/schoolAppointmentTransition.mysql.test.js',
      'src/services/__tests__/ehrHistoricalImport*.test.js',
      'src/services/__tests__/medicalArchiveUpload.test.js',
      'src/services/__tests__/scheduleSummaryPrivacy.service.test.js',
      'src/services/__tests__/clientContactAffiliation.schema.test.js',
      'src/controllers/__tests__/ehrHistorical*.test.js',
      'src/controllers/__tests__/ehrPatientListCreate.test.js',
      'src/controllers/__tests__/clientInsuranceSources.test.js',
      'src/controllers/__tests__/clientInsuranceSupport.test.js',
      'src/middleware/__tests__/clientDocumentUpload.test.js'
    ]
  }
});
