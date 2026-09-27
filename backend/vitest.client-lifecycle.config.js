export default {
  root: new URL('.', import.meta.url).pathname,
  test: {
    environment: 'node',
    include: ['src/services/__tests__/clientLifecycleTaskSync.test.js', 'src/services/__tests__/clientOnboardingTask.test.js', 'src/controllers/__tests__/publicIntakeProgress.test.js'],
    restoreMocks: true
  }
};
