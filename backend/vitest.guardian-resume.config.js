export default {
 root: new URL('.', import.meta.url).pathname,
 resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
 test: { environment: 'node', include: ['src/services/__tests__/coGuardianResume.test.js','src/controllers/__tests__/publicIntakeProgress.test.js','src/controllers/__tests__/enrollmentCompletion.coGuardianRetry.test.js','src/controllers/__tests__/enrollmentCompletion.coGuardianIntegrity.test.js'], restoreMocks: true }
};
