export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/controllers/__tests__/therapyNotesQuickGenerator.test.js',
    'src/controllers/__tests__/therapyNotesOrdinaryWorkflow.test.js',
    'src/models/__tests__/ClinicalNoteDraft.sessionReuse.test.js',
    'src/controllers/__tests__/clinicalData.sessionNoteRace.test.js',
    'src/routes/__tests__/supportClinicalRoutes.test.js',
    'src/controllers/__tests__/clinicalNoteDraftContext.test.js'
  ] }
};
