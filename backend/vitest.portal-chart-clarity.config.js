export default {
  root: new URL('.', import.meta.url).pathname,
  test: { environment: 'node', env: { SKIP_DB_CONNECT: '1' }, restoreMocks: true, include: [
    'src/controllers/__tests__/guardianAccess.notificationHistory.test.js',
    'src/services/__tests__/intakeDraftReview.test.js'
  ] }
};
