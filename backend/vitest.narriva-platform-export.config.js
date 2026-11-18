export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/narrivaSource.diagnosis.test.js', 'src/services/__tests__/narrivaRolloutSchema.test.js', 'src/services/__tests__/narrivaGeneratorSettings.test.js', 'src/services/__tests__/clinicalRecordPdf.test.js', 'src/services/__tests__/clinicalRecordExport.test.js', 'src/controllers/__tests__/narrivaPlatformSettings.test.js', 'src/controllers/__tests__/narrivaSectionDraft.test.js'], fileParallelism: false }
};
