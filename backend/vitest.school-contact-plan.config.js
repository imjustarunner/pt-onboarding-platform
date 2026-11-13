export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: ['src/middleware/__tests__/familyWelcomePreview.test.js','src/services/__tests__/familyIntroductionPilot.test.js', 'src/services/__tests__/schoolContactReplyRouting.test.js', 'src/services/__tests__/schoolContactPlanAdmin.test.js', 'src/services/__tests__/schoolContactProviderNotice.test.js', 'src/services/__tests__/schoolContactRollout.test.js', 'src/services/__tests__/schoolContactPlan.test.js', 'src/services/__tests__/schoolContactPlan.mysql.test.js', 'src/services/__tests__/schoolContactAutomation*.test.js','src/services/__tests__/schoolContactInitialRetry*.test.js'], restoreMocks: true }
};
