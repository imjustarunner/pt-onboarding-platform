export default {
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { vitest: new URL('../frontend/node_modules/vitest/dist/index.js', import.meta.url).pathname } },
  test: { environment: 'node', include: [
    'src/utils/__tests__/intakeCaptchaPolicy.test.js',
    'src/controllers/__tests__/publicIntakeCaptcha.test.js'
  ], restoreMocks: true }
};
