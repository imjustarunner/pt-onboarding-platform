export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/services/__tests__/copayAttendance.test.js','src/services/__tests__/copayDispatch.test.js','src/services/__tests__/clinicalDraftAttendanceIntent.test.js','src/services/__tests__/nonbillableNoteCompletion.test.js'], restoreMocks: true }
};
